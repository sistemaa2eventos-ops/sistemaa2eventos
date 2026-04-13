const express = require('express');
const router = express.Router();
const intelbrasController = require('./intelbras.controller');
const { validateInternalApiKey } = require('../../middleware/auth');
const multer = require('multer');

// Usar storage em memória temporário para fotos de passagem rápida
const upload = multer({ storage: multer.memoryStorage() });

/**
 * Middleware simples para validar o Token de Push do Hardware
 */
const validatePushToken = (req, res, next) => {
    const token = req.query.token || req.headers['x-push-token'];
    const expectedToken = process.env.HARDWARE_PUSH_TOKEN || 'a2_sec_default_2026';

    if (token !== expectedToken) {
        return res.status(401).json({ error: 'Não autorizado: Token de hardware inválido' });
    }
    next();
};

/**
 * @route   POST /api/intelbras/events
 * @desc    Recebe eventos em tempo real dos dispositivos Intelbras
 * @access  Protected by Push Token
 */
router.post('/events', validatePushToken, upload.any(), intelbrasController.handleEventPush.bind(intelbrasController));

// Rota de diagnóstico: confirma que o servidor está recebendo requests do dispositivo
router.get('/ping', (req, res) => {
    res.json({
        success: true,
        message: 'Servidor A2 Eventos respondendo!',
        server_ip: req.hostname,
        device_ip: req.ip,
        timestamp: new Date().toISOString(),
        endpoint_push: `${process.env.FRONTEND_URL || 'https://api.nzt.app.br'}/api/intelbras/events`
    });
});

module.exports = router;

