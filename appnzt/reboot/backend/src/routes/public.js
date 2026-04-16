const express = require('express');
const router = express.Router();
const QRCode = require('qrcode');
const { supabaseAdmin } = require('../../config/supabase');
const logger = require('../../services/logger');

router.get('/company/:token', async (req, res) => {
    try {
        const { token } = req.params;

        const { data: empresa, error } = await supabaseAdmin
            .from('empresas')
            .select('*, eventos(name)')
            .eq('registration_token', token)
            .single();

        if (error || !empresa) {
            return res.status(404).json({ error: 'Link inválido ou expirado' });
        }

        if (empresa.registration_token_expires_at && new Date(empresa.registration_token_expires_at) < new Date()) {
            return res.status(403).json({ error: 'Link expirado' });
        }

        const { count: totalPessoas } = await supabaseAdmin
            .from('pessoas')
            .select('id', { count: 'exact', head: true })
            .eq('empresa_id', empresa.id);

        const vagas = empresa.max_colaboradores > 0 
            ? empresa.max_colaboradores - (totalPessoas || 0) 
            : Infinity;

        res.json({
            success: true,
            empresa: {
                id: empresa.id,
                nome: empresa.nome,
                evento_nome: empresa.eventos?.nome,
                vagas,
                datas_acesso: empresa.datas_acesso
            }
        });
    } catch (err) {
        logger.error('Erro em getCompanyByToken:', err);
        res.status(500).json({ error: 'Erro interno' });
    }
});

router.post('/register-employee', async (req, res) => {
    try {
        const { token } = req.params;
        const payload = req.body;

        const { data: empresa, error: empError } = await supabaseAdmin
            .from('empresas')
            .select('id, evento_id, registration_token_expires_at, max_colaboradores')
            .eq('registration_token', token)
            .single();

        if (empError || !empresa) {
            return res.status(404).json({ error: 'Link inválido' });
        }

        if (empresa.registration_token_expires_at && new Date(empresa.registration_token_expires_at) < new Date()) {
            return res.status(403).json({ error: 'Link expirado' });
        }

        const cpfLimpo = (payload.cpf || '').replace(/\D/g, '');

        const { data: existing } = await supabaseAdmin
            .from('pessoas')
            .select('id')
            .eq('cpf', cpfLimpo)
            .eq('evento_id', empresa.evento_id)
            .single();

        if (existing) {
            return res.status(400).json({ error: 'CPF já cadastrado neste evento' });
        }

        const qrData = await QRCode.toDataURL(cpfLimpo);

        const { data: pessoa, error } = await supabaseAdmin
            .from('pessoas')
            .insert([{
                nome: payload.nome,
                cpf: cpfLimpo,
                data_nascimento: payload.data_nascimento,
                nome_mae: payload.nome_mae,
                telefone: payload.telefone,
                email: payload.email,
                foto_url: payload.foto_url,
                empresa_id: empresa.id,
                evento_id: empresa.evento_id,
                funcao: payload.funcao,
                dias_acesso: payload.dias_acesso,
                qr_code: qrData,
                status_acesso: 'pendente',
                origem_cadastro: 'public_portal'
            }])
            .select()
            .single();

        if (error) {
            logger.error('Erro ao criar pessoa:', error);
            return res.status(500).json({ error: 'Erro ao criar registro' });
        }

        res.status(201).json({ success: true, pessoa });
    } catch (err) {
        logger.error('Erro em register-employee:', err);
        res.status(500).json({ error: 'Erro interno' });
    }
});

router.post('/validate-invite', async (req, res) => {
    try {
        const { token } = req.body;

        const { data: invite, error } = await supabaseAdmin
            .from('user_invites')
            .select('*')
            .eq('invite_token', token)
            .gt('expires_at', new Date().toISOString())
            .eq('used', false)
            .single();

        if (error || !invite) {
            return res.status(404).json({ valid: false, error: 'Convite inválido ou expirado' });
        }

        res.json({ valid: true, email: invite.email, role: invite.role });
    } catch (err) {
        logger.error('Erro em validate-invite:', err);
        res.status(500).json({ error: 'Erro interno' });
    }
});

module.exports = router;