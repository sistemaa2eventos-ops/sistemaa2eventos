const express = require('express');
const router = express.Router();
const lgpdService = require('./lgpd.service');
const { supabase } = require('../../config/supabase');
const { authenticate, checkPermission } = require('../../middleware/auth');
const logger = require('../../services/logger');
const rateLimit = require('express-rate-limit');

// ── Rate limiter para rotas públicas LGPD (evita abuso em produção de 10k+ acessos)
const lgpdPublicLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 10,
    message: { error: 'Muitas requisições LGPD. Tente novamente em 15 minutos.' },
    standardHeaders: true,
    legacyHeaders: false,
});

// =============================================
// ROTAS PÚBLICAS (Direitos do Titular — LGPD Art. 18)
// Não requerem autenticação: o titular não possui conta no sistema
// =============================================

/**
 * @route POST /api/lgpd/portability
 * @desc Solicita portabilidade de dados por e-mail (Público)
 */
router.post('/portability', lgpdPublicLimiter, async (req, res) => {
    try {
        const { cpf, email, evento_id } = req.body;
        if (!cpf || !email || !evento_id) {
            return res.status(400).json({ error: 'Dados incompletos' });
        }

        const cpfLimpo = cpf.replace(/[^\d]/g, '');

        const { data: pessoa } = await supabase
            .from('pessoas')
            .select('id, nome, email')
            .eq('cpf', cpfLimpo)
            .eq('evento_id', evento_id)
            .single();

        if (!pessoa || pessoa.email !== email) {
            return res.status(404).json({ error: 'Participante não localizado ou e-mail divergente.' });
        }

        const userData = await lgpdService.exportUserData(pessoa.id);
        const emailService = require('../../services/emailService');
        await emailService.sendDataPortability(pessoa.email, pessoa.nome, userData);

        res.json({ success: true, message: 'Dados de portabilidade enviados para seu e-mail.' });
    } catch (error) {
        logger.error('[LGPD] Erro na portabilidade:', error);
        res.status(500).json({ error: 'Erro ao processar portabilidade' });
    }
});

/**
 * @route POST /api/lgpd/forget-me
 * @desc Solicita anonimização total do titular (Público/Confirmado)
 */
router.post('/forget-me', lgpdPublicLimiter, async (req, res) => {
    try {
        const { cpf, email, evento_id } = req.body;
        if (!cpf || !email || !evento_id) {
            return res.status(400).json({ error: 'Dados incompletos' });
        }

        const cpfLimpo = cpf.replace(/[^\d]/g, '');

        const { data: pessoa } = await supabase
            .from('pessoas')
            .select('id, nome, email')
            .eq('cpf', cpfLimpo)
            .eq('evento_id', evento_id)
            .single();

        if (!pessoa || pessoa.email !== email) {
            return res.status(404).json({ error: 'Dados não conferem.' });
        }

        await lgpdService.anonymizePerson(pessoa.id, 'SELF_REQUEST');

        const emailService = require('../../services/emailService');
        await emailService.sendForgetMeConfirmation(pessoa.email, pessoa.nome);

        res.json({ success: true, message: 'Seus dados foram anonimizados com sucesso.' });
    } catch (error) {
        logger.error('[LGPD] Erro no esquecimento:', error);
        res.status(500).json({ error: 'Erro ao processar esquecimento' });
    }
});

// =============================================
// ROTAS AUTENTICADAS (Operações administrativas)
// =============================================
router.use(authenticate);

/**
 * @route POST /api/lgpd/anonymize/:pessoa_id
 * @desc Anonimiza os dados pessoais de um participante (LGPD Art. 18)
 * @access Requer permissão configuracoes:escrita
 */
router.post('/anonymize/:pessoa_id', checkPermission('configuracoes', 'escrita'), async (req, res) => {
    try {
        const result = await lgpdService.anonymizePerson(req.params.pessoa_id, req.user.id);
        res.json(result);
    } catch (error) {
        logger.error('[LGPD] Erro na anonimização:', error);
        res.status(500).json({ error: error.message });
    }
});

module.exports = router;
