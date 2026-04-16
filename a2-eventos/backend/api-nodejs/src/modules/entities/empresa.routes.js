const express = require('express');
const router = express.Router();
const empresaController = require('./empresa.controller');
const { authenticate, checkPermission } = require('../../middleware/auth');
const { requireEvent } = require('../../middleware/eventMiddleware');

// Todas as rotas de empresa requerem autenticação e contexto de evento
router.use(authenticate);
router.use(requireEvent);

// Rotas protegidas
router.get('/', checkPermission('empresas', 'leitura'), empresaController.list);
router.get('/search', checkPermission('empresas', 'leitura'), empresaController.search);
router.get('/:id', checkPermission('empresas', 'leitura'), empresaController.getById);
router.post('/', checkPermission('empresas', 'escrita'), empresaController.create);
router.put('/:id', checkPermission('empresas', 'escrita'), empresaController.update);
router.delete('/:id', checkPermission('empresas', 'escrita'), empresaController.delete);

// Gerar novo token de cadastro (Admin/Supervisor)
router.post('/:id/refresh-token', checkPermission('empresas', 'escrita'), empresaController.refreshToken);
router.post('/:id/gerar-convite', checkPermission('empresas', 'escrita'), empresaController.gerarConvite);

module.exports = router;
