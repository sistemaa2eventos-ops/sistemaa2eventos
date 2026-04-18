/**
 * Modelo de Usuário do Sistema (Refatorado)
 * Sistema simplificado: admin_master e operador
 */
class User {
    constructor(data = {}) {
        this.id = data.id || null;
        this.email = data.email || '';
        this.nivel_acesso = data.nivel_acesso || data.role || 'operador';
        this.role = this.nivel_acesso; // alias
        
        // --- 🛡️ Role Harmonization (Nexus Architecture) ---
        // Normalização interna para garantir que o modelo fale a mesma língua que os middlewares
        if (this.nivel_acesso === 'master') this.nivel_acesso = 'admin_master';
        this.role = this.nivel_acesso;
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
            ADMIN_MASTER: 'admin_master',  // Acesso total (Super Admin)
            ADMIN: 'admin',                // Admin de Evento/SaaS
            SUPERVISOR: 'supervisor',
            OPERADOR: 'operador'
        };
    }

    isAdminMaster() {
        return this.nivel_acesso === 'admin_master' || this.nivel_acesso === 'admin';
    }

    /**
     * Verifica se o usuário tem privilégios de gestão (Admin/Master/Supervisor)
     */
    isPrivileged() {
        return ['admin_master', 'admin', 'supervisor'].includes(this.nivel_acesso);
    }

    /**
     * Verificar se tem permissão para módulo
     */
    hasPermission(modulo) {
        // admin_master e admin têm todas as permissões (bypass RLS/ACL no backend)
        if (this.nivel_acesso === 'admin_master' || this.nivel_acesso === 'admin') return true;
        
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