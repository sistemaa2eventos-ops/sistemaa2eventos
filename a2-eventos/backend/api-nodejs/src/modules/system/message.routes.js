const express = require('express');
const router = express.Router();
const messageController = require('./message.controller');
const { authenticate, checkPermission } = require('../../middleware/auth');

/**
 * @route GET /api/messages/templates
 */
router.get('/templates', authenticate, checkPermission('configuracoes', 'leitura'), messageController.index);

/**
 * @route POST /api/messages/templates
 */
router.post('/templates', authenticate, checkPermission('configuracoes', 'escrita'), messageController.store);

/**
 * @route POST /api/messages/preview
 */
router.post('/preview', authenticate, checkPermission('configuracoes', 'leitura'), messageController.preview);

module.exports = router;
