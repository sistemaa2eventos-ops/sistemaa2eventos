const { supabase } = require('../../config/supabase');
const logger = require('../../services/logger');

class EmpresaController {
    async list(req, res) {
        try {
            const eventoId = req.event.id;

            const { data, error } = await supabase
                .from('empresas')
                .select('*')
                .eq('evento_id', eventoId);

            if (error) throw error;
            res.json({ success: true, data });
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    }

    async search(req, res) {
        try {
            const { q } = req.query;
            const evId = req.event.id;

            let query = supabase.from('empresas').select('*').eq('evento_id', evId);

            if (q) {
                query = query.or(`nome.ilike.%${q}%,cnpj.ilike.%${q}%`);
            }

            const { data, error } = await query.limit(50);
            if (error) throw error;

            res.json({ success: true, data });
        } catch (error) {
            logger.error('Erro na busca de empresas:', error);
            res.status(500).json({ error: 'Erro interno ao realizar busca' });
        }
    }

    async create(req, res) {
        try {
            const { nome, cnpj, servico, email, responsavel } = req.body;
            const evento_id = req.event.id;

            const { data, error } = await supabase
                .from('empresas')
                .insert([{
                    nome,
                    cnpj,
                    servico,
                    email,
                    responsavel,
                    evento_id,
                    max_colaboradores: req.body.max_colaboradores || 0,
                    datas_presenca: req.body.datas_presenca || [],
                    observacao: req.body.observacao || '',
                    registration_token: require('crypto').randomUUID(),
                    created_by: req.user.id
                }])
                .select();

            if (error) throw error;
            res.status(201).json({ success: true, data: data[0] });
        } catch (error) {
            logger.error('Erro ao criar empresa:', error.message);
            res.status(500).json({ error: error.message });
        }
    }

    // Buscar empresa por ID
    async getById(req, res) {
        try {
            const { id } = req.params;
            const { data, error } = await supabase
                .from('empresas')
                .select('*')
                .eq('id', id)
                .single();
            if (error) throw error;
            res.json({ success: true, data });
        } catch (error) {
            logger.error('Erro ao buscar empresa:', error);
            res.status(500).json({ error: error.message });
        }
    }

    // Atualizar empresa
    async update(req, res) {
        try {
            const { id } = req.params;
            const updates = req.body;
            const { data, error } = await supabase
                .from('empresas')
                .update(updates)
                .eq('id', id)
                .select();
            if (error) throw error;
            res.json({ success: true, data: data[0] });
        } catch (error) {
            logger.error('Erro ao atualizar empresa:', error);
            res.status(500).json({ error: error.message });
        }
    }

    // Deletar empresa
    async delete(req, res) {
        try {
            const { id } = req.params;
            const { error } = await supabase
                .from('empresas')
                .delete()
                .eq('id', id);
            if (error) throw error;
            res.json({ success: true, message: 'Empresa deletada com sucesso' });
        } catch (error) {
            logger.error('Erro ao deletar empresa:', error);
            res.status(500).json({ error: error.message });
        }
    }

    /**
     * Gerar novo link de cadastro para a empresa
     */
    async refreshToken(req, res) {
        try {
            const { id } = req.params;
            const newToken = require('crypto').randomUUID();

            const { data, error } = await supabase
                .from('empresas')
                .update({ registration_token: newToken })
                .eq('id', id)
                .select()
                .single();

            if (error) throw error;
            res.json({ success: true, token: newToken, data });
        } catch (error) {
            res.status(500).json({ error: 'Erro ao gerar token' });
        }
    }
}

module.exports = new EmpresaController();