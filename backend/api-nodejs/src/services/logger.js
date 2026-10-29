const winston = require('winston');
const path = require('path');
const fs = require('fs');

// Criar pasta de logs se não existir
const logDir = path.join(__dirname, '../../logs');
if (!fs.existsSync(logDir)) {
    fs.mkdirSync(logDir, { recursive: true });
}

// Filtro de dados sensíveis (FIX I-07)
const sensitiveKeys = [
    'password', 'senha', 'token', 'access_token', 'refresh_token',
    'cpf', 'qr_code', 'foto_capturada', 'face_encoding', 'foto_base64_internal',
    'session', 'authorization', 'service_role_key',
    'credit_card', 'cvv', 'password_device', 'photo_capturada'
];

const sanitizeMeta = (meta) => {
    if (!meta) return meta;
    const sanitized = { ...meta };

    for (const key of Object.keys(sanitized)) {
        if (sensitiveKeys.includes(key)) {
            sanitized[key] = '*** MASCARADO ***';
        } else if (typeof sanitized[key] === 'object' && sanitized[key] !== null) {
            sanitized[key] = sanitizeMeta(sanitized[key]); // recursive
        }
    }
    return sanitized;
};

// Formato personalizado
const customFormat = winston.format.combine(
    winston.format.timestamp({
        format: 'YYYY-MM-DD HH:mm:ss'
    }),
    winston.format.errors({ stack: true }),
    winston.format.splat(),
    winston.format.printf(({ timestamp, level, message, service, ...meta }) => {
        const serviceName = service || 'a2-eventos';
        const cleanMeta = sanitizeMeta(meta);
        const metaStr = Object.keys(cleanMeta).length ? ` ${JSON.stringify(cleanMeta)}` : '';
        return `[${timestamp}] [${level.toUpperCase()}] [${serviceName}] ${message}${metaStr}`;
    })
);

// Logger principal
const logger = winston.createLogger({
    level: process.env.LOG_LEVEL || 'info',
    format: customFormat,
    defaultMeta: { service: 'a2-eventos' },
    transports: [
        // Arquivo de erros
        new winston.transports.File({
            filename: path.join(logDir, 'error.log'),
            level: 'error',
            maxsize: 5242880, // 5MB
            maxFiles: 5
        }),
        // Arquivo combinado
        new winston.transports.File({
            filename: path.join(logDir, 'combined.log'),
            maxsize: 5242880,
            maxFiles: 5
        })
        // (sync.log removido: recebia exatamente as mesmas linhas do combined.log — disco em dobro)
    ]
});

// Adicionar console em desenvolvimento
if (process.env.NODE_ENV !== 'production') {
    logger.add(new winston.transports.Console({
        format: winston.format.combine(
            winston.format.colorize(),
            winston.format.simple()
        )
    }));
} else {
    // Em produção, avisos e erros também no `docker logs` (os arquivos somem ao recriar o container)
    logger.add(new winston.transports.Console({
        level: 'warn',
        format: winston.format.combine(winston.format.timestamp(), winston.format.json())
    }));
}

// Normaliza chamadas no estilo pino e com detalhe em string, que o winston serializa
// errado ("[object Object]" e {"0":"I","1":"n",...}):
//   logger.error({ err, device_ip }, 'Mensagem')  →  'Mensagem' + meta
//   logger.error('Mensagem:', 'detalhe')          →  'Mensagem: detalhe'
//   logger.error('Mensagem:', new Error('x'))     →  'Mensagem: x' + stack
const errorToMeta = (err) => ({ error: err.message, stack: err.stack });
const normalizeMeta = (meta) => {
    if (!meta || typeof meta !== 'object') return meta;
    const out = { ...meta };
    for (const key of Object.keys(out)) {
        if (out[key] instanceof Error) {
            const e = out[key];
            out[key] = e.message;
            if (!out.stack) out.stack = e.stack;
        }
    }
    return out;
};

for (const level of ['error', 'warn', 'info', 'debug']) {
    const original = logger[level].bind(logger);
    logger[level] = (first, ...rest) => {
        const isPlainObject = (v) => v && typeof v === 'object' && !(v instanceof Error) && !Array.isArray(v);

        if (isPlainObject(first) && typeof rest[0] === 'string') {
            return original(rest[0], normalizeMeta(first));
        }
        if (typeof first === 'string' && rest.length > 0 && !first.includes('%')) {
            const [second, ...others] = rest;
            if (typeof second === 'string' || typeof second === 'number') {
                return original(`${first} ${second}`.trim(), ...others);
            }
            if (second instanceof Error) {
                return original(`${first} ${second.message}`.trim(), errorToMeta(second), ...others);
            }
            if (isPlainObject(second)) {
                return original(first, normalizeMeta(second), ...others);
            }
        }
        return original(first, ...rest);
    };
}

// Stream para morgan
logger.stream = {
    write: (message) => logger.info(message.trim())
};

module.exports = logger;