const { supabase } = require('../../config/supabase');
const logger = require('../../services/logger');
const eventService = require('./event.service');
const websocketService = require('../../services/websocketService');
const ApiResponse = require('../../utils/apiResponse');

class EventoController {
    async list(req, res) {
        try {
            const supabaseClient = req.supabase || supabase;
            const data = await eventService.listAll(supabaseClient);

            return ApiResponse.success(res, data);
        } catch (error) {
            logger.error('Erro ao listar eventos:', error.message);
            return ApiResponse.error(res, error.message);
        }
    }

    async getById(req, res) {
        try {
            const { id } = req.params;
            const supabaseClient = req.supabase || supabase;
            const data = await eventService.getById(supabaseClient, id);

            return ApiResponse.success(res, data);
        } catch (error) {
            logger.error('Erro ao buscar evento por ID:', error.message);
            return ApiResponse.error(res, error.message, 404);
        }
    }

    async create(req, res) {
        try {
            const supabaseClient = req.supabase || supabase;
            const data = await eventService.createEvent(supabaseClient, req.body, req.user?.id);

            return ApiResponse.success(res, data, 201);
        } catch (error) {
            logger.error('Erro ao criar evento:', error.message);
            return ApiResponse.error(res, error.message);
        }
    }

    async update(req, res) {
        try {
            const { id } = req.params;
            const supabaseClient = req.supabase || supabase;
            
            // 1. Verificar se a mudança é crítica para disparar alerta
            const isCriticalChange = req.body.config || req.body.status;
            
            const data = await eventService.updateEvent(supabaseClient, id, req.body);

            // 2. Disparar alerta WebSocket se for crítico
            if (isCriticalChange) {
                websocketService.emit('system:alert', {
                    type: 'CRITICAL_CONFIG_CHANGE',
                    severity: 'warning',
                    message: `Configuração crítica alterada no evento: ${data.nome}`,
                    details: {
                        event_id: id,
                        updated_by: req.user?.nome || 'Admin',
                        changes: Object.keys(req.body)
                    }
                }, 'system_admin');
            }

            return ApiResponse.success(res, data);
        } catch (error) {
            logger.error('Erro ao atualizar evento:', error.message);
            return ApiResponse.error(res, error.message);
        }
    }

    async activate(req, res) {
        try {
            const { id } = req.params;
            const supabaseClient = req.supabase || supabase;
            const data = await eventService.setStatus(supabaseClient, id, 'ativo');

            return ApiResponse.success(res, data, 200);
        } catch (error) {
            logger.error('Erro ao ativar evento:', error.message);
            return ApiResponse.error(res, error.message);
        }
    }

    async deactivate(req, res) {
        try {
            const { id } = req.params;
            const supabaseClient = req.supabase || supabase;
            const data = await eventService.setStatus(supabaseClient, id, 'encerrado');

            return ApiResponse.success(res, data, 200);
        } catch (error) {
            logger.error('Erro ao desativar evento:', error.message);
            return ApiResponse.error(res, error.message);
        }
    }

    async delete(req, res) {
        try {
            const { id } = req.params;
            const supabaseClient = req.supabase || supabase;
            await eventService.deleteEvent(supabaseClient, id);

            return ApiResponse.success(res, { message: 'Evento deletado com sucesso' });
        } catch (error) {
            logger.error('Erro ao deletar evento:', error.message);
            return ApiResponse.error(res, error.message);
        }
    }

    async getQuotas(req, res) {
        try {
            const { id, empresa_id } = req.params;
            const supabaseClient = req.supabase || supabase;
            const data = await eventService.getQuotas(supabaseClient, id, empresa_id);

            return ApiResponse.success(res, data);
        } catch (error) {
            logger.error('Erro ao buscar quotas:', error.message);
            return ApiResponse.error(res, error.message);
        }
    }

    async getStats(req, res) {
        try {
            const { id } = req.params;
            const supabaseClient = req.supabase || supabase;
            const data = await eventService.getStats(supabaseClient, id);

            return ApiResponse.success(res, data);
        } catch (error) {
            logger.error('Erro ao buscar stats do evento:', error.message);
            return ApiResponse.error(res, error.message);
        }
    }

    async updateQuotas(req, res) {
        try {
            const { id, empresa_id } = req.params;
            const { quotas } = req.body;
            const supabaseClient = req.supabase || supabase;

            await eventService.updateQuotas(supabaseClient, id, empresa_id, quotas);

            return ApiResponse.success(res, { message: 'Cotas atualizadas!' });
        } catch (error) {
            logger.error('Erro ao atualizar quotas:', error.message);
            return ApiResponse.error(res, error.message);
        }
    }

    async toggleModule(req, res) {
        try {
            const { id: evento_id } = req.params;
            const { module_key, is_enabled } = req.body;
            const supabaseClient = req.supabase || supabase;

            const data = await eventService.toggleModule(supabaseClient, evento_id, module_key, is_enabled);

            return ApiResponse.success(res, data);
        } catch (error) {
            logger.error('Erro ao alternar módulo:', error.message);
            return ApiResponse.error(res, error.message);
        }
    }

    async listPresets(req, res) {
        try {
            const data = eventService.getPresets();
            return ApiResponse.success(res, data);
        } catch (error) {
            return ApiResponse.error(res, error.message);
        }
    }

    async applyPreset(req, res) {
        try {
            const { id } = req.params;
            const { preset_key } = req.body;
            const supabaseClient = req.supabase || supabase;

            const data = await eventService.applyPreset(supabaseClient, id, preset_key);

            // Alerta crítico de aplicação de preset
            websocketService.emit('system:alert', {
                type: 'PRESET_APPLIED',
                severity: 'info',
                message: `Perfil de Evento '${preset_key}' aplicado em: ${data.nome}`,
                details: { event_id: id }
            }, 'system_admin');

            return ApiResponse.success(res, data);
        } catch (error) {
            logger.error('Erro ao aplicar preset:', error.message);
            return ApiResponse.error(res, error.message);
        }
    }

    /**
     * Obter áreas de acesso de um evento (para seleção durante aprovação de pessoa)
     */
    async getAreas(req, res) {
        try {
            const { id } = req.params;
            const supabaseClient = req.supabase || supabase;

            const { data, error } = await supabaseClient
                .from('evento_areas')
                .select('id, nome, descricao')
                .eq('evento_id', id)
                .order('nome', { ascending: true });

            if (error) throw error;

            return ApiResponse.success(res, {
                data: data || [],
                total: (data || []).length
            });
        } catch (error) {
            logger.error('Erro ao obter áreas do evento:', error);
            return ApiResponse.error(res, error.message);
        }
    }
}

module.exports = new EventoController();
