const rateLimit = require('express-rate-limit');

const isDev = process.env.NODE_ENV === 'development';

// No evento, todos os operadores saem pelo mesmo IP de internet (NAT do local).
// Por isso os limites de quem está logado são contados POR USUÁRIO, e não por IP.

/** Usuário do token (sem validar assinatura: serve só para separar a contagem). */
function usuarioDoToken(req) {
    // ?ingresso= (imagem/vídeo de câmera e gravação) leva o usuário no campo "u": sem isto, as
    // imagens do CFTV contavam no limite do IP do local e travavam o login de todo o evento
    const token = (req.headers.authorization || '').replace('Bearer ', '') || req.query?.token || req.query?.ingresso;
    if (!token || typeof token !== 'string' || token.split('.').length !== 3) return null;
    try {
        const payload = JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString('utf8'));
        const id = payload.sub || payload.u;
        return typeof id === 'string' ? id : null;
    } catch {
        return null;
    }
}

const chavePorUsuario = (req) => {
    const id = req.user?.id || usuarioDoToken(req);
    return id ? `u:${id}` : `ip:${req.ip}`;
};

// Login/cadastro/recuperação: IP + e-mail, para um erro de senha não travar os colegas
const chaveLogin = (req) => `ip:${req.ip}|${String(req.body?.email || '').trim().toLowerCase()}`;

// Limiter para rotas de autenticação
const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutos
    max: isDev ? 50 : 10,
    keyGenerator: chaveLogin,
    skipSuccessfulRequests: true, // só tentativas com erro contam
    message: {
        error: 'Muitas tentativas de login. Tente novamente em 15 minutos.'
    },
    standardHeaders: true,
    legacyHeaders: false
});

// Limiter para rotas de acesso (check-in/out) — por operador
const accessLimiter = rateLimit({
    windowMs: 60 * 1000, // 1 minuto
    max: 120,
    keyGenerator: chavePorUsuario,
    message: {
        error: 'Muitas requisições. Aguarde um momento.'
    },
    standardHeaders: true,
    legacyHeaders: false
});

// Limiter geral para API — por usuário logado (ou IP, sem login)
const apiLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 300,
    keyGenerator: chavePorUsuario,
    message: {
        error: 'Limite de requisições excedido.'
    },
    standardHeaders: true,
    legacyHeaders: false,
    // Leitores faciais (push/online/keepalive) disparam rajadas legítimas de eventos:
    // um 429 aqui vira acesso negado na porta.
    skip: (req) => {
        const url = req.originalUrl || req.url || '';
        // Vídeo/imagem de câmera e gravação: um mosaico gera centenas de pedidos por minuto e cada
        // um já exige ingresso assinado de 2 min (ou login)
        if (/^\/api\/cameras\/[^/]+\/(snapshot|stream|video\.mp4)(\?|$)/.test(url) || /^\/api\/gravacoes\/[^/]+\/video(\?|$)/.test(url)) return true;
        return url.startsWith('/api/intelbras/') || url.startsWith('/api/hikvision/') || url.startsWith('/keepalive');
    }
});

// FIX I-10: Limiter para rotas públicas (cadastro, portal, etc.)
// Por IP. Cada cadastro faz ~4 chamadas (empresa, equipe, URL da foto, envio):
// 30/min travava um escritório ou Wi-Fi compartilhado com poucas pessoas ao mesmo tempo
const publicLimiter = rateLimit({
    windowMs: 60 * 1000, // 1 minuto
    max: isDev ? 200 : 120,
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
    public: publicLimiter
};
