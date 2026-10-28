const express = require('express');
const router = express.Router();
const watchlistController = require('./watchlist.controller');
const { authenticate, checkPermission, requireAdminMaster } = require('../../middleware/auth');
const { requireEvent } = require('../../middleware/eventMiddleware');
const multer = require('multer');
const upload = multer();

// Middleware base — watchlist é sigilosa: somente Admin Master
router.use(authenticate, requireAdminMaster, requireEvent);

// Qualquer alteração na watchlist vale na hora para a IA das câmeras (consulta por CPF fica em cache 30 s)
const watchlistService = require('./watchlist.service');
router.use((req, res, next) => {
    if (req.method !== 'GET') watchlistService.cacheCpf.clear();
    next();
});

// Rotas de CPFs
router.get('/', checkPermission('monitor', 'leitura'), watchlistController.list);
router.get('/template-csv', watchlistController.downloadTemplateCSV);
router.post('/manual', checkPermission('monitor', 'escrita'), watchlistController.addManual);
router.post('/upload', checkPermission('monitor', 'escrita'), upload.single('file'), watchlistController.upload);
router.post('/:id/desbloquear', checkPermission('monitor', 'escrita'), watchlistController.desbloquear);
router.post('/:id/deixar-de-monitorar', checkPermission('monitor', 'escrita'), watchlistController.deixarDeMonitorar);
router.delete('/:id', checkPermission('monitor', 'escrita'), watchlistController.deixarDeMonitorar);

// Rotas de Contatos de Alerta
router.get('/contatos', checkPermission('monitor', 'leitura'), watchlistController.listContatos);
router.post('/contatos', checkPermission('monitor', 'escrita'), watchlistController.addContato);
router.delete('/contatos/:id', checkPermission('monitor', 'escrita'), watchlistController.removeContato);

// Rotas de Pessoas Procuradas / Alertas de Segurança (Fiscalização e Monitor)
router.get('/procurados', watchlistController.listProcurados);
router.post('/procurados', watchlistController.addProcurado);
router.delete('/procurados/:id', watchlistController.remove);

// Histórico de Alertas
router.get('/alertas', watchlistController.listAlertas);

// Finalização de Rastreamento (Alvo localizado pela equipe)
router.post('/concluir-rastreamento', watchlistController.concluirRastreamento);

module.exports = router;

