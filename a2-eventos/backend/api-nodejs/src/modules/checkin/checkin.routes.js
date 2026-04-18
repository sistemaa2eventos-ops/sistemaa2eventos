const express = require('express');
const router = express.Router();
const accessController = require('./checkin.controller');
const terminalController = require('./terminal.controller');
const pulseiraConfigController = require('./pulseiraConfig.controller');
const { authenticate, authorize, validateInternalApiKey } = require('../../middleware/auth');
const { requireEvent } = require('../../middleware/eventMiddleware');
const rateLimiter = require('../../middleware/rateLimiter');

// ============================================
// ROTAS PÚBLICAS (sem autenticação - para terminais)
// ============================================
// Check-in/out via terminal facial (API key interna)
router.post('/facial', validateInternalApiKey, accessController.checkinFacial);

// ============================================
// Middleware para rotas autenticadas
// ============================================
const sessionMiddleware = [authenticate, requireEvent];

// ============================================
// CHECK-IN / CHECK-OUT VIA PULSEIRA
// ============================================
router.post('/pulseira/checkin', sessionMiddleware, rateLimiter.access, accessController.checkinPulseira);
router.post('/pulseira/checkout', sessionMiddleware, rateLimiter.access, accessController.checkoutPulseira);
router.get('/pulseira/buscar', sessionMiddleware, accessController.buscarPessoaPulseira);
router.get('/pulseira/ultimo/:pessoa_id', sessionMiddleware, accessController.ultimoCheckin);

// ============================================
// GESTÃO DE TERMINAIS (apenas admin_master)
// ============================================
router.get('/terminais', sessionMiddleware, terminalController.list);
router.post('/terminais', sessionMiddleware, authorize('admin_master'), terminalController.create);
router.put('/terminais/:id', sessionMiddleware, authorize('admin_master'), terminalController.update);
router.delete('/terminais/:id', sessionMiddleware, authorize('admin_master'), terminalController.delete);

// ============================================
// CONFIGURAÇÕES DE PULSEIRA (apenas admin_master)
// ============================================
router.get('/config-pulseira', sessionMiddleware, pulseiraConfigController.get);
router.put('/config-pulseira', sessionMiddleware, authorize('admin_master'), pulseiraConfigController.update);

// ============================================
// CONSULTAS
// ============================================
router.get('/logs', sessionMiddleware, accessController.getLogs);
router.get('/stats/realtime', sessionMiddleware, accessController.getRealtimeStats);

// ============================================
// ADMINISTRATIVAS
// ============================================
router.post('/expulsar/:pessoa_id', sessionMiddleware, authorize('admin_master'), accessController.expulsar);

// ============================================
// DEPRECATED -Removidas:
// - /validate/qrcode (substituir por busca de pulseira)
// - /checkin/qrcode (substituir por pulseira/checkin)
// - /checkin/barcode (removido)
// - /checkin/rfid (removido)
// - /checkin/manual (removido)
// - /checkout/qrcode (substituir por pulseira/checkout)
// - /vincular-pulseira-facial (funcionalidade integrida no checkin facial)
// ============================================

module.exports = router;