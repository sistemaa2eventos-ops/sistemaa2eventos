const express = require('express');
const router = express.Router();
const hikvisionController = require('./hikvision.controller');
const multer = require('multer');

// Middleware para multipart (fotos de passagem)
const upload = multer({ storage: multer.memoryStorage() });

/**
 * @route   POST /api/hikvision/events
 * @desc    Recebe eventos ISAPI das catracas Hikvision
 */
router.post('/events', upload.any(), hikvisionController.handleEventPush.bind(hikvisionController));

// Rota de diagnóstico
router.get('/ping', (req, res) => {
    res.json({
        success: true,
        message: 'A2 Eventos Gateway Hikvision Online',
        device_ip: req.ip,
        timestamp: new Date().toISOString()
    });
});

module.exports = router;
