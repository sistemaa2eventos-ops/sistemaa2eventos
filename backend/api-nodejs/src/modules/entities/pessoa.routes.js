const express = require('express');
const router = express.Router();
const pessoaController = require('./pessoa.controller');
const accessController = require('../checkin/checkin.controller');
const { authenticate, authorize, checkPermission } = require('../../middleware/auth');
const { requireEvent } = require('../../middleware/eventMiddleware');
const { validatePessoa } = require('../../middleware/validator');
const { bloquearSeModuloDesligado } = require('../../middleware/moduloDesligado');

// Validação da trava de liberação manual de pendentes
const checarLiberarPendente = (req, res, next) => {
    const userRole = req.user?.nivel_acesso || req.user?.role;
    if (userRole === 'admin_master' || userRole === 'admin') return next();
    const regras = req.user?.permissions?.regras || req.user?.permissions || {};
    if (regras.checkin_liberar_pendente === false) {
        return res.status(403).json({ error: 'Acesso negado: Perfil sem permissão para liberação manual de participantes pendentes.' });
    }
    next();
};

// Aplicar middleware de autenticação e contexto de evento a todas as rotas
router.use(authenticate, requireEvent);

router.get('/', pessoaController.list.bind(pessoaController));
router.get('/search', pessoaController.search.bind(pessoaController));
router.post('/generate-upload-url', authorize('admin', 'supervisor', 'operador'), pessoaController.generateUploadUrl.bind(pessoaController));
// Cadastro respeita o módulo "pessoas" desligado em Usuários → Permissões e travas de somente leitura
router.post('/', authorize('admin', 'supervisor', 'operador'), bloquearSeModuloDesligado('pessoas'), checkPermission('pessoas', 'escrita'), validatePessoa, pessoaController.create.bind(pessoaController));
router.get('/:id', pessoaController.getById.bind(pessoaController));
// Editar cadastro: operador com o módulo Pessoas liberado (campos de status/evento/empresa ficam fora, ver pessoa.service)
router.put('/:id', authorize('admin', 'supervisor', 'operador'), checkPermission('pessoas', 'escrita'), pessoaController.update.bind(pessoaController));
router.patch('/:id/status', authorize('admin', 'supervisor'), checkPermission('pessoas', 'escrita'), pessoaController.updateStatus.bind(pessoaController));
router.delete('/:id', authorize('admin', 'supervisor'), checkPermission('pessoas', 'escrita'), pessoaController.delete.bind(pessoaController));
router.post('/:id/bloqueio', authorize('admin', 'supervisor', 'operador'), checkPermission('pessoas', 'escrita'), pessoaController.toggleBlock.bind(pessoaController));
// Liberação manual por turno (documentação pendente) — vale até o checkout ou o horário de reset do evento
router.post('/:id/liberacao-manual', authorize('admin', 'supervisor', 'operador'), checarLiberarPendente, pessoaController.liberarManual.bind(pessoaController));
router.delete('/:id/liberacao-manual', authorize('admin', 'supervisor', 'operador'), checarLiberarPendente, pessoaController.revogarLiberacaoManual.bind(pessoaController));
router.post('/:id/qr-code', authorize('admin', 'supervisor', 'operador'), pessoaController.generateQRCode.bind(pessoaController));
router.get('/:id/qrcode', pessoaController.generateQRCode.bind(pessoaController));
router.post('/:id/reenviar-qrcode', authorize('admin', 'supervisor', 'operador'), pessoaController.reenviarQRCode.bind(pessoaController));

//Fluxo de Aprovação
router.post('/:id/approve', authorize('admin', 'supervisor'), pessoaController.approve.bind(pessoaController));
router.post('/:id/reject', authorize('admin', 'supervisor'), pessoaController.reject.bind(pessoaController));

module.exports = router;
