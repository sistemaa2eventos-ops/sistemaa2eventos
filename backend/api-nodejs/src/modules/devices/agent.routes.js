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
            // O que o PC sabe fazer (agente antigo não troca o acesso da Central pelo painel)
            central_pelo_painel: !!agentService.recursos(a.id).central_acesso,
            central_chave_pelo_painel: !!agentService.recursos(a.id).central_chave,
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

// Ferramenta de rede: ping + portas a partir do PC do evento (equipe de campo sem Prompt de Comando)
router.post('/rede-testar', async (req, res) => {
    try {
        const { host, portas, agent_id } = req.body || {};
        const r = await require('./redeTeste.service').testar({ eventoId: req.event.id, agentId: agent_id || null, host, portas });
        logger.info(`[Rede] ${req.user?.email || req.user?.id} testou ${r.host} portas ${(r.portas || []).map(p => p.porta).join(',') || '-'} pelo ${r.origem}`);
        return ApiResponse.success(res, r);
    } catch (err) {
        if (err.status) return ApiResponse.error(res, err.message, err.status);
        logger.error(`[Rede] Falha no teste: ${err.message}`);
        return ApiResponse.error(res, 'Erro ao testar a rede.');
    }
});

// Central de Monitoramento do PC do evento: quem pode abrir (só o PC, rede local ou Tailscale)
const ACESSOS_CENTRAL = ['local', 'rede', 'tailscale'];
const agenteDoEvento = (req) => (agentService.agents.get(req.params.id)?.agentInfo?.evento_id === req.event.id ? req.params.id : null);
const erroAgente = (res, err) => (/Comando desconhecido/i.test(err.message)
    ? ApiResponse.error(res, 'O agente do PC do evento é de uma versão antiga. No PC do evento, rode ligar-ia-facial.bat para atualizar.', 409)
    : ApiResponse.error(res, `O PC do evento não respondeu: ${err.message}`, 502));

router.get('/:id/central', async (req, res) => {
    const id = agenteDoEvento(req);
    if (!id) return ApiResponse.error(res, 'Agente desconectado ou de outro evento.', 404);
    try {
        return ApiResponse.success(res, await agentService.sendCommand(id, 'central_status', {}, 8000));
    } catch (err) {
        return erroAgente(res, err);
    }
});

// Abrir a Central para a rede: só admin (outros computadores passam a ver as câmeras, com a chave)
router.put('/:id/central', authorize('admin'), async (req, res) => {
    const acesso = req.body?.acesso;
    if (!ACESSOS_CENTRAL.includes(acesso)) return ApiResponse.error(res, 'Escolha: só este PC, rede local ou Tailscale.', 400);
    const id = agenteDoEvento(req);
    if (!id) return ApiResponse.error(res, 'Agente desconectado ou de outro evento.', 404);
    try {
        const r = await agentService.sendCommand(id, 'central_configurar', { acesso }, 15000);
        await auditService.logEntity(req, 'CENTRAL_ACCESS_CHANGE', 'AGENTES', id, { acesso }).catch(() => {});
        return ApiResponse.success(res, r);
    } catch (err) {
        return erroAgente(res, err);
    }
});

// Chave de acesso da Central: mostrar (nova=false) ou gerar outra (nova=true, derruba quem entrou).
// POST e sem cache: a chave não fica em log de acesso nem no histórico do navegador. Só admin, auditado.
router.post('/:id/central/chave', authorize('admin'), async (req, res) => {
    const id = agenteDoEvento(req);
    if (!id) return ApiResponse.error(res, 'Agente desconectado ou de outro evento.', 404);
    const nova = req.body?.nova === true;
    try {
        const r = await agentService.sendCommand(id, 'central_chave', { nova }, 8000);
        if (!r?.chave) throw new Error('o PC não devolveu a chave');
        await auditService.logEntity(req, nova ? 'CENTRAL_KEY_REGENERATE' : 'CENTRAL_KEY_VIEW', 'AGENTES', id, {}).catch(() => {});
        res.set('Cache-Control', 'no-store');
        return ApiResponse.success(res, { chave: r.chave, nova });
    } catch (err) {
        return erroAgente(res, err);
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
