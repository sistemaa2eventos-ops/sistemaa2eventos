const express = require('express');
const router = express.Router();
const reportController = require('./report.controller');
const { authenticate, authorize } = require('../../middleware/auth');
const { requireEvent } = require('../../middleware/eventMiddleware');

// Relatórios requerem nível de Supervisor ou Admin e contexto de evento
router.use(authenticate);
router.use(requireEvent);
router.use(authorize('admin', 'supervisor'));

router.get('/daily', reportController.dailyReport);
router.get('/company-summary', reportController.companySummary);
router.get('/ranking', reportController.getRanking);

module.exports = router;
