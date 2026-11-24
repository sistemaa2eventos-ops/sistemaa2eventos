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

// Lançamento errado (pulseira digitada errada, marcação por engano): desfaz e restaura o anterior
router.post('/anular', checkPermission('checkin', 'escrita'), async (req, res) => {
    try {
        const { pessoa_id, observacao } = req.body || {};
        if (!pessoa_id) return ApiResponse.error(res, 'pessoa_id é obrigatório.', 400);
        const r = await pulseiraService.anularUltimo(req.event.id, pessoa_id, { observacao }, req.user?.id || null);
        await auditService.logEntity(req, 'BRACELET_ANNULLED', 'PESSOA', pessoa_id,
            { ...r, observacao: String(observacao || '').trim() || null });
        return ApiResponse.success(res, r);
    } catch (error) {
        logger.error('Erro ao anular lançamento de pulseira:', error.message);
        return ApiResponse.error(res, error.status ? error.message : 'Não foi possível desfazer o lançamento da pulseira.', error.status || 500);
    }
});

// Correção feita na tela de check-in: o número errado é anulado e a pessoa recebe o certo (sem entrada)
router.post('/corrigir', checkPermission('checkin', 'escrita'), async (req, res) => {
    try {
        const { pessoa_id, numero_pulseira, observacao } = req.body || {};
        if (!pessoa_id || !numero_pulseira) return ApiResponse.error(res, 'pessoa_id e numero_pulseira são obrigatórios.', 400);
        const r = await pulseiraService.corrigirNumero(req.event.id, pessoa_id, numero_pulseira, req.user?.id || null, observacao);
        await auditService.logEntity(req, 'BRACELET_CORRECTED', 'PESSOA', pessoa_id,
            { ...r, observacao: String(observacao || '').trim() || null });
        return ApiResponse.success(res, r);
    } catch (error) {
        logger.error('Erro ao corrigir número de pulseira:', error.message);
        return ApiResponse.error(res, error.status ? error.message : 'Não foi possível corrigir a pulseira.', error.status || 500);
    }
});

// Status de pulseira: em uso hoje ou pendência de dias anteriores
router.get('/status/:pessoa_id', async (req, res) => {
    try {
        const { pessoa_id } = req.params;
        if (!pessoa_id) return ApiResponse.error(res, 'pessoa_id é obrigatório.', 400);
        const status = await pulseiraService.buscarStatusPulseira(req.event.id, pessoa_id);
        return ApiResponse.success(res, status);
    } catch (error) {
        logger.error('Erro ao buscar status de pulseira:', error.message);
        return ApiResponse.error(res, 'Erro ao buscar status da pulseira.', 500);
    }
});

// Registrar motivo da não devolução (pendência de dia anterior)
router.post('/pendencia/:pessoa_id', checkPermission('checkin', 'escrita'), async (req, res) => {
    try {
        const { pessoa_id } = req.params;
        const { numero, dataCheckin } = req.body || {};
        const motivo = String(req.body?.motivo || '').trim();
        if (!pessoa_id || !numero || !dataCheckin) {
            return ApiResponse.error(res, 'Pendência sem pulseira ou sem data: reabra a ficha e tente de novo.', 400);
        }
        if (!/^\d+$/.test(String(numero).trim())) {
            return ApiResponse.error(res, `Pulseira "${numero}" não é numérica: o motivo não pode ser registrado por aqui.`, 400);
        }
        if (motivo.length < 3) return ApiResponse.error(res, 'Escreva o motivo da não devolução.', 400);
        const r = await pulseiraService.registrarMotivoPendencia(
            req.event.id,
            pessoa_id,
            { numero: parseInt(String(numero).trim(), 10), dataCheckin, motivo: motivo.slice(0, 500) },
            req.user?.id || null
        );
        await auditService.logEntity(req, 'BRACELET_PENDENCIA_MOTIVO', 'PESSOA', pessoa_id,
            { numero_pulseira: numero, motivo: motivo || null });
        return ApiResponse.success(res, r);
    } catch (error) {
        logger.error('Erro ao registrar motivo de pendência:', error.message);
        return ApiResponse.error(res, 'Erro ao registrar o motivo.', 500);
    }
});

module.exports = router;
