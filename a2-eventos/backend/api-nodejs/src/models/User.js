/**
 * Modelo de Usuário do Sistema (Refatorado)
 * Sistema simplificado: admin_master e operador
 */
class User {
    constructor(data = {}) {
        this.id = data.id || null;
        this.email = data.email || '';
        this.role = data.role || 'operador';
        this.nivel_acesso = data.nivel_acesso || 'operador';
        this.evento_id = data.evento_id || null;
        this.nome = data.nome || '';
        this.status = data.status || 'pendente';
        this.permissions = data.permissions || {};
    }

    /**
     * Papéis disponíveis no sistema (novo)
     */
    static get ROLES() {
        return {
            ADMIN_MASTER: 'admin_master',  // Acesso total
            OPERADOR: 'operador'        // Acesso por permissões
        };
    }

    /**
     * Verificar se é admin_master
     */
    isAdminMaster() {
        return this.nivel_acesso === 'admin_master';
    }

    /**
     * Verificar se tem permissão para módulo
     */
    hasPermission(modulo) {
        // admin_master tem todas as permissões
        if (this.nivel_acesso === 'admin_master') return true;
        
        //operador consulta o JSONB
        return this.permissions?.[modulo] === true;
    }

    /**
     * Verificar se está ativo
     */
    isAtivo() {
        return this.status === 'ativo';
    }

    /**
     * Criar User a partir do Supabase
     */
    static fromSupabase(supabaseUser, profile) {
        return new User({
            id: supabaseUser.id,
            email: supabaseUser.email,
            nivel_acesso: profile?.nivel_acesso || 'operador',
            evento_id: profile?.evento_id,
            nome: profile?.nome_completo || supabaseUser.email,
            status: profile?.status || 'pendente',
            permissions: profile?.permissions
        });
    }
}

module.exports = User;