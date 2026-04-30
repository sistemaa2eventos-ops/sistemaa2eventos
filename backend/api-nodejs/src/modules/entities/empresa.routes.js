const express = require('express');
const router = express.Router();
const empresaController = require('./empresa.controller');
const { authenticate, authorize } = require('../../middleware/auth');
const { requireEvent } = require('../../middleware/eventMiddleware');

// Todas as rotas de empresa requerem autenticação e contexto de evento
router.use(authenticate);
router.use(requireEvent);

// Rotas protegidas
router.get('/', empresaController.list);
router.get('/search', empresaController.search);
router.get('/:id', empresaController.getById);
router.post('/', authenticate, authorize('master', 'admin', 'supervisor', 'operador'), empresaController.create);
router.put('/:id', authenticate, authorize('master', 'admin', 'supervisor', 'operador'), empresaController.update);
router.delete('/:id', authorize('master', 'admin'), empresaController.delete);

// Gerar novo token de cadastro (Admin/Supervisor)
router.post('/:id/refresh-token', authorize('master', 'admin', 'supervisor'), empresaController.refreshToken);

module.exports = router;