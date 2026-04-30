/**
 * Configuração de CORS centralizada.
 * Todas as origens permitidas devem ser definidas aqui.
 * Usado tanto pelo Express (app.js) quanto pelo Socket.IO (websocketService.js).
 */

const allowedOrigins = [
    'https://painel.nzt.app.br',
    'https://api.nzt.app.br',
    'http://localhost',
    'http://127.0.0.1',
    'http://localhost:3000',
    'http://localhost:5173',
    'http://127.0.0.1:3000',
    'http://127.0.0.1:5173'
];

/**
 * Verifica se a origem é permitida.
 * Aceita origens explícitas + qualquer IP na faixa 192.168.x.x com porta.
 */
function isOriginAllowed(origin) {
    if (!origin) return true; // Permitir requests sem origin (ex: ferramentas, curl)
    if (allowedOrigins.includes(origin)) return true;
    if (/^http:\/\/192\.168\.\d+\.\d+(:\d+)?$/.test(origin)) return true;
    return false;
}

module.exports = { allowedOrigins, isOriginAllowed };
