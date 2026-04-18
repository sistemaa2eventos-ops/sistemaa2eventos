const { supabase } = require('../../config/supabase');
const logger = require('../../services/logger');

class TerminalController {
    async list(req, res) {
        try {
            const eventoId = req.event?.id;
            
            const { data, error } = await supabase
                .from('terminais_faciais')
                .select('*')
                .eq('evento_id', eventoId)
                .order('nome');

            if (error) throw error;

            res.json({ success: true, terminais: data });
        } catch (error) {
            logger.error('Erro ao listar terminais:', error);
            res.status(500).json({ error: 'Erro ao listar terminais' });
        }
    }

    async create(req, res) {
        try {
            const eventoId = req.event?.id;
            const { nome, area_id, area_nome, modo, ativo, biometric_confidence_min } = req.body;

            const { data, error } = await supabase
                .from('terminais_faciais')
                .insert({
                    evento_id: eventoId,
                    nome,
                    area_id: area_id || null,
                    area_nome: area_nome || null,
                    modo: modo || 'ambos',
                    ativo: ativo !== false,
                    biometric_confidence_min,
                    criado_por: req.user.id
                })
                .select()
                .single();

            if (error) throw error;

            logger.info(`Terminal criado: ${nome} (ID: ${data.id})`);
            res.json({ success: true, terminal: data });
        } catch (error) {
            logger.error('Erro ao criar terminal:', error);
            res.status(500).json({ error: 'Erro ao criar terminal' });
        }
    }

    async update(req, res) {
        try {
            const { id } = req.params;
            const { nome, area_id, area_nome, modo, ativo, biometric_confidence_min } = req.body;
            const eventoId = req.event?.id;

            const updateData = { atualizado_em: new Date() };
            if (nome) updateData.nome = nome;
            if (area_id !== undefined) updateData.area_id = area_id;
            if (area_nome !== undefined) updateData.area_nome = area_nome;
            if (modo) updateData.modo = modo;
            if (ativo !== undefined) updateData.ativo = ativo;
            if (biometric_confidence_min !== undefined) updateData.biometric_confidence_min = biometric_confidence_min;

            const { data, error } = await supabase
                .from('terminais_faciais')
                .update(updateData)
                .eq('id', id)
                .eq('evento_id', eventoId)
                .select()
                .single();

            if (error) throw error;

            logger.info(`Terminal atualizado: ${id}`);
            res.json({ success: true, terminal: data });
        } catch (error) {
            logger.error('Erro ao atualizar terminal:', error);
            res.status(500).json({ error: 'Erro ao atualizar terminal' });
        }
    }

    async delete(req, res) {
        try {
            const { id } = req.params;
            const eventoId = req.event?.id;

            const { error } = await supabase
                .from('terminais_faciais')
                .delete()
                .eq('id', id)
                .eq('evento_id', eventoId);

            if (error) throw error;

            logger.info(`Terminal deletado: ${id}`);
            res.json({ success: true });
        } catch (error) {
            logger.error('Erro ao deletar terminal:', error);
            res.status(500).json({ error: 'Erro ao deletar terminal' });
        }
    }
}

module.exports = new TerminalController();