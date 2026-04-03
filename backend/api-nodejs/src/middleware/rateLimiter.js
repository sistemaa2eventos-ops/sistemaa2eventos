const rateLimit = require('express-rate-limit');

// Limiter para rotas de autenticação
const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutos
    max: process.env.NODE_ENV === 'development' ? 50 : 5, // Mais tentativas em dev
    message: {
        error: 'Muitas tentativas de login. Tente novamente em 15 minutos.'
    },
    standardHeaders: true,
    legacyHeaders: false
});

// Limiter para rotas de acesso (check-in/out)
const accessLimiter = rateLimit({
    windowMs: 60 * 1000, // 1 minuto
    max: 30, // 30 tentativas por minuto
    message: {
        error: 'Muitas requisições. Aguarde um momento.'
    }
});

// Limiter geral para API
const apiLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 100,
    message: {
        error: 'Limite de requisições excedido.'
    }
});

module.exports = {
    auth: authLimiter,
    access: accessLimiter,
    api: apiLimiter
};