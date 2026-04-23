const express = require('express');
const router = express.Router();
const cameraController = require('./camera.controller');
const { authenticate, checkPermission } = require('../../middleware/auth');
const { requireEvent } = require('../../middleware/eventMiddleware');

// Middleware base
router.use(authenticate, requireEvent);

router.get('/', checkPermission('monitor', 'leitura'), cameraController.list);
router.post('/', checkPermission('monitor', 'escrita'), cameraController.create);
router.put('/:id', checkPermission('monitor', 'escrita'), cameraController.update);
router.delete('/:id', checkPermission('monitor', 'escrita'), cameraController.delete);
router.post('/:id/testar', checkPermission('monitor', 'leitura'), cameraController.testarConexao);
router.get('/:id/snapshot', checkPermission('monitor', 'leitura'), cameraController.getSnapshot);

module.exports = router;
