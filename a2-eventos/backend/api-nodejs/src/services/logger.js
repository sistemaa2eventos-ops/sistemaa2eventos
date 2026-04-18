const pino = require('pino');

// Campos sensíveis que serão mascarados nos logs
const SENSITIVE_KEYS = new Set([
    'password', 'token', 'cpf', 'qr_code',
    'foto_capturada', 'face_encoding', 'foto_base64_internal', 'session',
    'authorization', 'service_role_key'
]);

// Redact paths para pino suprimir campos em JSON aninhado
const redactPaths = [
    'password', 'token', 'cpf', 'qr_code', 'face_encoding',
    'foto_capturada', 'foto_base64_internal', 'session',
    '*.password', '*.token', '*.cpf', '*.face_encoding'
];

const isDev = process.env.NODE_ENV === 'development';

// FIX I-07: Substituído Winston por Pino (já presente no package.json como dep principal)
// Winston removido — mantendo apenas Pino para logs estruturados JSON (melhor para Docker/K8s)
const logger = pino({
    level: process.env.LOG_LEVEL || 'info',
    redact: {
        paths: redactPaths,
        censor: '*** MASCARADO ***'
    },
    timestamp: pino.stdTimeFunctions.isoTime,
    formatters: {
        level: (label) => ({ level: label.toUpperCase() })
    },
    // Em desenvolvimento, formata de forma legível
    ...(isDev && {
        transport: {
            target: 'pino-pretty',
            options: {
                colorize: true,
                translateTime: 'SYS:yyyy-mm-dd HH:MM:ss',
                ignore: 'pid,hostname'
            }
        }
    })
});

// Stream para compatibilidade com morgan (req logging)
logger.stream = {
    write: (message) => logger.info(message.trim())
};

module.exports = logger;