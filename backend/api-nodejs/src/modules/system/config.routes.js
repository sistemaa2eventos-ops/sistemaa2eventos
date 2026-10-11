const express = require('express');
const router = express.Router();
const configController = require('./config.controller');
const { authenticate, authorize, checkPermission } = require('../../middleware/auth');
const { requireEvent } = require('../../middleware/eventMiddleware');

// Aplicar middleware de autenticação e contexto de evento a todas as rotas
router.use(authenticate, requireEvent);

// Rotas para Gerenciamento de Áreas
router.get('/areas', configController.getAreas);
router.post('/areas', authorize('admin', 'supervisor'), configController.createArea);
router.put('/areas/:id', checkPermission('configuracoes', 'escrita'), configController.updateArea);
router.delete('/areas/:id', authorize('admin', 'supervisor'), configController.deleteArea);

// Rotas para Gerenciamento de Pulseiras Customizadas
router.get('/pulseiras', configController.getPulseiras);
router.post('/pulseiras', authorize('admin', 'supervisor'), configController.createPulseira);
router.put('/pulseiras/:id', checkPermission('configuracoes', 'escrita'), configController.updatePulseira);
router.delete('/pulseiras/:id', authorize('admin', 'supervisor'), configController.deletePulseira);

// Rotas para Editor de Etiquetas e Crachas
router.get('/etiquetas', configController.getEtiquetas);
router.post('/etiquetas', authorize('admin', 'supervisor'), configController.saveEtiquetas);

// Rotas para Credenciamento Dinâmico
router.get('/registration-settings', configController.getRegistrationSettings);
router.put('/registration-settings', authorize('admin', 'supervisor'), configController.updateRegistrationSettings);

// RBAC Dinâmico por Evento
const rbacController = require('./rbac.controller');
router.get('/rbac/matrix', checkPermission('configuracoes', 'escrita'), rbacController.getMatrix);
router.post('/rbac/rbac-toggle', checkPermission('configuracoes', 'escrita'), rbacController.updateMatrix);

// Manutenção de Performance
router.post('/clear-cache', checkPermission('configuracoes', 'escrita'), configController.clearCache);

module.exports = router;
