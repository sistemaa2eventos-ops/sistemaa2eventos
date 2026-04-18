const { supabase } = require('../../config/supabase');
const cacheService = require('../../services/cacheService');
const logger = require('../../services/logger');

/**
 * Engine responsável por resolver as políticas RBAC (Role-Based Access Control).
 * Busca as permissões atreladas a uma Role no Supabase e faz o cache para performance em memória.
 *
 * v17.5 — Correções aplicadas:
 *   I11: hasPermission admin bypass agora gera log de auditoria
 *   I12: getUserMenu filtra por roleName para evitar vazamento lateral de menu
 *   I13: Paradoxo admin removido de getRolePermissions
 *   I14: .innerJoin() inexistente substituído por sintaxe !inner correta do Supabase JS v2
 */
class PolicyEngine {
    /**
     * Retorna a lista de permissions de uma role para um EVENTO ESPECÍFICO ou Global
     */
    async getRolePermissions(roleName, eventoId = null) {
        if (!roleName) return [];

        const cacheKey = `permissions:${roleName}:${eventoId || 'global'}`;

        let permissions = cacheService.get(cacheKey);
        if (permissions) {
            return permissions;
        }

        try {
            // Master bypass (Sempre acesso total)
            if (roleName === 'master' || roleName === 'admin_master') {
                const rootPerms = [{ recurso: '*', acao: '*', escopo: 'global' }];
                cacheService.set(cacheKey, rootPerms, 60 * 60 * 1000);
                return rootPerms;
            }

            let data, error;

            if (eventoId) {
                // CORREÇÃO 4d: Usar sintaxe !inner correta do Supabase JS v2
                // O método .innerJoin() não existe no client — substituído por !inner no select.
                const result = await supabase
                    .from('sys_event_role_permissions')
                    .select(`
                        sys_permissions!inner ( recurso, acao, escopo ),
                        sys_roles!inner ( nome )
                    `)
                    .eq('evento_id', eventoId)
                    .eq('sys_roles.nome', roleName)
                    .eq('autorizado', true);

                data = result.data;
                error = result.error;

                permissions = data?.map(p => p.sys_permissions).filter(Boolean) || [];
            } else {
                // FALLBACK GLOBAL via sys_role_permissions
                const result = await supabase
                    .from('sys_roles')
                    .select(`
                        sys_role_permissions (
                            sys_permissions ( recurso, acao, escopo )
                        )
                    `)
                    .eq('nome', roleName)
                    .single();

                data = result.data;
                error = result.error;

                permissions = data?.sys_role_permissions?.map(rp => rp.sys_permissions).filter(Boolean) || [];
            }

            if (error) {
                logger.warn(`PolicyEngine: Erro ao carregar permissões para '${roleName}' no evento '${eventoId}': ${error.message}`);
            }

            // CORREÇÃO 4b: Paradoxo admin eliminado.
            // O bypass condicional causava comportamento imprevisível quando admin
            // recebia qualquer permissão explícita (I13). Admin agora depende
            // exclusivamente do seed em sys_role_permissions (garantido na Etapa 2).
            if (roleName === 'admin' && permissions.length === 0) {
                logger.warn('PolicyEngine: admin sem permissões em sys_role_permissions. Verifique o seed de dados.');
            }

            cacheService.set(cacheKey, permissions, 5 * 60 * 1000); // 5 min cache
            return permissions;
        } catch (err) {
            logger.error(`PolicyEngine Exception: ${err.message}`);
            return [];
        }
    }

    /**
     * Retorna a lista de itens de menu permitidos para uma role neste contexto
     */
    async getUserMenu(roleName, eventoId = null) {
        if (!roleName) return [];

        try {
            // Master vê tudo
            if (roleName === 'master' || roleName === 'admin_master') {
                const { data } = await supabase
                    .from('sys_permissions')
                    .select('recurso, acao, nome_humanizado, recurso_frontend, menu_icon, menu_order')
                    .eq('is_menu_item', true)
                    .order('menu_order');
                return data || [];
            }

            if (eventoId) {
                // CORREÇÃO 4a: Filtrar por roleName para evitar vazamento lateral de menu (I12).
                // Antes: qualquer role logado num evento recebia TODOS os menus daquele evento.
                // Agora: apenas os menus autorizados para o roleName específico são retornados.
                const { data, error } = await supabase
                    .from('sys_event_role_permissions')
                    .select(`
                        autorizado,
                        sys_permissions!inner (
                            recurso, acao, nome_humanizado, recurso_frontend, menu_icon, menu_order, is_menu_item
                        ),
                        sys_roles!inner ( nome )
                    `)
                    .eq('evento_id', eventoId)
                    .eq('sys_roles.nome', roleName)
                    .eq('autorizado', true)
                    .eq('sys_permissions.is_menu_item', true);

                if (error) throw error;

                return (data || [])
                    .map(item => item.sys_permissions)
                    .filter(Boolean)
                    .sort((a, b) => a.menu_order - b.menu_order);
            }

            // Fallback global: menu via sys_role_permissions
            const { data, error } = await supabase
                .from('sys_roles')
                .select(`
                    sys_role_permissions (
                        sys_permissions!inner (
                            recurso, acao, nome_humanizado, recurso_frontend, menu_icon, menu_order, is_menu_item
                        )
                    )
                `)
                .eq('nome', roleName)
                .single();

            if (error) throw error;

            return (data?.sys_role_permissions || [])
                .map(rp => rp.sys_permissions)
                .filter(p => p?.is_menu_item)
                .sort((a, b) => a.menu_order - b.menu_order);

        } catch (err) {
            logger.error(`PolicyEngine.getUserMenu Error: ${err.message}`);
            return [];
        }
    }

    /**
     * Resolve se uma Role específica tem uma action sobre um resource em um contexto de evento
     */
    async hasPermission(roleName, recurso, acao, eventoId = null) {
        if (roleName === 'master' || roleName === 'admin_master') return true;

        // CORREÇÃO 4c: Admin bypass com log de auditoria (I11).
        // O bypass é mantido por design (admin tem acesso total), mas agora
        // toda utilização é registrada para fins de auditoria e debugging.
        if (roleName === 'admin') {
            logger.info(`PolicyEngine: admin bypass para ${recurso}:${acao} (evento: ${eventoId || 'global'})`);
            return true;
        }

        const permissions = await this.getRolePermissions(roleName, eventoId);

        return permissions.some(p =>
            (p.recurso === recurso || p.recurso === '*') &&
            (p.acao === acao || p.acao === '*')
        );
    }
}

module.exports = new PolicyEngine();
