const express = require('express');
const router = express.Router();
const { supabaseAdmin } = require('../../config/supabase');
const logger = require('../../services/logger');
const { requireAuth } = require('../auth');
const { v4: uuidv4 } = require('uuid');

router.get('/', requireAuth, async (req, res) => {
    try {
        const { evento_id, page = 1, limit = 20, search } = req.query;
        const offset = (parseInt(page) - 1) * parseInt(limit);

        let query = supabaseAdmin
            .from('empresas')
            .select('*, eventos(name)', { count: 'exact' })
            .order('created_at', { ascending: false })
            .range(offset, offset + parseInt(limit) - 1);

        if (evento_id) query = query.eq('evento_id', evento_id);
        if (search) query = query.ilike('nome', `%${search}%`);

        const { data: empresas, error, count } = await query;

        if (error) throw error;

        res.json({ success: true, empresas, pagination: { page: parseInt(page), limit: parseInt(limit), total: count } });
    } catch (err) {
        logger.error('Erro ao buscar empresas:', err);
        res.status(500).json({ error: 'Erro interno' });
    }
});

router.get('/:id', requireAuth, async (req, res) => {
    try {
        const { id } = req.params;

        const { data: empresa, error } = await supabaseAdmin
            .from('empresas')
            .select('*, eventos(name), pessoas(*), documents(*)')
            .eq('id', id)
            .single();

        if (error || !empresa) {
            return res.status(404).json({ error: 'Empresa não encontrada' });
        }

        res.json({ success: true, empresa });
    } catch (err) {
        logger.error('Erro ao buscar empresa:', err);
        res.status(500).json({ error: 'Erro interno' });
    }
});

router.post('/', requireAuth, async (req, res) => {
    try {
        const { nome, cnpj, tipo_servico, responsavel_legal, email, evento_id, datas_acesso, max_colaboradores } = req.body;

        if (!nome || !evento_id) {
            return res.status(400).json({ error: 'Nome e evento_id são obrigatórios' });
        }

        const registration_token = uuidv4();
        const registration_token_expires_at = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

        const { data: empresa, error } = await supabaseAdmin
            .from('empresas')
            .insert([{
                nome,
                cnpj,
                tipo_servico,
                responsavel_legal,
                email,
                evento_id,
                datas_acesso: datas_acesso || [],
                max_colaboradores: max_colaboradores || 0,
                registration_token,
                registration_token_expires_at
            }])
            .select()
            .single();

        if (error) throw error;

        logger.info(`Empresa criada: ${nome} (${empresa.id})`);

        res.status(201).json({ success: true, empresa });
    } catch (err) {
        logger.error('Erro ao criar empresa:', err);
        res.status(500).json({ error: 'Erro interno' });
    }
});

router.put('/:id', requireAuth, async (req, res) => {
    try {
        const { id } = req.params;
        const { nome, cnpj, tipo_servico, responsavel_legal, email, datas_acesso, max_colaboradores } = req.body;

        const { data: empresa, error } = await supabaseAdmin
            .from('empresas')
            .update({
                nome, cnpj, tipo_servico, responsavel_legal, email,
                datas_acesso, max_colaboradores,
                updated_at: new Date().toISOString()
            })
            .eq('id', id)
            .select()
            .single();

        if (error) throw error;

        res.json({ success: true, empresa });
    } catch (err) {
        logger.error('Erro ao atualizar empresa:', err);
        res.status(500).json({ error: 'Erro interno' });
    }
});

router.delete('/:id', requireAuth, async (req, res) => {
    try {
        const { id } = req.params;

        const { error } = await supabaseAdmin
            .from('empresas')
            .delete()
            .eq('id', id);

        if (error) throw error;

        res.json({ success: true, message: 'Empresa deletada' });
    } catch (err) {
        logger.error('Erro ao deletar empresa:', err);
        res.status(500).json({ error: 'Erro interno' });
    }
});

router.post('/:id/regenerate-link', requireAuth, async (req, res) => {
    try {
        const { id } = req.params;

        const registration_token = uuidv4();
        const registration_token_expires_at = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

        const { data: empresa, error } = await supabaseAdmin
            .from('empresas')
            .update({ registration_token, registration_token_expires_at })
            .eq('id', id)
            .select()
            .single();

        if (error) throw error;

        res.json({ success: true, registration_token });
    } catch (err) {
        logger.error('Erro ao gerar novo link:', err);
        res.status(500).json({ error: 'Erro interno' });
    }
});

module.exports = router;