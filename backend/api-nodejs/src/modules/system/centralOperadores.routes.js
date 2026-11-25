'use strict';
/**
 * Operadores da Central de Monitoramento local (Monitor > Operadores da Central).
 * Só admin. Toda mudança fica na auditoria do sistema; o agente do evento é avisado para buscar a lista.
 */
const express = require('express');
const { authenticate, authorize } = require('../../middleware/auth');
const { requireEvent } = require('../../middleware/eventMiddleware');
const ApiResponse = require('../../utils/apiResponse');
const auditService = require('../../services/audit.service');
const agentService = require('../../services/agentService');
const logger = require('../../services/logger');
const svc = require('./centralOperadores.service');

const router = express.Router();
router.use(authenticate, requireEvent, authorize('admin'));

/** Avisa o PC do evento (se conectado) para buscar os operadores já; senão ele busca em até 1 min */
function avisarAgente(eventoId) {
    try {
        const id = agentService.findAgentForEvent(eventoId);
        if (id) agentService.sendCommand(id, 'central_operadores', {}, 8000).catch(() => {});
    } catch { /* sem agente: ele sincroniza quando conectar */ }
}

function responderErro(res, err, contexto) {
    if (err.status) return ApiResponse.error(res, err.message, err.status);
    logger.error(`[Central operadores] ${contexto}: ${err.message}`);
    return ApiResponse.error(res, 'Não deu para concluir. Tente de novo.', 500);
}

router.get('/', async (req, res) => {
    try {
        return ApiResponse.success(res, await svc.listar(req.event.id));
    } catch (err) { return responderErro(res, err, 'listar'); }
});

router.post('/', async (req, res) => {
    try {
        const op = await svc.criar(req.event.id, req.body || {}, req.user?.id);
        await auditService.logEntity(req, 'CENTRAL_OPERATOR_CREATE', 'CENTRAL_OPERADORES', op.id, { login: op.login }).catch(() => {});
        avisarAgente(req.event.id);
        return ApiResponse.success(res, op, 201);
    } catch (err) { return responderErro(res, err, 'criar'); }
});

router.patch('/:id', async (req, res) => {
    try {
        const corpo = req.body || {};
        const op = await svc.atualizar(req.event.id, req.params.id, corpo);
        const detalhes = { login: op.login, campos: Object.keys(corpo).filter(k => k !== 'senha'), senha_trocada: !!corpo.senha };
        await auditService.logEntity(req, 'CENTRAL_OPERATOR_UPDATE', 'CENTRAL_OPERADORES', op.id, detalhes).catch(() => {});
        avisarAgente(req.event.id);
        return ApiResponse.success(res, op);
    } catch (err) { return responderErro(res, err, 'atualizar'); }
});

router.delete('/:id', async (req, res) => {
    try {
        const op = await svc.excluir(req.event.id, req.params.id);
        await auditService.logEntity(req, 'CENTRAL_OPERATOR_DELETE', 'CENTRAL_OPERADORES', op.id, { login: op.login }).catch(() => {});
        avisarAgente(req.event.id);
        return ApiResponse.success(res, { id: op.id });
    } catch (err) { return responderErro(res, err, 'excluir'); }
});

// Registro de atividades (quem fez o quê, quando). Consultar também fica na auditoria do sistema.
router.get('/auditoria', async (req, res) => {
    try {
        const itens = await svc.auditoria(req.event.id, req.query || {});
        await auditService.logEntity(req, 'CENTRAL_AUDIT_VIEW', 'CENTRAL_AUDITORIA', req.event.id, { filtros: req.query || {} }).catch(() => {});
        res.set('Cache-Control', 'no-store');
        return ApiResponse.success(res, itens);
    } catch (err) { return responderErro(res, err, 'auditoria'); }
});

module.exports = router;
