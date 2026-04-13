const express = require('express');
const router = express.Router();
const settingsController = require('./settings.controller');
const { getDbMetrics } = require('./metrics.controller');
const { authenticate, checkPermission } = require('../../middleware/auth');

router.use(authenticate);

// Rotas exclusivas para admin e master — migradas para checkPermission (RBAC granular)
router.get('/', checkPermission('configuracoes', 'leitura'), settingsController.getSettings);
router.put('/', checkPermission('configuracoes', 'escrita'), settingsController.updateSettings);

// Rota publica para admin web
router.get('/metrics', checkPermission('configuracoes', 'leitura'), getDbMetrics);

// Coleções
router.get('/apikeys', checkPermission('configuracoes', 'escrita'), settingsController.getApiKeys);
router.post('/apikeys', checkPermission('configuracoes', 'escrita'), settingsController.createApiKey);
router.delete('/apikeys/:id', checkPermission('configuracoes', 'escrita'), settingsController.deleteApiKey);

router.get('/webhooks', checkPermission('configuracoes', 'escrita'), settingsController.getWebhooks);
router.post('/webhooks', checkPermission('configuracoes', 'escrita'), settingsController.createWebhook);
router.delete('/webhooks/:id', checkPermission('configuracoes', 'escrita'), settingsController.deleteWebhook);

// Auditoria
router.get('/test-connection', checkPermission('configuracoes', 'escrita'), settingsController.testConnection);
router.get('/sync-history', checkPermission('configuracoes', 'leitura'), settingsController.getSyncHistory);

// Comunicação
router.post('/verify-smtp', checkPermission('configuracoes', 'escrita'), settingsController.verifySmtp);
router.post('/verify-wpp', checkPermission('configuracoes', 'escrita'), settingsController.verifyWpp);
router.post('/test-email', checkPermission('configuracoes', 'escrita'), settingsController.testEmail);

// Segurança Avançada
router.post('/generate-api-key', checkPermission('configuracoes', 'escrita'), settingsController.generateApiKey);
router.post('/force-logout-all', checkPermission('configuracoes', 'escrita'), settingsController.forceLogoutAll);

module.exports = router;
