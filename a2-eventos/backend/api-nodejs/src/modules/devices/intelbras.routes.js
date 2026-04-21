const express = require('express');
const router = express.Router();
const intelbrasController = require('./intelbras.controller');
const { validateInternalApiKey } = require('../../middleware/auth');
const multer = require('multer');

// Usar storage em memória temporário para fotos de passagem rápida
const upload = multer({ storage: multer.memoryStorage() });

/**
 * Middleware para garantir que um token está presente.
 * A validação por dispositivo (control_token) é feita no controller.
 * Isso evita rejeitar dispositivos com tokens individuais válidos.
 */
const validatePushToken = (req, res, next) => {
    const token = req.query.token || req.headers['x-push-token'];
    if (!token) {
        return res.status(401).json({ error: 'Não autorizado: Token ausente. Configure o dispositivo com ?token=SEU_TOKEN' });
    }
    next();
};

/**
 * @route   POST /api/intelbras/events
 * @desc    Recebe eventos em tempo real (Modo Push/Evento)
 * @access  Protected by Push Token
 */
router.post('/events', validatePushToken, upload.any(), intelbrasController.handleEventPush.bind(intelbrasController));

/**
 * @route   POST /api/intelbras/online
 * @desc    Modo Online — dispositivo pergunta se pode liberar acesso
 *          Responde: {"message":"...","code":200,"auth":"true|false"}
 *          Configurar no dispositivo:
 *            PictureHttpUpload.UploadServerList[0].Uploadpath=/api/intelbras/online
 *            Intelbras_ModeCfg.DeviceMode=1
 * @access  Protected by Push Token
 */
router.post('/online', validatePushToken, upload.any(), intelbrasController.handleOnlineMode.bind(intelbrasController));
router.get('/online', validatePushToken, intelbrasController.handleOnlineMode.bind(intelbrasController));

/**
 * @route   GET /api/intelbras/keepalive
 * @desc    Heartbeat do dispositivo — atualiza status_online
 *          Configurar: Intelbras_ModeCfg.KeepAlive.Path=/api/intelbras/keepalive
 */
router.get('/keepalive', intelbrasController.handleKeepalive.bind(intelbrasController));

// Diagnóstico
router.get('/ping', (req, res) => {
    res.json({
        success: true,
        message: 'Servidor A2 Eventos respondendo!',
        server_ip: req.hostname,
        device_ip: req.ip,
        timestamp: new Date().toISOString(),
        endpoints: {
            online: `/api/intelbras/online?token=SEU_TOKEN`,
            keepalive: `/api/intelbras/keepalive?token=SEU_TOKEN`,
            push: `/api/intelbras/events?token=SEU_TOKEN`
        }
    });
});

module.exports = router;

