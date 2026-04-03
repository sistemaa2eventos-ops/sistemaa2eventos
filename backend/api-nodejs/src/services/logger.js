const winston = require('winston');
const path = require('path');
const fs = require('fs');

// Criar pasta de logs se não existir
const logDir = path.join(__dirname, '../../logs');
if (!fs.existsSync(logDir)) {
    fs.mkdirSync(logDir, { recursive: true });
}

// Filtro de dados sensíveis
const sanitizeMeta = (meta) => {
    if (!meta) return meta;
    const sanitized = { ...meta };
    const sensitiveKeys = ['password', 'token', 'cpf', 'qr_code', 'foto_capturada', 'face_encoding', 'foto_base64_internal', 'session'];

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
    defaultMeta: { service: 'a2-sync' },
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
        }),
        // Arquivo específico de sincronização
        new winston.transports.File({
            filename: path.join(logDir, 'sync.log'),
            maxsize: 5242880,
            maxFiles: 5
        })
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
}

// Stream para morgan
logger.stream = {
    write: (message) => logger.info(message.trim())
};

module.exports = logger;