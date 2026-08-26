const logger = require('../services/logger');

const errorHandler = (err, req, res, next) => {
    err.statusCode = err.statusCode || 500;
    err.code = err.code || 'INTERNAL_ERROR';

    const response = {
        success: false,
        error: {
            code: err.code,
            message: err.message
        }
    };

    if (process.env.NODE_ENV === 'development') {
        response.error.stack = err.stack;
        logger.error(`💥 Error in ${req.method} ${req.path}: ${err.message}`, { stack: err.stack });
    } else {
        // Em produção, se não for um erro operacional esperado, escondemos a mensagem detalhada
        if (!err.isOperational) {
            response.error.code = 'INTERNAL_ERROR';
            response.error.message = 'Algo deu errado no servidor. Tente novamente mais tarde.';
            logger.error(`💥 Unexpected Error in ${req.method} ${req.path}: ${err.message}`, { stack: err.stack });
        } else {
            logger.warn(`⚠️ Warning Operational Error in ${req.method} ${req.path}: ${err.message}`);
        }
    }

    res.status(err.statusCode).json(response);
};

module.exports = errorHandler;
