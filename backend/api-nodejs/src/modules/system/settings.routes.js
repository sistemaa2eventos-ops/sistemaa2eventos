const express = require('express');
const router = express.Router();
const settingsController = require('./settings.controller');
const { getDbMetrics } = require('./metrics.controller');
const { authorize, authenticate, checkPermission } = require('../../middleware/auth');
const { smtpValidators, handleValidationErrors } = require('../../middleware/validators');

router.use(authenticate);

// Rotas exclusivas para admin e master
router.get('/', authorize(['admin', 'master', 'supervisor']), settingsController.getSettings);
router.put('/', authorize(['admin', 'master']), settingsController.updateSettings);

// Rota publica para admin web
router.get('/metrics', authorize(['admin', 'master', 'supervisor']), getDbMetrics);

// Coleções
router.get('/apikeys', authorize(['admin', 'master']), settingsController.getApiKeys);
router.post('/apikeys', authorize(['admin', 'master']), settingsController.createApiKey);
router.delete('/apikeys/:id', authorize(['admin', 'master']), settingsController.deleteApiKey);

router.get('/webhooks', authorize(['admin', 'master']), settingsController.getWebhooks);
router.post('/webhooks', authorize(['admin', 'master']), settingsController.createWebhook);
router.put('/webhooks/:id', checkPermission('configuracoes', 'escrita'), settingsController.updateWebhook);
router.post('/webhooks/:id/test', checkPermission('configuracoes', 'escrita'), settingsController.testWebhook);
router.delete('/webhooks/:id', authorize(['admin', 'master']), settingsController.deleteWebhook);

// Auditoria
router.get('/test-connection', authorize(['admin', 'master']), settingsController.testConnection);
router.get('/sync-history', authorize(['admin', 'master']), settingsController.getSyncHistory);

// Comunicação
router.post('/verify-smtp', authorize(['admin', 'master']), smtpValidators.verify, handleValidationErrors, settingsController.verifySmtp);
router.post('/verify-wpp', authorize(['admin', 'master']), settingsController.verifyWpp);
router.post('/test-email', checkPermission('configuracoes', 'escrita'), settingsController.testEmail);

// Segurança Avançada
router.post('/generate-api-key', checkPermission('configuracoes', 'escrita'), settingsController.generateApiKey);
router.post('/force-logout-all', checkPermission('configuracoes', 'escrita'), settingsController.forceLogoutAll);

module.exports = router;
