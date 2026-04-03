const express = require('express');
const router = express.Router();
const multer = require('multer');
const documentoController = require('./documento.controller');
const { authenticate, checkPermission } = require('../../middleware/auth');

// Tipos permitidos
const allowedMimeTypes = ['application/pdf', 'image/jpeg', 'image/png'];

// Configuração do Multer (Armazenamento em memória para repassar ao Supabase)
const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 5 * 1024 * 1024 }, // 5MB máximo
    fileFilter: (req, file, cb) => {
        if (allowedMimeTypes.includes(file.mimetype)) {
            cb(null, true);
        } else {
            cb(new Error('Tipo de arquivo não suportado. Apenas PDF, JPG e PNG são permitidos.'));
        }
    }
});

// Tratamento de erro customizado do Multer para rotas
const uploadMiddleware = (req, res, next) => {
    const uploader = upload.single('arquivo');
    uploader(req, res, function (err) {
        if (err instanceof multer.MulterError) {
            return res.status(400).json({ error: `Erro no upload: ${err.message}` });
        } else if (err) {
            return res.status(400).json({ error: err.message });
        }
        next();
    });
};

// Todas rotas exigem autenticação
router.use(authenticate);

// Fila de Auditoria Documental do Analista
router.get(
    '/pendentes',
    checkPermission('documentos', 'aprovar'),
    documentoController.listarPendentes
);

// Submissão de documentos (Roles de upload)
router.post(
    '/:entityType/:entityId/upload',
    checkPermission('documentos', 'submeter'),
    uploadMiddleware,
    documentoController.uploadDocumento
);

// Auditoria em Lote de Documentos
router.patch(
    '/batch/auditar',
    checkPermission('documentos', 'aprovar'),
    documentoController.batchAudit
);

// Auditoria de documentos individual (Analista / Supervisor / Admin)
router.patch(
    '/:entityType/:docId/auditar',
    checkPermission('documentos', 'aprovar'),
    documentoController.auditarDocumento
);

// Listagem de documentos anexados (Visualização dependendo do escopo)
// Requer ao menos permissão de leitura sobre a entidade root
router.get(
    '/:entityType/:entityId',
    checkPermission('documentos', 'ler'),
    documentoController.listarDocumentos
);

module.exports = router;
