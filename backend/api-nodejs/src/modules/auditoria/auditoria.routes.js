const express = require('express');
const router = express.Router();
const AuditoriaService = require('./auditoria.service');
const { authenticate, checkAnyPermission } = require('../../middleware/auth');
const { requireEvent } = require('../../middleware/eventMiddleware');
const rateLimiter = require('../../middleware/rateLimiter');
const ApiResponse = require('../../utils/apiResponse');
const logger = require('../../services/logger');

const sessionMiddleware = [authenticate, requireEvent];

router.get(
    '/pessoas/:pessoa_id/status-documental',
    sessionMiddleware,
    rateLimiter.consulta,
    checkAnyPermission(['checkin', 'checkout', 'auditoria_documentos', 'fiscalizacao']),
    async (req, res) => {
        try {
            const pessoa = await AuditoriaService.buscarPessoa(req.event.id, req.params.pessoa_id);
            if (!pessoa) return ApiResponse.error(res, 'Pessoa não encontrada neste evento', 404);
            return ApiResponse.success(res, await AuditoriaService.situacaoParaEntrada(req.event.id, pessoa));
        } catch (error) {
            logger.error({ err: error, pessoa_id: req.params.pessoa_id }, 'Erro ao buscar situação documental');
            return ApiResponse.error(res, 'Erro ao buscar situação documental', 500);
        }
    }
);

// Quem audita documentos ou opera o check-in (portaria) pode liberar a entrada do dia
router.post(
    '/pessoas/:pessoa_id/liberar-um-dia',
    sessionMiddleware,
    rateLimiter.access,
    checkAnyPermission(['auditoria_documentos', 'checkin']),
    async (req, res) => {
        try {
            const motivo = String(req.body?.motivo || '').trim();
            if (motivo.length < 3) return ApiResponse.error(res, 'Informe o motivo da liberação', 400);

            const pessoa = await AuditoriaService.buscarPessoa(req.event.id, req.params.pessoa_id);
            if (!pessoa) return ApiResponse.error(res, 'Pessoa não encontrada neste evento', 404);

            const result = await AuditoriaService.liberarPorUmDia(req.event.id, pessoa.id, motivo.slice(0, 500), req.user?.id);
            logger.info({ pessoa_id: pessoa.id, evento_id: req.event.id, por: req.user?.id, data: result.liberado_ate }, 'Documentação pendente liberada por um dia');
            return ApiResponse.success(res, result, 201);
        } catch (error) {
            // 23514: CHECK antigo (data >= CURRENT_DATE em UTC) recusa liberações entre 21h e 24h; ver migration 20261124b
            if (error?.code === '23514') {
                return ApiResponse.error(res, 'Liberação recusada pelo banco depois das 21h: aplique a migration 20261124b_documento_liberacoes_data.sql', 500);
            }
            logger.error({ err: error, pessoa_id: req.params.pessoa_id }, 'Erro ao liberar pessoa por um dia');
            return ApiResponse.error(res, 'Erro ao liberar a entrada de hoje', 500);
        }
    }
);

module.exports = router;
