const express = require('express');
const router = express.Router();
const { supabaseAdmin } = require('../../config/supabase');
const logger = require('../../services/logger');
const { requireAuth } = require('../auth');
const { v4: uuidv4 } = require('uuid');

function requireAdmin(req, res, next) {
    if (req.user.role !== 'admin') {
        return res.status(403).json({ error: 'Acesso restrito ao administrador' });
    }
    next();
}

router.get('/', requireAuth, async (req, res) => {
    try {
        const { page = 1, limit = 20, search } = req.query;
        const offset = (parseInt(page) - 1) * parseInt(limit);

        let query = supabaseAdmin
            .from('events')
            .select('*', { count: 'exact' })
            .order('created_at', { ascending: false })
            .range(offset, offset + parseInt(limit) - 1);

        if (search) {
            query = query.ilike('name', `%${search}%`);
        }

        if (req.user.role !== 'admin') {
            query = query.eq('id', req.user.evento_id);
        }

        const { data: events, error } = await query;

        if (error) throw error;

        res.json({ success: true, events });
    } catch (err) {
        logger.error('Erro ao buscar eventos:', err);
        res.status(500).json({ error: 'Erro interno' });
    }
});

router.get('/:id', requireAuth, async (req, res) => {
    try {
        const { id } = req.params;

        const { data: event, error } = await supabaseAdmin
            .from('events')
            .select('*, event_dates(*), event_areas(*), event_bracelet_types(*)')
            .eq('id', id)
            .single();

        if (error || !event) {
            return res.status(404).json({ error: 'Evento não encontrado' });
        }

        res.json({ success: true, event });
    } catch (err) {
        logger.error('Erro ao buscar evento:', err);
        res.status(500).json({ error: 'Erro interno' });
    }
});

router.post('/', requireAuth, requireAdmin, async (req, res) => {
    try {
        const { name, location, config, event_dates, event_areas, event_bracelet_types } = req.body;

        if (!name) {
            return res.status(400).json({ error: 'Nome do evento é obrigatório' });
        }

        const { data: event, error } = await supabaseAdmin
            .from('events')
            .insert([{ name, location, config: config || {} }])
            .select()
            .single();

        if (error) throw error;

        if (event_dates && event_dates.length > 0) {
            const datesToInsert = event_dates.map(d => ({
                event_id: event.id,
                date: d.date,
                phase: d.phase
            }));
            await supabaseAdmin.from('event_dates').insert(datesToInsert);
        }

        if (event_areas && event_areas.length > 0) {
            const areasToInsert = event_areas.map(a => ({
                event_id: event.id,
                name: a.name,
                description: a.description
            }));
            await supabaseAdmin.from('event_areas').insert(areasToInsert);
        }

        if (event_bracelet_types && event_bracelet_types.length > 0) {
            const braceletToInsert = event_bracelet_types.map(b => ({
                event_id: event.id,
                name: b.name,
                color: b.color
            }));
            await supabaseAdmin.from('event_bracelet_types').insert(braceletToInsert);
        }

        logger.info(`Evento criado: ${name} (${event.id})`);

        res.status(201).json({ success: true, event });
    } catch (err) {
        logger.error('Erro ao criar evento:', err);
        res.status(500).json({ error: 'Erro interno' });
    }
});

router.put('/:id', requireAuth, requireAdmin, async (req, res) => {
    try {
        const { id } = req.params;
        const { name, location, config } = req.body;

        const { data: event, error } = await supabaseAdmin
            .from('events')
            .update({ name, location, config, updated_at: new Date().toISOString() })
            .eq('id', id)
            .select()
            .single();

        if (error) throw error;

        res.json({ success: true, event });
    } catch (err) {
        logger.error('Erro ao atualizar evento:', err);
        res.status(500).json({ error: 'Erro interno' });
    }
});

router.delete('/:id', requireAuth, requireAdmin, async (req, res) => {
    try {
        const { id } = req.params;

        const { error } = await supabaseAdmin
            .from('events')
            .delete()
            .eq('id', id);

        if (error) throw error;

        logger.info(`Evento deletado: ${id}`);

        res.json({ success: true, message: 'Evento deletado' });
    } catch (err) {
        logger.error('Erro ao deletar evento:', err);
        res.status(500).json({ error: 'Erro interno' });
    }
});

module.exports = router;