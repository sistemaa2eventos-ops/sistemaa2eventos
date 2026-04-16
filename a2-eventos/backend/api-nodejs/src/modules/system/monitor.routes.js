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
router.get('/dashboard', requireEvent, monitorController.dashboard);

// Rotas protegidas — migradas para checkPermission (RBAC granular)
router.get('/system-status', checkPermission('monitor', 'leitura'), monitorController.systemStatus);
router.get('/logs', checkPermission('monitor', 'leitura'), monitorController.systemLogs);
router.post('/logs/clear', checkPermission('monitor', 'escrita'), monitorController.clearSystemLogs);
router.get('/performance', checkPermission('monitor', 'leitura'), monitorController.performance);
router.get('/terminais', checkPermission('monitor', 'leitura'), requireEvent, monitorController.getTerminais);
router.post('/force-sync', checkPermission('monitor', 'escrita'), monitorController.forceSync);
router.post('/clear-cache', checkPermission('monitor', 'escrita'), monitorController.clearCache);

// Watchlist (Monitoramento de Alvos)
router.get('/watchlist', checkPermission('monitor', 'leitura'), requireEvent, monitorController.listWatchlist);
router.post('/watchlist', checkPermission('monitor', 'escrita'), requireEvent, monitorController.addToWatchlist);
router.delete('/watchlist/:id', checkPermission('monitor', 'escrita'), requireEvent, monitorController.removeFromWatchlist);

module.exports = router;
