const express = require('express');
const router = express.Router();
const eventoController = require('./event.controller');
const cronController = require('./cron.controller');
const { authenticate, authorize } = require('../../middleware/auth');

router.use(authenticate);

router.get('/', eventoController.list);
router.get('/:id', eventoController.getById);
router.get('/:id/stats', authorize('admin', 'supervisor'), eventoController.getStats);
router.post('/', authorize('master'), eventoController.create);
router.put('/:id', authorize('admin'), eventoController.update);
router.patch('/:id/activate', authorize('admin'), eventoController.activate);
router.patch('/:id/deactivate', authorize('admin'), eventoController.deactivate);
router.patch('/:id/toggle-module', authorize('admin'), eventoController.toggleModule);
router.delete('/:id', authorize('admin'), eventoController.delete);

// Rotas de Quotas Diárias
router.get('/:id/quotas/:empresa_id', authorize('admin', 'supervisor'), eventoController.getQuotas);
router.post('/:id/quotas/:empresa_id', authorize('admin'), eventoController.updateQuotas);

router.post('/reset/manual', authorize(['admin', 'master']), cronController.manualTrigger);

module.exports = router;
