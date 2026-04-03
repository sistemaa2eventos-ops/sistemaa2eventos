const express = require('express');
const router = express.Router();
const authController = require('./auth.controller');
const { authenticate, authorize } = require('../../middleware/auth');
const { validateLogin, validateRegister } = require('../../middleware/validator');
const rateLimiter = require('../../middleware/rateLimiter');

// Rotas públicas (com rate limiting)
router.post('/login', rateLimiter.auth, validateLogin, authController.login);
router.post('/register', rateLimiter.auth, validateRegister, authController.register);
router.post('/forgot-password', rateLimiter.auth, authController.forgotPassword);

// Rotas protegidas
router.post('/logout', authenticate, authController.logout);
router.get('/profile', authenticate, authController.getProfile);
router.put('/profile', authenticate, authController.updateProfile);
router.post('/active-event', authenticate, authController.setActiveEvent);

// Rotas de admin/supervisor
router.get('/users', authenticate, authorize('admin', 'supervisor'), authController.listUsers);
router.put('/users/:userId/role', authenticate, authorize('admin'), authController.updateUser);

// Rotas de permissões de menu (admin only)
router.get('/permissions', authenticate, authorize('admin'), authController.listPermissions);
router.get('/permissions/:role', authenticate, authorize('admin'), authController.getPermissions);
router.put('/permissions/:role', authenticate, authorize('admin'), authController.savePermissions);

module.exports = router;