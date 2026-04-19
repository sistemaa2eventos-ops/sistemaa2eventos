const express = require('express');
const router = express.Router();
const auditController = require('./audit.controller');
const { authenticate, authorize } = require('../../middleware/auth');
const { requireEvent } = require('../../middleware/eventMiddleware');

// Somente Master e Supervisor podem ver logs de auditoria
router.get('/', authenticate, requireEvent, authorize('admin_master', 'supervisor'), auditController.list);

module.exports = router;
