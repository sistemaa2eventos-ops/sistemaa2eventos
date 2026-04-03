const { supabase } = require('../../config/supabase');
const cacheService = require('../../services/cacheService');
const logger = require('../../services/logger');

/**
 * Engine responsável por resolver as políticas RBAC (Role-Based Access Control).
 * Busca as permissões atreladas a uma Role no Supabase e faz o cache para performance em memória.
 */
class PolicyEngine {
    /**
     * Retorna a lista completa de permissions de uma role para injeção no login/Frontend
     */
    async getRolePermissions(roleName) {
        if (!roleName) return [];

        const cacheKey = `permissions:${roleName}`;

        let permissions = cacheService.get(cacheKey);
        if (permissions) {
            return permissions;
        }

        try {
            // Master fallback (Has all generic root powers visually)
            if (roleName === 'master') {
                const rootPerms = [{ recurso: '*', acao: '*', escopo: 'global' }];
                cacheService.set(cacheKey, rootPerms, 60 * 60 * 1000); // 1hr
                return rootPerms;
            }

            // Realiza a junção para buscar sys_permissions de um sys_role
            const { data, error } = await supabase
                .from('sys_roles')
                .select(`
                    id,
                    nome,
                    sys_role_permissions (
                        sys_permissions (
                            recurso, acao, escopo
                        )
                    )
                `)
                .eq('nome', roleName)
                .single();

            if (error || !data) {
                logger.warn(`PolicyEngine: Não foi possível carregar as permissões do perfil '${roleName}'`);
                return [];
            }

            // Mapeando a resposta aninhada do Supabase para um array simples de objetos de policy
            permissions = data.sys_role_permissions
                .map(rp => rp.sys_permissions)
                .filter(Boolean);

            // Armazena no cache por 10 minutos
            cacheService.set(cacheKey, permissions, 10 * 60 * 1000);
            return permissions;
        } catch (error) {
            logger.error(`PolicyEngine Exception: ${error.message}`);
            return [];
        }
    }

    /**
     * Resolve se uma Role específica tem uma action sobre um resource
     */
    async hasPermission(roleName, recurso, acao) {
        if (roleName === 'master') return true;
        if (roleName === 'admin') return true; // Mantendo admin bypass temporário até todas as policies estarem cadastradas na V1

        const permissions = await this.getRolePermissions(roleName);

        return permissions.some(p =>
            (p.recurso === recurso || p.recurso === '*') &&
            (p.acao === acao || p.acao === '*')
        );
    }
}

module.exports = new PolicyEngine();
