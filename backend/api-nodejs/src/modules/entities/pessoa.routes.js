const express = require('express');
const router = express.Router();
const pessoaController = require('./pessoa.controller');
const accessController = require('../checkin/checkin.controller');
const { authenticate, authorize } = require('../../middleware/auth');
const { requireEvent } = require('../../middleware/eventMiddleware');
const { validatePessoa } = require('../../middleware/validator');

// Aplicar middleware de autenticação e contexto de evento a todas as rotas
router.use(authenticate, requireEvent);

router.get('/', pessoaController.list.bind(pessoaController));
router.get('/search', pessoaController.search.bind(pessoaController));
router.post('/generate-upload-url', authorize('admin', 'supervisor', 'operador'), pessoaController.generateUploadUrl.bind(pessoaController));
router.post('/', authorize('admin', 'supervisor', 'operador'), validatePessoa, pessoaController.create.bind(pessoaController));
router.get('/:id', pessoaController.getById.bind(pessoaController));
router.put('/:id', authorize('admin', 'supervisor'), pessoaController.update.bind(pessoaController));
router.delete('/:id', authorize('admin'), pessoaController.delete.bind(pessoaController));
router.post('/:id/bloqueio', authorize('admin', 'supervisor'), accessController.bloquearPessoa.bind(accessController));
router.get('/:id/qrcode', pessoaController.generateQRCode.bind(pessoaController));

module.exports = router;