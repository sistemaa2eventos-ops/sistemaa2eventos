const express = require('express');
const router = express.Router();
const { supabaseAdmin } = require('../../config/supabase');
const logger = require('../../services/logger');
const { requireAuth } = require('../auth');

router.get('/', requireAuth, async (req, res) => {
    try {
        const { evento_id, pessoa_id, page = 1, limit = 50 } = req.query;
        const offset = (parseInt(page) - 1) * parseInt(limit);

        let query = supabaseAdmin
            .from('veiculos')
            .select('*, pessoas(nome)', { count: 'exact' })
            .order('created_at', { ascending: false })
            .range(offset, offset + parseInt(limit) - 1);

        if (evento_id) query = query.eq('evento_id', evento_id);
        if (pessoa_id) query = query.eq('pessoa_id', pessoa_id);

        const { data: veiculos, error, count } = await query;

        if (error) throw error;

        res.json({ success: true, veiculos, pagination: { page: parseInt(page), limit: parseInt(limit), total: count } });
    } catch (err) {
        logger.error('Erro ao buscar veículos:', err);
        res.status(500).json({ error: 'Erro interno' });
    }
});

router.get('/:id', requireAuth, async (req, res) => {
    try {
        const { id } = req.params;

        const { data: veiculo, error } = await supabaseAdmin
            .from('veiculos')
            .select('*, pessoas(nome, cpf)')
            .eq('id', id)
            .single();

        if (error || !veiculo) {
            return res.status(404).json({ error: 'Veículo não encontrado' });
        }

        res.json({ success: true, veiculo });
    } catch (err) {
        logger.error('Erro ao buscar veículo:', err);
        res.status(500).json({ error: 'Erro interno' });
    }
});

router.post('/', requireAuth, async (req, res) => {
    try {
        const { marca, modelo, cor, placa, pessoa_id, evento_id } = req.body;

        if (!pessoa_id || !evento_id) {
            return res.status(400).json({ error: 'pessoa_id e evento_id são obrigatórios' });
        }

        const { data: veiculo, error } = await supabaseAdmin
            .from('veiculos')
            .insert([{ marca, modelo, cor, placa, pessoa_id, evento_id }])
            .select()
            .single();

        if (error) throw error;

        res.status(201).json({ success: true, veiculo });
    } catch (err) {
        logger.error('Erro ao criar veículo:', err);
        res.status(500).json({ error: 'Erro interno' });
    }
});

router.put('/:id', requireAuth, async (req, res) => {
    try {
        const { id } = req.params;
        const { marca, modelo, cor, placa } = req.body;

        const { data: veiculo, error } = await supabaseAdmin
            .from('veiculos')
            .update({ marca, modelo, cor, placa, updated_at: new Date().toISOString() })
            .eq('id', id)
            .select()
            .single();

        if (error) throw error;

        res.json({ success: true, veiculo });
    } catch (err) {
        logger.error('Erro ao atualizar veículo:', err);
        res.status(500).json({ error: 'Erro interno' });
    }
});

router.delete('/:id', requireAuth, async (req, res) => {
    try {
        const { id } = req.params;

        const { error } = await supabaseAdmin
            .from('veiculos')
            .delete()
            .eq('id', id);

        if (error) throw error;

        res.json({ success: true, message: 'Veículo deletado' });
    } catch (err) {
        logger.error('Erro ao deletar veículo:', err);
        res.status(500).json({ error: 'Erro interno' });
    }
});

module.exports = router;