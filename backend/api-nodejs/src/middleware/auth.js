const { supabase, createClientForUser } = require('../config/supabase');
const logger = require('../services/logger');
const User = require('../models/User');

/**
 * Middleware de autenticação
 * Verifica token JWT do Supabase e carrega o modelo de usuário
 */
async function authenticate(req, res, next) {
    try {
        const token = req.headers.authorization?.replace('Bearer ', '');

        if (!token) {
            return res.status(401).json({ error: 'Token não fornecido' });
        }

        let user = null;
        let authError = null;

        try {
            // --- HIGH PERFORMANCE IAM DECODING ---
            // Local JWT Verification to eliminate N+1 network calls to Supabase.
            if (process.env.SUPABASE_JWT_SECRET) {
                const jwt = require('jsonwebtoken');
                const decoded = jwt.verify(token, process.env.SUPABASE_JWT_SECRET);
                user = {
                    id: decoded.sub,
                    email: decoded.email,
                    user_metadata: decoded.user_metadata,
                    app_metadata: decoded.app_metadata
                };
            } else {
                // Fallback to slow network validation
                const { data, error } = await supabase.auth.getUser(token);
                user = data?.user;
                authError = error;
            }
        } catch (err) {
            authError = err;
        }

        if (authError || !user) {
            logger.warn(`Tentativa de acesso com token inválido: ${token.substring(0, 20)}...`);
            return res.status(401).json({ error: 'Token inválido' });
        }

        // Leitura da app_metadata vindo do JWT (Priorizando nível de acesso injetado)
        let role = user.app_metadata?.nivel_acesso || user.app_metadata?.role || user.user_metadata?.nivel_acesso || 'operador';

        // --- FAILSAFE SOBERANO: Busca em tempo real se o Token estiver desatualizado ---
        if (role !== 'master') {
            const { data: dbPerfil } = await supabase
                .from('perfis')
                .select('nivel_acesso, evento_id')
                .eq('id', user.id)
                .maybeSingle();
            
            console.log(`🔍 AUDITORIA AUTH [${user.email}]: JWT=${role}, DB=${dbPerfil?.nivel_acesso}`);
            
            if (dbPerfil?.nivel_acesso === 'master') {
                console.log('🦅 SOBERANIA MASTER DETECTADA NO BANCO! Fazendo bypass de token...');
                role = 'master';
                user.app_metadata = { ...user.app_metadata, nivel_acesso: 'master' };
            }
        }

        // Mock profile com claims seguras para evitar latência
        const profileProxy = {
            nivel_acesso: role,
            nome_completo: user.user_metadata?.nome_completo || user.email,
            evento_id: user.user_metadata?.evento_id,
            ativo: user.app_metadata?.ativo !== false // Trust by default unless banned via Supabase
        };

        // Criar instância do modelo User (RBAC)
        req.user = User.fromSupabase(user, profileProxy);

        if (!req.user.ativo) {
            return res.status(403).json({ error: 'Usuário desativado' });
        }

        // --- RLS ENFORCEMENT ---
        // Cria um cliente Supabase exclusivo para esta requisição, com o JWT do usuário.
        // Isso garante que o Row Level Security do Postgres seja respeitado em operações de dados.
        req.supabase = createClientForUser(token);

        next();
    } catch (error) {
        logger.error('Erro na autenticação:', error);
        return res.status(500).json({ error: 'Erro na autenticação' });
    }
}

/**
 * Middleware de autorização por papel (Role)
 */
function authorize(...roles) {
    return (req, res, next) => {
        if (!req.user) {
            return res.status(401).json({ error: 'Não autenticado' });
        }

        // Se não passar roles, apenas autenticado é suficiente
        if (roles.length === 0) return next();

        // Normalização: se o dev passou um Array em vez de múltiplos argumentos
        const allowedRoles = Array.isArray(roles[0]) ? roles[0] : roles;

        // Verifica se o role do usuário está na lista permitida
        // Master e Admin sempre têm acesso total
        if (req.user.role === 'master' || req.user.role === 'admin' || allowedRoles.includes(req.user.role)) {
            return next();
        }

        logger.warn(`Acesso negado: Usuário ${req.user.id} com role ${req.user.role} tentou acessar rota restrita`);
        return res.status(403).json({
            error: 'Acesso negado',
            required: roles,
            current: req.user.role
        });
    };
}

/**
 * Middleware para API Key interna (microsserviços)
 */
function validateInternalApiKey(req, res, next) {
    const apiKey = req.headers['x-api-key'];

    if (apiKey !== process.env.INTERNAL_API_KEY) {
        logger.warn(`Tentativa de acesso interno com chave inválida`);
        return res.status(401).json({ error: 'API key inválida' });
    }

    next();
}

const policyEngine = require('../modules/checkin/policy.service');

/**
 * Middleware de autorização dinâmico (RBAC Engine)
 * Verifica na base de policies se o Perfil detém a permissão para aquele Recurso e Ação
 */
function checkPermission(recurso, acao) {
    return async (req, res, next) => {
        if (!req.user) {
            return res.status(401).json({ error: 'Não autenticado' });
        }

        const role = req.user.role;

        // Bypass Soberano para Master
        if (role === 'master') return next();

        const hasPerm = await policyEngine.hasPermission(role, recurso, acao);

        if (hasPerm) {
            return next();
        }

        logger.warn(`Acesso bloqueado pelo PolicyEngine: Role '${role}' não possui '{${recurso}, ${acao}}'`);
        return res.status(403).json({
            error: 'Acesso negado: Perfil sem permissão para realizar esta ação.',
            required_policy: { recurso, acao }
        });
    };
}

module.exports = { authenticate, authorize, validateInternalApiKey, checkPermission };
