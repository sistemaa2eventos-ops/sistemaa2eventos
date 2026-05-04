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
 * Rejeita requisições sem origin header (CSRF protection).
 * Aceita apenas origens explicitamente whitelistadas.
 */
function isOriginAllowed(origin) {
    if (!origin) return false; // Rejeitar requests sem origin (CSRF protection)
    if (uniqueOrigins.includes(origin)) return true;
    return false;
}

module.exports = { allowedOrigins: uniqueOrigins, isOriginAllowed };
