const cron = require('node-cron');
const syncService = require('./sync.service');
const logger = require('../../services/logger');
const os = require('os');
require('dotenv').config();

class SyncScheduler {
    constructor() {
        this.isRunning = false;
        this.syncInterval = parseInt(process.env.SYNC_INTERVAL_MINUTES) || 5;
        this.healthChecks = {
            lastSuccess: null,
            failures: 0,
            consecutiveFailures: 0
        };

        // Bind listeners
        this.setupEventListeners();
    }

    setupEventListeners() {
        syncService.on('sync:complete', (data) => {
            this.healthChecks.lastSuccess = new Date();
            this.healthChecks.consecutiveFailures = 0;

            if (data.failed > 0) {
                logger.warn(`⚠️ Sincronização com ${data.failed} falhas`);
            }
        });

        syncService.on('sync:all:error', () => {
            this.healthChecks.consecutiveFailures++;
            this.healthChecks.failures++;
        });
    }

    /**
     * VERIFICA CONEXÃO COM INTERNET
     */
    async checkInternetConnection() {
        const controllers = [
            async () => {
                const { supabase } = require('../../config/supabase');
                const start = Date.now();
                const { error } = await supabase.from('eventos').select('*', { count: 'exact', head: true });
                const latency = Date.now() - start;
                return { online: !error, latency };
            },
            async () => {
                // Fallback: ping no Google DNS
                const dns = require('dns').promises;
                try {
                    const start = Date.now();
                    await dns.lookup('google.com');
                    const latency = Date.now() - start;
                    return { online: true, latency };
                } catch {
                    return { online: false, latency: 0 };
                }
            }
        ];

        for (const controller of controllers) {
            try {
                const result = await controller();
                if (result.online) {
                    return result;
                }
            } catch {
                continue;
            }
        }

        return { online: false, latency: 0 };
    }

    /**
     * VERIFICA SAÚDE DO SISTEMA
     */
    async checkSystemHealth() {
        const checks = {
            timestamp: new Date(),
            online: false,
            sqlServer: false,
            supabase: false,
            memory: null,
            latency: 0
        };

        try {
            // 1. Verificar internet
            const internet = await this.checkInternetConnection();
            checks.online = internet.online;
            checks.latency = internet.latency;

            // 2. Verificar PostgreSQL Edge
            const { testPgConnection } = require('../../config/pgEdge');
            checks.sqlServer = await testPgConnection();

            // 3. Verificar Supabase
            const { supabase } = require('../../config/supabase');
            const { error } = await supabase.from('eventos').select('*', { count: 'exact', head: true });
            checks.supabase = !error;

            // 4. Memória
            checks.memory = {
                free: os.freemem(),
                total: os.totalmem(),
                usage: ((os.totalmem() - os.freemem()) / os.totalmem() * 100).toFixed(2) + '%'
            };

            // 5. Status da fila
            checks.pendingLogs = syncService.getStats().pendingItems;
            checks.retryQueue = syncService.getStats().retryQueue;

        } catch (error) {
            logger.error('Erro no health check:', error);
        }

        return checks;
    }

    /**
     * INICIAR AGENDADOR (REDUZIDO NA FASE 2)
     */
    start() {
        logger.info('⏰ ========================================');
        logger.info(`⏰ SYNC SCHEDULER: Polling Relacional Desativado.`);
        logger.info(`⏰ Cloud Sync Worker (Redis Streams) assumiu a Nuvem!`);
        logger.info('⏰ ========================================');

        // ===========================================
        // NIGHTLY SMART SYNC (Limpeza e Carga de Borda)
        // Executa todo dia à 01h da Manhã.
        // ===========================================
        cron.schedule('0 1 * * *', async () => {
            logger.info('⏰ Disparando cron de madrugada (Nightly Smart Sync) às 01:00 AM');
            try {
                const health = await this.checkSystemHealth();
                if (health.online && health.supabase) {
                    await syncService.runDailyAccessSync();
                } else {
                    logger.warn('⚠️ Nightly Sync falhou ao iniciar por falta de conexão com Supabase ou Internet.');
                }
            } catch (error) {
                logger.error('❌ Erro crítico no agendador do Nightly Sync:', error);
            }
        });

        // Health check de dispositivos a cada 5 minutos
        cron.schedule('*/5 * * * *', async () => {
            try {
                if (!this.isRunning) {
                    const deviceHealthCheck = require('./deviceHealthCheck.service');
                    await deviceHealthCheck.checkAllDevices();
                }
            } catch (error) {
                logger.error('[Scheduler] Erro no health check de dispositivos:', error);
            }
        });

        // Processar fila de sync dos terminais a cada 60 segundos
        cron.schedule('* * * * *', async () => {
            try {
                if (!this.isRunning) {
                    await syncService.processTerminalQueue();
                }
            } catch (error) {
                logger.error('[Scheduler] Erro no processamento da fila de terminais:', error);
            }
        });

        // Health check de sistema a cada 30 segundos
        cron.schedule('*/30 * * * * *', async () => {
            if (!this.isRunning) {
                const health = await this.checkSystemHealth();
                // Log silencioso - só mostra se estiver degradado
                if (!health.online || !health.supabase || !health.sqlServer) {
                    logger.warn('🏥 Health check: Sistema DEGRADADO', {
                        online: health.online,
                        sql: health.sqlServer,
                        supabase: health.supabase
                    });
                }
            }
        });

        // Executar primeira sincronização após 10 segundos
        setTimeout(async () => {
            logger.info('🚀 Executando primeira sincronização...');
            try {
                await this.runManualSync();
            } catch (error) {
                logger.error('❌ Falha na primeira sincronização:', error);
            }
        }, 10000);
    }

    /**
     * EXECUTAR SINCRONIZAÇÃO MANUAL
     */
    async runManualSync() {
        if (this.isRunning) {
            throw new Error('Sincronização já em andamento');
        }

        this.isRunning = true;
        const startTime = Date.now();

        try {
            logger.info('👤 SINCRONIZAÇÃO MANUAL INICIADA');

            const result = await syncService.syncAll();

            const duration = ((Date.now() - startTime) / 1000).toFixed(2);

            logger.info(`✅ SINCRONIZAÇÃO MANUAL CONCLUÍDA em ${duration}s`);

            return {
                ...result,
                duration: `${duration}s`
            };

        } finally {
            this.isRunning = false;
        }
    }

    /**
     * PRÓXIMA EXECUÇÃO
     */
    getNextExecution() {
        const now = new Date();
        const next = new Date(now);
        next.setMinutes(now.getMinutes() + (this.syncInterval - (now.getMinutes() % this.syncInterval)));
        next.setSeconds(0);
        next.setMilliseconds(0);

        return next.toLocaleString('pt-BR');
    }

    /**
     * STATUS COMPLETO
     */
    async getStatus() {
        const health = await this.checkSystemHealth();
        const stats = syncService.getStats();

        return {
            scheduler: {
                isRunning: this.isRunning,
                interval: this.syncInterval,
                nextExecution: this.getNextExecution(),
                health: this.healthChecks
            },
            system: health,
            stats: stats,
            memory: process.memoryUsage(),
            uptime: process.uptime()
        };
    }
}

module.exports = new SyncScheduler();