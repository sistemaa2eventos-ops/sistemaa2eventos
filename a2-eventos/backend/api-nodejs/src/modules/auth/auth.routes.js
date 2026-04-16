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
router.post('/invite', authenticate, authController.invite);

// ============================================
// ROTAS PROTEGIDAS
// ============================================
router.post('/logout', authenticate, authController.logout);
router.get('/profile', authenticate, authController.getProfile);
router.get('/me', authenticate, authController.getProfile);
router.post('/profile/change-password', authenticate, authController.changeOwnPassword);

// ============================================
// GESTÃO DE USUÁRIOS
// ============================================
// Listar usuários (admin_master vê todos, operador vê do seu evento)
router.get('/users', authenticate, authController.listUsers);

// Aprovar usuário (apenas admin_master)
router.post('/users/:userId/approve', authenticate, authController.approveUser);

// Atualizar permissões (apenas admin_master)
router.put('/users/:userId/permissions', authenticate, authController.updatePermissions);

// Atualizar dados do usuário
router.put('/users/:userId', authenticate, authController.updateUser);

// Ativar/Inativar usuário (apenas admin_master)
router.patch('/users/:userId/status', authenticate, authController.updateUserStatus);

// ============================================
// ADMIN: Reset de senha (deprecated - agora usa approve)
// ============================================
// router.post('/admin/reset-password/:userId', authenticate, authorize('admin_master'), authController.adminResetPassword);

module.exports = router;