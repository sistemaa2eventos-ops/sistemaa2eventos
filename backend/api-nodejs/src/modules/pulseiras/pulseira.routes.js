const express = require('express');
const router = express.Router();
const pulseiraService = require('./pulseira.service');
const { authenticate, checkPermission } = require('../../middleware/auth');
const { requireEvent } = require('../../middleware/eventMiddleware');
const ApiResponse = require('../../utils/apiResponse');
const auditService = require('../../services/audit.service');
const logger = require('../../services/logger');

// Histórico de pulseiras (entregue, trocada, devolvida, perdida)
router.use(authenticate);
router.use(requireEvent);

router.get('/historico', checkPermission('relatorios', 'leitura'), async (req, res) => {
    try {
        return ApiResponse.success(res, await pulseiraService.historico(req.event.id, req.query));
    } catch (error) {
        logger.error('Erro no histórico de pulseiras:', { message: error.message, code: error.code });
        return ApiResponse.error(res, 'Erro ao carregar o histórico de pulseiras.', 500);
    }
});

// Devolvida ou perdida: encerra a pulseira em uso e tira o número da pessoa
router.post('/encerrar', checkPermission('checkin', 'escrita'), async (req, res) => {
    try {
        const { pessoa_id, motivo, observacao } = req.body || {};
        if (!pessoa_id) return ApiResponse.error(res, 'pessoa_id é obrigatório.', 400);
        const r = await pulseiraService.encerrar(req.event.id, pessoa_id, { motivo, observacao }, req.user?.id || null);
        await auditService.logEntity(req, motivo === 'perdida' ? 'BRACELET_LOST' : 'BRACELET_RETURNED', 'PESSOA', pessoa_id,
            { numero_pulseira: r.numero_pulseira, observacao: observacao || null });
        return ApiResponse.success(res, r);
    } catch (error) {
        logger.error('Erro ao encerrar pulseira:', error.message);
        return ApiResponse.error(res, error.status ? error.message : 'Erro ao registrar a pulseira.', error.status || 500);
    }
});

module.exports = router;
