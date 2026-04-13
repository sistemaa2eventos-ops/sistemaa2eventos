const { supabase } = require('../../config/supabase');
const logger = require('../../services/logger');
const veiculoService = require('./veiculo.service');
const ApiResponse = require('../../utils/apiResponse');

const veiculoController = {
    list: async (req, res) => {
        try {
            const eventoId = req.event?.id;
            if (!eventoId) return ApiResponse.error(res, 'Evento não identificado.', 400);

            const { busca } = req.query;
            const supabaseClient = req.supabase || supabase;
            const data = await veiculoService.listByEvent(supabaseClient, eventoId, busca);

            return ApiResponse.success(res, data);
        } catch (error) {
            logger.error('Erro ao listar veículos:', error.message);
            return ApiResponse.error(res, error.message);
        }
    },

    getById: async (req, res) => {
        try {
            const { id } = req.params;
            const eventoId = req.event?.id;
            if (!eventoId) return ApiResponse.error(res, 'Evento não identificado.', 400);

            const supabaseClient = req.supabase || supabase;
            const data = await veiculoService.getById(supabaseClient, id, eventoId);

            return ApiResponse.success(res, data);
        } catch (error) {
            logger.error('Erro ao buscar veículo:', error.message);
            return ApiResponse.error(res, 'Veículo não encontrado ou não pertence a este evento', 404);
        }
    },

    create: async (req, res) => {
        try {
            const eventoId = req.event?.id;
            if (!eventoId) return ApiResponse.error(res, 'Evento não identificado.', 400);

            const { placa, modelo, empresa_id } = req.body;
            if (!placa || !modelo || !empresa_id) {
                return ApiResponse.error(res, 'Placa, modelo e empresa são obrigatórios', 400);
            }

            const supabaseClient = req.supabase || supabase;
            const data = await veiculoService.createVeiculo(supabaseClient, req.body, eventoId);

            return ApiResponse.success(res, data, 201);
        } catch (error) {
            logger.error('Erro ao criar veículo:', error.message);
            return ApiResponse.error(res, error.message, 400);
        }
    },

    update: async (req, res) => {
        try {
            const { id } = req.params;
            const eventoId = req.event?.id;
            if (!eventoId) return ApiResponse.error(res, 'Evento não identificado.', 400);

            const supabaseClient = req.supabase || supabase;
            const data = await veiculoService.updateVeiculo(supabaseClient, id, req.body, eventoId);

            return ApiResponse.success(res, data);
        } catch (error) {
            logger.error('Erro ao atualizar veículo:', error.message);
            return ApiResponse.error(res, error.message, 400);
        }
    },

    delete: async (req, res) => {
        try {
            const { id } = req.params;
            const eventoId = req.event?.id;
            if (!eventoId) return ApiResponse.error(res, 'Evento não identificado.', 400);

            const supabaseClient = req.supabase || supabase;
            await veiculoService.deleteVeiculo(supabaseClient, id, eventoId);

            return ApiResponse.success(res, { message: 'Veículo removido com sucesso' });
        } catch (error) {
            logger.error('Erro ao excluir veículo:', error.message);
            return ApiResponse.error(res, error.message, 400);
        }
    }
};

module.exports = veiculoController;
