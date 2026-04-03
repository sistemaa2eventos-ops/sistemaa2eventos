const express = require('express');
const router = express.Router();
const monitorController = require('./monitor.controller');
const { authenticate, authorize } = require('../../middleware/auth');
const { requireEvent } = require('../../middleware/eventMiddleware');

// Todas as rotas de monitoramento requerem autenticação
router.use(authenticate);

// Rotas de evento específico (requerem contexto de evento)
router.use('/watchlist', requireEvent);
router.use('/dashboard', requireEvent);

// Dashboard principal
router.get('/dashboard', monitorController.dashboard);

// Status do sistema (admin apenas - SEM requireEvent, são rotas globais)
router.get('/system/status', authorize('admin'), monitorController.systemStatus);
router.get('/system/logs', authorize('admin'), monitorController.systemLogs);
router.delete('/system/logs', authorize('admin'), monitorController.clearSystemLogs);
router.get('/system/performance', authorize('admin'), monitorController.performance);

// Ações administrativas (SEM requireEvent)
router.post('/sync/force', authorize('admin'), monitorController.forceSync);
router.post('/cache/clear', authorize('admin'), monitorController.clearCache);

// Watchlist de Monitoramento (COM requireEvent, pois é por evento)
router.get('/watchlist', monitorController.listWatchlist);
router.post('/watchlist', monitorController.addToWatchlist);
router.delete('/watchlist/:id', monitorController.removeFromWatchlist);

module.exports = router;