const express = require('express');
const router = express.Router();
const pessoaController = require('./pessoa.controller');
const accessController = require('../checkin/checkin.controller');
const { authenticate, checkPermission } = require('../../middleware/auth');
const { requireEvent } = require('../../middleware/eventMiddleware');
const { validatePessoa } = require('../../middleware/validator');

// Aplicar middleware de autenticação e contexto de evento a todas as rotas
router.use(authenticate, requireEvent);

router.get('/', checkPermission('pessoas', 'leitura'), pessoaController.list.bind(pessoaController));
router.get('/search', checkPermission('pessoas', 'leitura'), pessoaController.search.bind(pessoaController));
router.post('/generate-upload-url', checkPermission('pessoas', 'escrita'), pessoaController.generateUploadUrl.bind(pessoaController));
router.post('/', checkPermission('pessoas', 'escrita'), validatePessoa, pessoaController.create.bind(pessoaController));
router.get('/:id', checkPermission('pessoas', 'leitura'), pessoaController.getById.bind(pessoaController));
router.put('/:id', checkPermission('pessoas', 'escrita'), pessoaController.update.bind(pessoaController));
router.patch('/:id/status', checkPermission('pessoas', 'escrita'), pessoaController.updateStatus.bind(pessoaController));
router.delete('/:id', checkPermission('pessoas', 'escrita'), pessoaController.delete.bind(pessoaController));
router.post('/:id/bloqueio', checkPermission('pessoas', 'escrita'), accessController.bloquearPessoa.bind(accessController));
router.post('/:id/qr-code', checkPermission('pessoas', 'escrita'), pessoaController.generateQRCode.bind(pessoaController));
router.get('/:id/qrcode', checkPermission('pessoas', 'leitura'), pessoaController.generateQRCode.bind(pessoaController));

module.exports = router;
