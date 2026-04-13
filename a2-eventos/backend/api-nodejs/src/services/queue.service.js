const { createClient } = require('redis');
const logger = require('./logger');

class QueueService {
    constructor() {
        // Stream keys
        this.UP_STREAM_KEY = 'stream:access_logs_up';
        this.DOWN_STREAM_KEY = 'stream:sync_entities_down';
        
        // Consumer settings
        this.CONSUMER_GROUP = 'cloud_sync_group';

        this.client = null;
        this.isConnected = false;
        this._redisErrorLogged = false;
        
        const redisUrl = process.env.REDIS_URL || 
            (process.env.REDIS_HOST ? `redis://${process.env.REDIS_PASSWORD ? ':' + process.env.REDIS_PASSWORD + '@' : ''}${process.env.REDIS_HOST}:${process.env.REDIS_PORT || 6379}` : null);

        if (redisUrl || process.env.USE_REDIS === 'true') {
            this.client = createClient({ 
                url: redisUrl || 'redis://localhost:6379',
                socket: {
                    reconnectStrategy: (retries) => {
                        if (retries >= 3) {
                            if (!this._redisErrorLogged) {
                                logger.warn('⚠️ [QueueService] Redis indisponível após 3 tentativas. Operando em modo Memória Local.');
                                this._redisErrorLogged = true;
                            }
                            return false; // Para de tentar reconectar
                        }
                        return Math.min(retries * 1000, 3000); // 1s, 2s, 3s
                    }
                }
            });
            
            this.client.on('error', (err) => {
                if (!this._redisErrorLogged) {
                    logger.error('❌ [QueueService] Redis Client Error: ' + err.message);
                }
            });
            this.client.on('connect', () => {
                this._redisErrorLogged = false;
                logger.info('✅ [QueueService] Redis Connected. Queues ready.');
            });
            
            this.connect();
        } else {
            logger.warn('⚠️ [QueueService] Redis desativado. Local Queues operarão em Fallback (Memory).');
        }
    }

    async connect() {
        if (!this.client || this.isConnected) return;
        try {
            await this.client.connect();
            this.isConnected = true;
            await this.initConsumerGroups();
        } catch (error) {
            logger.error(`[QueueService] Erro ao conectar Redis: ${error.message}`);
        }
    }

    /**
     * Inicializa os Consumer Groups se eles não existirem ainda
     */
    async initConsumerGroups() {
        try {
            // "0-0" ou "$" para criar do final. Usando "0-0" garante que lê tudo o que está lá se o grupo não existia
            await this.client.xGroupCreate(this.UP_STREAM_KEY, this.CONSUMER_GROUP, '0', { MKSTREAM: true });
            logger.info(`✅ [QueueService] Consumer Group '${this.CONSUMER_GROUP}' criado no stream ${this.UP_STREAM_KEY}`);
        } catch (error) {
            // BUSYGROUP significa que o grupo já existe, o que é o comportamento normal
            if (!error.message.includes('BUSYGROUP')) {
                logger.error(`[QueueService] Falha ao criar Consumer Group: ${error.message}`);
            }
        }
    }

    /**
     * Publica um evento de Log para subir pra Cloud via Outbox
     * @param {Object} logData 
     */
    async publishLogToCloud(logData) {
        if (!this.isConnected) {
            logger.warn('⚠️ [QueueService] Publicação ignorada. Redis desconectado.');
            return false;
        }
        
        try {
            // Redis Streams armazena strings. Precisamos serializar objetos complexos.
            const payload = {
                payload_json: JSON.stringify(logData),
                type: 'access_log',
                timestamp: Date.now().toString()
            };

            const msgId = await this.client.xAdd(this.UP_STREAM_KEY, '*', payload);
            logger.debug(`📤 [QueueService] Log inserido na fila. ID Stream: ${msgId}`);
            return msgId;
        } catch (error) {
            logger.error(`❌ [QueueService] Erro ao adicionar na fila XADD: ${error.message}`);
            return false;
        }
    }

    /**
     * Retorna a instância crua do Redis caso um Worker precise realizar operações bloqueantes
     */
    getClient() {
        return this.client;
    }
}

module.exports = new QueueService();
