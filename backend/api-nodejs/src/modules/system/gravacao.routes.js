const express = require('express');
const jwt = require('jsonwebtoken');
const router = express.Router();
const gravacaoService = require('./gravacao.service');
const logger = require('../../services/logger');
const { authenticate, checkPermission } = require('../../middleware/auth');
const { requireEvent } = require('../../middleware/eventMiddleware');

/**
 * Gravações das câmeras (arquivos ficam no PC do evento). Assistir e baixar exigem um ingresso
 * pedido com login; cada ingresso fica registrado em gravacoes_acessos (quem, quando, IP).
 */
const segredo = () => process.env.JWT_SECRET || process.env.SUPABASE_JWT_SECRET;

// <video> não manda cabeçalho de login: ?ingresso= (30 min, uma gravação, uma ação)
router.get('/:id/video', async (req, res) => {
    let d;
    try {
        d = jwt.verify(String(req.query.ingresso || ''), segredo());
        if (d.p !== 'grav' || d.g !== req.params.id) throw new Error('ingresso de outra gravação');
    } catch {
        return res.status(401).send('Ingresso inválido ou vencido. Abra a gravação de novo pelo painel.');
    }
    try {
        const g = await gravacaoService.buscar(req.params.id, d.e);
        if (!g) return res.status(404).send('Gravação não encontrada');
        if (g.status !== 'local') return res.status(410).send('Esta gravação já foi apagada do PC do evento (prazo ou limite de espaço).');
        await gravacaoService.transmitir(g, req, res, { baixar: d.a === 'baixar' });
    } catch (err) {
        logger.warn(`[Gravação] ${req.params.id}: ${err.message}`);
        if (!res.headersSent) res.status(err.status || 502).send(err.message);
        else res.end();
    }
});

router.use(authenticate, requireEvent);

router.get('/', checkPermission('monitor', 'escrita'), async (req, res) => {
    try {
        const eventoId = req.event?.id;
        if (!eventoId) return res.status(400).json({ error: 'Selecione um evento' });
        const data = await gravacaoService.listar(eventoId, req.query);
        res.json({ success: true, data });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.get('/status', checkPermission('monitor', 'leitura'), async (req, res) => {
    try {
        const eventoId = req.event?.id;
        if (!eventoId) return res.status(400).json({ error: 'Selecione um evento' });
        res.json({ success: true, data: await gravacaoService.statusDoPc(eventoId) });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.post('/:id/ingresso', checkPermission('monitor', 'escrita'), async (req, res) => {
    try {
        const eventoId = req.event?.id;
        const g = await gravacaoService.buscar(req.params.id, eventoId);
        if (!g) return res.status(404).json({ error: 'Gravação não encontrada neste evento' });
        if (!segredo()) return res.status(500).json({ error: 'JWT_SECRET não configurado no servidor' });
        const acao = req.body?.acao === 'baixar' ? 'baixar' : 'assistir';
        await gravacaoService.registrarAcesso(g, req.user, acao, req.ip);
        const ingresso = jwt.sign({ p: 'grav', g: g.id, e: g.evento_id, u: req.user?.id || null, a: acao }, segredo(), { expiresIn: '30m' });
        logger.info(`🎞️ [Gravação] ${acao} ${g.camera_nome || ''} ${g.inicio} por ${req.user?.email || req.user?.id}`);
        res.json({ success: true, ingresso });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;
