/**
 * Modelo de Usuário do Sistema
 * Define os papéis e permissões (RBAC)
 */
class User {
    constructor(data = {}) {
        this.id = data.id || null;
        this.email = data.email || '';
        this.role = data.role || 'operador'; // default role
        this.evento_id = data.evento_id || null;
        this.nome = data.nome || '';
        this.ativo = data.ativo !== undefined ? data.ativo : true;
    }

    /**
     * Papéis disponíveis no sistema
     */
    static get ROLES() {
        return {
            MASTER: 'master',         // SOBERANIA TOTAL (Mestre Global Multieventos)
            ADMIN: 'admin',           // Acesso total ao sistema (Full Nexus Control)
            SUPERVISOR: 'supervisor', // Quase total, exceto criar eventos/configurações globais
            OPERADOR: 'operador'      // Operação de campo (Empresas, Colaboradores, Check-in, Monitoramento)
        };
    }

    /**
     * Verifica se o usuário é administrador ou superior (Master)
     */
    isAdmin() {
        return [User.ROLES.MASTER, User.ROLES.ADMIN].includes(this.role);
    }

    /**
     * Verifica se o usuário é supervisor ou superior
     */
    isSupervisor() {
        return [User.ROLES.MASTER, User.ROLES.ADMIN, User.ROLES.SUPERVISOR].includes(this.role);
    }

    /**
     * Verifica se tem permissão mínima para operar
     */
    isOperator() {
        return [User.ROLES.MASTER, User.ROLES.ADMIN, User.ROLES.SUPERVISOR, User.ROLES.OPERADOR].includes(this.role);
    }

    /**
     * Verifica se tem permissão para uma ação baseada no cargo
     */
    can(permission) {
        const permissions = {
            'create_event': this.isAdmin(),
            'delete_event': this.isAdmin(),
            'manage_settings': this.isAdmin(),
            'manage_users': this.isAdmin(),
            'manage_companies': this.isOperator(),
            'manage_employees': this.isOperator(),
            'view_reports': this.isSupervisor(),
            'perform_checkin': this.isOperator(),
            'realtime_monitoring': this.isOperator(),
            'edit_own_profile': true
        };
        return permissions[permission] || false;
    }

    toJSON() {
        return {
            id: this.id,
            email: this.email,
            role: this.role,
            evento_id: this.evento_id,
            nome: this.nome,
            ativo: this.ativo
        };
    }

    static fromSupabase(user, profile = {}) {
        if (!user) return null;
        return new User({
            id: user.id,
            email: user.email,
            role: profile.nivel_acesso || user.user_metadata?.nivel_acesso || 'operador',
            evento_id: profile.evento_id || user.user_metadata?.evento_id,
            nome: profile.nome_completo || user.user_metadata?.nome_completo || user.email.split('@')[0],
            ativo: profile.ativo !== undefined ? profile.ativo : true
        });
    }
}

module.exports = User;
