const express = require('express');
const router = express.Router();
const AuditoriaService = require('./auditoria.service');
const { authenticate, checkAnyPermission } = require('../../middleware/auth');
const { requireEvent } = require('../../middleware/eventMiddleware');
const rateLimiter = require('../../middleware/rateLimiter');
const ApiResponse = require('../../utils/apiResponse');

const sessionMiddleware = [authenticate, requireEvent];

// ============================================
// ROTAS DE AUDITORIA DOCUMENTAL
// ============================================

/**
 * GET /audit/pessoas/:pessoa_id/status-documental
 * Busca status documental com liberação diária
 */
router.get(
  '/pessoas/:pessoa_id/status-documental',
  sessionMiddleware,
  rateLimiter.consulta,
  checkAnyPermission(['checkin', 'checkout', 'auditoria_documentos', 'fiscalizacao']),
  async (req, res) => {
    try {
      const { pessoa_id } = req.params;
      if (!pessoa_id) {
        return ApiResponse.error(res, 'pessoa_id é obrigatório', 400);
      }

      const status = await AuditoriaService.statusDocumentalComLiberacao(
        req.event.id,
        pessoa_id
      );

      return ApiResponse.success(res, status);
    } catch (error) {
      console.error('Erro ao buscar status documental:', error.message);
      return ApiResponse.error(res, 'Erro ao buscar status documental', 500);
    }
  }
);

/**
 * POST /audit/pessoas/:pessoa_id/liberar-um-dia
 * Libera pessoa para entrar HOJE apenas
 */
router.post(
  '/pessoas/:pessoa_id/liberar-um-dia',
  sessionMiddleware,
  rateLimiter.access,
  checkAnyPermission(['auditoria_documentos']),
  async (req, res) => {
    try {
      const { pessoa_id } = req.params;
      const { motivo } = req.body;

      if (!pessoa_id) {
        return ApiResponse.error(res, 'pessoa_id é obrigatório', 400);
      }

      const result = await AuditoriaService.liberarPorUmDia(
        req.event.id,
        pessoa_id,
        motivo || '',
        req.user.id
      );

      return ApiResponse.success(res, result, 201);
    } catch (error) {
      console.error('Erro ao liberar pessoa por um dia:', error.message);
      return ApiResponse.error(res, error.message, 500);
    }
  }
);

module.exports = router;
