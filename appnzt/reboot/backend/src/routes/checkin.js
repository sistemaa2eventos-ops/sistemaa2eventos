const express = require('express');
const router = express.Router();
const { supabaseAdmin } = require('../../config/supabase');
const logger = require('../../services/logger');
const { requireAuth } = require('../auth');
const axios = require('axios');

router.post('/checkin', requireAuth, async (req, res) => {
    try {
        const { pessoa_id, method = 'qr', terminal_id, terminal_area } = req.body;
        const evento_id = req.user.evento_id;

        if (!pessoa_id) {
            return res.status(400).json({ error: 'pessoa_id é obrigatório' });
        }

        const { data: pessoa, error: pessoaError } = await supabaseAdmin
            .from('pessoas')
            .select('*')
            .eq('id', pessoa_id)
            .single();

        if (pessoaError || !pessoa) {
            return res.status(404).json({ error: 'Pessoa não encontrada' });
        }

        if (pessoa.status_acesso === 'bloqueado') {
            return res.status(403).json({ error: 'Pessoa bloqueada', success: false });
        }

        const checkinRecord = {
            pessoa_id: pessoa.id,
            evento_id,
            type: 'checkin',
            method,
            terminal_id,
            terminal_area,
            timestamp: new Date().toISOString()
        };

        const { data: checkin, error: checkinError } = await supabaseAdmin
            .from('checkins')
            .insert([checkinRecord])
            .select()
            .single();

        if (checkinError) throw checkinError;

        await supabaseAdmin
            .from('pessoas')
            .update({ status_acesso: 'checkin', updated_at: new Date().toISOString() })
            .eq('id', pessoa.id);

        logger.info(`Check-in: ${pessoa.nome} (${method}) no evento ${evento_id}`);

        res.json({
            success: true,
            message: 'Check-in realizado com sucesso',
            pessoa: { id: pessoa.id, nome: pessoa.nome, status: 'checkin' }
        });
    } catch (err) {
        logger.error('Erro no checkin:', err);
        res.status(500).json({ error: 'Erro interno' });
    }
});

router.post('/checkout', requireAuth, async (req, res) => {
    try {
        const { pessoa_id, method = 'qr', terminal_id, terminal_area } = req.body;
        const evento_id = req.user.evento_id;

        if (!pessoa_id) {
            return res.status(400).json({ error: 'pessoa_id é obrigatório' });
        }

        const { data: pessoa, error: pessoaError } = await supabaseAdmin
            .from('pessoas')
            .select('*')
            .eq('id', pessoa_id)
            .single();

        if (pessoaError || !pessoa) {
            return res.status(404).json({ error: 'Pessoa não encontrada' });
        }

        const checkoutRecord = {
            pessoa_id: pessoa.id,
            evento_id,
            type: 'checkout',
            method,
            terminal_id,
            terminal_area,
            timestamp: new Date().toISOString()
        };

        const { data: checkout, error: checkoutError } = await supabaseAdmin
            .from('checkins')
            .insert([checkoutRecord])
            .select()
            .single();

        if (checkoutError) throw checkoutError;

        await supabaseAdmin
            .from('pessoas')
            .update({ status_acesso: 'checkout', updated_at: new Date().toISOString() })
            .eq('id', pessoa.id);

        logger.info(`Check-out: ${pessoa.nome} (${method}) no evento ${evento_id}`);

        res.json({
            success: true,
            message: 'Check-out realizado com sucesso',
            pessoa: { id: pessoa.id, nome: pessoa.nome, status: 'checkout' }
        });
    } catch (err) {
        logger.error('Erro no checkout:', err);
        res.status(500).json({ error: 'Erro interno' });
    }
});

router.post('/face-verify', requireAuth, async (req, res) => {
    try {
        const { image_base64, terminal_id, terminal_area } = req.body;
        const evento_id = req.user.evento_id;
        const faceServiceUrl = process.env.FACE_SERVICE_URL || 'http://localhost:8000';

        const { data: embeddingResult } = await axios.post(
            `${faceServiceUrl}/api/extract`,
            { image_base64 },
            { timeout: 10000 }
        );

        if (!embeddingResult?.success) {
            return res.status(400).json({ success: false, error: 'Falha ao processar imagem' });
        }

        const embedding = embeddingResult.embedding;

        const { data: pessoas } = await supabaseAdmin
            .from('pessoas')
            .select('id, nome, cpf, foto_url, face_embedding, status_acesso')
            .eq('evento_id', evento_id)
            .not('face_embedding', 'is', null);

        if (!pessoas || pessoas.length === 0) {
            return res.status(404).json({ success: false, error: 'Nenhuma pessoa cadastrada com biometria' });
        }

        // Calcular similaridade (cosine similarity)
        const cosineSimilarity = (a, b) => {
            if (!a || !b || a.length !== b.length) return 0;
            const dotProduct = a.reduce((sum, val, i) => sum + val * b[i], 0);
            const magA = Math.sqrt(a.reduce((sum, val) => sum + val * val, 0));
            const magB = Math.sqrt(b.reduce((sum, val) => sum + val * val, 0));
            return dotProduct / (magA * magB);
        };

        const threshold = 0.75;
        let bestMatch = null;
        let bestScore = 0;

        for (const p of pessoas) {
            if (!p.face_embedding) continue;
            const score = cosineSimilarity(embedding, p.face_embedding);
            if (score > threshold && score > bestScore) {
                bestScore = score;
                bestMatch = p;
            }
        }

        if (!bestMatch) {
            return res.status(404).json({ success: false, error: 'Face não reconhecida' });
        }

        // Executar check-in/checkout automático
        const lastCheckin = await supabaseAdmin
            .from('checkins')
            .select('type')
            .eq('pessoa_id', bestMatch.id)
            .order('timestamp', { ascending: false })
            .limit(1)
            .single();

        const isCheckout = lastCheckin.data?.type === 'checkin';

        const { error: logError } = await supabaseAdmin
            .from('checkins')
            .insert([{
                pessoa_id: bestMatch.id,
                evento_id,
                type: isCheckout ? 'checkout' : 'checkin',
                method: 'face',
                terminal_id,
                terminal_area,
                timestamp: new Date().toISOString()
            }]);

        if (logError) throw logError;

        await supabaseAdmin
            .from('pessoas')
            .update({ status_acesso: isCheckout ? 'checkout' : 'checkin', updated_at: new Date().toISOString() })
            .eq('id', bestMatch.id);

        logger.info(`Face verify: ${bestMatch.nome} -> ${isCheckout ? 'checkout' : 'checkin'}`);

        res.json({
            success: true,
            match: true,
            pessoa: { id: bestMatch.id, nome: bestMatch.nome, cpf: bestMatch.cpf },
            action: isCheckout ? 'checkout' : 'checkin',
            score: bestScore
        });
    } catch (err) {
        logger.error('Erro em face-verify:', err);
        res.status(500).json({ success: false, error: 'Erro interno' });
    }
});

router.get('/logs', requireAuth, async (req, res) => {
    try {
        const { evento_id } = req.query;
        const { limit = 50, offset = 0 } = req.query;

        let query = supabaseAdmin
            .from('checkins')
            .select('*, pessoas(nome, cpf, foto_url)')
            .order('timestamp', { ascending: false })
            .range(parseInt(offset), parseInt(offset) + parseInt(limit) - 1);

        if (evento_id) {
            query = query.eq('evento_id', evento_id);
        }

        const { data: logs, error } = await query;

        if (error) throw error;

        res.json({ success: true, logs });
    } catch (err) {
        logger.error('Erro ao buscar logs:', err);
        res.status(500).json({ error: 'Erro interno' });
    }
});

router.get('/status/:pessoa_id', requireAuth, async (req, res) => {
    try {
        const { pessoa_id } = req.params;

        const { data: pessoa } = await supabaseAdmin
            .from('pessoas')
            .select('status_acesso')
            .eq('id', pessoa_id)
            .single();

        res.json({ success: true, status: pessoa?.status_acesso || 'desconhecido' });
    } catch (err) {
        logger.error('Erro ao buscar status:', err);
        res.status(500).json({ error: 'Erro interno' });
    }
});

module.exports = router;