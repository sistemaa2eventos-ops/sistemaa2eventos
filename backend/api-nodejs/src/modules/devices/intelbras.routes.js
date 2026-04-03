const express = require('express');
const router = express.Router();
const intelbrasController = require('./intelbras.controller');
const { validateInternalApiKey } = require('../../middleware/auth');
const multer = require('multer');

// Usar storage em memória temporário para fotos de passagem rápida
const upload = multer({ storage: multer.memoryStorage() });

/**
 * @route   POST /api/intelbras/events
 * @desc    Recebe eventos em tempo real dos dispositivos Intelbras
 * @access  Public (Opcionalmente com API Key ou validação de IP)
 */
router.post('/events', upload.any(), intelbrasController.handleEventPush.bind(intelbrasController));

// Rota de diagnóstico: confirma que o servidor está recebendo requests do dispositivo
router.get('/ping', (req, res) => {
    res.json({
        success: true,
        message: 'Servidor A2 Eventos respondendo!',
        server_ip: req.hostname,
        device_ip: req.ip,
        timestamp: new Date().toISOString(),
        endpoint_push: `http://${req.hostname}:3001/api/intelbras/events`
    });
});

module.exports = router;

