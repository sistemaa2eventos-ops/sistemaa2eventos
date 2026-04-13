const { supabase } = require('../../config/supabase');
const apiResponse = require('../../utils/apiResponse');

/**
 * Controller para gerenciar a Matríz de Permissões (RBAC) por Evento
 */
class RbacController {
    /**
     * Retorna a matriz completa de perfis vs recursos para o evento atual
     */
    async getMatrix(req, res) {
        try {
            const { id: eventoId } = req.event;

            // 1. Buscar todos os roles (exceto master que é bypass)
            const { data: roles } = await supabase
                .from('sys_roles')
                .select('id, nome, descricao')
                .neq('nome', 'master')
                .order('nome');

            // 2. Buscar todas as permissões/recursos, incluindo metadados de menu
            const { data: permissions } = await supabase
                .from('sys_permissions')
                .select('id, recurso, acao, nome_humanizado, is_menu_item, menu_order, recurso_frontend, menu_icon')
                .order('recurso');

            // 3. Buscar as atribuições atuais para este evento
            const { data: matrix } = await supabase
                .from('sys_event_role_permissions')
                .select('role_id, permission_id, autorizado')
                .eq('evento_id', eventoId);

            return apiResponse.success(res, {
                roles,
                permissions,
                matrix: matrix || []
            });
        } catch (error) {
            console.error('❌ Erro no RBAC:', error);
            return apiResponse.error(res, 'Erro ao carregar matriz: ' + error.message);
        }
    }

    /**
     * Salva/Atualiza o estado de uma permissão na matriz
     */
    async updateMatrix(req, res) {
        try {
            const { id: eventoId } = req.event;
            const { role_id, permission_id, autorizado } = req.body;

            if (!role_id || !permission_id) {
                return apiResponse.error(res, 'ID de perfil e permissão são obrigatórios');
            }

            const { data, error } = await supabase
                .from('sys_event_role_permissions')
                .upsert({
                    evento_id: eventoId,
                    role_id,
                    permission_id,
                    autorizado: !!autorizado,
                    updated_at: new Date()
                }, { onConflict: 'evento_id,role_id,permission_id' })
                .select();

            if (error) throw error;

            return apiResponse.success(res, 'Permissão atualizada com sucesso', data[0]);
        } catch (error) {
            return apiResponse.error(res, 'Erro ao atualizar permissão: ' + error.message);
        }
    }
}

module.exports = new RbacController();
