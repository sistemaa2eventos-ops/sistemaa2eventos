const net = require('net');
const { supabase } = require('../../config/supabase');
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
     * Situação de um leitor, funcionando com o servidor na rede local ou na nuvem:
     * 1. keepalive/push recente do próprio leitor (last_push_at) → online;
     * 2. leitor atendido por agente local → ping pelo agente;
     * 3. teste TCP direto (só alcança leitores da mesma rede).
     */
    async avaliarDispositivo(dispositivo) {
        const JANELA_KEEPALIVE_MS = 3 * 60 * 1000;
        const ultimoContato = dispositivo.last_push_at ? new Date(dispositivo.last_push_at) : null;
        if (ultimoContato && Date.now() - ultimoContato.getTime() < JANELA_KEEPALIVE_MS) {
            return { online: true, timestamp: ultimoContato, via: 'keepalive' };
        }

        const agentService = require('../../services/agentService');
        // Mesma regra do IntelbrasService._request: no servidor local o teste direto funciona
        if (dispositivo.agent_id && (agentService.agents.has(dispositivo.agent_id) || !process.env.PYTHON_MICROSERVICE_URL)) {
            try {
                await agentService.sendCommand(dispositivo.agent_id, 'ping', {
                    deviceId: dispositivo.id,
                    config: { ip: dispositivo.ip_address, port: dispositivo.porta || 80, user: dispositivo.user_device, password: dispositivo.password_device }
                });
                return { online: true, timestamp: new Date(), via: 'agente' };
            } catch (err) {
                return { online: false, timestamp: new Date(), via: 'agente', error: err.message };
            }
        }

        return this.pingDevice(dispositivo.ip_address, dispositivo.porta || 80);
    }

    /**
     * Verificar status de todos os dispositivos do evento
     * Atualiza status_online e ultimo_ping no Supabase
     * Se dispositivo voltou online, enfileira processamento
     */
    async checkAllDevices(eventoId = null) {
        try {
            logger.debug(`🏥 [HealthCheck] Iniciando verificação de dispositivos${eventoId ? ` para evento ${eventoId}` : ''}...`);

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
                logger.debug('[HealthCheck] Nenhum terminal facial encontrado');
                return { checked: 0, online: 0, offline: 0 };
            }

            logger.debug(`[HealthCheck] Verificando ${dispositivos.length} dispositivos...`);

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
                        const status = await this.avaliarDispositivo(dispositivo);

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
                            require('../../services/websocketService').emit('system:alert', {
                                type: 'DEVICE_OFFLINE',
                                severity: 'critical',
                                message: `Leitor desconectado ou sem sinal: ${dispositivo.nome}`,
                                details: { device_id: dispositivo.id }
                            }, 'system_admin');
                        }
                    }

                    // Preparar update para Supabase (último contato só muda quando houve contato)
                    updates.push({
                        id: dispositivo.id,
                        status_online: nowOnline ? 'online' : 'offline',
                        ultimo_ping: nowOnline ? status.timestamp.toISOString() : dispositivo.ultimo_ping
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
                    logger.debug(`✅ [HealthCheck] ${successUpdates}/${updates.length} dispositivos atualizados no banco`);
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

            logger.debug(`🏥 [HealthCheck] Concluído em ${duration}s: ${onlineCount} online, ${offlineCount} offline`);

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
            // Contar itens pendentes via Supabase (onde terminal_sync_queue reside)
            const { count, error } = await supabase
                .from('terminal_sync_queue')
                .select('*', { count: 'exact', head: true })
                .eq('dispositivo_id', dispositivoId)
                .eq('status', 'pendente');

            if (error) throw error;

            const pendingCount = count || 0;

            if (pendingCount > 0) {
                logger.info(`⚡ [ProcessQueue] Dispositivo ${dispositivoId} tem ${pendingCount} itens pendentes`);
                // Processar fila imediatamente
                const syncService = require('./sync.service');
                await syncService.processTerminalQueue();
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

            // Contar itens na fila via Supabase
            const { data: queueItems } = await supabase
                .from('terminal_sync_queue')
                .select('status')
                .eq('dispositivo_id', dispositivoId);

            const queue = {
                total: queueItems?.length || 0,
                pendente: queueItems?.filter(q => q.status === 'pendente').length || 0,
                erro: queueItems?.filter(q => q.status === 'erro').length || 0,
                sucesso: queueItems?.filter(q => q.status === 'sucesso').length || 0
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
