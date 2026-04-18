const express = require('express');
const router = express.Router();
const eventoController = require('./event.controller');
const cronController = require('./cron.controller');
const { authenticate, checkPermission } = require('../../middleware/auth');

router.use(authenticate);

router.get('/', eventoController.list);
router.get('/:id', eventoController.getById);
router.get('/:id/stats', checkPermission('eventos', 'leitura'), eventoController.getStats);
router.post('/', checkPermission('eventos', 'escrita'), eventoController.create);
router.put('/:id', checkPermission('eventos', 'escrita'), eventoController.update);
router.patch('/:id/activate', checkPermission('eventos', 'escrita'), eventoController.activate);
router.patch('/:id/deactivate', checkPermission('eventos', 'escrita'), eventoController.deactivate);
router.patch('/:id/toggle-module', checkPermission('eventos', 'escrita'), eventoController.toggleModule);
router.delete('/:id', checkPermission('eventos', 'escrita'), eventoController.delete);

// Rotas de Quotas Diárias
router.get('/:id/quotas/:empresa_id', checkPermission('eventos', 'leitura'), eventoController.getQuotas);
router.post('/:id/quotas/:empresa_id', checkPermission('eventos', 'escrita'), eventoController.updateQuotas);

// Rotas de Configuração Dinâmica e Perfis
router.get('/presets/list', checkPermission('eventos', 'leitura'), eventoController.listPresets);
router.post('/:id/apply-preset', checkPermission('eventos', 'escrita'), eventoController.applyPreset);

// Rotas de Áreas de Acesso (para biometria)
router.get('/:id/areas', checkPermission('eventos', 'leitura'), eventoController.getAreas);

router.post('/reset/manual', checkPermission('eventos', 'escrita'), cronController.manualTrigger);

module.exports = router;
