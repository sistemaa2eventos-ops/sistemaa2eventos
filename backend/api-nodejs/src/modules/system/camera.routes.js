const express = require('express');
const router = express.Router();
const cameraController = require('./camera.controller');
const { authenticate, checkPermission, requireAdminMaster } = require('../../middleware/auth');
const { requireEvent } = require('../../middleware/eventMiddleware');

// Snapshot e Stream: exigem login. Tags <img> enviam o token na URL (?token=...),
// aceito pelo middleware authenticate.
router.get('/:id/snapshot', authenticate, cameraController.getSnapshot);
router.get('/:id/stream', authenticate, cameraController.getStream);

// Configuração da IA facial (global, não depende do evento)
router.get('/ia-config', authenticate, cameraController.getIaConfig);
router.put('/ia-config', authenticate, requireAdminMaster, cameraController.salvarIaConfig);

// Middleware base para rotas protegidas
router.use(authenticate, requireEvent);

router.get('/ia-status', checkPermission('monitor', 'leitura'), cameraController.iaStatus);

router.get('/:id/track', checkPermission('monitor', 'leitura'), cameraController.trackFace);
router.post('/:id/track', checkPermission('monitor', 'leitura'), cameraController.trackFace);
router.get('/', checkPermission('monitor', 'leitura'), cameraController.list);
router.post('/', checkPermission('monitor', 'escrita'), cameraController.create);
router.put('/:id', checkPermission('monitor', 'escrita'), cameraController.update);
router.delete('/:id', checkPermission('monitor', 'escrita'), cameraController.delete);
router.post('/:id/testar', checkPermission('monitor', 'leitura'), cameraController.testarConexao);

module.exports = router;
