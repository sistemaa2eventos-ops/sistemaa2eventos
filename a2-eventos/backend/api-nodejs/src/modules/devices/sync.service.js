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

            // 3. Upsert inteligente com verificação de Race Condition (D-01)
            const syncedIds = [];
            const failedLogs = [];

            if (logsToSync.length > 0) {
                for (const logData of logsToSync) {
                    try {
                        // Verificar se já existe um log idêntico nos últimos 10 segundos
                        // Evita duplicidade se 2 catracas sincronizarem o mesmo evento/pessoa simultaneamente
                        const { data: recent } = await supabase
                            .from('logs_acesso')
                            .select('id')
                            .eq('pessoa_id', logData.pessoa_id)
                            .eq('tipo', logData.tipo)
                            .eq('evento_id', logData.evento_id)
                            .gte('created_at', new Date(new Date(logData.created_at).getTime() - 10000).toISOString())
                            .limit(1);

                        if (recent && recent.length > 0) {
                            logger.warn(`🛑 [Sync] Race Condition Detectada para Pessoa ${logData.pessoa_id}. Ignorando log duplicado.`);
                            syncedIds.push(logData.id); // Marcar como sincronizado para não tentar de novo
                            continue;
                        }

                        const { error } = await supabase.from('logs_acesso').upsert(logData, { onConflict: 'id', ignoreDuplicates: true });
                        if (error) throw error;
                        
                        syncedIds.push(logData.id);
                        this.stats.totalSynced++;
                    } catch (err) {
                        logger.error(`❌ Erro ao sincronizar log ${logData.id}:`, err.message);
                        failedLogs.push({ ...logData, error: err.message });
                    }
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
            if (invalidEventIds.length > 0) {
                await connection.query(`
                    UPDATE logs_acesso
                    SET sync_attempts = COALESCE(sync_attempts, 0) + 5,
                        sync_error = 'Evento não encontrado no Supabase'
                    WHERE id = ANY($1)
                `, [invalidEventIds]);
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
                invalid: invalidEventIds.length,
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
                invalid: invalidEventIds.length,
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
            }

            logger.debug(`Registradas ${failedLogs.length} falhas de sincronização`);

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
            connection = await getPgConnection();

            // Buscar logs pendentes com muitas tentativas (retry)
            const result = await connection.query(`
                SELECT *
                FROM logs_acesso
                WHERE sync_attempts > 0 AND sync_attempts < 10
                ORDER BY sync_attempts ASC, updated_at ASC
                LIMIT 20
            `);

            const queue = result.rows;

            if (queue.length === 0) {
                logger.info('✅ Fila de retentativas vazia');
                return { processed: 0 };
            }

            logger.info(`📤 Processando ${queue.length} itens da fila de retentativas...`);

            let processed = 0;
            for (const log of queue) {
                try {
                    const logData = {
                        id: log.id,
                        evento_id: log.evento_id,
                        pessoa_id: log.pessoa_id,
                        tipo: log.tipo,
                        metodo: log.metodo,
                        dispositivo_id: log.dispositivo_id,
                        confianca: log.confianca,
                        created_at: log.created_at,
                        created_by: log.created_by,
                        localizacao: log.localizacao,
                        foto_capturada: log.foto_capturada
                    };

                    const { error } = await supabase
                        .from('logs_acesso')
                        .upsert(logData, { onConflict: 'id' });

                    if (!error) {
                        // Sucesso — marcar como sincronizado
                        await connection.query(
                            'UPDATE logs_acesso SET sincronizado = true, sync_error = NULL WHERE id = $1',
                            [log.id]
                        );

                        processed++;
                        logger.debug(`✅ Retentativa bem-sucedida: ${log.id}`);
                    } else {
                        // Falha — incrementar tentativas
                        await connection.query(
                            'UPDATE logs_acesso SET sync_attempts = sync_attempts + 1, updated_at = NOW() WHERE id = $1',
                            [log.id]
                        );
                        logger.warn(`⚠️ Retentativa falhou para ${log.id}: ${error.message}`);
                    }

                } catch (error) {
                    logger.error(`Erro ao processar retentativa ${log.id}:`, error);
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
                evento_id: '00000000-0000-0000-0000-000000000000', // Sistema-wide sync
                acao: 'FULL_SYNC_COMPLETED',
                recurso: 'SISTEMA',
                detalhes: {
                    logsSync: results.logs?.synced || 0,
                    logsFailed: results.logs?.failed || 0,
                    pessoasSync: results.pessoas?.synced || 0,
                    terminals: results.terminals || 0
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

            // Buscar evento_id do dispositivo (necessário pois é NOT NULL na tabela)
            const devResult = await connection.query(
                'SELECT evento_id FROM dispositivos_acesso WHERE id = $1 LIMIT 1',
                [dispositivoId]
            );

            const eventoId = devResult.rows[0]?.evento_id;
            if (!eventoId) {
                logger.warn(`[SyncQueue] Dispositivo ${dispositivoId} não encontrado ou sem evento_id. Comando ${tipo} descartado.`);
                return;
            }

            await connection.query(`
                INSERT INTO terminal_sync_queue (evento_id, dispositivo_id, tipo_comando, payload, status, created_at)
                VALUES ($1, $2, $3, $4, 'pendente', NOW())
            `, [eventoId, dispositivoId, tipo, JSON.stringify(payload)]);

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
            const connection = await getPgConnection();

            // Buscar fila pendente de sync para terminais online
            const result = await connection.query(`
                SELECT
                    q.id, q.dispositivo_id, q.tipo_comando, q.pessoa_id, q.payload,
                    q.status, q.attempt_count, q.created_at,
                    d.ip_address, d.user_device, d.password_device, d.marca, d.nome as device_name, d.config
                FROM terminal_sync_queue q
                JOIN dispositivos_acesso d ON q.dispositivo_id = d.id
                WHERE q.status IN ('pendente', 'erro')
                  AND q.attempt_count < 5
                  AND d.status_online = 'online'
                ORDER BY q.created_at ASC
                LIMIT 10
            `);

            const queue = result.rows;

            if (!queue || queue.length === 0) {
                return { processed: 0 };
            }

            logger.info(`📤 [SyncQueue] Processando ${queue.length} itens da fila...`);

            const DeviceFactory = require('./adapters/DeviceFactory');
            let processed = 0;

            for (const item of queue) {
                try {
                    const terminal = {
                        id: item.dispositivo_id,
                        ip_address: item.ip_address,
                        user_device: item.user_device,
                        password_device: item.password_device,
                        marca: item.marca,
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
                    await connection.query(
                        "UPDATE terminal_sync_queue SET status = 'sucesso', updated_at = NOW() WHERE id = $1",
                        [item.id]
                    );

                    processed++;
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

            logger.info(`✅ [SyncQueue] ${processed} itens processados com sucesso`);
            return { processed };

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
     * ═══════════════════════════════════════════════════════════════
     * NOVAS FUNÇÕES: CONTROLE DE ACESSO POR ÁREA
     * ═══════════════════════════════════════════════════════════════
     */

    /**
     * SINCRONIZAR PESSOA POR ÁREA - Cadastra/Remove baseado em acesso granular
     * Garante que pessoa SÓ aparece no leitor se tem autorização para aquela área
     */
    async syncEnrollmentByArea(pessoaId) {
        try {
            logger.info(`🔄 [AreaSync] Iniciando sync de áreas para pessoa ${pessoaId}...`);

            // 1. Buscar dados da pessoa
            const { data: pessoa, error: pessoaError } = await supabase
                .from('pessoas')
                .select('id, nome_completo, evento_id, status_acesso, foto_base64_cache, foto_base64_internal, foto_url')
                .eq('id', pessoaId)
                .single();

            if (pessoaError || !pessoa) {
                logger.warn(`⚠️ [AreaSync] Pessoa ${pessoaId} não encontrada`);
                return;
            }

            // 2. Verificar se pessoa está autorizada (regra crítica)
            if (pessoa.status_acesso !== 'autorizado') {
                logger.info(`⏸️ [AreaSync] Pessoa ${pessoa.nome_completo} não está 'autorizado' (status: ${pessoa.status_acesso}). Pulando sync.`);
                return;
            }

            // 3. Buscar áreas autorizadas para esta pessoa
            const { data: areasAutorizadas, error: areasError } = await supabase
                .from('pessoa_areas_acesso')
                .select('area_id')
                .eq('pessoa_id', pessoaId)
                .eq('evento_id', pessoa.evento_id);

            if (areasError) {
                logger.error(`❌ [AreaSync] Erro ao buscar áreas: ${areasError.message}`);
                return;
            }

            const areaIds = (areasAutorizadas || []).map(a => a.area_id);
            logger.info(`📍 [AreaSync] Pessoa ${pessoa.nome_completo} tem acesso a ${areaIds.length} áreas`);

            // 4. Buscar TODOS os dispositivos ativos do evento
            const { data: dispositivos, error: dispError } = await supabase
                .from('dispositivos_acesso')
                .select('id, nome, area_id, ip_address, user_device, password_device, marca, config, status_online')
                .eq('evento_id', pessoa.evento_id)
                .eq('tipo', 'terminal_facial');

            if (dispError || !dispositivos) {
                logger.warn(`⚠️ [AreaSync] Nenhum dispositivo encontrado para evento ${pessoa.evento_id}`);
                return;
            }

            const DeviceFactory = require('./adapters/DeviceFactory');
            let cadastrados = 0;
            let removidos = 0;

            // 5. Iterar cada dispositivo e decidir se cadastra ou remove
            for (const dispositivo of dispositivos) {
                const pessoaTemAcessoNessaArea = areaIds.includes(dispositivo.area_id);

                try {
                    if (pessoaTemAcessoNessaArea) {
                        // ✅ Pessoa tem acesso a esta área - CADASTRAR
                        if (dispositivo.status_online === 'online') {
                            const fotoBase64 = pessoa.foto_base64_cache || pessoa.foto_base64_internal || pessoa.foto_url;
                            if (!fotoBase64) {
                                logger.warn(`⚠️ [AreaSync] Pessoa ${pessoa.nome_completo} sem foto. Enfileirando...`);
                                await this.addToTerminalQueue(dispositivo.id, 'enroll_face', {
                                    pessoa,
                                    fotoBase64: null
                                });
                                continue;
                            }

                            const service = DeviceFactory.getDevice(dispositivo);
                            const optimizedPhoto = await imageProcessor.optimizeToBase64(fotoBase64);

                            await service.enrollUser(pessoa, optimizedPhoto);

                            // Log de sucesso
                            await supabase.from('dispositivo_sync_log').insert({
                                dispositivo_id: dispositivo.id,
                                pessoa_id: pessoaId,
                                area_id: dispositivo.area_id,
                                evento_id: pessoa.evento_id,
                                operacao: 'enroll',
                                status: 'sucesso'
                            });

                            cadastrados++;
                            logger.info(`✅ [AreaSync] ${pessoa.nome_completo} cadastrado em ${dispositivo.nome} (Área: ${dispositivo.area_id})`);
                        } else {
                            // Dispositivo offline - enfileira
                            await this.addToTerminalQueue(dispositivo.id, 'enroll_face', {
                                pessoa,
                                fotoBase64: pessoa.foto_base64_cache || pessoa.foto_base64_internal
                            });
                            logger.info(`⏳ [AreaSync] ${dispositivo.nome} offline. Comando enfileirado.`);
                        }
                    } else {
                        // ❌ Pessoa NÃO tem acesso a esta área - REMOVER
                        if (dispositivo.status_online === 'online') {
                            const service = DeviceFactory.getDevice(dispositivo);
                            await service.deleteUser(pessoaId.substring(0, 8)); // Usar primeiros 8 chars do UUID como ID

                            // Log de remoção
                            await supabase.from('dispositivo_sync_log').insert({
                                dispositivo_id: dispositivo.id,
                                pessoa_id: pessoaId,
                                area_id: dispositivo.area_id,
                                evento_id: pessoa.evento_id,
                                operacao: 'delete',
                                status: 'sucesso'
                            });

                            removidos++;
                            logger.info(`🗑️ [AreaSync] ${pessoa.nome_completo} removido de ${dispositivo.nome} (sem acesso)`);
                        } else {
                            // Dispositivo offline - enfileira remoção
                            await this.addToTerminalQueue(dispositivo.id, 'delete_face', {
                                hwUserId: pessoaId.substring(0, 8)
                            });
                        }
                    }
                } catch (err) {
                    logger.error(`❌ [AreaSync] Erro ao processar ${dispositivo.nome}: ${err.message}`);
                    await supabase.from('dispositivo_sync_log').insert({
                        dispositivo_id: dispositivo.id,
                        pessoa_id: pessoaId,
                        area_id: dispositivo.area_id,
                        evento_id: pessoa.evento_id,
                        operacao: 'enroll',
                        status: 'falha',
                        mensagem_erro: err.message
                    });
                }
            }

            logger.info(`✅ [AreaSync] Sync de áreas concluído: ${cadastrados} cadastrados, ${removidos} removidos`);
            return { cadastrados, removidos };

        } catch (error) {
            logger.error(`❌ [AreaSync] Erro crítico:`, error);
        }
    }

    /**
     * RESETAR E SINCRONIZAR DISPOSITIVO
     * Limpa TODAS as faces do dispositivo e recadastra APENAS pessoas autorizadas para aquela área
     */
    async resetAndSyncDevice(dispositivoId) {
        try {
            logger.info(`🔄 [DeviceReset] Iniciando reset de dispositivo ${dispositivoId}...`);

            // 1. Buscar dados do dispositivo
            const { data: dispositivo, error: dispError } = await supabase
                .from('dispositivos_acesso')
                .select('id, nome, area_id, evento_id, ip_address, user_device, password_device, marca, config, status_online')
                .eq('id', dispositivoId)
                .single();

            if (dispError || !dispositivo) {
                logger.error(`❌ [DeviceReset] Dispositivo ${dispositivoId} não encontrado`);
                return { success: false, error: 'Dispositivo não encontrado' };
            }

            // 2. Atualizar status do dispositivo
            await supabase
                .from('dispositivos_acesso')
                .update({ sync_status: 'sincronizando' })
                .eq('id', dispositivoId);

            // 3. Se online, limpar faces do dispositivo
            let cleaned = false;
            if (dispositivo.status_online === 'online') {
                try {
                    const service = DeviceFactory.getDevice(dispositivo);
                    // Chamar método de limpeza (se existir)
                    if (service.clearAllFaces) {
                        await service.clearAllFaces();
                        cleaned = true;
                        logger.info(`🧹 [DeviceReset] Todas as faces removidas de ${dispositivo.nome}`);
                    }
                } catch (err) {
                    logger.warn(`⚠️ [DeviceReset] Falha ao limpar ${dispositivo.nome}: ${err.message}`);
                }
            }

            // 4. Buscar pessoas com acesso a ESTA ÁREA específica
            const { data: pessoasAutorizadas, error: pessoasError } = await supabase
                .from('pessoas')
                .select(`
                    id, nome_completo, status_acesso, foto_base64_cache, foto_base64_internal, foto_url,
                    pessoa_areas_acesso(area_id)
                `)
                .eq('evento_id', dispositivo.evento_id)
                .eq('status_acesso', 'autorizado');

            if (pessoasError || !pessoasAutorizadas) {
                logger.warn(`⚠️ [DeviceReset] Nenhuma pessoa autorizada encontrada`);
                return { success: true, cleaned, cadastrados: 0 };
            }

            // 5. Filtrar apenas pessoas com acesso à área deste dispositivo
            const pessoasComAcesso = pessoasAutorizadas.filter(p => {
                const areas = p.pessoa_areas_acesso || [];
                return areas.some(a => a.area_id === dispositivo.area_id);
            });

            logger.info(`👥 [DeviceReset] ${pessoasComAcesso.length} pessoas com acesso à área ${dispositivo.area_id}`);

            // 6. Cadastrar pessoas no dispositivo
            const DeviceFactory = require('./adapters/DeviceFactory');
            let cadastrados = 0;
            let falhados = 0;

            if (dispositivo.status_online === 'online') {
                const service = DeviceFactory.getDevice(dispositivo);

                for (const pessoa of pessoasComAcesso) {
                    try {
                        const fotoBase64 = pessoa.foto_base64_cache || pessoa.foto_base64_internal || pessoa.foto_url;
                        if (!fotoBase64) {
                            logger.warn(`⚠️ [DeviceReset] ${pessoa.nome_completo} sem foto. Enfileirando...`);
                            await this.addToTerminalQueue(dispositivoId, 'enroll_face', {
                                pessoa,
                                fotoBase64: null
                            });
                            continue;
                        }

                        const optimizedPhoto = await imageProcessor.optimizeToBase64(fotoBase64);
                        await service.enrollUser(pessoa, optimizedPhoto);

                        await supabase.from('dispositivo_sync_log').insert({
                            dispositivo_id: dispositivoId,
                            pessoa_id: pessoa.id,
                            area_id: dispositivo.area_id,
                            evento_id: dispositivo.evento_id,
                            operacao: 'enroll',
                            status: 'sucesso'
                        });

                        cadastrados++;
                        logger.info(`✅ [DeviceReset] ${pessoa.nome_completo} cadastrado em ${dispositivo.nome}`);
                    } catch (err) {
                        logger.error(`❌ [DeviceReset] Falha ao cadastrar ${pessoa.nome_completo}: ${err.message}`);
                        falhados++;

                        await supabase.from('dispositivo_sync_log').insert({
                            dispositivo_id: dispositivoId,
                            pessoa_id: pessoa.id,
                            area_id: dispositivo.area_id,
                            evento_id: dispositivo.evento_id,
                            operacao: 'enroll',
                            status: 'falha',
                            mensagem_erro: err.message
                        });
                    }

                    await this.sleep(100); // Pequeno delay entre cadastros
                }
            } else {
                // Dispositivo offline - enfileira todos
                for (const pessoa of pessoasComAcesso) {
                    await this.addToTerminalQueue(dispositivoId, 'enroll_face', {
                        pessoa,
                        fotoBase64: pessoa.foto_base64_cache || pessoa.foto_base64_internal
                    });
                }
                logger.info(`⏳ [DeviceReset] Dispositivo offline. ${pessoasComAcesso.length} comandos enfileirados.`);
            }

            // 7. Atualizar status do dispositivo
            await supabase
                .from('dispositivos_acesso')
                .update({
                    sync_status: falhados === 0 ? 'sucesso' : 'erro',
                    ultima_sincronizacao: new Date(),
                    faces_cadastradas: cadastrados
                })
                .eq('id', dispositivoId);

            logger.info(`✅ [DeviceReset] Reset concluído: ${cadastrados} cadastrados, ${falhados} falhados`);
            return { success: true, cleaned, cadastrados, falhados };

        } catch (error) {
            logger.error(`❌ [DeviceReset] Erro crítico:`, error);

            // Marcar dispositivo com erro
            await supabase
                .from('dispositivos_acesso')
                .update({ sync_status: 'erro' })
                .eq('id', dispositivoId)
                .catch(e => logger.error('Falha ao atualizar status:', e));

            return { success: false, error: error.message };
        }
    }

    /**
     * SINCRONIZAR MUDANÇA DE ÁREA
     * Chamado quando uma pessoa ganha ou perde acesso a uma área
     */
    async syncAreaChange(pessoaId, areaId, acao, eventoId) {
        try {
            logger.info(`🔄 [AreaChange] ${acao === 'add' ? '✅ Adicionando' : '❌ Removendo'} acesso de pessoa ${pessoaId} à área ${areaId}...`);

            // 1. Buscar dados da pessoa
            const { data: pessoa } = await supabase
                .from('pessoas')
                .select('id, nome_completo, status_acesso, foto_base64_cache, foto_base64_internal')
                .eq('id', pessoaId)
                .single();

            if (!pessoa) {
                logger.warn(`⚠️ [AreaChange] Pessoa ${pessoaId} não encontrada`);
                return;
            }

            // 2. Buscar dispositivo da área
            const { data: dispositivo } = await supabase
                .from('dispositivos_acesso')
                .select('id, nome, ip_address, user_device, password_device, marca, config, status_online')
                .eq('area_id', areaId)
                .eq('evento_id', eventoId)
                .single();

            if (!dispositivo) {
                logger.warn(`⚠️ [AreaChange] Nenhum dispositivo para área ${areaId}`);
                return;
            }

            // 3. Executar ação
            const DeviceFactory = require('./adapters/DeviceFactory');

            if (acao === 'add') {
                // Adicionar pessoa ao dispositivo
                if (pessoa.status_acesso === 'autorizado') {
                    if (dispositivo.status_online === 'online') {
                        try {
                            const fotoBase64 = pessoa.foto_base64_cache || pessoa.foto_base64_internal;
                            if (fotoBase64) {
                                const service = DeviceFactory.getDevice(dispositivo);
                                const optimizedPhoto = await imageProcessor.optimizeToBase64(fotoBase64);
                                await service.enrollUser(pessoa, optimizedPhoto);

                                await supabase.from('dispositivo_sync_log').insert({
                                    dispositivo_id: dispositivo.id,
                                    pessoa_id: pessoaId,
                                    area_id: areaId,
                                    evento_id: eventoId,
                                    operacao: 'enroll',
                                    status: 'sucesso'
                                });

                                logger.info(`✅ [AreaChange] ${pessoa.nome_completo} adicionado a ${dispositivo.nome}`);
                            }
                        } catch (err) {
                            logger.error(`❌ [AreaChange] Falha ao adicionar: ${err.message}`);
                            await this.addToTerminalQueue(dispositivo.id, 'enroll_face', {
                                pessoa,
                                fotoBase64: pessoa.foto_base64_cache || pessoa.foto_base64_internal
                            });
                        }
                    } else {
                        // Offline - enfileira
                        await this.addToTerminalQueue(dispositivo.id, 'enroll_face', {
                            pessoa,
                            fotoBase64: pessoa.foto_base64_cache || pessoa.foto_base64_internal
                        });
                    }
                }
            } else if (acao === 'remove') {
                // Remover pessoa do dispositivo
                if (dispositivo.status_online === 'online') {
                    try {
                        const service = DeviceFactory.getDevice(dispositivo);
                        await service.deleteUser(pessoaId.substring(0, 8));

                        await supabase.from('dispositivo_sync_log').insert({
                            dispositivo_id: dispositivo.id,
                            pessoa_id: pessoaId,
                            area_id: areaId,
                            evento_id: eventoId,
                            operacao: 'delete',
                            status: 'sucesso'
                        });

                        logger.info(`✅ [AreaChange] ${pessoa.nome_completo} removido de ${dispositivo.nome}`);
                    } catch (err) {
                        logger.error(`❌ [AreaChange] Falha ao remover: ${err.message}`);
                        await this.addToTerminalQueue(dispositivo.id, 'delete_face', {
                            hwUserId: pessoaId.substring(0, 8)
                        });
                    }
                } else {
                    // Offline - enfileira
                    await this.addToTerminalQueue(dispositivo.id, 'delete_face', {
                        hwUserId: pessoaId.substring(0, 8)
                    });
                }
            }

        } catch (error) {
            logger.error(`❌ [AreaChange] Erro crítico:`, error);
        }
    }

    /**
     * ═══════════════════════════════════════════════════════════════
     * FIM - NOVAS FUNÇÕES DE CONTROLE POR ÁREA
     * ═══════════════════════════════════════════════════════════════
     */

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