const express = require('express');
const router = express.Router();
const { authenticate } = require('../../middleware/auth');
const { requireEvent } = require('../../middleware/eventMiddleware');
const notificacaoService = require('./notificacao.service');
const ApiResponse = require('../../utils/apiResponse');
const logger = require('../../services/logger');

router.use(authenticate, requireEvent);

// Admin Master sem evento selecionado: não há notificações de evento (evita consulta com evento_id nulo)
router.use((req, res, next) => {
    if (req.event?.id) return next();
    if (req.method === 'GET') return res.json({ success: true, data: [], nao_lidas: 0 });
    return res.status(400).json({ error: 'Selecione um evento.' });
});

// Lista as notificações do evento (?nao_lidas=1 para só as não lidas)
router.get('/', async (req, res) => {
    try {
        const naoLidas = req.query.nao_lidas === '1' || req.query.nao_lidas === 'true';
        const result = await notificacaoService.listar(req.event.id, { naoLidas, limit: Math.min(parseInt(req.query.limit) || 50, 200) });
        return res.json({ success: true, data: result.data, nao_lidas: result.nao_lidas });
    } catch (error) {
        logger.error(`[Notificações] Falha ao listar: ${error.message}`);
        return ApiResponse.error(res, 'Erro ao carregar notificações.');
    }
});

// Marca todas como lidas
router.patch('/lidas', async (req, res) => {
    try {
        await notificacaoService.marcarLida(req.event.id);
        return ApiResponse.success(res, { ok: true });
    } catch (error) {
        return ApiResponse.error(res, error.message);
    }
});

// Marca uma como lida
router.patch('/:id/lida', async (req, res) => {
    try {
        await notificacaoService.marcarLida(req.event.id, req.params.id);
        return ApiResponse.success(res, { ok: true });
    } catch (error) {
        return ApiResponse.error(res, error.message);
    }
});

module.exports = router;
