const express = require('express');
const router = express.Router();
const lgpdService = require('./lgpd.service');
const { supabase } = require('../../config/supabase');
const { authenticate, checkPermission } = require('../../middleware/auth');
const { eventoPermitido } = require('../../utils/escopoEvento');
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

const MSG_PORTABILIDADE_GENERICA = 'Se os dados conferirem, enviaremos seus dados para o e-mail cadastrado.';

/**
 * Titular do pedido público: CPF (com ou sem máscara) + evento, e o e-mail informado igual ao gravado
 * (sem diferenciar maiúsculas). Devolve a pessoa ou null.
 */
async function buscarTitular(cpf, email, eventoId) {
    const { data: candidatas } = await supabase
        .from('pessoas')
        .select('id, nome_completo, email')
        .in('cpf', formasCpf(cpf))
        .eq('evento_id', eventoId)
        .limit(2);
    const alvo = String(email).trim().toLowerCase();
    return (candidatas || []).find(p => p.email && p.email.trim().toLowerCase() === alvo) || null;
}

/**
 * @route POST /api/lgpd/portability
 * @desc Solicita portabilidade de dados por e-mail (Público). A resposta é sempre a mesma, exista ou
 *       não a pessoa (não revela cadastro nem e-mail divergente); os dados vão só ao e-mail gravado.
 */
router.post('/portability', lgpdPublicLimiter, async (req, res) => {
    const { cpf, email, evento_id } = req.body || {};
    if (!cpf || !email || !evento_id) {
        return res.status(400).json({ error: 'Dados incompletos' });
    }
    try {
        const pessoa = await buscarTitular(cpf, email, evento_id);
        if (pessoa) {
            // Sem await: o tempo de resposta não pode revelar se a pessoa existe
            (async () => {
                const userData = await lgpdService.exportUserData(pessoa.id);
                const emailService = require('../../services/emailService');
                await emailService.sendDataPortability(pessoa.email, pessoa.nome_completo, userData);
            })().catch(err => logger.error('[LGPD] Erro ao enviar portabilidade:', err));
        }
    } catch (error) {
        logger.error('[LGPD] Erro na portabilidade:', error);
    }
    res.json({ success: true, message: MSG_PORTABILIDADE_GENERICA });
});

// ── Direito ao esquecimento em duas etapas: pedido (e-mail com link) e confirmação (anonimiza)
const MSG_FORGET_GENERICA = 'Se os dados conferirem, enviaremos um e-mail de confirmação.';
const VALIDADE_TOKEN_FORGET = '30m';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const portalPublico = () => (process.env.PUBLIC_PORTAL_URL || 'https://cadastro.nzt.app.br').replace(/\/+$/, '');

/** CPF como gravado: só dígitos ou com máscara */
const formasCpf = (cpf) => {
    const d = String(cpf || '').replace(/\D/g, '');
    return d.length === 11 ? [d, d.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4')] : [d];
};

/**
 * @route POST /api/lgpd/forget-me
 * @desc Pedido de anonimização (Público). NÃO anonimiza: se CPF, e-mail e evento conferirem, envia ao
 *       e-mail gravado um link de confirmação (30 min). A resposta é sempre a mesma, para não revelar
 *       se a pessoa existe.
 */
router.post('/forget-me', lgpdPublicLimiter, async (req, res) => {
    const { cpf, email, evento_id } = req.body || {};
    if (!cpf || !email || !evento_id) {
        return res.status(400).json({ error: 'Dados incompletos' });
    }
    try {
        const segredo = process.env.JWT_SECRET;
        if (!segredo) throw new Error('JWT_SECRET não configurado');

        const pessoa = await buscarTitular(cpf, email, evento_id);

        if (pessoa) {
            const jwt = require('jsonwebtoken');
            const token = jwt.sign({ p: pessoa.id, a: 'forget' }, segredo, { expiresIn: VALIDADE_TOKEN_FORGET });
            const link = `${portalPublico()}/privacy/confirmar?token=${encodeURIComponent(token)}`;
            const emailService = require('../../services/emailService');
            // Sem await: o tempo de resposta não pode revelar se a pessoa existe
            emailService.sendForgetMeRequest(pessoa.email, pessoa.nome_completo, link)
                .catch(err => logger.error('[LGPD] Falha ao enviar confirmação de esquecimento:', err));
            logger.info(`[LGPD] Pedido de esquecimento recebido para a pessoa ${pessoa.id}; aguardando confirmação por e-mail`);
        }
    } catch (error) {
        logger.error('[LGPD] Erro no pedido de esquecimento:', error);
    }
    res.json({ success: true, message: MSG_FORGET_GENERICA });
});

/**
 * @route POST /api/lgpd/forget-me/confirmar
 * @desc Confirma o pedido (Público): { token } do e-mail. Valida e anonimiza.
 *       Uso único sem tabela: depois de anonimizada a pessoa fica sem e-mail, e o token deixa de valer.
 */
router.post('/forget-me/confirmar', lgpdPublicLimiter, async (req, res) => {
    const invalido = () => res.status(400).json({ error: 'Link inválido, expirado ou já utilizado.' });
    const { token } = req.body || {};
    if (!token || typeof token !== 'string' || !process.env.JWT_SECRET) return invalido();

    let dados;
    try {
        const jwt = require('jsonwebtoken');
        dados = jwt.verify(token, process.env.JWT_SECRET, { algorithms: ['HS256'] });
    } catch {
        return invalido();
    }
    if (!dados || dados.a !== 'forget' || !UUID.test(String(dados.p || ''))) return invalido();

    try {
        const { data: pessoa } = await supabase
            .from('pessoas')
            .select('id, nome_completo, email')
            .eq('id', dados.p)
            .maybeSingle();
        if (!pessoa || !pessoa.email) return invalido(); // já anonimizada: token usado

        // Guarda o contato antes: a anonimização apaga e-mail e nome
        const { email: emailTitular, nome_completo: nomeTitular } = pessoa;
        await lgpdService.anonymizePerson(pessoa.id, 'SELF_REQUEST');

        const emailService = require('../../services/emailService');
        emailService.sendForgetMeConfirmation(emailTitular, nomeTitular)
            .catch(err => logger.error('[LGPD] Falha ao enviar aviso de esquecimento concluído:', err));

        res.json({ success: true, message: 'Seus dados foram anonimizados com sucesso.' });
    } catch (error) {
        logger.error('[LGPD] Erro na confirmação do esquecimento:', error);
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
        // A pessoa precisa ser de um evento permitido a quem chama (admin e admin_master: todos)
        const { data: alvo } = await supabase
            .from('pessoas')
            .select('id, evento_id')
            .eq('id', req.params.pessoa_id)
            .maybeSingle();
        if (!alvo || !eventoPermitido(req.user, alvo.evento_id)) {
            return res.status(404).json({ error: 'Pessoa não encontrada.' });
        }

        const result = await lgpdService.anonymizePerson(req.params.pessoa_id, req.user.id);
        res.json(result);
    } catch (error) {
        logger.error('[LGPD] Erro na anonimização:', error);
        res.status(500).json({ error: error.message });
    }
});

module.exports = router;
