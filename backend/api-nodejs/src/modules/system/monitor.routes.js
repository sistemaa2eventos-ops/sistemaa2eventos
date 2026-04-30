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
router.get('/dashboard', authenticate, requireEvent, monitorController.dashboard);

// Rotas protegidas (Admin/Master)
router.get('/system-status', authenticate, authorize('master', 'admin'), monitorController.systemStatus);
router.get('/logs', authenticate, authorize('master', 'admin'), monitorController.systemLogs);
router.post('/logs/clear', authenticate, authorize('master', 'admin'), monitorController.clearSystemLogs);
router.get('/performance', authenticate, authorize('master', 'admin'), monitorController.performance);
router.post('/force-sync', authenticate, authorize('master', 'admin'), monitorController.forceSync);
router.post('/clear-cache', authenticate, authorize('master', 'admin'), monitorController.clearCache);

// Watchlist (Monitoramento de Alvos)
router.get('/watchlist', authenticate, requireEvent, monitorController.listWatchlist);
router.post('/watchlist', authenticate, requireEvent, monitorController.addToWatchlist);
router.delete('/watchlist/:id', authenticate, requireEvent, monitorController.removeFromWatchlist);

module.exports = router;