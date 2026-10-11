const express = require('express');
const router = express.Router();
const { supabase } = require('../../config/supabase');
const { authenticate, authorize } = require('../../middleware/auth');
const { requireEvent } = require('../../middleware/eventMiddleware');
const agentService = require('../../services/agentService');
const auditService = require('../../services/audit.service');
const ApiResponse = require('../../utils/apiResponse');
const logger = require('../../services/logger');

router.use(authenticate, requireEvent, authorize('admin', 'supervisor'));

// Agentes do evento, com status de conexão e leitores vinculados (o token nunca é devolvido aqui)
router.get('/', async (req, res) => {
    try {
        const [{ data: agentes, error }, { data: leitores }] = await Promise.all([
            supabase.from('agent_tokens').select('id, nome, ativo, created_at, last_connected_at').eq('evento_id', req.event.id).order('created_at'),
            supabase.from('dispositivos_acesso').select('id, nome, agent_id').eq('evento_id', req.event.id).not('agent_id', 'is', null)
        ]);
        if (error) throw error;
        const conectados = new Set(agentService.getConnectedAgents().map(a => a.id));
        return ApiResponse.success(res, (agentes || []).map(a => ({
            ...a,
            conectado: conectados.has(a.id),
            dispositivos: (leitores || []).filter(l => l.agent_id === a.id).map(l => ({ id: l.id, nome: l.nome }))
        })));
    } catch (err) {
        logger.error(`[Agentes] Falha ao listar: ${err.message}`);
        return ApiResponse.error(res, 'Erro ao listar agentes.');
    }
});

// Cria um agente e devolve o token UMA única vez (para o .env do agente)
router.post('/', async (req, res) => {
    try {
        const nome = String(req.body?.nome || '').trim().substring(0, 100);
        if (!nome) return ApiResponse.error(res, 'Informe o nome do agente.', 400);
        const AgentService = agentService.constructor;
        const agente = await AgentService.generateToken(nome, req.event.id, req.user?.id || null);
        await auditService.logEntity(req, 'CREATE_LOCAL_AGENT', 'AGENTES', agente.id, { nome });
        return ApiResponse.success(res, agente, 201);
    } catch (err) {
        logger.error(`[Agentes] Falha ao criar: ${err.message}`);
        return ApiResponse.error(res, 'Erro ao criar agente.');
    }
});

// Desativa o agente (o token deixa de funcionar e a conexão atual é encerrada)
router.delete('/:id', async (req, res) => {
    try {
        const { error } = await supabase.from('agent_tokens').update({ ativo: false })
            .eq('id', req.params.id).eq('evento_id', req.event.id);
        if (error) throw error;
        agentService.desconectar(req.params.id);
        await auditService.logEntity(req, 'DISABLE_LOCAL_AGENT', 'AGENTES', req.params.id, {});
        return ApiResponse.success(res, { ok: true });
    } catch (err) {
        logger.error(`[Agentes] Falha ao desativar: ${err.message}`);
        return ApiResponse.error(res, 'Erro ao desativar agente.');
    }
});

module.exports = router;
