const { supabase } = require('../../config/supabase');
const logger = require('../../services/logger');

class PulseiraConfigController {
    async get(req, res) {
        try {
            const eventoId = req.event?.id;
            
            const { data, error } = await supabase
                .from('config_pulseiras')
                .select('*')
                .eq('evento_id', eventoId)
                .single();

            if (error && error.code !== 'PGRST116') throw error;

            res.json({ success: true, config: data });
        } catch (error) {
            logger.error('Erro ao buscar config pulseira:', error);
            res.status(500).json({ error: 'Erro ao buscar configuração' });
        }
    }

    async update(req, res) {
        try {
            const eventoId = req.event?.id;
            const { 
                tipo_pulseira, 
                prefixo_codigo, 
                sequencia_inicial, 
                sequencia_final,
                alerta_duplicidade,
                tempo_confirmacao_checkout,
                ativo
            } = req.body;

            const updateData = {
                evento_id: eventoId,
                tipo_pulseira: tipo_pulseira || 'numerada',
                prefixo_codigo: prefixo_codigo || null,
                sequencia_inicial: sequencia_inicial || null,
                sequencia_final: sequencia_final || null,
                alerta_duplicidade: alerta_duplicidade !== false,
                tempo_confirmacao_checkout: tempo_confirmacao_checkout || 3,
                ativo: ativo !== false,
                atualizado_em: new Date()
            };

            // Upsert
            const { data, error } = await supabase
                .from('config_pulseiras')
                .upsert(updateData, { onConflict: 'evento_id' })
                .select()
                .single();

            if (error) throw error;

            logger.info(`Config pulseira atualizada para evento: ${eventoId}`);
            res.json({ success: true, config: data });
        } catch (error) {
            logger.error('Erro ao salvar config pulseira:', error);
            res.status(500).json({ error: 'Erro ao salvar configuração' });
        }
    }
}

module.exports = new PulseiraConfigController();