const express = require('express');
const router = express.Router();
const remuneracaoService = require('./remuneracao.service');
const { authenticate, checkPermission } = require('../../middleware/auth');
const { requireEvent } = require('../../middleware/eventMiddleware');
const ApiResponse = require('../../utils/apiResponse');
const auditService = require('../../services/audit.service');
const logger = require('../../services/logger');

// Regras de remuneração do evento (diária, meia diária, horas extras, dobra)
router.use(authenticate);
router.use(requireEvent);

const tratar = (acao, fn) => async (req, res) => {
    try {
        return await fn(req, res);
    } catch (error) {
        logger.error(`Erro ao ${acao} regra de remuneração:`, error.message);
        return ApiResponse.error(res, error.message || `Erro ao ${acao} regra.`, 400);
    }
};

router.get('/regras', checkPermission('empresas', 'leitura'), tratar('listar', async (req, res) =>
    ApiResponse.success(res, await remuneracaoService.listar(req.event.id))));

router.get('/funcoes', checkPermission('empresas', 'leitura'), tratar('listar funções da', async (req, res) =>
    ApiResponse.success(res, await remuneracaoService.funcoes(req.event.id, req.query.empresa_id || null))));

router.post('/regras', checkPermission('empresas', 'escrita'), tratar('criar', async (req, res) => {
    const regra = await remuneracaoService.criar(req.event.id, req.body || {});
    await auditService.logEntity(req, 'CREATE_PAY_RULE', 'REGRA_REMUNERACAO', regra.id, { nome: regra.nome });
    return ApiResponse.success(res, regra, 201);
}));

router.put('/regras/:id', checkPermission('empresas', 'escrita'), tratar('atualizar', async (req, res) => {
    const regra = await remuneracaoService.atualizar(req.event.id, req.params.id, req.body || {});
    await auditService.logEntity(req, 'UPDATE_PAY_RULE', 'REGRA_REMUNERACAO', regra.id, { nome: regra.nome });
    return ApiResponse.success(res, regra);
}));

router.delete('/regras/:id', checkPermission('empresas', 'escrita'), tratar('excluir', async (req, res) => {
    await remuneracaoService.excluir(req.event.id, req.params.id);
    await auditService.logEntity(req, 'DELETE_PAY_RULE', 'REGRA_REMUNERACAO', req.params.id, {});
    return ApiResponse.success(res, { id: req.params.id });
}));

module.exports = router;
