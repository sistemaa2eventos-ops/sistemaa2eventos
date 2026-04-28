const express = require('express');
const router = express.Router();
const authController = require('./auth.controller');
const { authenticate, authorize } = require('../../middleware/auth');
const { validateLogin } = require('../../middleware/validator');
const rateLimiter = require('../../middleware/rateLimiter');

// ============================================
// ROTAS PÚBLICAS
// ============================================
router.post('/login', rateLimiter.auth, validateLogin, authController.login);
router.post('/forgot-password', rateLimiter.auth, authController.forgotPassword);

// ============================================
// ROTAS DE CONVITE (apenas admin_master)
// ============================================
router.post('/invite', authenticate, authorize('admin_master'), authController.invite); // FIX C-06: authorize ausente

// ============================================
// ROTAS PROTEGIDAS
// ============================================
router.post('/logout', authenticate, authController.logout);
router.get('/profile', authenticate, authController.getProfile);
router.get('/me', authenticate, authController.getProfile);
router.post('/profile/change-password', authenticate, authController.changeOwnPassword);
router.post('/active-event', authenticate, authController.setActiveEvent);

// ============================================
// GESTÃO DE USUÁRIOS
// ============================================
// Listar usuários (admin_master vê todos, operador vê do seu evento)
router.get('/users', authenticate, authController.listUsers);

// Aprovar usuário (apenas admin_master) — FIX C-06
router.post('/users/:userId/approve', authenticate, authorize('admin_master'), authController.approveUser);

// Atualizar permissões (apenas admin_master) — FIX C-06
router.put('/users/:userId/permissions', authenticate, authorize('admin_master'), authController.updatePermissions);

// Atualizar dados do usuário (apenas admin_master) — FIX C-06
router.put('/users/:userId', authenticate, authorize('admin_master'), authController.updateUser);

// Ativar/Inativar usuário (apenas admin_master) — FIX C-06
router.patch('/users/:userId/status', authenticate, authorize('admin_master'), authController.updateUserStatus);

// Deletar usuário (apenas admin_master) — FIX C-06
router.delete('/users/:userId', authenticate, authorize('admin_master'), authController.deleteUser);

// ============================================
// ADMIN: Reset de senha
// ============================================
router.post('/users/:userId/reset-password', authenticate, authorize('admin_master'), authController.adminResetPassword);

module.exports = router;