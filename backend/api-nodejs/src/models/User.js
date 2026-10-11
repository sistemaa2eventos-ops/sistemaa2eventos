/**
 * Modelo de Usuário do Sistema
 * Define os papéis e permissões (RBAC)
 *
 * - `role` mantém o valor cru ('master' preservado para policy.service e websocketService)
 * - `nivel_acesso` espelha a role já normalizada ('master' -> 'admin_master'),
 *   que é o que as rotas novas do a2 (invite/approve/permissions) validam.
 */
class User {
    constructor(data = {}) {
        this.id = data.id || null;
        this.email = data.email || '';

        const rawRole = data.nivel_acesso || data.role || 'operador';

        this.role = rawRole;
        this.nivel_acesso = rawRole;

        this.evento_id = data.evento_id || null;
        this.nome = data.nome || '';
        this.ativo = data.ativo !== undefined ? data.ativo : true;
        this.status = data.status || 'ativo';
        this.permissions = data.permissions || {};

        // Vínculo flexível de eventos (global vs específico)
        this.vinculo_tipo = data.vinculo_tipo || data.permissions?.vinculo_tipo || (data.evento_id ? 'especifico' : 'global');
        this.eventos_permitidos = data.eventos_permitidos || data.permissions?.eventos_permitidos || (data.evento_id ? [data.evento_id] : []);
        this.eventos_permissoes = data.eventos_permissoes || data.permissions?.eventos_permissoes || {};
    }

    /**
     * Papéis disponíveis no sistema
     */
    static get ROLES() {
        return {
            MASTER: 'master',              // SOBERANIA TOTAL (Mestre Global Multieventos)
            ADMIN_MASTER: 'admin_master',  // Alias normalizado da soberania (a2)
            ADMIN: 'admin',
            SUPERVISOR: 'supervisor',
            OPERADOR: 'operador'
        };
    }

    /**
     * Acesso total (Master/Admin)
     */
    isAdminMaster() {
        return ['master', 'admin_master', 'admin'].includes(this.nivel_acesso) ||
            ['master', 'admin_master', 'admin'].includes(this.role);
    }

    /**
     * Verifica se o usuário é administrador ou superior (Master)
     */
    isAdmin() {
        return [User.ROLES.MASTER, User.ROLES.ADMIN_MASTER, User.ROLES.ADMIN].includes(this.role) ||
            this.isAdminMaster();
    }

    /**
     * Privilégios de gestão (Admin/Master/Supervisor)
     */
    isPrivileged() {
        return ['master', 'admin_master', 'admin', 'supervisor'].includes(this.nivel_acesso) ||
            ['master', 'admin_master', 'admin', 'supervisor'].includes(this.role);
    }

    /**
     * Verifica se o usuário é supervisor ou superior
     */
    isSupervisor() {
        return [User.ROLES.MASTER, User.ROLES.ADMIN_MASTER, User.ROLES.ADMIN, User.ROLES.SUPERVISOR].includes(this.role) ||
            this.isPrivileged();
    }

    /**
     * Verifica se tem permissão mínima para operar
     */
    isOperator() {
        return [User.ROLES.MASTER, User.ROLES.ADMIN_MASTER, User.ROLES.ADMIN, User.ROLES.SUPERVISOR, User.ROLES.OPERADOR].includes(this.role);
    }

    /**
     * Verifica se o operador tem autorização para atuar no evento
     */
    isAllowedEvent(eventoId) {
        if (this.isAdminMaster()) return true;
        if (this.vinculo_tipo === 'global') return true;
        if (!eventoId) return true;
        return Array.isArray(this.eventos_permitidos) && this.eventos_permitidos.includes(eventoId);
    }

    /**
     * Obtém as permissões efetivas do usuário para um evento específico
     */
    getEffectivePermissions(eventoId = null) {
        if (this.isAdminMaster()) {
            return {
                dashboard: true,
                empresas: true,
                pessoas: true,
                auditoria_documentos: true,
                relatorios: true,
                veiculos: true,
                checkin: true,
                checkout: true,
                fiscalizacao: true,
                monitoramento: true,
                usuarios: true
            };
        }

        const targetEventId = eventoId || this.evento_id;
        if (targetEventId && this.eventos_permissoes?.[targetEventId]) {
            return this.eventos_permissoes[targetEventId];
        }

        return this.permissions || {};
    }

    /**
     * Verificação de permissão granular por módulo (JSONB `permissions` do a2)
     */
    hasPermission(modulo, eventoId = null) {
        if (this.isAdminMaster()) return true;
        const perms = this.getEffectivePermissions(eventoId);
        return perms?.[modulo] === true;
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

    /**
     * Verificar se está ativo (alias do a2)
     */
    isAtivo() {
        return this.ativo !== false && (this.status ? this.status !== 'inativo' : true);
    }

    toJSON() {
        return {
            id: this.id,
            email: this.email,
            role: this.role,
            nivel_acesso: this.nivel_acesso,
            evento_id: this.evento_id,
            nome: this.nome,
            status: this.status,
            vinculo_tipo: this.vinculo_tipo,
            eventos_permitidos: this.eventos_permitidos,
            eventos_permissoes: this.eventos_permissoes,
            permissions: this.permissions,
            ativo: this.ativo
        };
    }

    static fromSupabase(user, profile = {}) {
        if (!user) return null;

        // nivel_acesso vem do perfil (admin_master | operador)
        const roleFinal = profile.nivel_acesso || user.user_metadata?.nivel_acesso || 'operador';

        const rawPermissions = profile.permissions || user.user_metadata?.permissions || {};
        const vinculoTipo = profile.vinculo_tipo || rawPermissions.vinculo_tipo || (profile.evento_id ? 'especifico' : 'global');
        const eventosPermitidos = profile.eventos_permitidos || rawPermissions.eventos_permitidos || (profile.evento_id ? [profile.evento_id] : []);
        const eventosPermissoes = profile.eventos_permissoes || rawPermissions.eventos_permissoes || {};

        return new User({
            id: user.id,
            email: user.email,
            role: roleFinal,
            evento_id: profile.evento_id || user.user_metadata?.evento_id,
            nome: profile.nome_completo || user.user_metadata?.nome_completo || user.email.split('@')[0],
            ativo: profile.ativo !== undefined ? profile.ativo : true,
            status: profile.status || 'ativo',
            vinculo_tipo: vinculoTipo,
            eventos_permitidos: eventosPermitidos,
            eventos_permissoes: eventosPermissoes,
            permissions: rawPermissions
        });
    }
}

module.exports = User;
