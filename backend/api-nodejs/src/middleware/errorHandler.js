/**
 * Global Error Handler Middleware
 * Centraliza o tratamento de erros em toda a aplicacao.
 *
 * Export duplo: a funcao middleware (padrao) e os helpers nomeados
 * ({ errorHandler, asyncHandler, AppError, ... }).
 */

const logger = require('../services/logger');

/**
 * Classes customizadas de erro
 */
class AppError extends Error {
  constructor(message, statusCode = 500) {
    super(message);
    this.statusCode = statusCode;
    this.timestamp = new Date().toISOString();
  }
}

class ValidationError extends AppError {
  constructor(message) {
    super(message, 400);
    this.name = 'ValidationError';
  }
}

class NotFoundError extends AppError {
  constructor(resource = 'Recurso') {
    super(`${resource} não encontrado`, 404);
    this.name = 'NotFoundError';
  }
}

class UnauthorizedError extends AppError {
  constructor(message = 'Não autorizado') {
    super(message, 401);
    this.name = 'UnauthorizedError';
  }
}

class ForbiddenError extends AppError {
  constructor(message = 'Acesso proibido') {
    super(message, 403);
    this.name = 'ForbiddenError';
  }
}

/**
 * Global Error Handler Middleware
 * Centraliza o tratamento de erros em toda a aplicacao.
 *
 * Export duplo: a funcao middleware (padrao) e os helpers nomeados
 * ({ errorHandler, asyncHandler, AppError, ... }).
 */
function errorHandler(err, req, res, next) {
  if (res.headersSent) {
    return next(err);
  }

  let statusCode = err.statusCode || err.status || 500;
  let message = err.message || 'Erro interno do servidor';
  let isOperational = err.isOperational === true;

  // Log estruturado (formato winston: mensagem primeiro, metadados depois)
  const logData = {
    error_type: err.name || 'Unknown',
    status_code: statusCode,
    path: req.path,
    method: req.method,
    user_id: req.user?.id
  };

  if (statusCode >= 500) {
    logger.error(`Server Error: ${message}`, { ...logData, stack: err.stack });
  } else if (statusCode >= 400) {
    logger.warn(`Client Error: ${message}`, logData);
  } else {
    logger.info(`Other Error: ${message}`, logData);
  }

  // Erros específicos de validação Supabase (mensagem amigável e segura)
  if (message.includes('duplicate key')) {
    message = 'Valor duplicado não permitido';
    statusCode = 409;
    isOperational = true;
  } else if (message.includes('foreign key')) {
    message = 'Referência inválida para registro relacionado';
    statusCode = 400;
    isOperational = true;
  } else if (message.includes('permission denied')) {
    message = 'Você não tem permissão para esta ação';
    statusCode = 403;
    isOperational = true;
  }

  let code = err.code || 'INTERNAL_ERROR';

  // PRODUÇÃO (raiz): nunca expor mensagem de erro não-operacional
  if (process.env.NODE_ENV !== 'development' && !isOperational) {
    message = 'Algo deu errado no servidor. Tente novamente mais tarde.';
    code = 'INTERNAL_ERROR';
  }

  const response = {
    success: false,
    error: message,
    code,
    statusCode,
    timestamp: new Date().toISOString()
  };

  // Detalhes adicionais apenas em desenvolvimento
  if (process.env.NODE_ENV === 'development') {
    response.details = err.details || err.hint;
    response.stack = err.stack;
  }

  res.status(statusCode).json(response);
}

/**
 * Wrapper para converter funções assíncronas em tratamento de erro
 * @param {Function} fn - Função assíncrona do controller
 */
function asyncHandler(fn) {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

module.exports = errorHandler;
module.exports.errorHandler = errorHandler;
module.exports.asyncHandler = asyncHandler;
module.exports.AppError = AppError;
module.exports.ValidationError = ValidationError;
module.exports.NotFoundError = NotFoundError;
module.exports.UnauthorizedError = UnauthorizedError;
module.exports.ForbiddenError = ForbiddenError;
