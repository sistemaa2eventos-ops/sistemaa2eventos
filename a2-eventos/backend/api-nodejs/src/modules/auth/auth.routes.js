const express = require('express');
const router = express.Router();
const authController = require('./auth.controller');
const { authenticate, authorize } = require('../../middleware/auth');
const { validateLogin, validateRegister } = require('../../middleware/validator');
const rateLimiter = require('../../middleware/rateLimiter');

// Rotas públicas (com rate limiting)
router.post('/login', rateLimiter.auth, validateLogin, authController.login);
router.post('/forgot-password', rateLimiter.auth, authController.forgotPassword);
router.get('/onboarding/:token', authController.getOnboardingData);
router.post('/onboarding/:token', authController.completeOnboarding);

// FIX ERR-U02: Substituído por Invite (Bi-Role)
router.post('/invite', authenticate, authorize('master', 'operador'), authController.invite);

// Rotas protegidas
router.post('/logout', authenticate, authController.logout);
router.get('/profile', authenticate, authController.getProfile);
router.get('/me', authenticate, authController.getProfile);
router.put('/profile', authenticate, authController.updateProfile);
router.post('/active-event', authenticate, authController.setActiveEvent);

// Rotas de gestão de usuários (Bi-Role)
router.get('/users', authenticate, authorize('master', 'operador'), authController.listUsers);
router.get('/roles', authenticate, authorize('master'), authController.listRoles);
router.put('/users/:userId/role', authenticate, authorize('master', 'operador'), authController.updateUser);
router.patch('/users/:userId/status', authenticate, authorize('master', 'operador'), authController.updateUserStatus);

// Rotas de permissões de menu (master only)
router.get('/available-permissions', authenticate, authorize('master'), authController.getAvailablePermissions);
router.get('/permissions', authenticate, authorize('master'), authController.listPermissions);
router.get('/permissions/:role', authenticate, authorize('master'), authController.getPermissions);
router.put('/permissions/:role', authenticate, authorize('master'), authController.savePermissions);

// Gerenciamento de Senhas
router.post('/admin/reset-password/:userId', authenticate, authorize('master', 'operador'), authController.adminResetPassword);
router.post('/profile/change-password', authenticate, authController.changeOwnPassword);

module.exports = router;