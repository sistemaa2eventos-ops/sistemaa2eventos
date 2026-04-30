const express = require('express');
const router = express.Router();
const publicController = require('./public.controller');

/**
 * Rotas Publicas de Cadastro
 * Não requerem autenticação, apenas o token da empresa
 */

// Obter dados da empresa pelo token
router.get('/company/:token', publicController.getCompanyByToken);

// Gerar URL pré-assinada de upload
router.post('/generate-upload-url/:token', publicController.generateUploadUrl);

// Cadastro de colaborador via link externo
router.post('/register/:token', publicController.registerEmployee);

module.exports = router;
