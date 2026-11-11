const express = require('express');
const router = express.Router();
const cameraController = require('./camera.controller');
const { autenticarMidia } = cameraController;
const { authenticate, authorize, checkPermission, requireAdminMaster } = require('../../middleware/auth');
const { requireEvent } = require('../../middleware/eventMiddleware');

// Imagem e vídeo: <img>/<video> não enviam o cabeçalho de login. Levam ?ingresso= (2 min, uma
// câmera, pedido em POST /:id/ingresso). O token de login na URL não é mais aceito aqui.
router.get('/:id/snapshot', autenticarMidia, cameraController.getSnapshot);
router.get('/:id/stream', autenticarMidia, cameraController.getStream);
router.get('/:id/video.mp4', autenticarMidia, cameraController.getVideoMp4);

// Configuração da IA facial (global, não depende do evento)
router.get('/ia-config', authenticate, cameraController.getIaConfig);
router.put('/ia-config', authenticate, requireAdminMaster, cameraController.salvarIaConfig);

// Middleware base para rotas protegidas
router.use(authenticate, requireEvent);

router.get('/ia-status', checkPermission('monitor', 'leitura'), cameraController.iaStatus);
router.post('/ia-iniciar', checkPermission('monitor', 'escrita'), cameraController.iniciarIa);

// Chaves gerais do evento: motor de IA, gravação, espaço e prazo de guarda
router.get('/evento-config', checkPermission('monitor', 'leitura'), cameraController.getEventoConfig);
// Desligar o motor afeta todas as câmeras e os leitores com confirmação da IA: só admin/supervisor
router.put('/evento-config', authorize('admin', 'supervisor'), cameraController.salvarEventoConfig);

router.post('/:id/ingresso', checkPermission('monitor', 'leitura'), cameraController.ingresso);
router.get('/:id/deteccoes', checkPermission('monitor', 'leitura'), cameraController.deteccoes);
router.get('/:id/track', checkPermission('monitor', 'leitura'), cameraController.trackFace);
router.post('/:id/track', checkPermission('monitor', 'leitura'), cameraController.trackFace);
router.get('/', checkPermission('monitor', 'leitura'), cameraController.list);
router.post('/', checkPermission('monitor', 'escrita'), cameraController.create);
router.put('/:id', checkPermission('monitor', 'escrita'), cameraController.update);
router.delete('/:id', checkPermission('monitor', 'escrita'), cameraController.delete);
router.post('/:id/testar', checkPermission('monitor', 'leitura'), cameraController.testarConexao);

module.exports = router;
