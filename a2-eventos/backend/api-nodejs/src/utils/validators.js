/**
 * Validadores úteis para dados de usuário
 */

/**
 * Validar formato de email
 */
function validateEmail(email) {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
}

/**
 * Validar CPF (formato e dígitos verificadores)
 */
function validateCPF(cpf) {
    // Remove caracteres especiais
    const cleanCpf = cpf.replace(/[^\d]/g, '');

    // Deve ter 11 dígitos
    if (cleanCpf.length !== 11) return false;

    // Rejeitar CPFs conhecidamente inválidos (todos iguais)
    if (/^(\d)\1{10}$/.test(cleanCpf)) return false;

    // Validar primeiro dígito verificador
    let sum = 0;
    for (let i = 0; i < 9; i++) {
        sum += parseInt(cleanCpf[i]) * (10 - i);
    }
    let remainder = sum % 11;
    let firstDigit = remainder < 2 ? 0 : 11 - remainder;

    if (parseInt(cleanCpf[9]) !== firstDigit) return false;

    // Validar segundo dígito verificador
    sum = 0;
    for (let i = 0; i < 10; i++) {
        sum += parseInt(cleanCpf[i]) * (11 - i);
    }
    remainder = sum % 11;
    let secondDigit = remainder < 2 ? 0 : 11 - remainder;

    if (parseInt(cleanCpf[10]) !== secondDigit) return false;

    return true;
}

/**
 * Validar formato de telefone brasileiro
 */
function validatePhone(phone) {
    // Remove caracteres especiais
    const cleanPhone = phone.replace(/[^\d]/g, '');

    // Deve ter 10 ou 11 dígitos
    if (cleanPhone.length !== 10 && cleanPhone.length !== 11) return false;

    // Se tiver 11, primeiro dígito deve ser 9 (celular)
    if (cleanPhone.length === 11 && cleanPhone[2] !== '9') return false;

    // DDD deve ser de 11 a 99
    const ddd = parseInt(cleanPhone.substring(0, 2));
    if (ddd < 11 || ddd > 99) return false;

    return true;
}

/**
 * Validar força de senha
 */
function validatePasswordStrength(password) {
    if (password.length < 8) {
        return { valid: false, reason: 'Mínimo 8 caracteres' };
    }
    if (!/[A-Z]/.test(password)) {
        return { valid: false, reason: 'Deve conter letra maiúscula' };
    }
    if (!/[a-z]/.test(password)) {
        return { valid: false, reason: 'Deve conter letra minúscula' };
    }
    if (!/\d/.test(password)) {
        return { valid: false, reason: 'Deve conter número' };
    }
    if (!/[!@#$%^&*]/.test(password)) {
        return { valid: false, reason: 'Deve conter caractere especial (!@#$%^&*)' };
    }
    return { valid: true };
}

/**
 * Limpar e formatar CPF
 */
function formatCPF(cpf) {
    const clean = cpf.replace(/[^\d]/g, '');
    return clean.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4');
}

/**
 * Limpar e formatar telefone
 */
function formatPhone(phone) {
    const clean = phone.replace(/[^\d]/g, '');
    if (clean.length === 11) {
        return clean.replace(/(\d{2})(\d{5})(\d{4})/, '($1) $2-$3');
    }
    return clean.replace(/(\d{2})(\d{4})(\d{4})/, '($1) $2-$3');
}

/**
 * Limpar e normalizar email
 */
function normalizeEmail(email) {
    return email.trim().toLowerCase();
}

/**
 * Validar permissões válidas
 */
function validatePermissions(permissions) {
    if (!permissions || typeof permissions !== 'object') {
        return { valid: false, reason: 'Permissões deve ser um objeto' };
    }

    const validKeys = [
        'dashboard',
        'empresas',
        'pessoas',
        'auditoria_documentos',
        'monitoramento',
        'relatorios',
        'checkin',
        'checkout',
        'dispositivos',
        'usuarios'
    ];

    const invalidKeys = Object.keys(permissions).filter(key => !validKeys.includes(key));

    if (invalidKeys.length > 0) {
        return { valid: false, reason: `Permissões inválidas: ${invalidKeys.join(', ')}` };
    }

    // Dashboard deve ser sempre true
    if (permissions.dashboard === false) {
        return { valid: false, reason: 'Dashboard deve ser sempre acessível' };
    }

    return { valid: true };
}

/**
 * Validar nível de acesso
 * SIMPLIFICADO: Apenas admin_master e operador
 */
function validateAccessLevel(nivel) {
    const validLevels = ['admin_master', 'operador'];
    return validLevels.includes(nivel);
}

/**
 * Obter permissões padrão por nível de acesso
 *
 * IMPORTANTE: Novo modelo de permissões:
 * - admin_master: acesso irrestrito (gerenciado centralmente)
 * - operador: sempre começa com tudo desligado (dashboard = true apenas)
 *   Admin master ativa permissões conforme necessário
 */
function getDefaultPermissions(nivel_acesso) {
    if (nivel_acesso === 'admin_master') {
        return {
            dashboard: true,
            empresas: true,
            pessoas: true,
            auditoria_documentos: true,
            monitoramento: true,
            relatorios: true,
            checkin: true,
            checkout: true,
            dispositivos: true,
            usuarios: true
        };
    }

    if (nivel_acesso === 'operador') {
        // PADRÃO: Tudo desligado exceto dashboard
        // Admin master ativa conforme precisa
        return {
            dashboard: true,
            empresas: false,
            pessoas: false,
            auditoria_documentos: false,
            monitoramento: false,
            relatorios: false,
            checkin: false,
            checkout: false,
            dispositivos: false,
            usuarios: false
        };
    }

    throw new Error(`Nível de acesso inválido: ${nivel_acesso}. Valores válidos: admin_master, operador`);
}

module.exports = {
    validateEmail,
    validateCPF,        // ← Usado para pessoas (participantes)
    validatePhone,
    validatePasswordStrength,
    validatePermissions,
    validateAccessLevel,
    formatCPF,         // ← Usado para pessoas (participantes)
    formatPhone,
    normalizeEmail,
    getDefaultPermissions
};
