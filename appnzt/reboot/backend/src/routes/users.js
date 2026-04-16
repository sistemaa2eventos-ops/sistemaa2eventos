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

router.get('/', requireAuth, requireAdmin, async (req, res) => {
    try {
        const { evento_id, search, page = 1, limit = 20 } = req.query;
        const offset = (parseInt(page) - 1) * parseInt(limit);

        let query = supabaseAdmin
            .from('users')
            .select('*, eventos(name)', { count: 'exact' })
            .order('created_at', { ascending: false })
            .range(offset, offset + parseInt(limit) - 1);

        if (evento_id) query = query.eq('evento_id', evento_id);
        if (search) query = query.ilike('name', `%${search}%`);

        const { data: users, error, count } = await query;

        if (error) throw error;

        res.json({ success: true, users, pagination: { page: parseInt(page), limit: parseInt(limit), total: count } });
    } catch (err) {
        logger.error('Erro ao buscar usuários:', err);
        res.status(500).json({ error: 'Erro interno' });
    }
});

router.get('/operators', requireAuth, async (req, res) => {
    try {
        const { evento_id } = req.query;

        let query = supabaseAdmin
            .from('users')
            .select('id, name, email, role, active, permissions')
            .eq('role', 'operador')
            .eq('active', true);

        if (evento_id) query = query.eq('evento_id', evento_id);

        const { data: operators, error } = await query;

        if (error) throw error;

        res.json({ success: true, operators });
    } catch (err) {
        logger.error('Erro ao buscar operadores:', err);
        res.status(500).json({ error: 'Erro interno' });
    }
});

router.post('/invite', requireAuth, requireAdmin, async (req, res) => {
    try {
        const { email, role, evento_id, permissions } = req.body;

        if (!email || !role) {
            return res.status(400).json({ error: 'Email e role são obrigatórios' });
        }

        if (role !== 'admin' && role !== 'operador') {
            return res.status(400).json({ error: 'Role inválida' });
        }

        const existingUser = await supabaseAdmin
            .from('users')
            .select('id')
            .eq('email', email)
            .single();

        if (existingUser) {
            return res.status(400).json({ error: 'Email já cadastrado no sistema' });
        }

        const invite_token = uuidv4();
        const expires_at = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

        const { data: invite, error } = await supabaseAdmin
            .from('user_invites')
            .insert([{
                invite_token,
                email,
                role,
                evento_id,
                permissions: permissions || {},
                invited_by: req.user.id,
                expires_at
            }])
            .select()
            .single();

        if (error) throw error;

        const inviteLink = `${process.env.FRONTEND_URL}/register?token=${invite_token}`;

        logger.info(`Convite criado para ${email}: ${inviteLink}`);

        res.status(201).json({ 
            success: true, 
            invite: { ...invite, invite_link: inviteLink }
        });
    } catch (err) {
        logger.error('Erro ao criar convite:', err);
        res.status(500).json({ error: 'Erro interno' });
    }
});

router.put('/:id', requireAuth, requireAdmin, async (req, res) => {
    try {
        const { id } = req.params;
        const { name, role, evento_id, permissions, active } = req.body;

        if (role === 'admin' && req.user.role !== 'admin') {
            return res.status(403).json({ error: 'Apenas admin pode modificar admin' });
        }

        const { data: user, error } = await supabaseAdmin
            .from('users')
            .update({ name, role, evento_id, permissions, active, updated_at: new Date().toISOString() })
            .eq('id', id)
            .select()
            .single();

        if (error) throw error;

        logger.info(`Usuário ${id} atualizado por ${req.user.email}`);

        res.json({ success: true, user });
    } catch (err) {
        logger.error('Erro ao atualizar usuário:', err);
        res.status(500).json({ error: 'Erro interno' });
    }
});

router.delete('/:id', requireAuth, requireAdmin, async (req, res) => {
    try {
        const { id } = req.params;

        if (id === req.user.id) {
            return res.status(400).json({ error: 'Não é possível excluir a si mesmo' });
        }

        const { data: targetUser } = await supabaseAdmin
            .from('users')
            .select('role')
            .eq('id', id)
            .single();

        if (targetUser?.role === 'admin' && req.user.role !== 'admin') {
            return res.status(403).json({ error: 'Apenas admin pode excluir admin' });
        }

        await supabaseAdmin
            .from('users')
            .delete()
            .eq('id', id);

        logger.info(`Usuário ${id} deletado por ${req.user.email}`);

        res.json({ success: true, message: 'Usuário deletado' });
    } catch (err) {
        logger.error('Erro ao deletar usuário:', err);
        res.status(500).json({ error: 'Erro interno' });
    }
});

router.patch('/:id/toggle-status', requireAuth, requireAdmin, async (req, res) => {
    try {
        const { id } = req.params;

        if (id === req.user.id) {
            return res.status(400).json({ error: 'Não é possível alterar seu próprio status' });
        }

        const { data: user } = await supabaseAdmin
            .from('users')
            .select('active')
            .eq('id', id)
            .single();

        if (!user) {
            return res.status(404).json({ error: 'Usuário não encontrado' });
        }

        const { data: updated, error } = await supabaseAdmin
            .from('users')
            .update({ active: !user.active, updated_at: new Date().toISOString() })
            .eq('id', id)
            .select()
            .single();

        if (error) throw error;

        res.json({ success: true, user: updated });
    } catch (err) {
        logger.error('Erro ao togglear status:', err);
        res.status(500).json({ error: 'Erro interno' });
    }
});

module.exports = router;