const { supabase, createClientForUser } = require('../config/supabase');
const logger = require('../services/logger');
const User = require('../models/User');
const policyEngine = require('../modules/checkin/policy.service');

/**
 * Middleware de autenticação soberano
 * Usa a API oficial do Supabase para validar tokens ECC (P-256) ou HS256
 */
async function authenticate(req, res, next) {
    try {
        const token = req.headers.authorization?.replace('Bearer ', '');

        if (!token) {
            return res.status(401).json({ error: 'Token não fornecido' });
        }

        // --- VALIDAÇÃO SOBERANA VIA SDK OFICIAL ---
        // Removida a dependência de SUPABASE_JWT_SECRET local, 
        // delegando a validação para o servidor do Supabase que entende chaves ECC (P-256).
        const { data, error: authError } = await supabase.auth.getUser(token);
        const user = data?.user;

        if (authError || !user) {
            const reason = authError?.message || 'Sessão inválida na nuvem';
            
            // Tratamento especial para falhas de rede (evita deslogar o usuário por instabilidade de rota)
            if (reason.includes('fetch failed') || reason.includes('SocketError') || reason.includes('socket hang up') || reason.includes('timeout')) {
                logger.error(`⚠️ 502 BAD GATEWAY (Falha de comunicação com Auth Provider): ${reason}`);
                return res.status(502).json({ 
                    error: 'Instabilidade momentânea de rede na validação. Tente novamente.', 
                    code: 'AUTH_NETWORK_ERROR',
                    detail: reason 
                });
            }

            logger.warn(`⚠️ 401 UNAUTHORIZED: ${reason}`);
            
            return res.status(401).json({ 
                error: 'Token inválido', 
                code: 'AUTH_FAILED',
                detail: reason 
            });
        }

        // Leitura de nível de acesso (Role)
        let role = user.app_metadata?.nivel_acesso || user.app_metadata?.role || user.user_metadata?.nivel_acesso || 'operador';

        // Mock profile com claims seguras
        const profileProxy = {
            nivel_acesso: role,
            nome_completo: user.user_metadata?.nome_completo || user.email,
            evento_id: (() => {
                const v = user.app_metadata?.evento_id || user.user_metadata?.evento_id;
                return (v && v !== 'undefined' && v !== 'null') ? v : null;
            })(),
            status: 'ativo'
        };

        // Criar instância do modelo User (RBAC)
        req.user = User.fromSupabase(user, profileProxy);

        // Cria um cliente Supabase exclusivo para esta requisição
        req.supabase = createClientForUser(token);

        next();
    } catch (error) {
        logger.error('Erro fatal na autenticação:', error);
        return res.status(500).json({ error: 'Erro interno de autenticação' });
    }
}

const ROLE_ALIASES = {
    'master': 'admin_master',
    'admin': 'admin',
    'supervisor': 'supervisor',
    'operador': 'operador'
};

const normalize = (role) => ROLE_ALIASES[role] || role;

/**
 * Utilitário soberano para extração de Role
 */
const extractRole = (user) => {
    if (!user) return 'operador';
    return normalize(user.nivel_acesso || user.role);
};

/**
 * Middleware de autorização por papel (Role)
 */
function authorize(...roles) {
    return (req, res, next) => {
        if (!req.user) return res.status(401).json({ error: 'Não autenticado' });
        if (roles.length === 0) return next();
        
        const userRole = extractRole(req.user);
        const allowed = roles.map(normalize);

        if (userRole === 'admin_master' || userRole === 'admin' || allowed.includes(userRole)) {
            return next();
        }

        logger.warn(`🚫 [AUTH DISMISS] Acesso negado via authorize: UserID=${req.user.id}, Role=${userRole}, AllowedRoles=[${roles.join(',')}]`);
        return res.status(403).json({ error: 'Acesso negado' });
    };
}

/**
 * Middleware para API Key interna
 */
function validateInternalApiKey(req, res, next) {
    const expectedKey = process.env.INTERNAL_API_KEY || process.env.A2_API_KEY || 'a2eventos_sync_2026';
    if (req.headers['x-api-key'] !== expectedKey) {
        return res.status(401).json({ error: 'API key inválida' });
    }
    next();
}

/**
 * Middleware de autorização dinâmica (RBAC) com isolamento de Tenant
 */
function checkPermission(recurso, acao) {
    return async (req, res, next) => {
        if (!req.user) return res.status(401).json({ error: 'Não autenticado' });
        
        const userRole = normalize(req.user.role || req.user.nivel_acesso);

        // --- 🦅 SOBERANIA MASTER / ADMIN (Super Admin SaaS) ---
        // Master e Admin podem atuar em qualquer evento. Aceita o ID do header para troca de contexto.
        const _s = (v) => (v && v !== 'undefined' && v !== 'null') ? v : null;
        if (userRole === 'admin_master' || userRole === 'master' || userRole === 'admin') {
            req.tenantId = _s(req.headers['x-evento-id']) || 
                          _s(req.query.evento_id) || 
                          (recurso === 'eventos' ? req.params.id : null) || 
                          _s(req.body?.evento_id);
            return next();
        }

        // --- 🔒 ARQUITETURA DE TENANT IMUTÁVEL ---
        // Para Admin/Supervisor/Operador, o EventoID VEM DO JWT (user_metadata).
        // Isso impede que um atacante altere o header 'x-evento-id' para acessar outro evento.
        const _safe = (v) => (v && v !== 'undefined' && v !== 'null') ? v : null;
        const tenantId = _safe(req.user.evento_id);

        if (!tenantId) {
            logger.warn(`⚠️ Sessão sem Evento vinculado: ${req.user.id}`);
            return res.status(400).json({ error: 'Sua sessão não possui um ID de Evento vinculado. Refaça o login.' });
        }

        // Injetar tenantId na request para uso nos controllers/services
        req.tenantId = tenantId;

        // 1. Validar Isolamento (O usuário pode atuar neste evento?)
        // (Já garantido pelo fato do ID vir do JWT, mas mantemos auditoria se houver mismatch)
        const requestEventId = req.headers['x-evento-id'] || req.query.evento_id || req.body.evento_id;
        if (requestEventId && requestEventId !== tenantId) {
             logger.warn(`🚨 TENANT MISMATCH ATTEMPT: ${req.user.id} tentou header ${requestEventId} mas está preso ao ${tenantId}`);
             // Opcional: Bloquear ou apenas ignorar o header. Vamos ignorar e usar o do JWT por segurança.
        }

        // 2. Validar Permissão Granular (ACL) via PolicyEngine
        if (await policyEngine.hasPermission(userRole, recurso, acao, tenantId)) {
            return next();
        }

        logger.warn(`🚫 [RBAC DENIED] ${recurso}:${acao} negado para UserID=${req.user.id}, Role=${userRole}, Evento=${tenantId}`);
        return res.status(403).json({ error: `Sem permissão de ${acao} no recurso ${recurso}` });
    };
}

/**
 * Middleware para validar API Key via header X-API-Key ou Authorization Bearer token
 * Usado por webhooks que não requerem autenticação de usuário
 */
function validateApiKey(req, res, next) {
    const apiKey = req.headers['x-api-key'] || req.headers['authorization']?.replace('Bearer ', '');

    if (!apiKey) {
        logger.warn(`🚫 Webhook sem API key: ${req.path}`);
        return res.status(401).json({
            error: 'API Key obrigatória',
            code: 'MISSING_API_KEY'
        });
    }

    // Validar contra INTERNAL_API_KEY do environment
    const expectedKey = process.env.INTERNAL_API_KEY || process.env.API_KEY;

    if (apiKey !== expectedKey) {
        logger.warn(`🚫 API Key inválida para: ${req.path}`);
        return res.status(403).json({
            error: 'API Key inválida',
            code: 'INVALID_API_KEY'
        });
    }

    next();
}

module.exports = { authenticate, authorize, validateInternalApiKey, validateApiKey, checkPermission, normalize, extractRole };
