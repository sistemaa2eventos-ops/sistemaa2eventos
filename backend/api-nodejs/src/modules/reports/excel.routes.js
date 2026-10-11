const express = require('express');
const router = express.Router();
const excelController = require('./excel.controller');
const { authenticate, authorize } = require('../../middleware/auth');
const { requireEvent } = require('../../middleware/eventMiddleware');
const multer = require('multer');

// Configurar multer para upload em memória
const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 5 * 1024 * 1024 } // 5MB limit
});

// Template de Importação (Público/Admin)
router.get('/template', excelController.downloadTemplate);
router.get('/template/pessoas', excelController.downloadTemplate);

// Importar Funcionários (Necessita Admin)
router.post('/import', authenticate, authorize('admin', 'master'), upload.single('file'), excelController.importEmployees);

// Exportar Funcionários (Necessita Admin)
router.get('/export', authenticate, authorize('admin', 'master'), requireEvent, excelController.exportEmployees);
router.get('/export/pessoas', authenticate, authorize('admin', 'master'), requireEvent, excelController.exportEmployees);

module.exports = router;
