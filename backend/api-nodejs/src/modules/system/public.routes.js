const express = require('express');
const router = express.Router();
const rateLimit = require('express-rate-limit');
const publicController = require('./public.controller');


// --- 🛡️ LIMITADORES DE TAXA (Hardening de Rotas Públicas) ---
// Previne ataques de negação de serviço e spam de cadastros
const registerLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutos
    max: 5, // Limite de 5 tentativas por IP
    message: { error: 'Muitas tentativas de cadastro. Tente novamente em 15 minutos.' },
    standardHeaders: true,
    legacyHeaders: false,
});

const uploadLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 10,
    message: { error: 'Limite de geração de URLs de upload excedido.' }
});

/**
 * Rotas Publicas de Cadastro
 * Não requerem autenticação, apenas o token da empresa
 */

// Token de convite da empresa é um UUID: formato inválido responde "link inválido" sem consultar o banco
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const tokenDeEmpresa = (req, res, next) => (UUID.test(req.params.token || '')
    ? next()
    : res.status(404).json({ error: 'Link de cadastro inválido ou inexistente. Gere um novo convite no painel admin.' }));

// Obter dados da empresa pelo token
router.get('/company/:token', tokenDeEmpresa, publicController.getCompanyByToken);

// Listar colaboradores (Nome, Função, Status) vinculados à empresa via token público
router.get('/company/:token/employees', tokenDeEmpresa, publicController.getCompanyEmployeesByToken);

// Obter dados do colaborador pelo token (Pré-preenchimento)
router.get('/person/:token', publicController.getPersonByToken);


// Gerar URL pré-assinada de upload
router.post('/generate-upload-url/:token', tokenDeEmpresa, uploadLimiter, publicController.generateUploadUrl);

// Cadastro de colaborador via link externo
router.post('/register/:token', tokenDeEmpresa, registerLimiter, publicController.registerEmployee);

// --- Rotas B2B Auto-Cadastro Portal ---
router.get('/portal/invite/:token', publicController.validateInvite);
router.post('/portal/cadastro', publicController.submitCadastro);

module.exports = router;
