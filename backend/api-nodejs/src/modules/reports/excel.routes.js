const express = require('express');
const router = express.Router();
const excelController = require('./excel.controller');
const { authorize } = require('../../middleware/auth');
const multer = require('multer');

// Configurar multer para upload em memória
const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 5 * 1024 * 1024 } // 5MB limit
});

// Template de Importação (Público/Admin)
router.get('/template', excelController.downloadTemplate);

// Importar Funcionários (Necessita Admin)
router.post('/import', authorize(['admin', 'master']), upload.single('file'), excelController.importEmployees);

// Exportar Funcionários (Necessita Admin)
router.get('/export', authorize(['admin', 'master']), excelController.exportEmployees);

module.exports = router;
