const { supabase } = require('../config/supabase');
const logger = require('../services/logger');

/**
 * Middleware para garantir que a requisição opere dentro de um contexto de evento (Nexus)
 * 1. Extrai o evento_id do perfil do usuário (req.user)
 * 2. Valida existência e status do evento
 * 3. Sanitiza body/query para impedir override manual de evento_id
 * 4. Anexa o objeto do evento em req.event
 */
async function requireEvent(req, res, next) {
    try {
        if (!req.user) {
            return res.status(401).json({ error: 'Usuário não autenticado no middleware de evento' });
        }

        // --- 🔒 ARQUITETURA DE TENANT IMUTÁVEL ---
        // Se o middleware de auth já validou o tenantId, usamos ele.
        // Caso contrário, Masters podem usar headers, outros usam o JWT fixo.
        // Sanitizar valores que o frontend pode enviar como string literal "undefined" ou "null"
        const sanitize = (v) => (v && v !== 'undefined' && v !== 'null') ? v : null;
        const eventoId = sanitize(req.tenantId) || 
                        (req.user.role === 'master' 
                            ? (sanitize(req.headers['x-evento-id']) || sanitize(req.query.evento_id) || sanitize(req.body?.evento_id)) 
                            : sanitize(req.user.evento_id));

        req.event = null;

        if (!eventoId) {
            if (req.user.role === 'master') {
                logger.info(`[Master Bypass] Usuário ${req.user.email} operando sem evento contextualizado.`);
                req.event = { id: null, nome: 'Global (Sem Evento)', status: 'ativo' };
                // Master sem evento: tenantId fica null intencionalmente
                if (!req.tenantId) req.tenantId = null;
                return next();
            }
            return res.status(400).json({ error: 'Falta vincular evento ativo para prosseguir.' });
        }

        // Buscar detalhes do evento (Cache idealmente aqui no futuro)
        const { data: evento, error } = await supabase
            .from('eventos')
            .select('*')
            .eq('id', eventoId)
            .single();

        if ((error || !evento) && req.user.role !== 'master') {
            logger.warn(`Usuário ${req.user.id} tentou acessar evento inexistente: ${eventoId}`);
            return res.status(404).json({ error: 'Nexus de evento não encontrado ou inválido.' });
        }

        // Se for Master e o evento não existir, permitimos prosseguir (bypass de lixo de cache)
        if (!evento && req.user.role === 'master') {
            req.event = { id: eventoId || null, nome: 'Global (Bypass)', status: 'ativo' };
            return next();
        }

        // Bloquear acesso se o evento não estiver ativo (exceto para Gestores que podem estar configurando)
        const isManager = req.user.role === 'admin' || req.user.role === 'master' || req.user.role === 'supervisor';
        if (evento.status !== 'ativo' && !isManager) {
            return res.status(403).json({
                error: `O Nexus "${evento.nome}" está atualmente ${evento.status} e não permite operações.`
            });
        }

        // --- CRITICAL SECURITY FIX: HORIZONTAL PRIVILEGE ESCALATION (IDOR) PREVENTION ---
        // Valida se o usuário autenticado realmente tem laço com o evento que está tentando acessar
        if (req.user.role !== 'admin' && req.user.role !== 'supervisor' && req.user.role !== 'master') {
            if (req.user.evento_id && req.user.evento_id !== eventoId) {
                logger.warn(`[SECURITY ALERT] Usuário ${req.user.email} tentou IDOR no evento ${eventoId}`);
                return res.status(403).json({ error: 'Você não tem permissão para operar o Nexus deste evento.' });
            }
        }

        // ANEXAR CONTEXTO
        req.event = evento;
        req.user.evento_id = eventoId;

        // 🔑 FIX CRÍTICO: Garantir que req.tenantId esteja sempre disponível
        // para controllers que não passam por checkPermission (ex: GET /, GET /search)
        if (!req.tenantId) {
            req.tenantId = eventoId;
        }

        req.body = req.body || {};
        req.query = req.query || {};

        if (!req.body.evento_id) req.body.evento_id = eventoId;
        if (!req.query.evento_id) req.query.evento_id = eventoId;

        next();
    } catch (error) {
        logger.error('Erro no requireEvent:', error);
        return res.status(500).json({ error: 'Erro interno ao validar contexto de evento' });
    }
}

module.exports = { requireEvent };
