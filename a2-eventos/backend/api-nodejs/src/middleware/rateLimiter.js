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
    max: 1000, // AVALIADO PELA AUDITORIA: 1000 tentativas/minuto para aguentar dezenas de catracas roteadas no mesmo IP
    message: {
        error: 'Muitas requisições. Aguarde um momento.'
    }
});

// Limiter geral para API
const apiLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 1000,
    message: {
        error: 'Limite de requisições excedido.'
    }
});

// FIX I-10: Limiter para rotas públicas (cadastro, portal, etc.)
// Mais restritivo para proteger contra abuso no endpoint de cadastro público
const publicLimiter = rateLimit({
    windowMs: 60 * 1000, // 1 minuto
    max: process.env.NODE_ENV === 'development' ? 200 : 30,
    message: {
        error: 'Muitas requisições ao portal. Aguarde um momento.'
    },
    standardHeaders: true,
    legacyHeaders: false
});

module.exports = {
    auth: authLimiter,
    access: accessLimiter,
    api: apiLimiter,
    public: publicLimiter // FIX I-10
};