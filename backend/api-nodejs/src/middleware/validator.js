const { body, validationResult } = require('express-validator');

/**
 * Função centralizada para lidar com erros de validação
 */
const validate = (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        const lista = errors.array();
        // `error` é o campo que o painel exibe; `errors` mantém a lista completa
        return res.status(400).json({ success: false, error: lista[0].msg, errors: lista });
    }
    next();
};

/**
 * Validador de CPF (Algoritmo de Checksum)
 */
const isValidCPF = (cpf) => {
    if (typeof cpf !== 'string') return false;
    cpf = cpf.replace(/[^\d]+/g, '');
    if (cpf.length !== 11 || !!cpf.match(/(\d)\1{10}/)) return false;
    cpf = cpf.split('').map(el => +el);
    const rest = (count) => (cpf.slice(0, count - 12).reduce((soma, el, index) => (soma + el * (count - index)), 0) * 10) % 11 % 10;
    return rest(10) === cpf[9] && rest(11) === cpf[10];
};

/**
 * Regras de Login
 */
const validateLogin = [
    body('email').isEmail().withMessage('Email inválido').normalizeEmail(),
    body('password').notEmpty().withMessage('Senha é obrigatória'),
    validate
];

/**
 * Regras de Registro de Usuário (Admin/Supervisor)
 */
const validateRegister = [
    body('email').isEmail().withMessage('Email inválido').normalizeEmail(),
    body('password')
        .isLength({ min: 8 }).withMessage('Senha deve ter no mínimo 8 caracteres')
        .matches(/[A-Z]/).withMessage('Senha deve conter pelo menos 1 letra maiúscula')
        .matches(/[0-9]/).withMessage('Senha deve conter pelo menos 1 número'),
    body('nome_completo').trim().notEmpty().withMessage('Nome é obrigatório').escape(),
    validate
];

/**
 * Regras de Registro de Funcionário
 */
const validatePessoa = [
    // O painel envia nome_completo; `nome` fica como alternativa (o service aceita os dois).
    // Sem .escape(): ele reescreveria o valor gravado (D'Ávila virava D&#x27;Ávila)
    body('nome_completo').custom((value, { req }) => {
        const nome = value || req.body.nome;
        if (typeof nome !== 'string' || !nome.trim()) throw new Error('Nome completo é obrigatório');
        return true;
    }),
    // CPF é opcional quando há passaporte (estrangeiro); se vier preenchido, tem que ser válido
    body('cpf').custom((value, { req }) => {
        if (value) {
            if (!isValidCPF(value)) throw new Error('CPF inválido');
        } else if (!req.body.passaporte || !String(req.body.passaporte).trim()) {
            throw new Error('Informe CPF ou passaporte');
        }
        return true;
    }),
    body('empresa_id').optional({ nullable: true }).isUUID().withMessage('ID de empresa inválido'), // FIX I-02: visitantes podem não ter empresa
    validate
];

/**
 * Sanatização Geral de Input
 */
const sanitizeBody = [
    body('*').trim().escape(),
    validate
];

module.exports = {
    validateLogin,
    validateRegister,
    validatePessoa,
    sanitizeBody,
    isValidCPF
};