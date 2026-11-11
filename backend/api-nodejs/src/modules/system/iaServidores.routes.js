const express = require('express');
const router = express.Router();
const logger = require('../../services/logger');
const iaCentral = require('../../services/iaCentral');
const { authenticate, requireAdminMaster } = require('../../middleware/auth');

/**
 * Servidores de IA centrais: cadastrar (token mostrado uma vez), listar com a situação ao vivo e
 * revogar. Só o Admin Master: o servidor recebe biometria dos eventos que atende.
 */
router.use(authenticate, requireAdminMaster);

router.get('/', async (req, res) => {
    try {
        res.json({ success: true, data: await iaCentral.listar() });
    } catch (err) {
        if (/servidores_ia/.test(err.message || '')) {
            return res.status(409).json({ error: 'Aplique a migration 20261112_servidores_ia.sql no Supabase.' });
        }
        res.status(500).json({ error: err.message });
    }
});

router.post('/', async (req, res) => {
    try {
        const criado = await iaCentral.criar(req.body?.nome, req.user?.id);
        logger.info(`🧠 [IA central] servidor "${criado.nome}" cadastrado por ${req.user?.email || req.user?.id}`);
        res.json({ success: true, data: criado });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.delete('/:id', async (req, res) => {
    try {
        await iaCentral.revogar(req.params.id);
        logger.warn(`🧠 [IA central] servidor ${req.params.id} revogado por ${req.user?.email || req.user?.id}`);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;
