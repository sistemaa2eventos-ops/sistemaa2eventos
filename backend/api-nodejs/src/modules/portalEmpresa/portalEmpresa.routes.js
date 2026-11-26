'use strict';

const express = require('express');
const multer = require('multer');
const rateLimit = require('express-rate-limit');
const logger = require('../../services/logger');
const { autenticarEmpresa } = require('./portalEmpresaAuth');
const portal = require('./portalEmpresa.service');
const planilhaService = require('../planilha/planilha.service');

/**
 * API do portal da empresa (empresa.nzt.app.br) — /api/portal-empresa.
 * Depois do login, toda rota enxerga só a empresa do token (req.empresaPortal).
 */
const router = express.Router();

const MIME_DOCUMENTO = ['application/pdf', 'image/jpeg', 'image/png'];
const enviarArquivo = (campo, filtro, limiteMb) => (req, res, next) => multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: limiteMb * 1024 * 1024 },
    fileFilter: (r, file, cb) => (filtro(file) ? cb(null, true) : cb(new Error('Tipo de arquivo não aceito.')))
}).single(campo)(req, res, (err) => (err ? res.status(400).json({ error: err.message }) : next()));

const documento = enviarArquivo('arquivo', (f) => MIME_DOCUMENTO.includes(f.mimetype), 10);
const planilha = enviarArquivo('arquivo', (f) => /\.xlsx$/i.test(f.originalname || ''), 5);

// Tentativas de login por rede: segura quem tenta adivinhar chave
const limiteLogin = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 20,
    message: { error: 'Muitas tentativas de acesso. Aguarde alguns minutos e tente de novo.' },
    standardHeaders: true,
    legacyHeaders: false
});

/** Responde erro de regra (4xx) com a mensagem; erro inesperado vira 500 genérico. */
const executar = (fn) => async (req, res) => {
    try {
        const resultado = await fn(req, res);
        if (!res.headersSent) res.json({ success: true, data: resultado });
    } catch (error) {
        if (error.status && error.status < 500) return res.status(error.status).json({ error: error.message });
        logger.error(`[PortalEmpresa] ${req.method} ${req.originalUrl}:`, error);
        return res.status(500).json({ error: 'Não foi possível concluir. Tente de novo em instantes.' });
    }
};

const XLSX = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
const enviarPlanilha = async (res, workbook, nome) => {
    res.setHeader('Content-Type', XLSX);
    res.setHeader('Content-Disposition', `attachment; filename="${nome}"`);
    await workbook.xlsx.write(res);
    res.end();
};

router.post('/login', limiteLogin, executar((req) => portal.login(req.body || {})));

router.use(autenticarEmpresa);

router.get('/perfil', executar((req) => portal.perfil(req.empresaPortal)));
router.patch('/perfil', executar((req) => portal.atualizarContato(req.empresaPortal, req.body || {})));

router.get('/resumo', executar((req) => portal.resumo(req.empresaPortal)));
router.get('/tipos-documento', executar((req) => portal.tiposDocumento(req.empresaPortal.evento_id)));

router.post('/participantes', executar((req) => portal.incluirParticipante(req.empresaPortal, req.body || {})));
router.get('/participantes/:id', executar((req) => portal.participante(req.empresaPortal, req.params.id)));
router.post('/participantes/:id/documentos', documento, executar((req) => portal.enviarDocumento(req.empresaPortal, {
    entityType: 'pessoa', entityId: req.params.id, ...req.body, file: req.file
})));

router.get('/documentos', executar((req) => portal.documentosDaEmpresa(req.empresaPortal)));
router.post('/documentos', documento, executar((req) => portal.enviarDocumento(req.empresaPortal, {
    entityType: 'empresa', entityId: req.empresaPortal.id, ...req.body, file: req.file
})));

// Planilha da equipe: mesmo modelo do evento e mesmas regras da importação no painel
router.get('/planilha/modelo', executar(async (req, res) => {
    const wb = await planilhaService.modeloEmBranco(req.empresaPortal.evento_id, req.empresaPortal.id);
    await enviarPlanilha(res, wb, 'Modelo_participantes.xlsx');
}));
router.get('/planilha/exportar', executar(async (req, res) => {
    const { workbook } = await planilhaService.exportar(req.empresaPortal.evento_id, req.empresaPortal.id);
    await enviarPlanilha(res, workbook, 'Participantes.xlsx');
}));
router.post('/planilha/importar', planilha, executar((req) => {
    if (!req.file) throw Object.assign(new Error('Envie a planilha .xlsx.'), { status: 400 });
    return planilhaService.importar({ eventoId: req.empresaPortal.evento_id, empresaId: req.empresaPortal.id, buffer: req.file.buffer });
}));

router.get('/solicitacoes', executar((req) => portal.listarSolicitacoes(req.empresaPortal)));
router.post('/solicitacoes', executar((req) => portal.criarSolicitacao(req.empresaPortal, req.body || {})));
router.post('/solicitacoes/:id/cancelar', executar((req) => portal.cancelarSolicitacao(req.empresaPortal, req.params.id)));

module.exports = router;
