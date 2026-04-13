const express = require('express');
const router = express.Router();
const monitorController = require('./monitor.controller');
const { authenticate, checkPermission } = require('../../middleware/auth');
const { requireEvent } = require('../../middleware/eventMiddleware');

// Todas as rotas de monitoramento requerem autenticação
router.use(authenticate);

// Rotas de evento específico (requerem contexto de evento)
router.use('/watchlist', requireEvent);
router.use('/dashboard', requireEvent);

// Dashboard principal
router.get('/dashboard', authenticate, requireEvent, monitorController.dashboard);

// Rotas protegidas — migradas para checkPermission (RBAC granular)
router.get('/system-status', authenticate, checkPermission('monitor', 'leitura'), monitorController.systemStatus);
router.get('/logs', authenticate, checkPermission('monitor', 'leitura'), monitorController.systemLogs);
router.post('/logs/clear', authenticate, checkPermission('monitor', 'escrita'), monitorController.clearSystemLogs);
router.get('/performance', authenticate, checkPermission('monitor', 'leitura'), monitorController.performance);
router.get('/terminais', authenticate, monitorController.getTerminais);
router.post('/force-sync', authenticate, checkPermission('monitor', 'escrita'), monitorController.forceSync);
router.post('/clear-cache', authenticate, checkPermission('monitor', 'escrita'), monitorController.clearCache);

// Watchlist (Monitoramento de Alvos)
router.get('/watchlist', authenticate, requireEvent, monitorController.listWatchlist);
router.post('/watchlist', authenticate, requireEvent, monitorController.addToWatchlist);
router.delete('/watchlist/:id', authenticate, requireEvent, monitorController.removeFromWatchlist);

module.exports = router;