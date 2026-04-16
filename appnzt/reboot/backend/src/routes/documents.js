const express = require('express');
const router = express.Router();
const { supabaseAdmin } = require('../../config/supabase');
const logger = require('../../services/logger');
const { requireAuth } = require('../auth');

router.get('/', requireAuth, async (req, res) => {
    try {
        const { owner_type, owner_id, status, page = 1, limit = 50 } = req.query;
        const offset = (parseInt(page) - 1) * parseInt(limit);

        let query = supabaseAdmin
            .from('documents')
            .select('*', { count: 'exact' })
            .order('uploaded_at', { ascending: false })
            .range(offset, offset + parseInt(limit) - 1);

        if (owner_type && owner_id) {
            query = query.eq('owner_type', owner_type).eq('owner_id', owner_id);
        }
        if (status) query = query.eq('status_auditoria', status);

        const { data: documents, error, count } = await query;

        if (error) throw error;

        res.json({ success: true, documents, pagination: { page: parseInt(page), limit: parseInt(limit), total: count } });
    } catch (err) {
        logger.error('Erro ao buscar documentos:', err);
        res.status(500).json({ error: 'Erro interno' });
    }
});

router.get('/pending', requireAuth, async (req, res) => {
    try {
        const { evento_id } = req.query;

        let query = supabaseAdmin
            .from('documents')
            .select('*, empresas(nome), pessoas(nome)')
            .eq('status_auditoria', 'pendente')
            .order('uploaded_at', { ascending: false })
            .limit(100);

        const { data: documents, error } = await query;

        if (error) throw error;

        res.json({ success: true, documents });
    } catch (err) {
        logger.error('Erro ao buscar documentos pendentes:', err);
        res.status(500).json({ error: 'Erro interno' });
    }
});

router.post('/', requireAuth, async (req, res) => {
    try {
        const { owner_type, owner_id, doc_type, file_url } = req.body;

        if (!owner_type || !owner_id || !doc_type) {
            return res.status(400).json({ error: 'owner_type, owner_id e doc_type são obrigatórios' });
        }

        const { data: document, error } = await supabaseAdmin
            .from('documents')
            .insert([{
                owner_type,
                owner_id,
                doc_type,
                file_url,
                status_auditoria: 'pendente'
            }])
            .select()
            .single();

        if (error) throw error;

        res.status(201).json({ success: true, document });
    } catch (err) {
        logger.error('Erro ao criar documento:', err);
        res.status(500).json({ error: 'Erro interno' });
    }
});

router.patch('/:id/review', requireAuth, async (req, res) => {
    try {
        const { id } = req.params;
        const { status_auditoria, review_comment } = req.body;

        const validStatuses = ['pendente', 'aprovado', 'reprovado'];
        if (!validStatuses.includes(status_auditoria)) {
            return res.status(400).json({ error: 'Status inválido' });
        }

        const { data: document, error } = await supabaseAdmin
            .from('documents')
            .update({
                status_auditoria,
                review_comment,
                reviewed_by: req.user.id,
                reviewed_at: new Date().toISOString()
            })
            .eq('id', id)
            .select()
            .single();

        if (error) throw error;

        logger.info(`Documento ${id} revisado: ${status_auditoria}`);

        res.json({ success: true, document });
    } catch (err) {
        logger.error('Erro ao revisar documento:', err);
        res.status(500).json({ error: 'Erro interno' });
    }
});

router.delete('/:id', requireAuth, async (req, res) => {
    try {
        const { id } = req.params;

        const { error } = await supabaseAdmin
            .from('documents')
            .delete()
            .eq('id', id);

        if (error) throw error;

        res.json({ success: true, message: 'Documento deletado' });
    } catch (err) {
        logger.error('Erro ao deletar documento:', err);
        res.status(500).json({ error: 'Erro interno' });
    }
});

module.exports = router;