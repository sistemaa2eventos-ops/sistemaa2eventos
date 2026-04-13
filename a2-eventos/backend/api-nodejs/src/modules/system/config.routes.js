const express = require('express');
const router = express.Router();
const configController = require('./config.controller');
const { authenticate, checkPermission } = require('../../middleware/auth');
const { requireEvent } = require('../../middleware/eventMiddleware');

// Aplicar middleware de autenticação e contexto de evento a todas as rotas
router.use(authenticate, requireEvent);

// Rotas para Gerenciamento de Áreas — migradas para checkPermission
router.get('/areas', configController.getAreas);
router.post('/areas', checkPermission('configuracoes', 'escrita'), configController.createArea);
router.delete('/areas/:id', checkPermission('configuracoes', 'escrita'), configController.deleteArea);

// Rotas para Gerenciamento de Pulseiras Customizadas
router.get('/pulseiras', configController.getPulseiras);
router.post('/pulseiras', checkPermission('configuracoes', 'escrita'), configController.createPulseira);
router.delete('/pulseiras/:id', checkPermission('configuracoes', 'escrita'), configController.deletePulseira);

// Rotas para Editor de Etiquetas e Crachas
router.get('/etiquetas', configController.getEtiquetas);
router.post('/etiquetas', checkPermission('configuracoes', 'escrita'), configController.saveEtiquetas);

// Rotas para Credenciamento Dinâmico
router.get('/registration-settings', configController.getRegistrationSettings);
router.put('/registration-settings', checkPermission('configuracoes', 'escrita'), configController.updateRegistrationSettings);

// RBAC Dinâmico por Evento
const rbacController = require('./rbac.controller');
router.get('/rbac/matrix', checkPermission('configuracoes', 'escrita'), rbacController.getMatrix);
router.post('/rbac/rbac-toggle', checkPermission('configuracoes', 'escrita'), rbacController.updateMatrix);

// Manutenção de Performance
router.post('/clear-cache', checkPermission('configuracoes', 'escrita'), configController.clearCache);

module.exports = router;
