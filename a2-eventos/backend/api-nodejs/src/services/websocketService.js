const socketIo = require('socket.io');
const { createAdapter } = require('@socket.io/redis-adapter');
const { createClient } = require('redis');
const logger = require('./logger');
const { isOriginAllowed } = require('../config/cors');

class WebSocketService {
    constructor() {
        this.io = null;
        this.pubClient = null;
        this.subClient = null;
        this.redisEnabled = false;
    }

    async init(httpServer) {
        const rateLimitMap = new Map();

        this.io = socketIo(httpServer, {
            cors: {
                origin: "*",
                methods: ["GET", "POST"],
                credentials: false
            }
        });

        // Tentar conectar ao Redis para o Adapter Pub/Sub
        const redisUrl = process.env.REDIS_URL || (process.env.REDIS_HOST ? `redis://${process.env.REDIS_PASSWORD ? ':' + process.env.REDIS_PASSWORD + '@' : ''}${process.env.REDIS_HOST}:${process.env.REDIS_PORT || 6379}` : null);
        
        if (process.env.USE_REDIS === 'true' && redisUrl) {
            try {
                this.pubClient = createClient({ url: redisUrl });
                this.subClient = this.pubClient.duplicate();

                await Promise.all([this.pubClient.connect(), this.subClient.connect()]);

                this.io.adapter(createAdapter(this.pubClient, this.subClient));
                this.redisEnabled = true;
                logger.info('✅ Conectado ao Redis Pub/Sub: WebSocket agora suporta cluster/Multi-Node (A2 Eventos SaaS)');
            } catch (error) {
                logger.warn('⚠️ Falha ao conectar Sockets no Redis. Caindo para memória local: ' + String(error.message || error));
                this.redisEnabled = false;
            }
        } else {
            logger.info('ℹ️ Redis URL não configurada. WebSockets rodando em modo In-Memory (Single-Node).');
        }

        // Middleware de limitação de conexões ativas por IP
        this.io.use((socket, next) => {
            const ip = socket.handshake.address;
            const now = Date.now();
            const limit = 20; // max connections per IP per minute

            if (!rateLimitMap.has(ip)) {
                rateLimitMap.set(ip, { count: 1, resetTime: now + 60000 });
                return next();
            }

            const record = rateLimitMap.get(ip);
            if (now > record.resetTime) {
                record.count = 1;
                record.resetTime = now + 60000;
                return next();
            }

            if (record.count > limit) {
                logger.warn(`🛑 WebSocket Rate Limit Excedido para IP: ${ip}`);
                return next(new Error('Rate limit exceeded. Try again later.'));
            }

            record.count++;
            next();
        });

        this.io.on('connection', (socket) => {
            logger.info(`🔌 Cliente conectado no WebSocket: ${socket.id}`);

            socket.on('join_event', (eventoId) => {
                socket.join(`evento_${eventoId}`);
                logger.info(`🔌 Cliente ${socket.id} entrou na sala do evento: ${eventoId}`);
            });

            socket.on('join_system_admin', () => {
                // Idealmente validar role aqui, mas como o token já foi validado no handshake ou middleware de auth
                socket.join('system_admin');
                logger.info(`🔌 Cliente ${socket.id} entrou na sala administrativa global (Alertas)`);
            });

            socket.on('disconnect', () => {
                logger.info(`🔌 Cliente desconectado do WebSocket: ${socket.id}`);
            });
        });

        logger.info('✅ Serviço WebSocket inicializado');
    }

    emit(event, data, room = null) {
        if (!this.io) {
            logger.warn('⚠️ Tentativa de emitir evento WebSocket antes da inicialização');
            return;
        }
        if (room) {
            // Se o room não começar com 'evento_' ou 'system_', assume-se que é um evento_id
            const roomName = (room.startsWith('evento_') || room.startsWith('system_')) 
                ? room 
                : `evento_${room}`;
            
            this.io.to(roomName).emit(event, data);
            logger.info(`📡 [WS] Emitido '${event}' para sala ${roomName}`);
        } else {
            this.io.emit(event, data);
            logger.info(`📡 [WS] Emitido '${event}' global`);
        }
    }
}

module.exports = new WebSocketService();
