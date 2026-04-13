const express = require('express');
const router = express.Router();
const reportController = require('./report.controller');
const { authenticate, checkPermission } = require('../../middleware/auth');
const { requireEvent } = require('../../middleware/eventMiddleware');

// Relatórios requerem autenticação e contexto de evento — migrado para checkPermission
router.use(authenticate);
router.use(requireEvent);

router.get('/daily', checkPermission('relatorios', 'leitura'), reportController.dailyReport);
router.get('/company-summary', checkPermission('relatorios', 'leitura'), reportController.companySummary);
router.get('/ranking', checkPermission('relatorios', 'leitura'), reportController.getRanking);
router.get('/attendance-pdf', checkPermission('relatorios', 'leitura'), reportController.attendancePDF);

// Novos relatórios agregados
router.get('/por-area',    checkPermission('relatorios', 'leitura'), reportController.porArea);
router.get('/por-empresa', checkPermission('relatorios', 'leitura'), reportController.porEmpresa);
router.get('/por-leitor',  checkPermission('relatorios', 'leitura'), reportController.porLeitor);
router.get('/por-funcao',  checkPermission('relatorios', 'leitura'), reportController.porFuncao);
router.get('/por-status',  checkPermission('relatorios', 'leitura'), reportController.porStatus);

module.exports = router;
