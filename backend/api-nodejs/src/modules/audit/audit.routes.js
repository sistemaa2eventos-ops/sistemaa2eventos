const express = require('express');
const router = express.Router();
const auditController = require('./audit.controller');
const { authenticate, authorize } = require('../../middleware/auth');
const { requireEvent } = require('../../middleware/eventMiddleware');

// Somente Master e Supervisor podem ver logs de auditoria brutos
router.get('/', authenticate, requireEvent, authorize('admin_master', 'supervisor'), auditController.list);

// Encerramento de sessão do operador ao deslogar (com salvamento de relatório consolidado)
router.post('/sessao-logout', authenticate, auditController.registrarLogoutSessao);

// Histórico de relatórios de sessões de operador (acessível por Master, Supervisor e pelo próprio operador)
router.get('/sessoes-operadores', authenticate, auditController.listarSessoesOperadores);

// Botão de pânico / chamada do Administrador Master pelo operador
router.post('/chamar-master', authenticate, auditController.chamarMaster);

module.exports = router;
