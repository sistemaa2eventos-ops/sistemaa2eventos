const express = require('express');
const router = express.Router();
const settingsController = require('./settings.controller');
const { getDbMetrics } = require('./metrics.controller');
const { authorize, authenticate } = require('../../middleware/auth');

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
router.delete('/webhooks/:id', authorize(['admin', 'master']), settingsController.deleteWebhook);

// Auditoria
router.get('/test-connection', authorize(['admin', 'master']), settingsController.testConnection);
router.get('/sync-history', authorize(['admin', 'master']), settingsController.getSyncHistory);

// Comunicação
router.post('/verify-smtp', authorize(['admin', 'master']), settingsController.verifySmtp);
router.post('/verify-wpp', authorize(['admin', 'master']), settingsController.verifyWpp);

module.exports = router;
