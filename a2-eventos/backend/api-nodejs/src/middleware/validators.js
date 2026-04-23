/**
 * Schemas de validação reutilizáveis com express-validator
 *
 * Uso:
 *   router.post('/', ...validationSchemas.createDevice, controller.create);
 */

const { body, param, query, validationResult } = require('express-validator');

// ============================================
// VALIDAÇÃO DE DISPOSITIVOS
// ============================================
const deviceValidators = {
  create: [
    body('nome')
      .notEmpty().withMessage('Nome é obrigatório')
      .isString().withMessage('Nome deve ser string')
      .trim()
      .isLength({ min: 3, max: 100 }).withMessage('Nome deve ter entre 3 e 100 caracteres'),

    body('marca')
      .notEmpty().withMessage('Marca é obrigatória')
      .isIn(['intelbras', 'hikvision', 'dahua']).withMessage('Marca inválida'),

    body('tipo')
      .notEmpty().withMessage('Tipo é obrigatório')
      .isIn(['terminal_facial', 'camera', 'catraca', 'impressora']).withMessage('Tipo inválido'),

    body('ip_address')
      .notEmpty().withMessage('IP é obrigatório')
      .isIP().withMessage('IP deve ser válido (ex: 192.168.1.100)'),

    body('porta')
      .notEmpty().withMessage('Porta é obrigatória')
      .isInt({ min: 1, max: 65535 }).withMessage('Porta deve estar entre 1 e 65535'),

    body('user_device')
      .notEmpty().withMessage('Usuário do dispositivo é obrigatório')
      .trim()
      .isLength({ min: 1, max: 50 }).withMessage('Usuário deve ter até 50 caracteres'),

    body('password_device')
      .notEmpty().withMessage('Senha do dispositivo é obrigatória')
      .isLength({ min: 1 }).withMessage('Senha não pode estar vazia'),

    body('modo')
      .optional()
      .isIn(['checkin', 'checkout', 'ambos']).withMessage('Modo inválido'),

    body('area_nome')
      .optional()
      .trim()
      .isLength({ max: 100 }).withMessage('Área deve ter até 100 caracteres')
  ],

  testConnection: [
    body('ip_address')
      .notEmpty().withMessage('IP é obrigatório')
      .isIP().withMessage('IP inválido'),

    body('porta')
      .notEmpty().withMessage('Porta é obrigatória')
      .isInt({ min: 1, max: 65535 }).withMessage('Porta inválida')
  ],

  update: [
    param('id')
      .isUUID().withMessage('ID do dispositivo inválido'),

    body('nome')
      .optional()
      .trim()
      .isLength({ min: 3, max: 100 }).withMessage('Nome deve ter entre 3 e 100 caracteres'),

    body('ip_address')
      .optional()
      .isIP().withMessage('IP deve ser válido'),

    body('porta')
      .optional()
      .isInt({ min: 1, max: 65535 }).withMessage('Porta deve estar entre 1 e 65535')
  ]
};

// ============================================
// VALIDAÇÃO DE PESSOAS
// ============================================
const pessoaValidators = {
  create: [
    body('nome_completo')
      .notEmpty().withMessage('Nome é obrigatório')
      .trim()
      .isLength({ min: 3, max: 200 }).withMessage('Nome deve ter entre 3 e 200 caracteres'),

    body('cpf')
      .optional()
      .matches(/^\d{11}$/).withMessage('CPF deve ter 11 dígitos'),

    body('email')
      .optional()
      .isEmail().withMessage('Email inválido')
      .normalizeEmail(),

    body('telefone')
      .optional()
      .matches(/^\d{10,11}$/).withMessage('Telefone deve ter 10 ou 11 dígitos'),

    body('status_acesso')
      .optional()
      .isIn(['autorizado', 'pendente', 'bloqueado']).withMessage('Status de acesso inválido')
  ],

  update: [
    param('id')
      .isUUID().withMessage('ID da pessoa inválido'),

    body('nome_completo')
      .optional()
      .trim()
      .isLength({ min: 3, max: 200 }).withMessage('Nome deve ter entre 3 e 200 caracteres'),

    body('email')
      .optional()
      .isEmail().withMessage('Email inválido')
      .normalizeEmail()
  ]
};

// ============================================
// VALIDAÇÃO DE SMTP
// ============================================
const smtpValidators = {
  verify: [
    body('host')
      .notEmpty().withMessage('Host SMTP é obrigatório')
      .trim(),

    body('port')
      .notEmpty().withMessage('Porta SMTP é obrigatória')
      .isInt({ min: 1, max: 65535 }).withMessage('Porta inválida'),

    body('user')
      .notEmpty().withMessage('Usuário SMTP é obrigatório')
      .trim(),

    body('pass')
      .notEmpty().withMessage('Senha SMTP é obrigatória')
  ]
};

// ============================================
// MIDDLEWARE: Validação e tratamento de erros
// ============================================
const handleValidationErrors = (req, res, next) => {
  const errors = validationResult(req);

  if (!errors.isEmpty()) {
    const errorMessages = errors.array().map(err => ({
      field: err.param,
      message: err.msg,
      value: err.value
    }));

    return res.status(400).json({
      success: false,
      error: 'Erro de validação',
      details: errorMessages
    });
  }

  next();
};

// ============================================
// EXPORTAR
// ============================================
module.exports = {
  // Validadores
  deviceValidators,
  pessoaValidators,
  smtpValidators,

  // Middleware de tratamento de erros
  handleValidationErrors,

  // Função helper para validar
  validate: (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        error: 'Erro de validação',
        details: errors.array()
      });
    }
    next();
  }
};
