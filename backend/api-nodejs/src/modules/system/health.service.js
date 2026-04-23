const logger = require('../../services/logger');
const syncService = require('../devices/sync.service');
const webSocketService = require('../../services/websocketService');
const { supabase } = require('../../config/supabase');
const { testPgConnection } = require('../../config/pgEdge');

/**
 * HealthService: Monitora proativamente a saúde do sistema NZT.
 * Dispara alertas via WebSocket para administradores em caso de falhas.
 */
class HealthService {
    constructor() {
        this.checkInterval = 60 * 1000; // 1 minuto
        this.thresholds = {
            maxSyncDelayMinutes: 15,
            maxPendingItems: 500,
            maxLatencyMs: 3000
        };
        this.timer = null;
        this.lastAlertSentAt = null;
        this.alertCooldown = 5 * 60 * 1000; // 5 minutos entre alertas do mesmo tipo
    }

    start() {
        logger.info('🏥 HealthMonitor iniciado - Alertas proativos ativos');
        this.timer = setInterval(() => this.runDiagnostics(), this.checkInterval);
        
        // Diagnóstico imediato
        setTimeout(() => this.runDiagnostics(), 5000);
    }

    stop() {
        if (this.timer) clearInterval(this.timer);
    }

    async runDiagnostics() {
        try {
            // 0. Carregar configurações do evento ativo para obter thresholds dinâmicos
            const { data: activeEvent } = await supabase
                .from('eventos')
                .select('config')
                .eq('status', 'ativo')
                .order('updated_at', { ascending: false })
                .limit(1)
                .maybeSingle();

            const customThresholds = activeEvent?.config || {};
            const thresholds = {
                maxSyncDelayMinutes: customThresholds.sync_delay_threshold_min || this.thresholds.maxSyncDelayMinutes,
                maxPendingItems: this.thresholds.maxPendingItems,
                maxLatencyMs: this.thresholds.maxLatencyMs
            };

            const stats = syncService.getStats();
            const alerts = [];

            // 1. Verificar Sincronia
            if (stats.lastSync) {
                const diffMinutes = (Date.now() - new Date(stats.lastSync).getTime()) / 1000 / 60;
                if (diffMinutes > thresholds.maxSyncDelayMinutes) {
                    alerts.push({
                        type: 'SYNC_DELAY',
                        severity: 'critical',
                        message: `Sincronização parada há ${Math.round(diffMinutes)} minutos!`,
                        value: `${Math.round(diffMinutes)} min`
                    });
                }
            }

            if (stats.pendingItems > thresholds.maxPendingItems) {
                alerts.push({
                    type: 'SYNC_BACKLOG',
                    severity: 'warning',
                    message: `Fila de sincronização congestionada: ${stats.pendingItems} itens pendentes.`,
                    value: stats.pendingItems
                });
            }

            // 2. Verificar Conectividade Cloud
            try {
                const start = Date.now();
                const { error } = await supabase.from('eventos').select('count', { count: 'exact', head: true }).limit(1);
                const latency = Date.now() - start;

                if (error) throw error;
                if (latency > thresholds.maxLatencyMs) {
                    alerts.push({
                        type: 'CLOUD_LATENCY',
                        severity: 'warning',
                        message: `Latência alta com Supabase: ${latency}ms`,
                        value: latency
                    });
                }
            } catch (err) {
                alerts.push({
                    type: 'CLOUD_OFFLINE',
                    severity: 'critical',
                    message: 'Conexão com a Nuvem (Supabase) perdida!',
                    error: err.message
                });
            }

            // 3. Verificar Banco Local (Edge)
            const isPgOk = await testPgConnection();
            if (!isPgOk) {
                alerts.push({
                    type: 'EDGE_OFFLINE',
                    severity: 'critical',
                    message: 'Banco de dados local (Postgres Edge) inacessível!'
                });
            }

            // 4. Verificar Liveness dos Dispositivos (Watchdog)
            await this.checkDeviceLiveness(customThresholds.watchdog_timeout_min || 10);

            // 5. Disparar Alertas via WebSocket se necessário
            if (alerts.length > 0) {
                this.broadcastAlerts(alerts);
            }
        } catch (error) {
            logger.error('❌ Erro no runDiagnostics:', error.message);
        }
    }

    /**
     * Verifica se os dispositivos estão enviando pulsos (Watchdog)
     */
    async checkDeviceLiveness(timeoutMinutes) {
        try {
            const { data: devices, error } = await supabase
                .from('dispositivos_acesso')
                .select('id, nome, last_push_at, status_online')
                .eq('status_online', 'online');

            if (error || !devices) return;

            const now = Date.now();
            const timeoutMs = timeoutMinutes * 60 * 1000;

            for (const device of devices) {
                if (device.last_push_at) {
                    const diff = now - new Date(device.last_push_at).getTime();
                    if (diff > timeoutMs) {
                        logger.warn(`🔦 [Watchdog] Dispositivo offline por inatividade: ${device.nome}`);
                        
                        // Atualizar para offline no banco
                        await supabase
                            .from('dispositivos_acesso')
                            .update({ status_online: 'offline' })
                            .eq('id', device.id);

                        // Alerta imediato de queda de hardware
                        webSocketService.emit('system:alert', {
                            type: 'DEVICE_OFFLINE',
                            severity: 'critical',
                            message: `Leitor desconectado ou sem sinal: ${device.nome}`,
                            details: { device_id: device.id }
                        }, 'system_admin');
                    }
                }
            }
        } catch (err) {
            logger.error('Erro no checkDeviceLiveness:', err.message);
        }
    }

    broadcastAlerts(alerts) {
        // Debounce/Cooldown por alerta para não floodar o socket
        const now = Date.now();
        if (this.lastAlertSentAt && (now - this.lastAlertSentAt < this.alertCooldown)) {
            return;
        }

        logger.warn(`🚨 [HEALTH] Disparando ${alerts.length} alertas proativos via WS`);
        
        // Emitir para a sala administrativa
        webSocketService.emit('system:alert', {
            timestamp: new Date().toISOString(),
            alerts: alerts
        }, 'system_admin');

        this.lastAlertSentAt = now;
    }
}

module.exports = new HealthService();
