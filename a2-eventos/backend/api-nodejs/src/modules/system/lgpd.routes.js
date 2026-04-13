const express = require('express');
const router = express.Router();
const lgpdService = require('./lgpd.service');
const { authenticate, checkPermission } = require('../../middleware/auth');
const logger = require('../../services/logger');

router.use(authenticate);

/**
 * @route POST /api/lgpd/anonymize/:pessoa_id
 * @desc Anonimiza os dados pessoais de um participante (LGPD Art. 18)
 * @access Master Only
 */
/**
 * @route POST /api/lgpd/anonymize/:pessoa_id
 * @desc Anonimiza os dados pessoais de um participante (LGPD Art. 18)
 * @access Master Only
 */
router.post('/anonymize/:pessoa_id', authenticate, checkPermission('configuracoes', 'escrita'), async (req, res) => {
    try {
        const result = await lgpdService.anonymizePerson(req.params.pessoa_id, req.user.id);
        res.json(result);
    } catch (error) {
        logger.error('[LGPD] Erro na anonimização:', error);
        res.status(500).json({ error: error.message });
    }
});

/**
 * @route POST /api/lgpd/portability
 * @desc Solicita portabilidade de dados por e-mail (Público)
 */
router.post('/portability', async (req, res) => {
    try {
        const { cpf, email, evento_id } = req.body;
        if (!cpf || !email || !evento_id) return res.status(400).json({ error: 'Dados incompletos' });

        const { data: pessoa } = await supabase
            .from('pessoas')
            .select('id, nome, email')
            .eq('cpf', cpf.replace(/[^\d]/g, ''))
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
        res.status(500).json({ error: 'Erro ao processar portabilidade' });
    }
});

/**
 * @route POST /api/lgpd/forget-me
 * @desc Solicita anonimização total do titular (Público/Confirmado)
 */
router.post('/forget-me', async (req, res) => {
    try {
        const { cpf, email, evento_id } = req.body;
        
        const { data: pessoa } = await supabase
            .from('pessoas')
            .select('id, nome, email')
            .eq('cpf', cpf.replace(/[^\d]/g, ''))
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
        res.status(500).json({ error: 'Erro ao processar esquecimento' });
    }
});

module.exports = router;
