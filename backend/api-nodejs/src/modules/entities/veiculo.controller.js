const { supabase } = require('../../config/supabase');
const logger = require('../../services/logger');

const veiculoController = {
    // Listar todos os veículos vinculados às empresas do evento atual
    list: async (req, res) => {
        try {
            const evento_id = req.event.id;
            const { busca } = req.query;

            // Para listar os veículos de um evento, precisamos cruzar com a tabela de empresas
            let query = supabase
                .from('veiculos')
                .select(`
                    *,
                    empresas!inner(id, nome, evento_id),
                    pessoas!veiculos_motorista_id_fkey(nome, cpf)
                `)
                .eq('empresas.evento_id', evento_id);

            if (busca) {
                query = query.or(`placa.ilike.%${busca}%,modelo.ilike.%${busca}%`);
            }

            // Ordena pelo mais recente
            query = query.order('criado_em', { ascending: false });

            const { data, error } = await query;

            if (error) {
                logger.error('Erro ao listar veículos:', error);
                return res.status(500).json({ error: 'Erro ao listar veículos do evento', details: error.message });
            }

            res.json({ success: true, data });
        } catch (error) {
            logger.error('Erro inesperado em veiculoController.list:', error);
            res.status(500).json({ error: 'Erro interno no servidor' });
        }
    },

    // Buscar um veículo específico
    getById: async (req, res) => {
        try {
            const { id } = req.params;
            const evento_id = req.event.id;

            const { data, error } = await supabase
                .from('veiculos')
                .select(`
                    *,
                    empresas!inner(id, nome, evento_id),
                    pessoas!veiculos_motorista_id_fkey(nome, cpf)
                `)
                .eq('id', id)
                .eq('empresas.evento_id', evento_id)
                .single();

            if (error || !data) {
                return res.status(404).json({ error: 'Veículo não encontrado ou não pertence a este evento' });
            }

            res.json({ success: true, data });
        } catch (error) {
            logger.error('Erro ao buscar veículo:', error);
            res.status(500).json({ error: 'Erro interno no servidor' });
        }
    },

    // Criar veículo
    create: async (req, res) => {
        try {
            const evento_id = req.event.id;
            const { placa, modelo, empresa_id, motorista_id } = req.body;

            if (!placa || !modelo || !empresa_id) {
                return res.status(400).json({ error: 'Placa, modelo e empresa são obrigatórios' });
            }

            // Validar se a empresa fornecida pertence ao evento atual
            const { data: empresa, error: empError } = await supabase
                .from('empresas')
                .select('id')
                .eq('id', empresa_id)
                .eq('evento_id', evento_id)
                .single();

            if (empError || !empresa) {
                return res.status(403).json({ error: 'A empresa informada não pertence ao evento atual' });
            }

            const { data, error } = await supabase
                .from('veiculos')
                .insert([{
                    placa: placa.toUpperCase().trim(),
                    modelo: modelo.toUpperCase().trim(),
                    empresa_id,
                    motorista_id: motorista_id || null
                }])
                .select()
                .single();

            if (error) {
                if (error.code === '23505') { // UNIQUE constraint
                    return res.status(400).json({ error: 'Já existe um veículo cadastrado com esta placa' });
                }
                logger.error('Erro ao criar veículo:', error);
                return res.status(400).json({ error: 'Falha ao gravar veículo no banco', details: error.message });
            }

            res.status(201).json({ success: true, data, message: 'Veículo cadastrado com sucesso' });
        } catch (error) {
            logger.error('Erro inesperado em veiculoController.create:', error);
            res.status(500).json({ error: 'Erro interno no servidor' });
        }
    },

    // Atualizar veículo
    update: async (req, res) => {
        try {
            const { id } = req.params;
            const evento_id = req.event.id;
            const { placa, modelo, empresa_id, motorista_id } = req.body;

            // Garantir que o veículo existente pertence a uma empresa deste evento antes de alterar
            const { data: veiculoAtual, error: vError } = await supabase
                .from('veiculos')
                .select('id, empresas!inner(evento_id)')
                .eq('id', id)
                .eq('empresas.evento_id', evento_id)
                .single();

            if (vError || !veiculoAtual) {
                return res.status(404).json({ error: 'Veículo não encontrado neste evento' });
            }

            // Se for mudar a empresa, validar se a nova empresa também pertence ao evento
            if (empresa_id) {
                const { data: empCheck } = await supabase
                    .from('empresas')
                    .select('id')
                    .eq('id', empresa_id)
                    .eq('evento_id', evento_id)
                    .single();

                if (!empCheck) {
                    return res.status(403).json({ error: 'A nova empresa informada não pertence a este evento' });
                }
            }

            const updates = {
                atualizado_em: new Date()
            };
            if (placa) updates.placa = placa.toUpperCase().trim();
            if (modelo) updates.modelo = modelo.toUpperCase().trim();
            if (empresa_id) updates.empresa_id = empresa_id;
            updates.motorista_id = motorista_id || null; // Nulifica se vier vazio, ou atribui

            const { data, error } = await supabase
                .from('veiculos')
                .update(updates)
                .eq('id', id)
                .select()
                .single();

            if (error) {
                if (error.code === '23505') return res.status(400).json({ error: 'A placa informada já está em uso' });
                throw error;
            }

            res.json({ success: true, data, message: 'Veículo atualizado com sucesso' });
        } catch (error) {
            logger.error('Erro ao atualizar veículo:', error);
            res.status(500).json({ error: 'Erro interno no servidor' });
        }
    },

    // Deletar veículo
    delete: async (req, res) => {
        try {
            const { id } = req.params;
            const evento_id = req.event.id;

            // Autorização via Inner Join: Deleta só se a empresa for do evento atual
            const { data: veiculoAtual, error: vError } = await supabase
                .from('veiculos')
                .select('id, empresas!inner(evento_id)')
                .eq('id', id)
                .eq('empresas.evento_id', evento_id)
                .single();

            if (vError || !veiculoAtual) {
                return res.status(404).json({ error: 'Veículo não encontrado neste evento' });
            }

            const { error } = await supabase
                .from('veiculos')
                .delete()
                .eq('id', id);

            if (error) throw error;

            res.json({ success: true, message: 'Veículo removido com sucesso' });
        } catch (error) {
            logger.error('Erro ao excluir veículo:', error);
            res.status(500).json({ error: 'Erro interno no servidor' });
        }
    }
};

module.exports = veiculoController;
