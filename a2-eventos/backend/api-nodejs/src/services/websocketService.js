const socketIo = require('socket.io');
const { createAdapter } = require('@socket.io/redis-adapter');
const { createClient } = require('redis');
const logger = require('./logger');
const { isOriginAllowed } = require('../config/cors');
const { supabase } = require('../config/supabase');

class WebSocketService {
    constructor() {
        this.io = null;
        this.pubClient = null;
        this.subClient = null;
        this.redisEnabled = false;
    }

    async init(httpServer) {
        const rateLimitMap = new Map();

        // FIX C-08: CORS agora usa a mesma allowlist do Express (era "*")
        this.io = socketIo(httpServer, {
            cors: {
                origin: (origin, callback) => {
                    // Permite origens sem header (mobile apps, Postman interno)
                    if (!origin) return callback(null, true);
                    if (isOriginAllowed(origin)) return callback(null, true);
                    logger.warn(`[WS CORS] Origem bloqueada: ${origin}`);
                    return callback(new Error('Origem não permitida pelo WebSocket CORS'));
                },
                methods: ['GET', 'POST'],
                credentials: true
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
                logger.info('✅ Conectado ao Redis Pub/Sub: WebSocket agora suporta cluster/Multi-Node');
            } catch (error) {
                logger.warn('⚠️ Falha ao conectar Sockets no Redis. Caindo para memória local: ' + String(error.message || error));
                this.redisEnabled = false;
            }
        } else {
            logger.info('ℹ️ Redis URL não configurada. WebSockets rodando em modo In-Memory (Single-Node).');
        }

        // FIX C-08: Autenticação JWT no handshake — ANTES do rate limiter
        this.io.use(async (socket, next) => {
            try {
                // Token pode vir via query string (?token=...) ou header Authorization: Bearer ...
                const token = socket.handshake.auth?.token
                    || socket.handshake.query?.token
                    || (socket.handshake.headers?.authorization || '').replace('Bearer ', '');

                if (!token) {
                    logger.warn(`[WS Auth] Conexão rejeitada: sem token. ID: ${socket.id}`);
                    return next(new Error('Autenticação obrigatória: forneça um token JWT.'));
                }

                const { data: { user }, error } = await supabase.auth.getUser(token);

                if (error || !user) {
                    logger.warn(`[WS Auth] Token inválido ou expirado. ID: ${socket.id}`);
                    return next(new Error('Token inválido ou expirado.'));
                }

                // Anexa dados do usuário ao socket para uso nos handlers
                socket.user = {
                    id: user.id,
                    email: user.email,
                    role: user.user_metadata?.role || 'operador',
                    evento_id: user.user_metadata?.evento_id || null
                };

                logger.info(`[WS Auth] ✅ ${user.email} autenticado. Sala: evento_${socket.user.evento_id}`);
                next();
            } catch (err) {
                logger.error('[WS Auth] Erro na validação do token:', err.message);
                next(new Error('Erro interno na autenticação WebSocket.'));
            }
        });

        // Middleware de rate limit por IP (após autenticação)
        this.io.use(async (socket, next) => {
            const ip = socket.handshake.address;
            const limit = 20;
            const windowSec = 60;

            try {
                if (this.redisEnabled && this.pubClient) {
                    // Rate limit via Redis (cluster-safe, persiste entre restarts)
                    const key = `ws_rate:${ip}`;
                    const count = await this.pubClient.incr(key);
                    if (count === 1) await this.pubClient.expire(key, windowSec);

                    if (count > limit) {
                        logger.warn(`🛑 WebSocket Rate Limit Excedido (Redis) para IP: ${ip}`);
                        return next(new Error('Rate limit exceeded. Try again later.'));
                    }
                    return next();
                }

                // Fallback: in-memory (single-node)
                const now = Date.now();
                if (!rateLimitMap.has(ip)) {
                    rateLimitMap.set(ip, { count: 1, resetTime: now + windowSec * 1000 });
                    return next();
                }
                const record = rateLimitMap.get(ip);
                if (now > record.resetTime) {
                    record.count = 1;
                    record.resetTime = now + windowSec * 1000;
                    return next();
                }
                if (record.count > limit) {
                    logger.warn(`🛑 WebSocket Rate Limit Excedido (Memory) para IP: ${ip}`);
                    return next(new Error('Rate limit exceeded. Try again later.'));
                }
                record.count++;
                next();
            } catch (err) {
                // Se Redis falhar, permite a conexão (fail-open)
                logger.error('Erro no rate limiter WS:', err.message);
                next();
            }
        });

        this.io.on('connection', (socket) => {
            const userInfo = socket.user ? `${socket.user.email} (${socket.user.role})` : socket.id;
            logger.info(`🔌 WS conectado: ${userInfo}`);

            // Auto-join na room do evento do usuário (extraído do JWT)
            if (socket.user?.evento_id) {
                socket.join(`evento_${socket.user.evento_id}`);
                logger.info(`🔌 Auto-join: ${socket.user.email} → sala evento_${socket.user.evento_id}`);
            }

            socket.on('join_event', (eventoId) => {
                // Masters podem se juntar a qualquer room; outros apenas ao próprio evento
                const isMaster = socket.user?.role === 'master' || socket.user?.role === 'admin_master';
                if (!isMaster && socket.user?.evento_id && socket.user.evento_id !== eventoId) {
                    logger.warn(`[WS] ${socket.user.email} tentou join em evento diferente: ${eventoId}`);
                    return;
                }
                socket.join(`evento_${eventoId}`);
                logger.info(`🔌 ${socket.user?.email || socket.id} entrou na sala: evento_${eventoId}`);
            });

            socket.on('join_system_admin', () => {
                // Apenas admin_master e master podem entrar na sala global
                const allowed = ['master', 'admin_master', 'admin'];
                if (!allowed.includes(socket.user?.role)) {
                    logger.warn(`[WS] ${socket.user?.email} tentou join em system_admin sem permissão`);
                    return;
                }
                socket.join('system_admin');
                logger.info(`🔌 ${socket.user?.email} entrou em system_admin`);
            });

            socket.on('disconnect', (reason) => {
                logger.info(`🔌 WS desconectado: ${userInfo} (${reason})`);
            });
        });

        logger.info('✅ Serviço WebSocket inicializado com autenticação JWT');
    }

    emit(event, data, room = null) {
        if (!this.io) {
            logger.warn('⚠️ Tentativa de emitir evento WebSocket antes da inicialização');
            return;
        }
        if (room) {
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

