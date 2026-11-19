'use strict';

/**
 * Modelos de câmera (padrão de endereço RTSP por fabricante). Lista: quem gerencia câmeras.
 * Criar, editar e apagar: administradores (vale para todos os eventos).
 */
const express = require('express');
const router = express.Router();
const logger = require('../../services/logger');
const { authenticate, authorize, checkPermission } = require('../../middleware/auth');
const servico = require('./modelosCamera.service');

router.use(authenticate);

const responderErro = (res, err, acao) => {
    if (err.status === 400) return res.status(400).json({ error: err.message });
    logger.error(`[Modelos de câmera] ${acao}: ${err.message}`);
    return res.status(500).json({ error: `Não foi possível ${acao} o modelo` });
};

router.get('/', checkPermission('monitor', 'leitura'), async (req, res) => {
    try {
        res.json({ success: true, ...(await servico.listar({ todos: req.query.todos === '1' })) });
    } catch (err) { responderErro(res, err, 'listar'); }
});

router.post('/', authorize('admin'), async (req, res) => {
    try {
        res.status(201).json({ success: true, data: await servico.criar(req.body || {}) });
    } catch (err) { responderErro(res, err, 'criar'); }
});

router.put('/:id', authorize('admin'), async (req, res) => {
    try {
        const data = await servico.atualizar(req.params.id, req.body || {});
        if (!data) return res.status(404).json({ error: 'Modelo não encontrado' });
        res.json({ success: true, data });
    } catch (err) { responderErro(res, err, 'salvar'); }
});

router.delete('/:id', authorize('admin'), async (req, res) => {
    try {
        if (!(await servico.apagar(req.params.id))) return res.status(404).json({ error: 'Modelo não encontrado' });
        res.json({ success: true });
    } catch (err) { responderErro(res, err, 'apagar'); }
});

module.exports = router;
