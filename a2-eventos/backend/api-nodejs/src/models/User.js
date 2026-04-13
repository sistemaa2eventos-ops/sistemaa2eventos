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
        // v17.5 — Expandido para cobrir todos os 15 roles do sistema
        return {
            MASTER: 'master',                   // SOBERANIA TOTAL
            ADMIN: 'admin',                     // Acesso total ao sistema
            SUPERVISOR: 'supervisor',           // Gestão operacional completa
            OP_ANALISTA: 'op_analista',         // Operador com visão analítica
            ANALISTA: 'analista',               // Relatórios e financeiro
            OP_MONITORAMENTO: 'op_monitoramento', // Monitoramento em tempo real
            OP_ATENDIMENTO: 'op_atendimento',   // Atendimento e cadastro de campo
            OPERADOR: 'operador',               // Operação básica de campo
            PORTARIA: 'portaria',               // Controle de acesso (check-in/saída)
            TECNICO: 'tecnico',                 // Operação de hardware e dispositivos
            MONITOR: 'monitor',                 // Visualização de monitor
            ESTACIONAMENTO: 'estacionamento',   // Frota e LPR
            CLIENTE_TECNICO: 'cliente_tecnico', // Técnico do cliente (acesso restrito)
            EMPRESA: 'empresa',                 // Portal da empresa expositora
            CLIENTE: 'cliente'                  // Portal do participante
        };
    }

    /**
     * Verifica se o usuário é administrador ou superior (Master)
     * @deprecated I14 — Use PolicyEngine.hasPermission() no lugar.
     * Este método conhece apenas roles estáticos e não consulta a matriz RBAC dinâmica.
     * Mantido para compatibilidade retroativa. NÃO utilizar em novos middlewares.
     */
    isAdmin() {
        try { require('../services/logger').warn('DEPRECATED: User.isAdmin() — use PolicyEngine.hasPermission()'); } catch (e) {}
        return [User.ROLES.MASTER, User.ROLES.ADMIN].includes(this.role);
    }

    /**
     * Verifica se o usuário é supervisor ou superior
     * @deprecated I14 — Use PolicyEngine.hasPermission() no lugar.
     * Mantido para compatibilidade retroativa. NÃO utilizar em novos middlewares.
     */
    isSupervisor() {
        try { require('../services/logger').warn('DEPRECATED: User.isSupervisor() — use PolicyEngine.hasPermission()'); } catch (e) {}
        return [User.ROLES.MASTER, User.ROLES.ADMIN, User.ROLES.SUPERVISOR].includes(this.role);
    }

    /**
     * Verifica se tem permissão mínima para operar
     * @deprecated I14 — Use PolicyEngine.hasPermission() no lugar.
     * Cobre apenas 4 dos 15 roles. Mantido para compatibilidade retroativa.
     */
    isOperator() {
        try { require('../services/logger').warn('DEPRECATED: User.isOperator() — use PolicyEngine.hasPermission()'); } catch (e) {}
        return [User.ROLES.MASTER, User.ROLES.ADMIN, User.ROLES.SUPERVISOR, User.ROLES.OPERADOR].includes(this.role);
    }

    /**
     * Verifica se tem permissão para uma ação baseada no cargo (mini-RBAC estático)
     * @deprecated I14 — Use PolicyEngine.hasPermission(role, recurso, acao, eventoId) no lugar.
     * Este método usa uma tabela estática com apenas 10 permissões hardcoded.
     * O PolicyEngine consulta a matriz completa do banco de dados em tempo real.
     * Mantido para compatibilidade retroativa. NÃO utilizar em novos middlewares.
     */
    can(permission) {
        try { require('../services/logger').warn(`DEPRECATED: User.can('${permission}') — use PolicyEngine.hasPermission()`); } catch (e) {}
        const permissions = {
            'create_event': [User.ROLES.MASTER, User.ROLES.ADMIN].includes(this.role),
            'delete_event': [User.ROLES.MASTER, User.ROLES.ADMIN].includes(this.role),
            'manage_settings': [User.ROLES.MASTER, User.ROLES.ADMIN].includes(this.role),
            'manage_users': [User.ROLES.MASTER, User.ROLES.ADMIN].includes(this.role),
            'manage_companies': [User.ROLES.MASTER, User.ROLES.ADMIN, User.ROLES.SUPERVISOR, User.ROLES.OPERADOR].includes(this.role),
            'manage_employees': [User.ROLES.MASTER, User.ROLES.ADMIN, User.ROLES.SUPERVISOR, User.ROLES.OPERADOR].includes(this.role),
            'view_reports': [User.ROLES.MASTER, User.ROLES.ADMIN, User.ROLES.SUPERVISOR].includes(this.role),
            'perform_checkin': [User.ROLES.MASTER, User.ROLES.ADMIN, User.ROLES.SUPERVISOR, User.ROLES.OPERADOR].includes(this.role),
            'realtime_monitoring': [User.ROLES.MASTER, User.ROLES.ADMIN, User.ROLES.SUPERVISOR, User.ROLES.OPERADOR].includes(this.role),
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

        const _s = (v) => (v && v !== 'undefined' && v !== 'null') ? v : null;
        let roleFinal = profile.nivel_acesso || user.app_metadata?.role || user.user_metadata?.nivel_acesso || 'operador';

        return new User({
            id: _s(user.id),
            email: user.email,
            role: roleFinal,
            evento_id: _s(profile.evento_id || user.user_metadata?.evento_id),
            nome: profile.nome_completo || user.user_metadata?.nome_completo || user.email.split('@')[0],
            ativo: profile.ativo !== undefined ? profile.ativo : true
        });
    }
}

module.exports = User;
