const { getPgConnection } = require('../../config/pgEdge');
const { supabase } = require('../../config/supabase');
const logger = require('../../services/logger');
const auditService = require('../../services/audit.service');
const imageProcessor = require('../../utils/imageProcessor');
const EventEmitter = require('events');
require('dotenv').config();

class SyncService extends EventEmitter {  // ← EXTENDE EventEmitter
    constructor() {
        super();  // ← CHAMA O CONSTRUTOR DO EventEmitter
        this.batchSize = parseInt(process.env.SYNC_BATCH_SIZE) || 50;
        this.retryAttempts = parseInt(process.env.SYNC_RETRY_ATTEMPTS) || 3;
        this.retryDelay = parseInt(process.env.SYNC_RETRY_DELAY_SECONDS) * 1000 || 30000;
        this.maxRetryPerLog = 5;

        // Estatísticas detalhadas
        this.stats = {
            lastSync: null,
            totalSynced: 0,
            totalFailed: 0,
            pendingItems: 0,
            retryQueue: 0,
            syncHistory: []
        };

        // Cache de eventos para validação
        this.eventoCache = new Map();
        this.cacheTTL = 5 * 60 * 1000; // 5 minutos

        logger.info('🔄 SyncService inicializado com EventEmitter');
    }

    /**
     * VALIDAÇÃO DE EVENTO - Verifica se evento existe no Supabase
     */
    async validateEvento(eventoId) {
        try {
            // Verificar cache
            if (this.eventoCache.has(eventoId)) {
                const cached = this.eventoCache.get(eventoId);
                if (Date.now() - cached.timestamp < this.cacheTTL) {
                    return cached.exists;
                }
            }

            // Consultar Supabase
            const { data, error } = await supabase
                .from('eventos')
                .select('id')
                .eq('id', eventoId)
                .maybeSingle();

            const exists = !error && data !== null;

            // Atualizar cache
            this.eventoCache.set(eventoId, {
                exists,
                timestamp: Date.now()
            });

            return exists;
        } catch (error) {
            logger.error(`Erro ao validar evento ${eventoId}:`, error);
            return false;
        }
    }

    /**
     * DOWN-SYNC / OUTBOX PATTERN (Cloud -> Edge)
     * Puxa transações originadas pelo backend/cloud e garante que o Edge (MSSQL) as conheça,
     * implementando resiliência assíncrona.
     */
    async syncAccessLogsDown() {
        logger.info('📥 Iniciando download de logs (Outbox Cloud -> Edge)...');
        let connection;
        try {
            const { data: logs, error } = await supabase
                .from('logs_acesso')
                .select('*')
                .order('created_at', { ascending: false })
                .limit(100);
            
            if (error) throw error;
            if (!logs || logs.length === 0) return { downloaded: 0 };
            
            connection = await getPgConnection();
            let newInserted = 0;
            
            for (const log of logs) {
                try {
                    const result = await connection.query(`
                        INSERT INTO logs_acesso (
                            id, evento_id, pessoa_id, tipo, metodo, 
                            dispositivo_id, confianca, foto_capturada, 
                            created_at, created_by, sincronizado, sync_id
                        )
                        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, true, $11)
                        ON CONFLICT (id) DO NOTHING
                        RETURNING 1 as inserted;
                    `, [
                        log.id, log.evento_id, log.pessoa_id, log.tipo, log.metodo, 
                        log.dispositivo_id, log.confianca, log.foto_capturada, 
                        log.created_at, log.created_by, log.sync_id
                    ]);

                    if (result.rowCount > 0) {
                        newInserted++;
                    }
                } catch (innerErr) {
                    logger.debug(`Falha ao injetar log ${log.id} no Edge: ${innerErr.message}`);
                }
            }
            
            if (newInserted > 0) {
                logger.info(`✅ Outbox Down-Sync: Injetados ${newInserted} logs vindos da Cloud no Postgres local.`);
            }
            return { downloaded: newInserted };
        } catch (error) {
            logger.error('❌ Erro no Down-Sync (Outbox):', error);
            throw error;
        }
    }

    /**
     * SINCRONIZAÇÃO PRINCIPAL DE LOGS (Edge -> Cloud)
     */
    async syncAccessLogs() {
        const startTime = Date.now();
        logger.info('🔄 Iniciando sincronização de logs...');

        let connection;
        try {
            connection = await getPgConnection();

            // 1. Buscar logs pendentes (Postgres Native)
            const result = await connection.query(`
                SELECT *, count(*) OVER() as total_pendente
                FROM logs_acesso
                WHERE sincronizado = false
                ORDER BY created_at ASC
                LIMIT $1
            `, [this.batchSize]);

            const pendingLogs = result.rows || [];
            const totalPendente = result.rows[0]?.total_pendente || 0;

            this.stats.pendingItems = totalPendente;

            if (pendingLogs.length === 0) {
                logger.info('✅ Nenhum log pendente');
                return { synced: 0, pending: totalPendente };
            }

            logger.info(`📤 Processando ${pendingLogs.length} logs...`);

            const logsToSync = [];
            const failedLogIds = [];
            const invalidEventIds = [];

            // 2. Preparar logs para envio em lote
            for (const log of pendingLogs) {
                const eventoValido = await this.validateEvento(log.evento_id);

                if (!eventoValido) {
                    logger.warn(`⚠️ Evento ${log.evento_id} não encontrado no Supabase`);
                    invalidEventIds.push(log.id);
                    continue;
                }

                const logData = {
                    id: log.id,
                    evento_id: log.evento_id,
                    pessoa_id: log.pessoa_id,
                    tipo: log.tipo,
                    metodo: log.metodo || 'manual',
                    dispositivo_id: log.dispositivo_id,
                    localizacao: log.localizacao,
                    foto_capturada: log.foto_capturada,
                    confianca: log.confianca,
                    created_by: log.created_by,
                    created_at: log.created_at
                };

                // Limpar campos undefined
                Object.keys(logData).forEach(key => logData[key] === undefined && delete logData[key]);
                logsToSync.push(logData);
            }

            // 3. Upsert em lote no Supabase
            if (logsToSync.length > 0) {
                const { error } = await supabase
                    .from('logs_acesso')
                    .upsert(logsToSync, { onConflict: 'id', ignoreDuplicates: true });

                if (error) {
                    logger.error('❌ Erro no batch upsert de logs:', error.message);
                    // Em caso de erro no lote, voltamos para o modo individual para identificar o culpado
                    for (const log of logsToSync) {
                        try {
                            const { error: singleErr } = await supabase.from('logs_acesso').upsert(log, { onConflict: 'id' });
                            if (singleErr) throw singleErr;
                            syncedIds.push(log.id);
                        } catch (err) {
                            failedLogs.push({ ...log, error: err.message });
                        }
                    }
                } else {
                    logsToSync.forEach(l => syncedIds.push(l.id));
                    this.stats.totalSynced += logsToSync.length;
                }
            }

            // 4. Marcar logs sincronizados (Postgres Native)
            if (syncedIds.length > 0) {
                await connection.query(`
                    UPDATE logs_acesso 
                    SET sincronizado = true 
                    WHERE id = ANY($1)
                `, [syncedIds]);

                logger.info(`✅ ${syncedIds.length} logs sincronizados em lote`);
            }

            // 4. Tratar eventos inválidos
            if (invalidEvents.length > 0) {
                await connection.request()
                    .input('ids', sql.VarChar, invalidEvents.join(','))
                    .query(`
                        UPDATE logs_acesso 
                        SET sync_attempts = sync_attempts + 5,
                            sync_error = 'Evento não encontrado no Supabase'
                        WHERE id IN (SELECT value FROM STRING_SPLIT(@ids, ','))
                    `);
            }

            // 5. Registrar falhas
            if (failedLogs.length > 0) {
                await this.registerFailedSync(failedLogs, connection);
            }

            const duration = ((Date.now() - startTime) / 1000).toFixed(2);

            // Registrar histórico
            this.stats.syncHistory.unshift({
                timestamp: new Date(),
                duration,
                synced: syncedIds.length,
                failed: failedLogs.length,
                invalid: invalidEvents.length,
                pending: totalPendente - syncedIds.length
            });

            // Manter apenas últimos 100 registros
            if (this.stats.syncHistory.length > 100) {
                this.stats.syncHistory.pop();
            }

            this.stats.lastSync = new Date();

            // Emitir evento (AGORA FUNCIONA!)
            this.emit('sync:complete', {
                synced: syncedIds.length,
                failed: failedLogs.length,
                duration
            });

            return {
                synced: syncedIds.length,
                failed: failedLogs.length,
                invalid: invalidEvents.length,
                pending: totalPendente - syncedIds.length,
                duration: `${duration}s`,
                timestamp: this.stats.lastSync
            };

        } catch (error) {
            logger.error('❌ Erro crítico na sincronização:', error);
            this.emit('sync:error', error);  // ← EMITINDO ERRO
            throw error;
        }
    }

    /**
     * REGISTRAR FALHAS PARA RETENTATIVA
     */
    async registerFailedSync(failedLogs, connection) {
        try {
            for (const log of failedLogs) {
                // Incrementar tentativas
                await connection.query(`
                    UPDATE logs_acesso 
                    SET sync_attempts = COALESCE(sync_attempts, 0) + 1,
                        sync_error = $2,
                        updated_at = NOW()
                    WHERE id = $1
                    RETURNING sync_attempts;
                `, [log.id, log.error || 'Unknown error']);

                // Nota: sp_adicionar_retentativa seria uma tabela separada ou um log
                // No Postgres, podemos manter apenas os logs com erros na própria tabela
            }

            // Verificar tamanho da fila
            const queueResult = await connection.request()
                .query('SELECT COUNT(*) as total FROM sync_retry_queue');

            this.stats.retryQueue = queueResult.recordset[0].total;

        } catch (error) {
            logger.error('Erro ao registrar falhas:', error);
        }
    }

    /**
     * PROCESSAR FILA DE RETENTATIVAS
     */
    async processRetryQueue() {
        logger.info('🔄 Processando fila de retentativas...');

        let connection;
        try {
            connection = await getConnection();

            const result = await connection.request()
                .query(`
                    SELECT TOP 20 
                        id, log_data, attempt_count, created_at
                    FROM sync_retry_queue
                    ORDER BY attempt_count ASC, created_at ASC
                `);

            const queue = result.recordset;

            if (queue.length === 0) {
                logger.info('✅ Fila de retentativas vazia');
                return { processed: 0 };
            }

            logger.info(`📤 Processando ${queue.length} itens da fila...`);

            let processed = 0;
            for (const item of queue) {
                try {
                    const logData = JSON.parse(item.log_data);

                    const { error } = await supabase
                        .from('logs_acesso')
                        .upsert(logData, { onConflict: 'id' });

                    if (!error) {
                        await connection.request()
                            .input('log_id', sql.UniqueIdentifier, logData.id)
                            .query(`
                                DELETE FROM sync_retry_queue WHERE id = @log_id;
                                UPDATE logs_acesso 
                                SET sincronizado = 1, sync_error = NULL 
                                WHERE id = @log_id;
                            `);

                        processed++;
                        logger.debug(`✅ Retentativa bem-sucedida: ${logData.id}`);
                    } else {
                        await connection.request()
                            .input('id', sql.UniqueIdentifier, item.id)
                            .query(`
                                UPDATE sync_retry_queue 
                                SET attempt_count = attempt_count + 1,
                                    last_attempt = GETDATE()
                                WHERE id = @id
                            `);
                    }

                } catch (error) {
                    logger.error(`Erro ao processar retentativa ${item.id}:`, error);
                }

                await this.sleep(50);
            }

            logger.info(`✅ ${processed} itens recuperados da fila`);
            return { processed };

        } catch (error) {
            logger.error('❌ Erro ao processar fila:', error);
            throw error;
        }
    }

    /**
     * SINCRONIZAÇÃO DE FUNCIONÁRIOS
     */
    async syncPessoas() {
        logger.info('🔄 Sincronizando pessoas...');

        try {
            const connection = await getPgConnection();

            const result = await connection.query(`
                SELECT 
                    id, evento_id, empresa_id, nome, cpf, funcao,
                    fase_montagem, fase_showday, fase_desmontagem,
                    foto_url, face_encoding, status_acesso, qr_code,
                    ativo, 
                    created_at, updated_at
                FROM pessoas
                WHERE updated_at >= NOW() - INTERVAL '24 hours'
                    OR sincronizado_supabase = false
                ORDER BY updated_at DESC
                LIMIT 100
            `);

            const pessoas = result.rows || [];

            if (pessoas.length === 0) {
                logger.info('✅ Nenhuma pessoa para sincronizar');
                return { synced: 0 };
            }

            logger.info(`📤 Sincronizando ${pessoas.length} pessoas...`);

            const pessoasToSync = [];
            const syncedPessoaIds = [];
            let syncedCount = 0;
            let failedCount = 0;

            for (const func of pessoas) {
                const eventoValido = await this.validateEvento(func.evento_id);
                if (!eventoValido) {
                    logger.warn(`⚠️ Evento ${func.evento_id} inválido para pessoa ${func.id}`);
                    failedCount++;
                    continue;
                }

                let faceEncoding = null;
                if (func.face_encoding) {
                    try {
                        faceEncoding = typeof func.face_encoding === 'string'
                            ? JSON.parse(func.face_encoding)
                            : func.face_encoding;
                    } catch (e) {
                        logger.error(`❌ Erro ao parsear face_encoding para ${func.nome}:`, e.message);
                    }
                }

                const funcData = {
                    id: func.id,
                    evento_id: func.evento_id,
                    empresa_id: func.empresa_id,
                    nome: func.nome,
                    cpf: func.cpf,
                    funcao: func.funcao,
                    fase_montagem: Boolean(func.fase_montagem),
                    fase_showday: Boolean(func.fase_showday),
                    fase_desmontagem: Boolean(func.fase_desmontagem),
                    foto_url: func.foto_url,
                    face_encoding: faceEncoding,
                    status_acesso: func.status_acesso,
                    qr_code: func.qr_code,
                    ativo: Boolean(func.ativo),
                    updated_at: func.updated_at
                };

                pessoasToSync.push(funcData);
            }

            if (pessoasToSync.length > 0) {
                const { error } = await supabase
                    .from('pessoas')
                    .upsert(pessoasToSync, { onConflict: 'id', ignoreDuplicates: false });

                if (error) {
                    logger.error('❌ Erro no batch upsert de pessoas:', error.message);
                    // Fallback
                    for (const p of pessoasToSync) {
                        try {
                            const { error: singleErr } = await supabase.from('pessoas').upsert(p, { onConflict: 'id' });
                            if (singleErr) throw singleErr;
                            syncedCount++;
                            syncedPessoaIds.push(p.id);
                        } catch (err) {
                            failedCount++;
                        }
                    }
                } else {
                    syncedCount = pessoasToSync.length;
                    pessoasToSync.forEach(p => syncedPessoaIds.push(p.id));
                }
            }

            // 2. Marcar na borda (Postgres)
            if (syncedPessoaIds.length > 0) {
                await connection.query('UPDATE pessoas SET sincronizado_supabase = true WHERE id = ANY($1)', [syncedPessoaIds]);
                logger.info(`✅ ${syncedPessoaIds.length} pessoas sincronizadas em lote`);
            }

            return { synced: syncedCount, failed: failedCount };

        } catch (error) {
            logger.error('❌ Erro na sincronização de pessoas:', error);
            throw error;
        }
    }

    /**
     * GARANTIR COLUNAS DE CONTROLE
     */
    async ensureSyncColumns() {
        try {
            const connection = await getPgConnection();

            await connection.query(`
                DO $$ 
                BEGIN 
                    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='pessoas' AND column_name='sincronizado_supabase') THEN
                        ALTER TABLE pessoas ADD COLUMN sincronizado_supabase BOOLEAN DEFAULT false;
                    END IF;
                END $$;
            `);

            logger.info('🛡️ Colunas de sincronia validadas no Postgres Edge');
        } catch (error) {
            logger.warn('⚠️ Falha ao validar colunas (Acesso DDL restrito):', error.message);
        }
    }

    /**
     * ESTATÍSTICAS DETALHADAS
     */
    async getDetailedStats() {
        try {
            const connection = await getPgConnection();

            const result = await connection.query(`
                SELECT 
                    COUNT(*) as total_logs,
                    SUM(CASE WHEN sincronizado = false THEN 1 ELSE 0 END) as pendentes,
                    SUM(CASE WHEN sincronizado = true THEN 1 ELSE 0 END) as sincronizados,
                    AVG(CASE WHEN sincronizado = false 
                        THEN EXTRACT(EPOCH FROM (NOW() - created_at))/60 
                        ELSE NULL END) as media_minutos_pendente,
                    SUM(CASE WHEN sincronizado = false AND sync_attempts > 3 
                        THEN 1 ELSE 0 END) as logs_criticos
                FROM logs_acesso
            `);

            const queueResult = await connection.query('SELECT COUNT(*) as total FROM terminal_sync_queue WHERE status = \'pendente\'');

            return {
                ...this.stats,
                database: result.rows[0],
                retryQueue: queueResult.rows[0].total,
                lastSync: this.stats.lastSync,
                uptime: process.uptime()
            };

        } catch (error) {
            logger.error('Erro ao buscar estatísticas:', error);
            return this.stats;
        }
    }

    /**
     * SINCRONIZAÇÃO COMPLETA
     */
    async syncAll() {
        logger.info('🚀 INICIANDO SINCRONIZAÇÃO COMPLETA');

        await this.ensureSyncColumns();

        const results = {
            logsDown: null, // Outbox Pattern Fase 2
            logs: null,
            pessoas: null,
            retryQueue: null,
            timestamp: new Date()
        };

        try {
            results.retryQueue = await this.processRetryQueue();
            await this.processTerminalQueue(); // Nova fila de comandos (Fase 8)
            results.logsDown = await this.syncAccessLogsDown(); 
            results.logs = await this.syncAccessLogs();
            results.pessoas = await this.syncPessoas();

            this.emit('sync:all:complete', results);  // ← EMITINDO EVENTO

            // Auditoria de Sistema
            await auditService.log({
                evento_id: results.logs?.evento_id || '00000000-0000-0000-0000-000000000000',
                acao: 'FULL_SYNC_COMPLETED',
                recurso: 'SISTEMA',
                detalhes: { 
                    logs: results.logs?.synced, 
                    pessoas: results.pessoas?.synced,
                    duration: results.duration 
                }
            });

            this.stats.lastSync = new Date().toISOString();
            logger.info('🎉 SINCRONIZAÇÃO COMPLETA FINALIZADA');

            return results;

        } catch (error) {
            logger.error('❌ FALHA NA SINCRONIZAÇÃO COMPLETA:', error);
            this.emit('sync:all:error', error);  // ← EMITINDO ERRO
            throw error;
        }
    }

    /**
     * SLEEP
     */
    sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    /**
     * ESTATÍSTICAS
     */
    getStats() {
        return this.stats;
    }

    /**
     * ADICIONAR COMANDO À FILA DE SINCRONIZAÇÃO DO TERMINAL
     * Garante que comandos não se percam se o terminal estiver offline.
     */
    async addToTerminalQueue(dispositivoId, tipo, payload) {
        try {
            const connection = await getPgConnection();
            await connection.query(`
                INSERT INTO terminal_sync_queue (dispositivo_id, tipo_comando, payload, status, created_at)
                VALUES ($1, $2, $3, 'pendente', NOW())
            `, [dispositivoId, tipo, JSON.stringify(payload)]);
            logger.info(`📝 [SyncQueue] Comando ${tipo} agendado para dispositivo ${dispositivoId}`);
        } catch (error) {
            logger.error(`❌ Erro ao enfileirar comando para terminal: ${error.message}`);
        }
    }

    /**
     * PROCESSAR FILA DE COMANDOS DOS TERMINAIS
     */
    async processTerminalQueue() {
        try {
            const connection = await getConnection();
            const { recordset: queue } = await connection.request()
                .query(`
                    SELECT TOP 10 q.*, d.ip_address, d.username, d.password, d.nome as device_name, d.config
                    FROM terminal_sync_queue q
                    JOIN dispositivos_acesso d ON q.dispositivo_id = d.id
                    WHERE q.status IN ('pendente', 'erro') AND q.attempt_count < 5
                    ORDER BY q.created_at ASC
                `);

            if (!queue || queue.length === 0) return;

            const DeviceFactory = require('./adapters/DeviceFactory');

            for (const item of queue) {
                try {
                    const terminal = { 
                        id: item.dispositivo_id, 
                        ip_address: item.ip_address, 
                        username: item.username, 
                        password: item.password,
                        config: item.config 
                    };
                    const service = DeviceFactory.getDevice(terminal);
                    const payload = JSON.parse(item.payload);

                    logger.info(`🔄 [SyncQueue] Tentando ${item.tipo_comando} no terminal ${item.device_name}...`);

                    if (item.tipo_comando === 'enroll_face') {
                        // Otimizar imagem para o hardware antes do envio
                        const optimizedPhoto = await imageProcessor.optimizeToBase64(payload.fotoBase64);
                        await service.enrollUser(payload.pessoa, optimizedPhoto);
                    } else if (item.tipo_comando === 'delete_face') {
                        await service.deleteUser(payload.hwUserId);
                    }

                    // Sucesso
                    await connection.query("UPDATE terminal_sync_queue SET status = 'sucesso', updated_at = NOW() WHERE id = $1", [item.id]);
                    
                    logger.info(`✅ [SyncQueue] ${item.tipo_comando} executado com sucesso em ${item.device_name}`);

                } catch (err) {
                    await connection.query(`
                        UPDATE terminal_sync_queue 
                        SET status = 'erro', 
                            attempt_count = attempt_count + 1, 
                            error_message = $2, 
                            last_attempt = NOW() 
                        WHERE id = $1
                    `, [item.id, err.message]);
                    logger.warn(`⚠️ [SyncQueue] Falha ao processar item ${item.id}: ${err.message}`);
                }
            }
        } catch (error) {
            logger.error(`❌ Erro no processamento da fila de terminais: ${error.message}`);
        }
    }

    /**
     * SINCRONIZAR USUÁRIO ESPECÍFICO PARA TODOS OS TERMINAIS ATIVOS
     * Melhorado: Agora enfileira se o terminal estiver offline.
     */
    async syncUserToAllDevices(pessoa) {
        try {
            logger.info(`🔄 Auto-Sync: Processando ${pessoa.nome} para terminais...`);

            const { data: terminais } = await supabase
                .from('dispositivos_acesso')
                .select('*')
                .eq('evento_id', pessoa.evento_id)
                .eq('tipo', 'terminal_facial');

            if (!terminais || terminais.length === 0) return;

            const DeviceFactory = require('./adapters/DeviceFactory');

            for (const terminal of terminais) {
                // Se offline, direto pra fila
                if (terminal.status_online !== 'online') {
                    await this.addToTerminalQueue(terminal.id, 'enroll_face', { pessoa, fotoBase64: pessoa.foto_base64_cache || pessoa.foto_base64_internal });
                    continue;
                }

                const service = DeviceFactory.getDevice(terminal);
                let fotoBase64 = pessoa.foto_base64_cache || pessoa.foto_base64_internal;

                // Tentar envio imediato
                try {
                    // Otimizar imagem para o hardware antes do envio imediato
                    const optimizedPhoto = await imageProcessor.optimizeToBase64(fotoBase64);
                    await service.enrollUser(pessoa, optimizedPhoto);
                    logger.info(`✅ Sync Imediato: ${pessoa.nome} -> ${terminal.nome}`);
                } catch (err) {
                    // Erro no envio imediato -> Enfileira
                    logger.warn(`⚠️ Erro no sync imediato para ${terminal.nome}. Enfileirando...`);
                    await this.addToTerminalQueue(terminal.id, 'enroll_face', { pessoa, fotoBase64 });
                }
            }
        } catch (error) {
            logger.error('Erro no Auto-Sync:', error);
        }
    }

    /**
     * DELETAR USUÁRIO ESPECÍFICO DE TODOS OS TERMINAIS ATIVOS
     * Chamado quando um funcionário é bloqueado ou excluído.
     */
    async deleteUserFromAllDevices(pessoaId, eventoId) {
        try {
            logger.info(`🗑️ Auto-Delete: Removendo usuário ${pessoaId} dos terminais...`);

            const { data: terminais, error } = await supabase
                .from('dispositivos_acesso')
                .select('*')
                .eq('evento_id', eventoId)
                .eq('tipo', 'terminal_facial')
                .eq('status_online', 'online');

            if (error || !terminais || terminais.length === 0) {
                logger.warn('⚠️ Nenhum terminal online para deletar usuário.');
                return;
            }

            const DeviceFactory = require('./adapters/DeviceFactory');

            const hwUserId = pessoaId.includes('-') ? pessoaId.split('-')[0] : pessoaId;

            const results = await Promise.allSettled(terminais.map(async (terminal) => {
                const service = DeviceFactory.getDevice(terminal);

                await service.deleteUser(hwUserId);
                return terminal.nome;
            }));

            const success = results.filter(r => r.status === 'fulfilled').map(r => r.value);
            const failures = results.filter(r => r.status === 'rejected').map(r => r.reason.message);

            logger.info(`✅ Auto-Delete Finalizado: ${success.length} sucessos, ${failures.length} falhas.`);
            return { success, failures };

        } catch (error) {
            logger.error('Erro no Auto-Delete de usuário:', error);
        }
    }

    /**
     * NIGHTLY SMART SYNC (Executado pelo Scheduler toda madrugada)
     * Busca quem está autorizado para o evento de hoje e descarrega as faces
     * de quem perdeu o direito de acesso hoje, enquanto envia quem ganhou as credenciais.
     */
    async runDailyAccessSync() {
        try {
            logger.info('🌙 [Nightly Sync] Iniciando sincronização inteligente diária de catracas...');
            const startTime = Date.now();

            // 1. Obter a data local de hoje (America/Sao_Paulo)
            const nowSp = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Sao_Paulo' }));
            const year = nowSp.getFullYear();
            const month = String(nowSp.getMonth() + 1).padStart(2, '0');
            const day = String(nowSp.getDate()).padStart(2, '0');
            const hojeLiteral = `${year}-${month}-${day}`;

            logger.info(`📅 Referência de data atual (Local SP): ${hojeLiteral}`);

            // 2. Buscar eventos que estão ativos e possuem terminais faciais
            const { data: terminais, error: errTerminais } = await supabase
                .from('dispositivos_acesso')
                .select('evento_id')
                .eq('tipo', 'terminal_facial')
                .eq('status_online', 'online');

            if (errTerminais || !terminais || terminais.length === 0) {
                logger.warn('⚠️ [Nightly Sync] Nenhum terminal facial online / configurado.');
                return;
            }

            // Agrupar terminais por evento_id
            const eventosComTerminais = [...new Set(terminais.map(t => t.evento_id))];
            
            let totalRemovidos = 0;
            let totalSincronizados = 0;

            // 3. Iterar cada evento
            for (const eventoId of eventosComTerminais) {
                const { data: evento } = await supabase.from('eventos').select('*').eq('id', eventoId).single();
                if (!evento) continue;

                const datasMontagem = Array.isArray(evento.datas_montagem) ? evento.datas_montagem : [];
                const datasEvento = Array.isArray(evento.datas_evento) ? evento.datas_evento : [];
                const datasDesmontagem = Array.isArray(evento.datas_desmontagem) ? evento.datas_desmontagem : [];

                const isMontagem = datasMontagem.includes(hojeLiteral);
                const isShowday = datasEvento.includes(hojeLiteral);
                const isDesmontagem = datasDesmontagem.includes(hojeLiteral);

                if (!isMontagem && !isShowday && !isDesmontagem) {
                    logger.info(`⏸️ [Nightly Sync] Hoje (${hojeLiteral}) não é data ativa para o evento ${evento.id}`);
                    continue; 
                }

                logger.info(`🚀 Processando Evento ${eventoId} - Montagem: ${isMontagem}, ShowDay: ${isShowday}, Desmontagem: ${isDesmontagem}`);

                // Buscar pessoas (Somente não deletados logicamente)
                const { data: pessoas, error: errPessoas } = await supabase
                    .from('pessoas')
                    .select('*')
                    .eq('evento_id', eventoId)
                    .neq('ativo', false);

                if (errPessoas || !pessoas) continue;

                // 4. Analisar cada pessoa e verificar acessos
                for (const pessoa of pessoas) {
                    let acessoPermitidoHoje = false;
                    const isAtivo = ['autorizado', 'checkin_feito', 'checkout_feito'].includes(pessoa.status_acesso);
                    
                    if (isAtivo) {
                        // Relacionar com as fases globais
                        let fasePermitida = false;
                        if (isMontagem && pessoa.fase_montagem) fasePermitida = true;
                        if (isShowday && pessoa.fase_showday) fasePermitida = true;
                        if (isDesmontagem && pessoa.fase_desmontagem) fasePermitida = true;

                        // Relacionar com os dias específicos (se array preenchido)
                        let diasTrabalhoPermitidos = true;
                        let diasTrabalho = pessoa.dias_trabalho;
                        
                        if (typeof diasTrabalho === 'string') {
                            try { diasTrabalho = JSON.parse(diasTrabalho); } catch(e) { diasTrabalho = []; }
                        }

                        if (Array.isArray(diasTrabalho) && diasTrabalho.length > 0) {
                            diasTrabalhoPermitidos = diasTrabalho.includes(hojeLiteral);
                        }

                        // Conceder sinal verde apenas se cumpriu ambos os bloqueios de tempo
                        if (fasePermitida && diasTrabalhoPermitidos) {
                            acessoPermitidoHoje = true;
                        }
                    }

                    // 5. Acionar Apagamento explícito ou Inserção
                    if (!acessoPermitidoHoje) {
                        // SALVAGUARDA DE MADRUGADA (Overnight Shift Protection)
                        // Se a pessoa não tem permissão hoje, mas o status dela é 'checkin_feito', 
                        // significa que ela entrou ontem e ainda não saiu (virou a noite trabalhando).
                        // Não podemos apagar a face dela, senão a catraca não abrirá pra ela sair (checkout).
                        if (pessoa.status_acesso === 'checkin_feito') {
                            logger.warn(`🛡️ [Nightly Sync] Ignorando exclusão de ${pessoa.nome}. (Sem permissão hoje, mas está PRESENTE no evento - Virou a noite).`);
                            continue;
                        }

                        logger.debug(`[Nightly Sync] Limpando acesso expirado/inativo: ${pessoa.nome}`);
                        await this.deleteUserFromAllDevices(pessoa.id, eventoId);
                        totalRemovidos++;
                    } else {
                        // Se for autorizada hoje, tem validação para sincronizar face
                        if (pessoa.foto_url || pessoa.foto_base64_cache || pessoa.foto_base64_internal) {
                           logger.debug(`[Nightly Sync] Renovando acesso válido de hoje: ${pessoa.nome}`);
                           await this.syncUserToAllDevices(pessoa);
                           totalSincronizados++;
                        }
                    }
                    
                    await this.sleep(100);
                }
            }

            const duration = ((Date.now() - startTime) / 1000).toFixed(2);
            logger.info(`✅ [Nightly Sync] Finalizado em ${duration}s! Total Liberados (Hoje): ${totalSincronizados} | Limpos (Removidos): ${totalRemovidos}`);

        } catch (error) {
            logger.error('❌ [Nightly Sync] Erro crítico na rotina de madrugada:', error);
        }
    }
}

module.exports = new SyncService();