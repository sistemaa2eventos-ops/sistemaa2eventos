const { supabase } = require('../../config/supabase');
const watchlistService = require('./watchlist.service');
const logger = require('../../services/logger');

class WatchlistController {
    /**
     * Listar CPFs da Watchlist do Evento
     */
    async list(req, res) {
        try {
            const evento_id = req.query.evento_id || req.headers['x-evento-id'];
            if (!evento_id) return res.status(400).json({ error: 'evento_id obrigatório' });

            const { data, error } = await supabase
                .from('watchlist')
                .select('*')
                .eq('evento_id', evento_id)
                .order('created_at', { ascending: false });

            if (error) throw error;
            res.json({ success: true, data });
        } catch (error) {
            logger.error('Erro ao listar watchlist:', error);
            res.status(500).json({ error: 'Erro ao listar CPFs' });
        }
    }

    /**
     * Upload de CSV
     */
    async upload(req, res) {
        try {
            const evento_id = req.body.evento_id || req.headers['x-evento-id'];
            if (!evento_id) return res.status(400).json({ error: 'evento_id obrigatório' });
            if (!req.file) return res.status(400).json({ error: 'Arquivo CSV não fornecido' });

            const result = await watchlistService.uploadCSV(evento_id, req.file.buffer);
            if (result.error) return res.status(400).json({ error: result.error });

            res.json(result);
        } catch (error) {
            logger.error('Erro no upload da watchlist:', error);
            res.status(500).json({ error: 'Erro no processamento do arquivo' });
        }
    }

    /**
     * Adicionar Manualmente
     */
    async addManual(req, res) {
        try {
            const evento_id = req.body.evento_id || req.headers['x-evento-id'];
            const { cpf, nome, motivo, nivel_alerta } = req.body;

            if (!evento_id || !cpf) return res.status(400).json({ error: 'Campos obrigatórios ausentes' });

            const { data, error } = await supabase
                .from('watchlist')
                .upsert([{
                    evento_id,
                    cpf: String(cpf).replace(/\D/g, ''),
                    nome: nome || 'Alvo Monitorado',
                    motivo: motivo || 'Adicionado manualmente',
                    nivel_alerta: nivel_alerta || 'alto',
                    ativo: true,
                    adicionado_por: req.user?.id
                }], { onConflict: 'evento_id,cpf' })
                .select()
                .single();

            if (error) throw error;
            res.json({ success: true, data });
        } catch (error) {
            logger.error('Erro ao adicionar CPF manual:', error);
            res.status(500).json({ error: 'Erro ao salvar CPF' });
        }
    }

    /**
     * Remover/Desativar da Watchlist
     */
    async remove(req, res) {
        try {
            const { id } = req.params;
            const { error } = await supabase
                .from('watchlist')
                .delete()
                .eq('id', id);

            if (error) throw error;
            res.json({ success: true });
        } catch (error) {
            logger.error('Erro ao remover CPF da watchlist:', error);
            res.status(500).json({ error: 'Erro ao remover registro' });
        }
    }

    /**
     * Contatos de Alerta
     */
    async listContatos(req, res) {
        try {
            const evento_id = req.query.evento_id || req.headers['x-evento-id'];
            const { data, error } = await supabase
                .from('watchlist_contatos')
                .select('*')
                .eq('evento_id', evento_id);
            if (error) throw error;
            res.json({ success: true, data });
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    }

    async addContato(req, res) {
        try {
            const evento_id = req.body.evento_id || req.headers['x-evento-id'];
            const { nome, telefone, canal, bot_token } = req.body;
            const { data, error } = await supabase
                .from('watchlist_contatos')
                .insert([{ evento_id, nome, telefone, canal, bot_token, ativo: true }])
                .select()
                .single();
            if (error) throw error;
            res.json({ success: true, data });
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    }

    async removeContato(req, res) {
        try {
            const { id } = req.params;
            const { error } = await supabase.from('watchlist_contatos').delete().eq('id', id);
            if (error) throw error;
            res.json({ success: true });
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    }

    /**
     * Histórico de Alertas
     */
    async listAlertas(req, res) {
        try {
            const evento_id = req.query.evento_id || req.headers['x-evento-id'];
            const { data, error } = await supabase
                .from('watchlist_alertas')
                .select('*, watchlist(nome, cpf), pessoa:pessoas(nome, foto_url), dispositivo:dispositivos_acesso(nome), area:evento_areas(nome_area)')
                .eq('evento_id', evento_id)
                .order('hora', { ascending: false })
                .limit(50);
            if (error) throw error;
            res.json({ success: true, data });
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    }
}

module.exports = new WatchlistController();
