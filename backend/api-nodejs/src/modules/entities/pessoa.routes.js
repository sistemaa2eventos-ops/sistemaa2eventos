const express = require('express');
const router = express.Router();
const pessoaController = require('./pessoa.controller');
const accessController = require('../checkin/checkin.controller');
const { authenticate, authorize, checkPermission } = require('../../middleware/auth');
const { requireEvent } = require('../../middleware/eventMiddleware');
const { validatePessoa } = require('../../middleware/validator');

// Aplicar middleware de autenticação e contexto de evento a todas as rotas
router.use(authenticate, requireEvent);

router.get('/', pessoaController.list.bind(pessoaController));
router.get('/search', pessoaController.search.bind(pessoaController));
router.post('/generate-upload-url', authorize('admin', 'supervisor', 'operador'), pessoaController.generateUploadUrl.bind(pessoaController));
router.post('/', authorize('admin', 'supervisor', 'operador'), validatePessoa, pessoaController.create.bind(pessoaController));
router.get('/:id', pessoaController.getById.bind(pessoaController));
// Editar cadastro: operador com o módulo Pessoas liberado (campos de status/evento/empresa ficam fora, ver pessoa.service)
router.put('/:id', authorize('admin', 'supervisor', 'operador'), checkPermission('pessoas', 'escrita'), pessoaController.update.bind(pessoaController));
router.patch('/:id/status', authorize('admin', 'supervisor'), pessoaController.updateStatus.bind(pessoaController));
router.delete('/:id', authorize('admin', 'supervisor'), pessoaController.delete.bind(pessoaController));
router.post('/:id/bloqueio', authorize('admin', 'supervisor', 'operador'), pessoaController.toggleBlock.bind(pessoaController));
// Liberação manual por turno (documentação pendente) — vale até o checkout ou o horário de reset do evento
router.post('/:id/liberacao-manual', authorize('admin', 'supervisor', 'operador'), pessoaController.liberarManual.bind(pessoaController));
router.delete('/:id/liberacao-manual', authorize('admin', 'supervisor', 'operador'), pessoaController.revogarLiberacaoManual.bind(pessoaController));
router.post('/:id/qr-code', authorize('admin', 'supervisor', 'operador'), pessoaController.generateQRCode.bind(pessoaController));
router.get('/:id/qrcode', pessoaController.generateQRCode.bind(pessoaController));

//Fluxo de Aprovação
router.post('/:id/approve', authorize('admin', 'supervisor'), pessoaController.approve.bind(pessoaController));
router.post('/:id/reject', authorize('admin', 'supervisor'), pessoaController.reject.bind(pessoaController));

module.exports = router;
