const express = require('express');
const router = express.Router();
const { supabaseAdmin } = require('../../config/supabase');
const logger = require('../../services/logger');
const { requireAuth } = require('../auth');

router.get('/', requireAuth, async (req, res) => {
    try {
        const { evento_id, empresa_id, status, page = 1, limit = 50, search } = req.query;
        const offset = (parseInt(page) - 1) * parseInt(limit);

        let query = supabaseAdmin
            .from('pessoas')
            .select('*, empresas(nome), veiculos(*)', { count: 'exact' })
            .order('created_at', { ascending: false })
            .range(offset, offset + parseInt(limit) - 1);

        if (evento_id) query = query.eq('evento_id', evento_id);
        if (empresa_id) query = query.eq('empresa_id', empresa_id);
        if (status) query = query.eq('status_acesso', status);
        if (search) query = query.ilike('nome', `%${search}%`);

        const { data: pessoas, error, count } = await query;

        if (error) throw error;

        res.json({ success: true, pessoas, pagination: { page: parseInt(page), limit: parseInt(limit), total: count } });
    } catch (err) {
        logger.error('Erro ao buscar pessoas:', err);
        res.status(500).json({ error: 'Erro interno' });
    }
});

router.get('/:id', requireAuth, async (req, res) => {
    try {
        const { id } = req.params;

        const { data: pessoa, error } = await supabaseAdmin
            .from('pessoas')
            .select('*, empresas(nome, evento_id), veiculos(*), documents(*), checkins(*)')
            .eq('id', id)
            .single();

        if (error || !pessoa) {
            return res.status(404).json({ error: 'Pessoa não encontrada' });
        }

        res.json({ success: true, pessoa });
    } catch (err) {
        logger.error('Erro ao buscar pessoa:', err);
        res.status(500).json({ error: 'Erro interno' });
    }
});

router.post('/', requireAuth, async (req, res) => {
    try {
        const payload = req.body;
        const { evento_id } = req.user;

        if (!payload.nome || !payload.cpf || !payload.empresa_id) {
            return res.status(400).json({ error: 'nome, cpf e empresa_id são obrigatórios' });
        }

        const cpfLimpo = payload.cpf.replace(/\D/g, '');

        const { data: existing } = await supabaseAdmin
            .from('pessoas')
            .select('id')
            .eq('cpf', cpfLimpo)
            .eq('evento_id', evento_id)
            .single();

        if (existing) {
            return res.status(400).json({ error: 'CPF já cadastrado neste evento' });
        }

        const { data: pessoa, error } = await supabaseAdmin
            .from('pessoas')
            .insert([{
                ...payload,
                cpf: cpfLimpo,
                evento_id: payload.evento_id || evento_id,
                status_acesso: 'pendente',
                origem_cadastro: 'admin'
            }])
            .select()
            .single();

        if (error) throw error;

        res.status(201).json({ success: true, pessoa });
    } catch (err) {
        logger.error('Erro ao criar pessoa:', err);
        res.status(500).json({ error: 'Erro interno' });
    }
});

router.put('/:id', requireAuth, async (req, res) => {
    try {
        const { id } = req.params;
        const payload = req.body;

        if (payload.cpf) {
            payload.cpf = payload.cpf.replace(/\D/g, '');
        }

        const { data: pessoa, error } = await supabaseAdmin
            .from('pessoas')
            .update({ ...payload, updated_at: new Date().toISOString() })
            .eq('id', id)
            .select()
            .single();

        if (error) throw error;

        res.json({ success: true, pessoa });
    } catch (err) {
        logger.error('Erro ao atualizar pessoa:', err);
        res.status(500).json({ error: 'Erro interno' });
    }
});

router.patch('/:id/status', requireAuth, async (req, res) => {
    try {
        const { id } = req.params;
        const { status_acesso, motivo } = req.body;

        const validStatuses = ['pendente', 'autorizado', 'negado', 'checkin', 'checkout', 'bloqueado'];
        if (!validStatuses.includes(status_acesso)) {
            return res.status(400).json({ error: 'Status inválido' });
        }

        const { data: pessoa, error } = await supabaseAdmin
            .from('pessoas')
            .update({ status_acesso, updated_at: new Date().toISOString() })
            .eq('id', id)
            .select()
            .single();

        if (error) throw error;

        logger.info(`Status alterado para ${status_acesso}: ${id}`);

        res.json({ success: true, pessoa });
    } catch (err) {
        logger.error('Erro ao alterar status:', err);
        res.status(500).json({ error: 'Erro interno' });
    }
});

router.delete('/:id', requireAuth, async (req, res) => {
    try {
        const { id } = req.params;

        const { error } = await supabaseAdmin
            .from('pessoas')
            .delete()
            .eq('id', id);

        if (error) throw error;

        res.json({ success: true, message: 'Pessoa deletada' });
    } catch (err) {
        logger.error('Erro ao deletar pessoa:', err);
        res.status(500).json({ error: 'Erro interno' });
    }
});

module.exports = router;