const express = require('express');
const router = express.Router();
const watchlistController = require('./watchlist.controller');
const { authenticate, checkPermission } = require('../../middleware/auth');
const { requireEvent } = require('../../middleware/eventMiddleware');
const multer = require('multer');
const upload = multer();

// Middleware base
router.use(authenticate, requireEvent);

// Rotas de CPFs
router.get('/', checkPermission('monitor', 'leitura'), watchlistController.list);
router.post('/manual', checkPermission('monitor', 'escrita'), watchlistController.addManual);
router.post('/upload', checkPermission('monitor', 'escrita'), upload.single('file'), watchlistController.upload);
router.delete('/:id', checkPermission('monitor', 'escrita'), watchlistController.remove);

// Rotas de Contatos de Alerta
router.get('/contatos', checkPermission('monitor', 'leitura'), watchlistController.listContatos);
router.post('/contatos', checkPermission('monitor', 'escrita'), watchlistController.addContato);
router.delete('/contatos/:id', checkPermission('monitor', 'escrita'), watchlistController.removeContato);

// Histórico de Alertas
router.get('/alertas', checkPermission('monitor', 'leitura'), watchlistController.listAlertas);

module.exports = router;
