/**
 * Configuração de CORS centralizada.
 * Todas as origens permitidas devem ser definidas aqui.
 * Usado tanto pelo Express (app.js) quanto pelo Socket.IO (websocketService.js).
 */

const allowedOrigins = [
    // Production URLs (via environment variables)
    process.env.FRONTEND_URL,
    process.env.PUBLIC_PORTAL_URL,
    process.env.API_URL,

    // Production URLs (hardcoded fallback — garante acesso mesmo se env estiver incompleto)
    'https://painel.nzt.app.br',
    'https://cadastro.nzt.app.br',
    'https://api.nzt.app.br',

    // Development URLs (fallback)
    'http://localhost',
    'http://127.0.0.1',
    'http://localhost:3000',
    'http://localhost:3002',
    'http://localhost:5173',
    'http://127.0.0.1:3000',
    'http://127.0.0.1:5173'
].filter(Boolean); // Remove nulos caso o env não esteja definido

// Deduplica (caso env vars repitam os hardcoded)
const uniqueOrigins = [...new Set(allowedOrigins)];

/**
 * Verifica se a origem é permitida.
 * Aceita origens explícitas + qualquer IP na faixa 192.168.x.x com porta.
 */
function isOriginAllowed(origin) {
    if (!origin) return true; // Permitir requests sem origin (ex: ferramentas, curl)
    if (uniqueOrigins.includes(origin)) return true;
    if (/^http:\/\/192\.168\.\d+\.\d+(:\d+)?$/.test(origin)) return true;
    return false;
}

module.exports = { allowedOrigins: uniqueOrigins, isOriginAllowed };
