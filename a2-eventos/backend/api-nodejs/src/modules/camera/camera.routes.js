/**
 * Camera Routes
 * Webhook e endpoints de consulta para o módulo de câmeras
 */

const express = require('express');
const router = express.Router();
const cameraController = require('./camera.controller');
const { validateApiKey } = require('../../middlewares/auth');

/**
 * POST /api/detections
 * Webhook do camera-service
 * Requer header: X-API-Key ou Authorization Bearer
 */
router.post('/detections', validateApiKey, cameraController.handleDetection);

/**
 * GET /api/detections
 * Lista detecções recentes
 * Query params: tipo, camera_id, limit, offset
 */
router.get('/detections', cameraController.listDetections);

/**
 * GET /api/detections/watchlist
 * Lista detecções de watchlist
 * Query params: limit, offset
 */
router.get('/detections/watchlist', cameraController.listWatchlistDetections);

module.exports = router;
