const express = require('express');
const multer = require('multer');
const router = express.Router();
const planilhaController = require('./planilha.controller');
const { authenticate, authorize } = require('../../middleware/auth');
const { requireEvent } = require('../../middleware/eventMiddleware');

// Planilha em memória (até 5 MB): só .xlsx
const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 5 * 1024 * 1024 },
    fileFilter: (req, file, cb) => cb(null, /\.xlsx$/i.test(file.originalname || ''))
});

router.use(authenticate);
router.use(requireEvent);

// Modelo da planilha do evento (Configurações › Planilha de participantes)
router.get('/modelo', planilhaController.obterModelo);
router.put('/modelo', authorize('master', 'admin'), planilhaController.salvarModelo);
router.get('/modelo/arquivo', planilhaController.baixarModelo);

// Por empresa (Empresas › ações): importar e exportar os participantes vinculados
router.post('/empresas/:empresaId/importar', authorize('master', 'admin', 'supervisor'), upload.single('arquivo'), planilhaController.importarEmpresa);
router.get('/empresas/:empresaId/exportar', authorize('master', 'admin', 'supervisor'), planilhaController.exportarEmpresa);

module.exports = router;
