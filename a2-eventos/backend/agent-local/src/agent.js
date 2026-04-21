'use strict';

const { io } = require('socket.io-client');
const IntelbrasLocal = require('./intelbras');
const winston = require('winston');

// ─── Logger ──────────────────────────────────────────────────────────────────
const logger = winston.createLogger({
    level: process.env.LOG_LEVEL || 'info',
    format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.colorize(),
        winston.format.printf(({ timestamp, level, message }) => `[${timestamp}] ${level}: ${message}`)
    ),
    transports: [new winston.transports.Console()]
});

// ─── Configuração ─────────────────────────────────────────────────────────────
const VPS_URL       = process.env.VPS_URL        || 'https://api.seudominio.com';
const AGENT_TOKEN   = process.env.AGENT_TOKEN;     // Token único deste agente (gerado na VPS)
const AGENT_NAME    = process.env.AGENT_NAME       || 'Agente Local';
const RECONNECT_MS  = parseInt(process.env.RECONNECT_MS || '5000');

if (!AGENT_TOKEN) {
    logger.error('❌ AGENT_TOKEN não definido. Configure no .env');
    process.exit(1);
}

// ─── Registro de dispositivos locais ──────────────────────────────────────────
// Formato: { [deviceId]: { ip, port, user, password } }
// Pode ser populado via comando remoto ou variável de ambiente
const deviceRegistry = new Map();

function getDevice(deviceId, config = {}) {
    if (!deviceRegistry.has(deviceId)) {
        if (!config.ip) throw new Error(`Dispositivo ${deviceId} não registrado localmente`);
        deviceRegistry.set(deviceId, new IntelbrasLocal(config));
        logger.info(`📟 Dispositivo registrado: ${deviceId} → ${config.ip}:${config.port || 80}`);
    }
    return deviceRegistry.get(deviceId);
}

// ─── Handlers de Comandos ─────────────────────────────────────────────────────
const handlers = {
    async ping({ deviceId, config }) {
        const dev = getDevice(deviceId, config);
        return await dev.ping();
    },

    async enrollUser({ deviceId, config, pessoa, fotoBase64 }) {
        const dev = getDevice(deviceId, config);
        return await dev.enrollUser(pessoa, fotoBase64);
    },

    async deleteUser({ deviceId, config, hwUserId }) {
        const dev = getDevice(deviceId, config);
        return await dev.deleteUser(hwUserId);
    },

    async openDoor({ deviceId, config, doorIndex }) {
        const dev = getDevice(deviceId, config);
        return await dev.openDoor(doorIndex);
    },

    async getSnapshot({ deviceId, config }) {
        const dev = getDevice(deviceId, config);
        return { snapshot: await dev.getSnapshot() };
    },

    async registerDevice({ deviceId, ip, port, user, password }) {
        deviceRegistry.set(deviceId, new IntelbrasLocal({ ip, port, user, password }));
        logger.info(`📟 Dispositivo ${deviceId} registrado via comando remoto: ${ip}:${port || 80}`);
        return { success: true };
    }
};

// ─── Conexão WebSocket ─────────────────────────────────────────────────────────
let socket;

function connect() {
    logger.info(`🔌 Conectando à VPS: ${VPS_URL}`);

    socket = io(VPS_URL, {
        path: '/agent',
        auth: { token: AGENT_TOKEN, name: AGENT_NAME },
        reconnectionDelay: RECONNECT_MS,
        reconnectionAttempts: Infinity,
        transports: ['websocket']
    });

    socket.on('connect', () => {
        logger.info(`✅ Conectado à VPS (socket: ${socket.id})`);
        socket.emit('agent:ready', {
            name: AGENT_NAME,
            version: '1.0.0',
            devices: [...deviceRegistry.keys()],
            ts: new Date().toISOString()
        });
    });

    socket.on('disconnect', (reason) => {
        logger.warn(`⚠️ Desconectado: ${reason}. Reconectando em ${RECONNECT_MS}ms...`);
    });

    socket.on('connect_error', (err) => {
        logger.error(`❌ Erro de conexão: ${err.message}`);
    });

    // ── Receber comandos da VPS ──
    socket.on('agent:command', async ({ requestId, command, payload }) => {
        logger.info(`📩 Comando recebido: ${command} (req: ${requestId})`);

        const handler = handlers[command];
        if (!handler) {
            logger.warn(`⚠️ Comando desconhecido: ${command}`);
            return socket.emit('agent:response', {
                requestId,
                success: false,
                error: `Comando desconhecido: ${command}`
            });
        }

        try {
            const result = await handler(payload || {});
            logger.info(`✅ Comando ${command} executado com sucesso`);
            socket.emit('agent:response', { requestId, success: true, data: result });
        } catch (err) {
            logger.error(`❌ Erro ao executar ${command}: ${err.message}`);
            socket.emit('agent:response', { requestId, success: false, error: err.message });
        }
    });
}

connect();

// Graceful shutdown
process.on('SIGTERM', () => { socket?.disconnect(); process.exit(0); });
process.on('SIGINT',  () => { socket?.disconnect(); process.exit(0); });
