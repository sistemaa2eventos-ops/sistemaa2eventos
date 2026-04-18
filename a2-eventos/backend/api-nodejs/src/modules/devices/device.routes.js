const express = require('express');
const router = express.Router();
const { authenticate, authorize } = require('../../middleware/auth');
const { requireEvent } = require('../../middleware/eventMiddleware');
const { supabase } = require('../../config/supabase');
const logger = require('../../services/logger');

const deviceController = require('./device.controller');

// Todas as rotas de dispositivos requerem autenticação e contexto de evento
router.use(authenticate);
router.use(requireEvent);

// Listar dispositivos
router.get('/', deviceController.list);

// Obter fila de sincronização
router.get('/queue', deviceController.getQueue);

// Cadastrar dispositivo (Admin/Supervisor)
router.post('/', authorize('admin', 'supervisor'), deviceController.create);

// Testar conexão
router.post('/test-connection', authorize('admin', 'supervisor'), deviceController.testConnection);

// Deletar dispositivo (Admin)
router.delete('/:id', authorize('admin'), deviceController.delete);

// Forçar sincronização de faces (Admin/Supervisor)
router.post('/:id/sync', authorize('admin', 'supervisor'), deviceController.sync);

// Forçar processamento da fila (Admin/Supervisor)
router.post('/:id/force-queue', authorize('admin', 'supervisor'), deviceController.forceQueue);

// Obter status de saúde do dispositivo
router.get('/:id/health', deviceController.getHealth);

// Configurar Push de Eventos (Intelbras)
router.post('/:id/configure-push', authorize('admin', 'supervisor'), deviceController.configurePush);

// Pegar Snapshot (JPEG) da câmera proxy
router.get('/:id/snapshot', deviceController.getSnapshot);

/**
 * Atualizar configuração de dispositivo
 */
router.put('/:id', authorize('admin', 'supervisor'), deviceController.update);

// Comandos de Atuação Remota
router.post('/:id/remote-open', authorize('admin', 'supervisor'), deviceController.remoteOpen);
router.post('/:id/remote-unlock', authorize('admin', 'supervisor'), deviceController.remoteUnlock);
router.post('/:id/remote-lock', authorize('admin', 'supervisor'), deviceController.remoteLock);
router.post('/:id/remote-close', authorize('admin', 'supervisor'), deviceController.remoteClose);

/**
 * Imprimir etiqueta/credencial via impressora térmica
 */
router.post('/print-label', authorize('admin', 'supervisor', 'operador'), deviceController.printLabel);

module.exports = router;

