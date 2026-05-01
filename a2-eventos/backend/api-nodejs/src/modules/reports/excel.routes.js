const express = require('express');
const router = express.Router();
const excelController = require('./excel.controller');
const { authenticate, checkPermission } = require('../../middleware/auth');
const multer = require('multer');

// Configurar multer para upload em memória
const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 5 * 1024 * 1024 } // 5MB limit
});

// Template de Importação (Público/Admin)
router.get('/template', authenticate, excelController.downloadTemplate);
router.get('/template/pessoas', authenticate, excelController.downloadTemplatePessoas);

// Importar Funcionários — migrado para checkPermission (RBAC granular)
router.post('/import', authenticate, checkPermission('pessoas', 'escrita'), upload.single('file'), excelController.importEmployees);
router.post('/import/pessoas', authenticate, checkPermission('pessoas', 'escrita'), upload.single('file'), excelController.importPessoas);

// Exportar Funcionários
router.get('/export', authenticate, checkPermission('relatorios', 'leitura'), excelController.exportEmployees);
router.get('/export/pessoas', authenticate, checkPermission('relatorios', 'leitura'), excelController.exportPessoas);

// Novos relatórios e exportações
router.get('/export/relatorio-diario', authenticate, checkPermission('relatorios', 'leitura'), excelController.relatorioDiarioManual);
router.get('/export/area', authenticate, checkPermission('relatorios', 'leitura'), excelController.exportPorArea);
router.get('/export/empresa', authenticate, checkPermission('relatorios', 'leitura'), excelController.exportPorEmpresa);
router.get('/export/leitor', authenticate, checkPermission('relatorios', 'leitura'), excelController.exportPorLeitor);
router.get('/export/funcao', authenticate, checkPermission('relatorios', 'leitura'), excelController.exportPorFuncao);
router.get('/export/status', authenticate, checkPermission('relatorios', 'leitura'), excelController.exportPorStatus);
router.get('/export/ponto',  authenticate, checkPermission('relatorios', 'leitura'), excelController.exportPonto);

module.exports = router;
