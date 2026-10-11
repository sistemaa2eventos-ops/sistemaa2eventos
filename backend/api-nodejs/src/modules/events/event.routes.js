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
// Alteração de evento limpa o cache do requireEvent na hora
const { invalidarEvento } = require('../../middleware/eventMiddleware');
router.use((req, res, next) => {
    if (req.method !== 'GET') res.on('finish', () => { if (res.statusCode < 400) invalidarEvento(); });
    next();
});

router.put('/:id', authorize('admin'), eventoController.update);
router.patch('/:id/activate', authorize('admin'), eventoController.activate);
router.patch('/:id/deactivate', authorize('admin'), eventoController.deactivate);
router.patch('/:id/toggle-module', authorize('admin'), eventoController.toggleModule);
router.delete('/:id', authorize('admin'), eventoController.delete);

// Rotas de Quotas Diárias
router.get('/:id/quotas/:empresa_id', authorize('admin', 'supervisor'), eventoController.getQuotas);
router.post('/:id/quotas/:empresa_id', authorize('admin'), eventoController.updateQuotas);

// Rotas de Configuração Dinâmica e Perfis
router.get('/presets/list', authorize('admin', 'supervisor'), eventoController.listPresets);
router.post('/:id/apply-preset', authorize('admin'), eventoController.applyPreset);

// Rotas de Áreas de Acesso (para biometria)
router.get('/:id/areas', authorize('admin', 'supervisor'), eventoController.getAreas);

router.post('/reset/manual', authorize(['admin', 'master']), cronController.manualTrigger);

module.exports = router;
