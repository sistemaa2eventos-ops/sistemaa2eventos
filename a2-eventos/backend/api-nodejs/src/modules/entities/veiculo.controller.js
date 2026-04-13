const { supabase } = require('../../config/supabase');
const logger = require('../../services/logger');
const veiculoService = require('./veiculo.service');

const veiculoController = {
    /**
     * Listar todos os veículos vinculados às empresas do evento atual com paginação
     */
    list: async (req, res) => {
        try {
            const evento_id = req.tenantId;
            const { busca, page = 1, limit = 20 } = req.query;

            const { data, total } = await veiculoService.list(
                supabase, 
                evento_id, 
                busca, 
                parseInt(page), 
                parseInt(limit)
            );
            
            res.json({ success: true, data, total });
        } catch (error) {
            logger.error('Erro inesperado em veiculoController.list:', error);
            res.status(500).json({ error: 'Erro interno no servidor', details: error.message });
        }
    },

    /**
     * Buscar um veículo específico
     */
    getById: async (req, res) => {
        try {
            const { id } = req.params;
            const evento_id = req.tenantId;

            const data = await veiculoService.getById(supabase, id, evento_id);
            res.json({ success: true, data });
        } catch (error) {
            logger.error('Erro ao buscar veículo:', error);
            res.status(error.message.includes('encontrado') ? 404 : 500).json({ error: error.message });
        }
    },

    /**
     * Criar veículo (Agora via Service)
     */
    create: async (req, res) => {
        try {
            const evento_id = req.tenantId;
            const { placa, marca, modelo, empresa_id, motorista_id } = req.body;

            if (!placa || !empresa_id) {
                return res.status(400).json({ error: 'Placa e empresa são obrigatórios' });
            }

            const data = await veiculoService.createVeiculo(supabase, {
                placa, marca, modelo, empresa_id, motorista_id
            }, evento_id);

            res.status(201).json({ success: true, data, message: 'Veículo cadastrado com sucesso' });
        } catch (error) {
            logger.error('Erro inesperado em veiculoController.create:', error);
            res.status(error.message.includes('Já existe') ? 400 : 500).json({ error: error.message });
        }
    },

    /**
     * Atualizar veículo
     */
    update: async (req, res) => {
        try {
            const { id } = req.params;
            const evento_id = req.tenantId;
            const { placa, marca, modelo, empresa_id, motorista_id } = req.body;

            const data = await veiculoService.updateVeiculo(supabase, id, { 
                placa, marca, modelo, empresa_id, motorista_id 
            }, evento_id);

            res.json({ success: true, data, message: 'Veículo atualizado com sucesso' });
        } catch (error) {
            logger.error('Erro ao atualizar veículo:', error);
            res.status(500).json({ error: error.message });
        }
    },

    /**
     * Atualizar status (Bloquear/Liberar)
     */
    updateStatus: async (req, res) => {
        try {
            const { id } = req.params;
            const { status } = req.body;
            const evento_id = req.tenantId;

            if (!['liberado', 'bloqueado'].includes(status)) {
                return res.status(400).json({ error: 'Status inválido.' });
            }

            // Validar propriedade antes de atualizar
            const { data: veiculo, error: vError } = await supabase
                .from('veiculos')
                .select('id, evento_id')
                .eq('id', id)
                .single();

            if (vError || !veiculo) return res.status(404).json({ error: 'Veículo não encontrado.' });
            if (veiculo.evento_id !== evento_id) return res.status(403).json({ error: 'Acesso negado ao veículo.' });

            const { data, error } = await supabase
                .from('veiculos')
                .update({ status, updated_at: new Date() })
                .eq('id', id)
                .select()
                .single();

            if (error) throw error;
            res.json({ success: true, data });
        } catch (error) {
            logger.error('Erro ao atualizar status:', error);
            res.status(500).json({ error: 'Erro ao atualizar status.' });
        }
    },

    /**
     * Consulta rápida de placa para o dashboard e portaria
     */
    consultarPlaca: async (req, res) => {
        try {
            const { placa } = req.params;
            const evento_id = req.tenantId;

            if (!placa) return res.status(400).json({ error: 'Placa não informada.' });

            const { data, error } = await supabase
                .from('veiculos')
                .select('*, empresas(nome, evento_id), pessoas(nome_completo)')
                .eq('placa', placa.toUpperCase().replace(/\s/g, ''))
                .eq('evento_id', evento_id)
                .single();

            if (error || !data) {
                return res.status(404).json({
                    success: false,
                    autorizado: false,
                    error: 'Placa não cadastrada neste evento.'
                });
            }

            if (data.status === 'bloqueado') {
                return res.json({
                    success: true,
                    autorizado: false,
                    motivo: 'Veículo bloqueado.',
                    veiculo: data
                });
            }

            res.json({
                success: true,
                autorizado: true,
                veiculo: data
            });
        } catch (error) {
            logger.error('Erro ao consultar placa:', error);
            res.status(500).json({ error: 'Erro interno ao consultar placa.' });
        }
    },

    /**
     * Registrar passagem manual (Entrada/Saída)
     */
    registrarPassagem: async (req, res) => {
        try {
            const { placa, tipo, metodo = 'manual', observacao } = req.body;
            const evento_id = req.tenantId;

            // Buscar veículo para validar status e pegar ID
            const { data: veiculo } = await supabase
                .from('veiculos')
                .select('id, status, evento_id')
                .eq('placa', placa.toUpperCase().replace(/\s/g, ''))
                .eq('evento_id', evento_id)
                .single();

            if (!veiculo) {
                return res.status(404).json({ error: 'Veículo não cadastrado neste evento.' });
            }

            if (veiculo.status === 'bloqueado') {
                return res.status(403).json({ error: 'Veículo bloqueado.' });
            }

            const { data, error } = await supabase
                .from('logs_veiculos')
                .insert({
                    veiculo_id: veiculo.id,
                    evento_id,
                    placa: placa.toUpperCase().replace(/\s/g, ''),
                    tipo,
                    metodo,
                    operador_id: req.user?.id,
                    observacao
                })
                .select()
                .single();

            if (error) throw error;
            res.json({ success: true, data });
        } catch (error) {
            logger.error('Erro ao registrar passagem:', error);
            res.status(500).json({ error: 'Erro ao registrar passagem.' });
        }
    },

    /**
     * Listagem histórica de passagens de um veículo
     */
    historico: async (req, res) => {
        try {
            const { id } = req.params;
            const { page = 1, limit = 20 } = req.query;
            const from = (page - 1) * limit;

            const { data, error, count } = await supabase
                .from('logs_veiculos')
                .select('*, usuarios:operador_id(nome_completo)', { count: 'exact' })
                .eq('veiculo_id', id)
                .order('created_at', { ascending: false })
                .range(from, from + limit - 1);

            if (error) throw error;
            res.json({ success: true, data, total: count });
        } catch (error) {
            logger.error('Erro ao buscar histórico:', error);
            res.status(500).json({ error: 'Erro ao buscar histórico.' });
        }
    },

    /**
     * Endpoint PÚBLICO para integração LPR (External Hardware)
     */
    consultarPlacaLPR: async (req, res) => {
        try {
            const { placa } = req.params;
            const { evento_id, tipo = 'entrada' } = req.query;

            if (!placa || !evento_id) {
                return res.status(400).json({ autorizado: false, motivo: 'DADOS_INCOMPLETOS' });
            }

            const { data: veiculo, error } = await supabase
                .from('veiculos')
                .select('*, empresas(nome, evento_id), pessoas(nome_completo)')
                .eq('placa', placa.toUpperCase().replace(/\s/g, ''))
                .eq('evento_id', evento_id)
                .single();

            if (error || !veiculo) {
                return res.json({ autorizado: false, motivo: 'NAO_CADASTRADO' });
            }

            if (veiculo.status === 'bloqueado') {
                return res.json({ autorizado: false, motivo: 'BLOQUEADO' });
            }

            // Registrar passagem AUTOMÁTICA via LPR
            await supabase.from('logs_veiculos').insert({
                veiculo_id: veiculo.id,
                evento_id,
                placa: placa.toUpperCase(),
                tipo,
                metodo: 'lpr'
            });

            res.json({
                autorizado: true,
                veiculo: {
                    placa: veiculo.placa,
                    empresa: veiculo.empresas?.nome,
                    motorista: veiculo.pessoas?.nome_completo
                }
            });
        } catch (error) {
            logger.error('Erro em consultarPlacaLPR:', error);
            res.status(500).json({ autorizado: false, motivo: 'ERRO_INTERNO' });
        }
    },

    /**
     * Deletar veículo
     */
    delete: async (req, res) => {
        try {
            const { id } = req.params;
            const evento_id = req.tenantId;

            await veiculoService.deleteVeiculo(supabase, id, evento_id);
            res.json({ success: true, message: 'Veículo removido com sucesso' });
        } catch (error) {
            logger.error('Erro ao excluir veículo:', error);
            res.status(500).json({ error: error.message });
        }
    }
};

module.exports = veiculoController;
