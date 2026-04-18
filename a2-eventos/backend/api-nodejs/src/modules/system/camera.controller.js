const { supabase } = require('../../config/supabase');
const logger = require('../../services/logger');
const axios = require('axios');

class CameraController {
    /**
     * Listar Câmeras do Evento
     */
    async list(req, res) {
        try {
            const evento_id = req.query.evento_id || req.headers['x-evento-id'];
            if (!evento_id) return res.status(400).json({ error: 'evento_id obrigatório' });

            let { data, error } = await supabase
                .from('cameras_ip')
                .select('*, area:evento_areas(nome)')
                .eq('evento_id', evento_id)
                .order('created_at', { ascending: true });

            // Fallback: se a tabela ou join falhar, tentar sem o join
            if (error) {
                logger.warn('Fallback cameras sem join evento_areas:', error.message);
                const retry = await supabase
                    .from('cameras_ip')
                    .select('*')
                    .eq('evento_id', evento_id)
                    .order('created_at', { ascending: true });

                if (retry.error) throw retry.error;
                data = retry.data;
            }

            res.json({ success: true, data: data || [] });
        } catch (error) {
            logger.error('Erro ao listar câmeras:', error);
            res.status(500).json({ error: 'Erro ao listar câmeras' });
        }
    }

    /**
     * Criar Câmera
     */
    async create(req, res) {
        try {
            const evento_id = req.body.evento_id || req.headers['x-evento-id'];
            const cameraData = req.body;

            // Auto-preencher snapshot_url se fabricante for selecionado e URL estiver vazia
            if (cameraData.fabricante && !cameraData.snapshot_url) {
                const ip = cameraData.ip_address;
                const porta = cameraData.porta || 80;
                if (cameraData.fabricante === 'Intelbras') {
                    cameraData.snapshot_url = `http://${ip}:${porta}/cgi-bin/snapshot.cgi`;
                } else if (cameraData.fabricante === 'Hikvision') {
                    cameraData.snapshot_url = `http://${ip}:${porta}/ISAPI/Streaming/channels/101/picture`;
                }
            }

            const { data, error } = await supabase
                .from('cameras_ip')
                .insert([{ ...cameraData, evento_id }])
                .select()
                .single();

            if (error) throw error;
            res.json({ success: true, data });
        } catch (error) {
            logger.error('Erro ao criar câmera:', error);
            res.status(500).json({ error: 'Erro ao salvar câmera' });
        }
    }

    /**
     * Atualizar Câmera
     */
    async update(req, res) {
        try {
            const { id } = req.params;
            const updateData = req.body;

            const { data, error } = await supabase
                .from('cameras_ip')
                .update(updateData)
                .eq('id', id)
                .select()
                .single();

            if (error) throw error;
            res.json({ success: true, data });
        } catch (error) {
            logger.error('Erro ao atualizar câmera:', error);
            res.status(500).json({ error: 'Erro ao atualizar' });
        }
    }

    /**
     * Deletar Câmera
     */
    async delete(req, res) {
        try {
            const { id } = req.params;
            const { error } = await supabase
                .from('cameras_ip')
                .delete()
                .eq('id', id);

            if (error) throw error;
            res.json({ success: true });
        } catch (error) {
            logger.error('Erro ao excluir câmera:', error);
            res.status(500).json({ error: 'Erro ao excluir' });
        }
    }

    /**
     * Testar Conexão (Medir Latência e Status)
     */
    async testarConexao(req, res) {
        try {
            const { id } = req.params;
            const { data: cam } = await supabase.from('cameras_ip').select('*').eq('id', id).single();
            if (!cam) return res.status(404).json({ error: 'Câmera não encontrada' });

            const start = Date.now();
            let status = 'offline';
            let latencia = 0;

            try {
                // Timeout curto para teste
                await axios.get(cam.snapshot_url, { 
                    timeout: 3000,
                    auth: cam.usuario ? { username: cam.usuario, password: cam.senha } : null
                });
                status = 'online';
                latencia = Date.now() - start;
            } catch (err) {
                status = 'offline';
            }

            await supabase
                .from('cameras_ip')
                .update({ status, last_seen: new Date() })
                .eq('id', id);

            res.json({ success: true, online: status === 'online', latencia_ms: latencia });
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    }

    /**
     * Proxy Snapshot (Evitar CORS)
     */
    async getSnapshot(req, res) {
        try {
            const { id } = req.params;
            const { data: cam } = await supabase.from('cameras_ip').select('*').eq('id', id).single();
            if (!cam || !cam.snapshot_url) return res.status(404).send('Not Found');

            const response = await axios.get(cam.snapshot_url, {
                responseType: 'arraybuffer',
                timeout: 5000,
                auth: cam.usuario ? { username: cam.usuario, password: cam.senha } : null
            });

            res.set('Content-Type', response.headers['content-type'] || 'image/jpeg');
            res.send(response.data);
        } catch (error) {
            res.status(502).send('Gateway Error: ' + error.message);
        }
    }
}

module.exports = new CameraController();
