const express = require('express');
const router = express.Router();
const accessController = require('./checkin.controller');
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
router.post('/pulseira/link-checkin', sessionMiddleware, rateLimiter.access, accessController.credenciarPulseira);
router.post('/link-checkin', sessionMiddleware, rateLimiter.access, accessController.credenciarPulseira);
router.get('/pulseira/buscar', sessionMiddleware, accessController.buscarPessoaPulseira);
router.get('/pulseira/ultimo/:pessoa_id', sessionMiddleware, accessController.ultimoCheckin);

// ============================================
// CHECK-IN GENÉRICO (manual e qrcode — painel web)
// ============================================
router.post('/checkin/manual', sessionMiddleware, rateLimiter.access, accessController.checkinManual);
router.post('/checkin/qrcode', sessionMiddleware, rateLimiter.access, accessController.checkinQrcode);

// ============================================
// CREDENCIAMENTO & LEITOR RÁPIDO (CÓDIGO DE BARRAS / CPF / ENTRADA & SAÍDA SEM PULSEIRA)
// ============================================
router.post('/credenciar-pulseira', sessionMiddleware, rateLimiter.access, accessController.credenciarPulseira);
router.post('/leitor-rapido', sessionMiddleware, rateLimiter.access, accessController.leitorRapido);

// ============================================
// CONSULTA E FISCALIZAÇÃO DE PULSEIRA / ÁREAS (painel web & app fiscal)
// ============================================
router.get('/consultar-pulseira/:codigo', sessionMiddleware, accessController.consultarPulseira);
router.get('/fiscalizacoes-recentes', sessionMiddleware, accessController.getFiscalizacoesRecentes);
router.post('/fiscalizar', sessionMiddleware, rateLimiter.access, accessController.fiscalizarAcesso);
router.post('/checkin/fiscalizar', sessionMiddleware, rateLimiter.access, accessController.fiscalizarAcesso);

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
// DEPRECATED (ainda removidas):
// - /validate/qrcode
// - /checkin/barcode
// - /checkin/rfid
// - /checkout/qrcode
// - /vincular-pulseira-facial
// ============================================

module.exports = router;
