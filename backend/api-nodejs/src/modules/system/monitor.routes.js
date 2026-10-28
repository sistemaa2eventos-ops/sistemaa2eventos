const express = require('express');
const router = express.Router();
const monitorController = require('./monitor.controller');
const { authenticate, authorize, checkPermission, requireAdminMaster } = require('../../middleware/auth');
const { requireEvent } = require('../../middleware/eventMiddleware');

// Todas as rotas de monitoramento requerem autenticação
router.use(authenticate);

// Dashboard principal (requireEvent aplicado UMA vez por rota)
router.get('/dashboard', requireEvent, monitorController.dashboard);
router.post('/dashboard/reset-diario', checkPermission('monitor', 'escrita'), requireEvent, monitorController.resetDiario);

// Rotas protegidas (Admin/Master)
router.get('/system-status', authorize('master', 'admin'), monitorController.systemStatus);
router.get('/logs', authorize('master', 'admin'), monitorController.systemLogs);
router.post('/logs/clear', authorize('master', 'admin'), monitorController.clearSystemLogs);
router.get('/performance', authorize('master', 'admin'), monitorController.performance);
router.post('/force-sync', authorize('master', 'admin'), monitorController.forceSync);
router.post('/clear-cache', authorize('master', 'admin'), monitorController.clearCache);

// Rotas que requerem contexto de evento (requireEvent aplicado UMA vez por rota)
router.get('/terminais', checkPermission('monitor', 'leitura'), requireEvent, monitorController.getTerminais);

// Watchlist (Monitoramento de Alvos)
// Watchlist é sigilosa (só Admin Master, como em /api/watchlist): estas rotas antigas estavam abertas a
// qualquer usuário logado. O painel não as usa mais.
router.get('/watchlist', requireAdminMaster, requireEvent, monitorController.listWatchlist);
const limparCacheWatchlist = (req, res, next) => { require('./watchlist.service').cacheCpf.clear(); next(); };
router.post('/watchlist', requireAdminMaster, requireEvent, limparCacheWatchlist, monitorController.addToWatchlist);
router.delete('/watchlist/:id', requireAdminMaster, requireEvent, limparCacheWatchlist, monitorController.removeFromWatchlist);

module.exports = router;
