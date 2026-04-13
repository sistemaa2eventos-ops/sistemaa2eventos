const express = require('express');
const router = express.Router();
const accessController = require('./checkin.controller');
const { authenticate, authorize, validateInternalApiKey } = require('../../middleware/auth');
const { requireEvent } = require('../../middleware/eventMiddleware');
const rateLimiter = require('../../middleware/rateLimiter');

// Rota para microsserviço facial (API key) - Sem contexto de evento via Token
router.post('/face/process', validateInternalApiKey, accessController.processFaceRecognition);

// Middleware global para rotas de Dashboard/Operação
const sessionMiddleware = [authenticate, requireEvent];

// Rotas para operadores (check-in/out)
router.post('/validate/qrcode', sessionMiddleware, rateLimiter.access, accessController.validateQRCode);
router.post('/checkin/qrcode', sessionMiddleware, rateLimiter.access, accessController.checkinQRCode);
router.post('/checkin/barcode', sessionMiddleware, rateLimiter.access, accessController.checkinBarcode);
router.post('/checkin/rfid', sessionMiddleware, rateLimiter.access, accessController.checkinRFID);
router.post('/checkin/manual', sessionMiddleware, rateLimiter.access, accessController.checkinManual);
router.post('/checkout', sessionMiddleware, rateLimiter.access, accessController.checkout);
router.post('/checkout/qrcode', sessionMiddleware, rateLimiter.access, accessController.checkoutQRCode);
router.post('/vincular-pulseira-facial', sessionMiddleware, rateLimiter.access, accessController.vincularPulseiraFacial);
router.get('/consultar-pulseira/:codigo', sessionMiddleware, accessController.consultarPulseira);
router.get('/ultimo-checkin/:pessoa_id', sessionMiddleware, accessController.ultimoCheckin);

// Rotas de consulta
router.get('/logs', sessionMiddleware, accessController.getLogs);
router.get('/stats/realtime', sessionMiddleware, accessController.getRealtimeStats);

// Rotas administrativas
router.post('/expulsar/:pessoa_id', sessionMiddleware, authorize('admin', 'supervisor'), accessController.expulsar);

module.exports = router;