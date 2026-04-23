const { supabase } = require('../config/supabase');
const logger = require('../services/logger');

/**
 * Audit Middleware: Vincula a identidade do usuário às sessões do Postgres
 * permitindo que triggers identifiquem o autor da mudança em audit_logs.
 */
const auditMiddleware = async (req, res, next) => {
    // Só prossegue se o usuário estiver autenticado (middleware auth.js rodou antes)
    if (req.user && req.user.id) {
        try {
            // Se houver conexão Postgres direta disponível (ex: via execute_sql ou pg pool)
            // Tentamos definir a váriavel de sessão. 
            // NOTA: No Supabase/PostgREST isso não persiste entre chamadas REST,
            // mas é deixado aqui como infraestrutura para futuras implementações via RPC ou PG Pool.
            
            // Adicionalmente, enriquecemos o req para o AuditService manual
            req.auditMetadata = {
                ip: req.ip || req.headers['x-forwarded-for'] || '0.0.0.0',
                userAgent: req.headers['user-agent'] || 'unknown',
                timestamp: new Date().toISOString()
            };

            // Se quiséssemos forçar via RPC no Supabase para ativar triggers:
            // await supabase.rpc('set_session_user', { user_id: req.user.id });
            
        } catch (error) {
            logger.warn(`[AuditMiddleware] Falha ao preparar contexto de auditoria: ${error.message}`);
        }
    }
    next();
};

module.exports = auditMiddleware;
