/**
 * Global Error Handler Middleware
 * Centraliza tratamento de erros em toda a aplicação
 *
 * Uso: Adicionar no final de app.js, após todas as rotas:
 *   app.use(errorHandler);
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
 * Global error handler middleware
 * @param {Error} err - Error object
 * @param {Object} req - Express request
 * @param {Object} res - Express response
 * @param {Function} next - Next middleware
 */
function errorHandler(err, req, res, next) {
  // Se resposta já foi enviada, passer para Express
  if (res.headersSent) {
    return next(err);
  }

  // Status code padrão
  let statusCode = err.statusCode || err.status || 500;
  let message = err.message || 'Erro interno do servidor';

  // Log estruturado
  const logData = {
    error_type: err.name || 'Unknown',
    status_code: statusCode,
    message: message,
    path: req.path,
    method: req.method,
    user_id: req.user?.id,
    timestamp: new Date().toISOString()
  };

  // Diferentes níveis de log por status code
  if (statusCode >= 500) {
    logger.error('❌ Server Error:', logData);
    // Log stack trace apenas em desenvolvimento
    if (process.env.NODE_ENV === 'development') {
      logger.debug('Stack trace:', { stack: err.stack });
    }
  } else if (statusCode >= 400) {
    logger.warn('⚠️ Client Error:', logData);
  } else {
    logger.info('ℹ️ Other:', logData);
  }

  // Nunca retornar stack trace em produção
  const response = {
    success: false,
    error: message,
    statusCode: statusCode,
    timestamp: new Date().toISOString()
  };

  // Detalhes adicionais apenas em desenvolvimento
  if (process.env.NODE_ENV === 'development') {
    response.details = err.details || err.hint;
    response.stack = err.stack;
  }

  // Erros específicos de validação Supabase
  if (err.message?.includes('duplicate key')) {
    response.error = 'Valor duplicado não permitido';
    statusCode = 409;
  } else if (err.message?.includes('foreign key')) {
    response.error = 'Referência inválida para registro relacionado';
    statusCode = 400;
  } else if (err.message?.includes('permission denied')) {
    response.error = 'Você não tem permissão para esta ação';
    statusCode = 403;
  }

  // Resposta com status correto
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

module.exports = {
  errorHandler,
  asyncHandler,
  AppError,
  ValidationError,
  NotFoundError,
  UnauthorizedError,
  ForbiddenError
};
