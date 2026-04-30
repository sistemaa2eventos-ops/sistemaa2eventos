const express = require('express');
const router = express.Router();
const veiculoController = require('./veiculo.controller');
const { authenticate, authorize } = require('../../middleware/auth');
const { requireEvent } = require('../../middleware/eventMiddleware');

// Validar sessão de usuário autenticado e contexto de evento ativo ('Event-Id' header)
router.use(authenticate, requireEvent);

// Rotas CRUD
router.get('/', veiculoController.list);
router.get('/:id', veiculoController.getById);

// Cadastro de novos veículos protegido por RBAC (Criação e Atualização)
router.post('/', authorize('admin', 'supervisor', 'operador'), veiculoController.create);
router.put('/:id', authorize('admin', 'supervisor', 'operador'), veiculoController.update);

// Exclusão estrita apenas para Admin
router.delete('/:id', authorize('admin'), veiculoController.delete);

module.exports = router;
