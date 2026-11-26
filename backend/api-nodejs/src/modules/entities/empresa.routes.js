const express = require('express');
const router = express.Router();
const empresaController = require('./empresa.controller');
const { authenticate, authorize } = require('../../middleware/auth');
const { requireEvent } = require('../../middleware/eventMiddleware');
const { bloquearSeModuloDesligado } = require('../../middleware/moduloDesligado');

// Todas as rotas de empresa requerem autenticação e contexto de evento
router.use(authenticate);
router.use(requireEvent);

// Módulo "empresas" desligado em Usuários → Permissões vale também para estas rotas
const moduloEmpresas = bloquearSeModuloDesligado('empresas');

// Rotas protegidas (o controller limita toda operação por id ao evento da requisição).
// Leitura sem o bloqueio de módulo: a lista de empresas alimenta o cadastro de pessoas e outras telas.
router.get('/', empresaController.list);
router.get('/search', empresaController.search);
// Portal da empresa: solicitações do responsável (antes de /:id) e chave de acesso
const portalAdmin = require('../portalEmpresa/portalEmpresaAdmin.controller');
const decideSolicitacao = authorize('master', 'admin', 'supervisor');
router.get('/solicitacoes', decideSolicitacao, portalAdmin.listarSolicitacoes);
router.get('/solicitacoes/contagem', decideSolicitacao, portalAdmin.contarSolicitacoes);
router.post('/solicitacoes/:solicitacaoId/aprovar', decideSolicitacao, moduloEmpresas, portalAdmin.aprovar);
router.post('/solicitacoes/:solicitacaoId/recusar', decideSolicitacao, moduloEmpresas, portalAdmin.recusar);
router.get('/:id/portal-acesso', authorize('master', 'admin', 'supervisor'), moduloEmpresas, portalAdmin.obterAcesso);
router.post('/:id/portal-acesso/chave', authorize('master', 'admin', 'supervisor'), moduloEmpresas, portalAdmin.gerarChave);

router.get('/:id', empresaController.getById);
router.get('/:id/participantes-resumo', empresaController.participantesResumo);
router.post('/', authorize('master', 'admin', 'supervisor', 'operador'), moduloEmpresas, empresaController.create);
router.put('/:id', authorize('master', 'admin', 'supervisor', 'operador'), moduloEmpresas, empresaController.update);
router.delete('/:id', authorize('master', 'admin'), empresaController.delete);

// Gerar novo token de cadastro (Admin/Supervisor)
router.post('/:id/refresh-token', authorize('master', 'admin', 'supervisor'), moduloEmpresas, empresaController.refreshToken);

// Enviar convite por e-mail para o responsável da empresa (link de colaboradores + link de documentação da empresa)
router.post('/:id/send-invite', authorize('master', 'admin', 'supervisor', 'operador'), moduloEmpresas, empresaController.sendInviteEmail);

module.exports = router;
