const { supabase, createClientForUser } = require('../config/supabase');
const logger = require('../services/logger');
const User = require('../models/User');

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
                const v = user.user_metadata?.evento_id;
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
    'master': 'admin_master',  // Legado -> novo
    'admin': 'operador',      // Legado -> operador
    'supervisor': 'operador', // Legado -> operador
    'operador': 'operador'
};

const normalize = (role) => ROLE_ALIASES[role] || role;

/**
 * Middleware de autorização por papel (Role)
 */
function authorize(...roles) {
    return (req, res, next) => {
        if (!req.user) return res.status(401).json({ error: 'Não autenticado' });
        if (roles.length === 0) return next();
        
        const userRole = normalize(req.user.role || req.user.nivel_acesso);
        const allowed = roles.map(normalize);

        if (userRole === 'admin_master' || allowed.includes(userRole)) {
            return next();
        }

        return res.status(403).json({ error: 'Acesso negado' });
    };
}

/**
 * Middleware para API Key interna
 */
function validateInternalApiKey(req, res, next) {
    if (req.headers['x-api-key'] !== process.env.INTERNAL_API_KEY) {
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

        // --- 🦅 SOBERANIA MASTER (Super Admin SaaS) ---
        // Master pode atuar em qualquer evento. Aceita o ID do header para troca de contexto.
        const _s = (v) => (v && v !== 'undefined' && v !== 'null') ? v : null;
        if (userRole === 'master') {
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
        const policyEngine = require('../modules/checkin/policy.service');
        if (await policyEngine.hasPermission(userRole, recurso, acao, tenantId)) {
            return next();
        }

        logger.warn(`🚫 Permissão Negada: ${req.user.id} -> ${recurso}:${acao} no evento ${tenantId}`);
        return res.status(403).json({ error: `Sem permissão de ${acao} no recurso ${recurso}` });
    };
}


module.exports = { authenticate, authorize, validateInternalApiKey, checkPermission };
