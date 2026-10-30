const express = require('express');
const router = express.Router();
const { authenticate, authorize } = require('../../middleware/auth');
const { requireEvent } = require('../../middleware/eventMiddleware');
const drive = require('./drive.service');
const logger = require('../../services/logger');

const PAINEL = () => (process.env.PAINEL_URL || 'https://painel.nzt.app.br').replace(/\/$/, '');
const VOLTA = '/config/integracoes';

// O Google redireciona o navegador para cá depois do login (sem token do painel): o "state" assinado identifica quem pediu
router.get('/callback', async (req, res) => {
    const { code, state, error } = req.query;
    if (error || !code || !state) {
        return res.redirect(`${PAINEL()}${VOLTA}?drive=cancelado`);
    }
    try {
        await drive.concluirConexao(String(code), String(state));
        res.redirect(`${PAINEL()}${VOLTA}?drive=conectado`);
    } catch (err) {
        logger.error(`[Drive] Falha ao conectar: ${err.message}`);
        res.redirect(`${PAINEL()}${VOLTA}?drive=erro&motivo=${encodeURIComponent(err.message).slice(0, 300)}`);
    }
});

router.use(authenticate, authorize('admin'));

router.get('/status', requireEvent, async (req, res) => {
    try {
        res.json({ success: true, data: await drive.status(req.event?.id) });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

router.post('/conectar', (req, res) => {
    if (!drive.configurado()) {
        return res.status(400).json({ success: false, error: 'Faltam GOOGLE_CLIENT_ID e GOOGLE_CLIENT_SECRET no servidor.' });
    }
    res.json({ success: true, url: drive.urlAutorizacao(req.user?.id) });
});

router.post('/copiar-tudo', requireEvent, async (req, res) => {
    try {
        res.json({ success: true, data: await drive.copiarTudo(req.event.id) });
    } catch (err) {
        res.status(400).json({ success: false, error: err.message });
    }
});

router.post('/desconectar', async (req, res) => {
    try {
        await drive.desconectar();
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

module.exports = router;
