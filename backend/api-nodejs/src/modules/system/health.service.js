const logger = require('../../services/logger');
const syncService = require('../devices/sync.service');
const webSocketService = require('../../services/websocketService');
const { supabase } = require('../../config/supabase');
const { testPgConnection, edgeAtivo } = require('../../config/pgEdge');

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
            // 0. Carregar apenas o campo leve sync_delay_threshold_min (sem puxar eventos.config inteiro,
            //    que chegava a 504 KB por minuto e gerava ~26 GB/mês de Database Egress!) e somente se o Edge local estiver ativo.
            let syncDelayThreshold = this.thresholds.maxSyncDelayMinutes;
            if (edgeAtivo()) {
                if (!this._thresholdCache || Date.now() > this._thresholdCache.expiresAt) {
                    const { data: activeEvent } = await supabase
                        .from('eventos')
                        .select('sync_delay_threshold_min:config->sync_delay_threshold_min')
                        .eq('status', 'ativo')
                        .order('updated_at', { ascending: false })
                        .limit(1)
                        .maybeSingle();
                    const val = Number(activeEvent?.sync_delay_threshold_min);
                    this._thresholdCache = {
                        val: Number.isFinite(val) && val > 0 ? val : this.thresholds.maxSyncDelayMinutes,
                        expiresAt: Date.now() + 10 * 60 * 1000
                    };
                }
                syncDelayThreshold = this._thresholdCache.val;
            }

            const thresholds = {
                maxSyncDelayMinutes: syncDelayThreshold,
                maxPendingItems: this.thresholds.maxPendingItems,
                maxLatencyMs: this.thresholds.maxLatencyMs
            };

            const stats = syncService.getStats();
            const alerts = [];

            // 1. Verificar Sincronia (só existe com o banco local Edge ativo)
            if (edgeAtivo() && stats.lastSync) {
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

            if (edgeAtivo() && stats.pendingItems > thresholds.maxPendingItems) {
                alerts.push({
                    type: 'SYNC_BACKLOG',
                    severity: 'warning',
                    message: `Fila de sincronização congestionada: ${stats.pendingItems} itens pendentes.`,
                    value: stats.pendingItems
                });
            }

            // 2. Verificar Conectividade Cloud (HEAD leve sem agregação count(*))
            try {
                const start = Date.now();
                const { error } = await supabase.from('eventos').select('id', { head: true }).limit(1);
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
            const isPgOk = await testPgConnection(); // null = Edge desativado
            if (isPgOk === false) {
                alerts.push({
                    type: 'EDGE_OFFLINE',
                    severity: 'critical',
                    message: 'Banco de dados local (Postgres Edge) inacessível!'
                });
            }

            // 4. Status dos leitores: fica só com o deviceHealthCheck (keepalive → agente → TCP).
            //    O watchdog daqui usava outra regra e ping TCP direto, que falha na VPS com leitores
            //    atrás do agente local — o leitor "piscava" entre offline e online.

            // 5. Disparar Alertas via WebSocket se necessário
            if (alerts.length > 0) {
                this.broadcastAlerts(alerts);
            }
        } catch (error) {
            logger.error('❌ Erro no runDiagnostics:', error.message);
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
