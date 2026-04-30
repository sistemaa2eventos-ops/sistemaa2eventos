const express = require('express');
const router = express.Router();
const syncService = require('./sync.service');
const syncScheduler = require('./syncScheduler.service');
const logger = require('../../services/logger');
const { authenticate, authorize, validateInternalApiKey } = require('../../middleware/auth');

/**
 * @route   POST /api/sync/run
 * @route   POST /api/sync/force
 * @desc    Executa sincronização manual
 * @access  Admin
 */
router.post(['/run', '/force'], authenticate, authorize('admin'), async (req, res) => {
    const startTime = Date.now();

    try {
        logger.info(`👤 Sincronização manual solicitada por: ${req.user.email}`);

        const result = await syncScheduler.runManualSync();

        const duration = ((Date.now() - startTime) / 1000).toFixed(2);

        res.json({
            success: true,
            message: 'Sincronização concluída',
            duration: `${duration}s`,
            data: result
        });

    } catch (error) {
        logger.error('❌ Erro na sincronização manual:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

/**
 * @route   POST /api/sync/edge
 * @desc    Força varredura imediata nas catracas físicas (remove faces fora da agenda de hoje)
 * @access  Admin
 */
router.post('/edge', authenticate, authorize('admin'), async (req, res) => {
    try {
        logger.info(`🛡️ Varredura de Borda (Edge Sync) manual solicitada por: ${req.user.email}`);
        await syncService.runDailyAccessSync();
        res.json({ success: true, message: 'Varredura de Borda concluída. Faces fora da agenda de hoje foram removidas das catracas.' });
    } catch (error) {
        logger.error('❌ Erro na varredura de borda:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * @route   GET /api/sync/status
 * @desc    Status completo do sistema
 * @access  Admin, Supervisor
 */
router.get('/status', authenticate, authorize('admin', 'supervisor'), async (req, res) => {
    try {
        const status = await syncScheduler.getStatus();

        res.json({
            success: true,
            timestamp: new Date(),
            data: status
        });

    } catch (error) {
        logger.error('Erro ao obter status:', error);
        res.status(500).json({ error: error.message });
    }
});

/**
 * @route   GET /api/sync/pending
 * @desc    Verifica logs pendentes
 * @access  Admin, Supervisor
 */
router.get('/pending', authenticate, authorize('admin', 'supervisor'), async (req, res) => {
    try {
        const { getConnection } = require('../../config/database');
        const connection = await getConnection();

        const result = await connection.request()
            .query(`
                SELECT 
                    COUNT(*) as total,
                    MIN(created_at) as mais_antigo,
                    MAX(created_at) as mais_recente,
                    COUNT(DISTINCT evento_id) as eventos,
                    COUNT(DISTINCT pessoa_id) as pessoas
                FROM logs_acesso 
                WHERE sincronizado = 0
            `);

        const queueResult = await connection.request()
            .query('SELECT COUNT(*) as total FROM sync_retry_queue');

        res.json({
            success: true,
            pending: {
                logs: result.recordset[0].total,
                mais_antigo: result.recordset[0].mais_antigo,
                mais_recente: result.recordset[0].mais_recente,
                eventos: result.recordset[0].eventos,
                pessoas: result.recordset[0].pessoas
            },
            retryQueue: queueResult.recordset[0].total
        });

    } catch (error) {
        logger.error('Erro ao verificar pendentes:', error);
        res.status(500).json({ error: error.message });
    }
});

/**
 * @route   POST /api/sync/logs/batch
 * @desc    Endpoint para microsserviço facial enviar logs
 * @access  Internal (API Key)
 */
router.post('/logs/batch', validateInternalApiKey, async (req, res) => {
    try {
        const logs = req.body.logs;

        if (!logs || !Array.isArray(logs)) {
            return res.status(400).json({ error: 'Formato inválido' });
        }

        if (logs.length === 0) {
            return res.json({ success: true, received: 0 });
        }

        logger.info(`📥 Recebendo ${logs.length} logs do microsserviço facial`);

        const { getConnection, sql } = require('../../config/database');
        const connection = await getConnection();

        let saved = 0;
        const errors = [];

        for (const log of logs) {
            try {
                // Validar dados mínimos
                if (!log.evento_id || !log.pessoa_id) {
                    errors.push({ log, error: 'evento_id e pessoa_id obrigatórios' });
                    continue;
                }

                await connection.request()
                    .input('id', sql.UniqueIdentifier, log.id || sql.newid())
                    .input('evento_id', sql.UniqueIdentifier, log.evento_id)
                    .input('pessoa_id', sql.UniqueIdentifier, log.pessoa_id)
                    .input('tipo', sql.VarChar, log.tipo || 'checkin')
                    .input('metodo', sql.VarChar, log.metodo || 'face')
                    .input('dispositivo_id', sql.VarChar, log.dispositivo_id || 'facial-camera')
                    .input('confianca', sql.Decimal(5, 2), log.confianca || null)
                    .input('foto_capturada', sql.Text, log.foto_capturada || null)
                    .query(`
                        INSERT INTO logs_acesso 
                        (id, evento_id, pessoa_id, tipo, metodo, 
                         dispositivo_id, confianca, foto_capturada, created_at, sincronizado)
                        VALUES 
                        (@id, @evento_id, @pessoa_id, @tipo, @metodo,
                         @dispositivo_id, @confianca, @foto_capturada, GETDATE(), 0)
                    `);

                saved++;

            } catch (error) {
                logger.error(`Erro ao salvar log: ${error.message}`);
                errors.push({ log_id: log.id, error: error.message });
            }
        }

        logger.info(`✅ ${saved}/${logs.length} logs salvos no SQL Server`);

        res.json({
            success: true,
            received: logs.length,
            saved,
            errors: errors.length > 0 ? errors : undefined
        });

    } catch (error) {
        logger.error('❌ Erro ao receber logs do microsserviço:', error);
        res.status(500).json({ error: error.message });
    }
});

/**
 * @route   POST /api/sync/retry/failed
 * @desc    Força retentativa de logs com falha
 * @access  Admin
 */
router.post('/retry/failed', authenticate, authorize('admin'), async (req, res) => {
    try {
        const result = await syncService.processRetryQueue();

        res.json({
            success: true,
            message: 'Retentativas processadas',
            data: result
        });

    } catch (error) {
        logger.error('Erro ao processar retentativas:', error);
        res.status(500).json({ error: error.message });
    }
});

/**
 * @route   GET /api/sync/stats/detailed
 * @desc    Estatísticas detalhadas de sincronização
 * @access  Admin
 */
router.get('/stats/detailed', authenticate, authorize('admin'), async (req, res) => {
    try {
        const stats = await syncService.getDetailedStats();

        res.json({
            success: true,
            timestamp: new Date(),
            data: stats
        });

    } catch (error) {
        logger.error('Erro ao obter estatísticas:', error);
        res.status(500).json({ error: error.message });
    }
});

/**
 * @route   POST /api/sync/configure
 * @desc    Configurar parâmetros de sincronização
 * @access  Admin
 */
router.post('/configure', authenticate, authorize('admin'), async (req, res) => {
    try {
        const { interval, batchSize, retryAttempts } = req.body;

        // Validar
        if (interval && (interval < 1 || interval > 60)) {
            return res.status(400).json({ error: 'Intervalo deve ser entre 1 e 60 minutos' });
        }

        if (batchSize && (batchSize < 10 || batchSize > 500)) {
            return res.status(400).json({ error: 'Batch size deve ser entre 10 e 500' });
        }

        // Atualizar (em memória - em produção, salvar no banco)
        if (interval) {
            process.env.SYNC_INTERVAL_MINUTES = interval;
            logger.info(`⚙️ Intervalo de sincronização alterado para ${interval} minutos`);
        }

        if (batchSize) {
            process.env.SYNC_BATCH_SIZE = batchSize;
            syncService.batchSize = batchSize;
            logger.info(`⚙️ Batch size alterado para ${batchSize}`);
        }

        if (retryAttempts) {
            process.env.SYNC_RETRY_ATTEMPTS = retryAttempts;
            syncService.retryAttempts = retryAttempts;
            logger.info(`⚙️ Tentativas de retry alteradas para ${retryAttempts}`);
        }

        res.json({
            success: true,
            message: 'Configurações atualizadas',
            current: {
                interval: process.env.SYNC_INTERVAL_MINUTES,
                batchSize: process.env.SYNC_BATCH_SIZE,
                retryAttempts: process.env.SYNC_RETRY_ATTEMPTS
            }
        });

    } catch (error) {
        logger.error('Erro ao configurar:', error);
        res.status(500).json({ error: error.message });
    }
});

module.exports = router;