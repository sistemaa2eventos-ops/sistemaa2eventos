const net = require('net');
const { supabase } = require('../../config/supabase');
const { getPgConnection } = require('../../config/pgEdge');
const logger = require('../../services/logger');

class DeviceHealthCheckService {
    constructor() {
        this.lastCheckTime = null;
        this.deviceStatuses = new Map();
    }

    /**
     * Fazer ping em um dispositivo via TCP
     * Retorna: { online: boolean, latency: number, timestamp: Date }
     */
    async pingDevice(ip, port = 80, timeoutMs = 5000) {
        return new Promise((resolve) => {
            const socket = new net.Socket();
            const startTime = Date.now();

            const timeout = setTimeout(() => {
                socket.destroy();
                resolve({
                    online: false,
                    latency: timeoutMs,
                    timestamp: new Date(),
                    error: 'Timeout'
                });
            }, timeoutMs);

            socket.on('connect', () => {
                clearTimeout(timeout);
                const latency = Date.now() - startTime;
                socket.destroy();
                resolve({
                    online: true,
                    latency,
                    timestamp: new Date()
                });
            });

            socket.on('error', (err) => {
                clearTimeout(timeout);
                resolve({
                    online: false,
                    latency: Date.now() - startTime,
                    timestamp: new Date(),
                    error: err.message
                });
            });

            socket.connect(port, ip);
        });
    }

    /**
     * Verificar status de todos os dispositivos do evento
     * Atualiza status_online e ultimo_ping no Supabase
     * Se dispositivo voltou online, enfileira processamento
     */
    async checkAllDevices(eventoId = null) {
        try {
            logger.info(`🏥 [HealthCheck] Iniciando verificação de dispositivos${eventoId ? ` para evento ${eventoId}` : ''}...`);

            const startTime = Date.now();
            let query = supabase.from('dispositivos_acesso').select('*');

            if (eventoId) {
                query = query.eq('evento_id', eventoId);
            }

            const { data: dispositivos, error } = await query.eq('tipo', 'terminal_facial');

            if (error) {
                logger.error('[HealthCheck] Erro ao buscar dispositivos:', error.message);
                return { error: error.message };
            }

            if (!dispositivos || dispositivos.length === 0) {
                logger.info('[HealthCheck] Nenhum terminal facial encontrado');
                return { checked: 0, online: 0, offline: 0 };
            }

            logger.info(`[HealthCheck] Verificando ${dispositivos.length} dispositivos...`);

            let onlineCount = 0;
            let offlineCount = 0;
            const updates = [];
            const devicesOnline = [];

            // Realizar ping em paralelo com limite de concorrência
            const batchSize = 5;
            for (let i = 0; i < dispositivos.length; i += batchSize) {
                const batch = dispositivos.slice(i, i + batchSize);

                const results = await Promise.all(
                    batch.map(async (dispositivo) => {
                        const status = await this.pingDevice(dispositivo.ip_address, dispositivo.porta || 80);

                        const wasOffline = dispositivo.status_online !== 'online';
                        const nowOnline = status.online;

                        return {
                            dispositivo,
                            status,
                            wasOffline,
                            nowOnline
                        };
                    })
                );

                // Processar resultados da batch
                for (const result of results) {
                    const { dispositivo, status, wasOffline, nowOnline } = result;

                    if (nowOnline) {
                        onlineCount++;
                        if (wasOffline) {
                            devicesOnline.push(dispositivo.id);
                            logger.info(`🟢 [HealthCheck] ${dispositivo.nome} VOLTOU ONLINE`);
                        }
                    } else {
                        offlineCount++;
                        if (!wasOffline) {
                            logger.warn(`🔴 [HealthCheck] ${dispositivo.nome} foi para OFFLINE`);
                        }
                    }

                    // Preparar update para Supabase
                    updates.push({
                        id: dispositivo.id,
                        status_online: nowOnline ? 'online' : 'offline',
                        ultimo_ping: status.timestamp.toISOString()
                    });

                    // Manter registro em memória
                    this.deviceStatuses.set(dispositivo.id, {
                        ...status,
                        online: nowOnline,
                        dispositivo_id: dispositivo.id,
                        nome: dispositivo.nome
                    });
                }
            }

            // Atualizar Supabase - Usamos update individual para evitar problemas com upsert e colunas obrigatórias
            if (updates.length > 0) {
                let successUpdates = 0;
                for (const update of updates) {
                    const { error: updateError } = await supabase
                        .from('dispositivos_acesso')
                        .update({
                            status_online: update.status_online,
                            ultimo_ping: update.ultimo_ping
                        })
                        .eq('id', update.id);

                    if (updateError) {
                        logger.error({ err: updateError, deviceId: update.id }, `[HealthCheck] Erro ao atualizar status do dispositivo ${update.id}: ${updateError.message}`);
                    } else {
                        successUpdates++;
                    }
                }
                
                if (successUpdates > 0) {
                    logger.info(`✅ [HealthCheck] ${successUpdates}/${updates.length} dispositivos atualizados no banco`);
                }
            }

            // Se algum dispositivo voltou online, processa sua fila
            if (devicesOnline.length > 0) {
                logger.info(`⚡ [HealthCheck] ${devicesOnline.length} dispositivos voltaram online — enfileirando processamento`);
                for (const deviceId of devicesOnline) {
                    await this.processOfflineQueue(deviceId);
                }
            }

            const duration = ((Date.now() - startTime) / 1000).toFixed(2);
            this.lastCheckTime = new Date();

            logger.info(`🏥 [HealthCheck] Concluído em ${duration}s: ${onlineCount} online, ${offlineCount} offline`);

            return {
                checked: dispositivos.length,
                online: onlineCount,
                offline: offlineCount,
                wentOnline: devicesOnline.length,
                duration: `${duration}s`
            };

        } catch (error) {
            logger.error('[HealthCheck] Erro crítico:', error);
            return { error: error.message };
        }
    }

    /**
     * Processa fila pendente de um dispositivo que voltou online
     */
    async processOfflineQueue(dispositivoId) {
        try {
            const connection = await getPgConnection();

            // Contar itens pendentes
            const result = await connection.query(
                `SELECT COUNT(*) as total FROM terminal_sync_queue
                 WHERE dispositivo_id = $1 AND status = 'pendente'`,
                [dispositivoId]
            );

            const pendingCount = result.rows[0]?.total || 0;

            if (pendingCount > 0) {
                logger.info(`⚡ [ProcessQueue] Dispositivo ${dispositivoId} tem ${pendingCount} itens pendentes`);
                // A fila será processada no próximo ciclo de processamento scheduled
            }

        } catch (error) {
            logger.error(`[ProcessQueue] Erro ao verificar fila do dispositivo ${dispositivoId}:`, error.message);
        }
    }

    /**
     * Retornar status detalhado de um dispositivo
     */
    async getDeviceStatus(dispositivoId) {
        try {
            const { data: dispositivo } = await supabase
                .from('dispositivos_acesso')
                .select('*')
                .eq('id', dispositivoId)
                .single();

            if (!dispositivo) {
                return { error: 'Dispositivo não encontrado' };
            }

            const connection = await getPgConnection();

            // Contar itens na fila
            const queueResult = await connection.query(
                `SELECT
                    COUNT(*) as total,
                    SUM(CASE WHEN status = 'pendente' THEN 1 ELSE 0 END) as pendente,
                    SUM(CASE WHEN status = 'erro' THEN 1 ELSE 0 END) as erro,
                    SUM(CASE WHEN status = 'sucesso' THEN 1 ELSE 0 END) as sucesso
                FROM terminal_sync_queue
                WHERE dispositivo_id = $1`,
                [dispositivoId]
            );

            const queue = queueResult.rows[0] || {
                total: 0,
                pendente: 0,
                erro: 0,
                sucesso: 0
            };

            // Pegar status em cache
            const cachedStatus = this.deviceStatuses.get(dispositivoId);

            return {
                dispositivo: {
                    id: dispositivo.id,
                    nome: dispositivo.nome,
                    ip_address: dispositivo.ip_address,
                    status_online: dispositivo.status_online,
                    ultimo_ping: dispositivo.ultimo_ping
                },
                fila: queue,
                health: cachedStatus || {
                    online: dispositivo.status_online === 'online',
                    latency: null,
                    timestamp: dispositivo.ultimo_ping
                }
            };

        } catch (error) {
            logger.error(`[GetStatus] Erro ao buscar status do dispositivo ${dispositivoId}:`, error.message);
            return { error: error.message };
        }
    }

    /**
     * Limpar stats de memória
     */
    getStats() {
        return {
            lastCheckTime: this.lastCheckTime,
            devicesTracked: this.deviceStatuses.size,
            devicesOnline: Array.from(this.deviceStatuses.values()).filter(s => s.online).length
        };
    }
}

module.exports = new DeviceHealthCheckService();
