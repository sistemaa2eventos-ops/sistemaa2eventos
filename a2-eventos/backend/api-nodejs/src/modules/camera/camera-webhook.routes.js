/**
 * Camera Webhook Routes
 * Endpoint público para receber detecções do camera-service
 * NÃO requer autenticação - usa X-API-Key apenas
 */

const express = require('express');
const router = express.Router();
const cameraController = require('./camera.controller');
const { validateApiKey } = require('../../middleware/auth');

/**
 * POST /api/camera/webhooks/detections
 * Recebe webhook do camera-service com detecção facial ou de placa
 * Headers obrigatórios:
 *   X-API-Key: chave de API do sistema A2
 *   ou Authorization: Bearer <token>
 */
router.post('/webhooks/detections', validateApiKey, cameraController.handleDetection);

/**
 * GET /api/camera/detections
 * Lista detecções recentes (requer autenticação normal)
 */
router.get('/detections', cameraController.listDetections);

/**
 * GET /api/camera/detections/watchlist
 * Lista detecções de watchlist (requer autenticação normal)
 */
router.get('/detections/watchlist', cameraController.listWatchlistDetections);

/**
 * GET /api/camera/health
 * Health check do módulo de câmeras
 */
router.get('/health', (req, res) => {
    res.status(200).json({
        status: 'ok',
        service: 'camera-webhook',
        timestamp: new Date().toISOString()
    });
});

module.exports = router;
