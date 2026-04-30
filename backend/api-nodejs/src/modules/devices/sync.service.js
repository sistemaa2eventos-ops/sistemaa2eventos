const { getConnection, sql } = require('../../config/database');
const { supabase } = require('../../config/supabase');
const logger = require('../../services/logger');
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
            
            connection = await getConnection();
            let newInserted = 0;
            
            for (const log of logs) {
                try {
                    const result = await connection.request()
                        .input('id', sql.UniqueIdentifier, log.id)
                        .input('evento_id', sql.UniqueIdentifier, log.evento_id)
                        .input('pessoa_id', sql.UniqueIdentifier, log.pessoa_id)
                        .input('tipo', sql.VarChar(20), log.tipo)
                        .input('metodo', sql.VarChar(20), log.metodo)
                        .input('dispositivo_id', sql.VarChar(100), log.dispositivo_id)
                        .input('confianca', sql.Decimal(5, 2), log.confianca || null)
                        .input('foto_capturada', sql.Text, log.foto_capturada || null)
                        .input('created_at', sql.DateTime, new Date(log.created_at))
                        .input('created_by', sql.UniqueIdentifier, log.created_by || null)
                        .input('sync_id', sql.UniqueIdentifier, log.sync_id || null)
                        .query(`
                            IF NOT EXISTS (SELECT 1 FROM logs_acesso WHERE id = @id)
                            BEGIN
                                INSERT INTO logs_acesso (id, evento_id, pessoa_id, tipo, metodo, dispositivo_id, confianca, foto_capturada, created_at, created_by, sincronizado, sync_id)
                                VALUES (@id, @evento_id, @pessoa_id, @tipo, @metodo, @dispositivo_id, @confianca, @foto_capturada, @created_at, @created_by, 1, @sync_id);
                                SELECT 1 as inserted;
                            END
                            ELSE
                            BEGIN
                                SELECT 0 as inserted;
                            END
                        `);
                        
                    if (result.recordset && result.recordset[0] && result.recordset[0].inserted === 1) {
                        newInserted++;
                    }
                } catch (innerErr) {
                    logger.debug(`Falha ao injetar log ${log.id} no Edge: ${innerErr.message}`);
                }
            }
            
            if (newInserted > 0) {
                logger.info(`✅ Outbox Down-Sync: Injetados ${newInserted} logs vindos da Cloud no MSSQL local.`);
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
            connection = await getConnection();

            // 1. Buscar logs pendentes
            const result = await connection.request()
                .input('quantidade', sql.Int, this.batchSize)
                .execute('sp_sincronizar_logs_offline');

            const pendingLogs = result.recordsets[0] || [];
            const totalPendente = result.recordsets[1]?.[0]?.total_pendente || 0;

            this.stats.pendingItems = totalPendente;

            if (pendingLogs.length === 0) {
                logger.info('✅ Nenhum log pendente');
                return { synced: 0, pending: totalPendente };
            }

            logger.info(`📤 Processando ${pendingLogs.length} logs...`);

            const syncedIds = [];
            const failedLogs = [];
            const invalidEvents = [];

            // 2. Processar cada log
            for (const log of pendingLogs) {
                try {
                    // Validar evento antes de sincronizar
                    const eventoValido = await this.validateEvento(log.evento_id);

                    if (!eventoValido) {
                        logger.warn(`⚠️ Evento ${log.evento_id} não encontrado no Supabase`);
                        invalidEvents.push(log.id);
                        continue;
                    }

                    // Preparar dados
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

                    // Remover campos undefined/null
                    Object.keys(logData).forEach(key =>
                        logData[key] === undefined && delete logData[key]
                    );

                    // Inserir no Supabase
                    const { error } = await supabase
                        .from('logs_acesso')
                        .upsert(logData, {
                            onConflict: 'id',
                            ignoreDuplicates: true
                        });

                    if (error) {
                        // Erro específico de foreign key
                        if (error.message.includes('violates foreign key')) {
                            logger.warn(`⚠️ FK violation - pessoa ${log.pessoa_id} não existe no Supabase`);
                            failedLogs.push({ ...log, error: 'FK_VIOLATION' });
                        } else {
                            throw error;
                        }
                    } else {
                        syncedIds.push(log.id);
                        this.stats.totalSynced++;
                        logger.debug(`✅ Log ${log.id} sincronizado`);
                    }

                } catch (error) {
                    logger.error(`❌ Falha no log ${log.id}:`, error.message);
                    failedLogs.push({ ...log, error: error.message });
                    this.stats.totalFailed++;
                }

                // Pequena pausa
                await this.sleep(50);
            }

            // 3. Marcar logs sincronizados
            if (syncedIds.length > 0) {
                await connection.request()
                    .input('ids', sql.VarChar, syncedIds.join(','))
                    .execute('sp_marcar_logs_sincronizados');

                logger.info(`✅ ${syncedIds.length} logs marcados como sincronizados`);
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
                await connection.request()
                    .input('id', sql.UniqueIdentifier, log.id)
                    .input('error', sql.Text, log.error || 'Unknown error')
                    .query(`
                        UPDATE logs_acesso 
                        SET sync_attempts = ISNULL(sync_attempts, 0) + 1,
                            sync_error = @error
                        WHERE id = @id
                    `);

                // Se excedeu limite, mover para retry queue
                const attemptResult = await connection.request()
                    .input('id', sql.UniqueIdentifier, log.id)
                    .query('SELECT sync_attempts FROM logs_acesso WHERE id = @id');

                const attempts = attemptResult.recordset[0]?.sync_attempts || 0;

                if (attempts >= this.maxRetryPerLog) {
                    await connection.request()
                        .input('log_data', sql.VarChar(sql.MAX), JSON.stringify(log))
                        .input('error', sql.Text, `Max attempts (${this.maxRetryPerLog}) exceeded`)
                        .execute('sp_adicionar_retentativa');

                    logger.warn(`⚠️ Log ${log.id} movido para retry queue (${attempts} tentativas)`);
                }
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
            const connection = await getConnection();

            const result = await connection.request()
                .query(`
                    SELECT TOP 100 
                        id, evento_id, empresa_id, nome, cpf, funcao,
                        fase_montagem, fase_showday, fase_desmontagem,
                        foto_url, face_encoding, status_acesso, qr_code,
                        ativo, 
                        CONVERT(VARCHAR(30), created_at, 120) as created_at,
                        CONVERT(VARCHAR(30), updated_at, 120) as updated_at
                    FROM pessoas
                    WHERE updated_at >= DATEADD(hour, -24, GETDATE())
                        OR sincronizado_supabase = 0
                    ORDER BY updated_at DESC
                `);

            const pessoas = result.recordset;

            if (pessoas.length === 0) {
                logger.info('✅ Nenhuma pessoa para sincronizar');
                return { synced: 0 };
            }

            logger.info(`📤 Sincronizando ${pessoas.length} pessoas...`);

            let synced = 0;
            let failed = 0;

            for (const func of pessoas) {
                try {
                    const eventoValido = await this.validateEvento(func.evento_id);
                    if (!eventoValido) {
                        logger.warn(`⚠️ Evento ${func.evento_id} inválido para pessoa ${func.id}`);
                        failed++;
                        continue;
                    }

                    let faceEncoding = null;
                    if (func.face_encoding) {
                        try {
                            faceEncoding = typeof func.face_encoding === 'string'
                                ? JSON.parse(func.face_encoding)
                                : func.face_encoding;
                        } catch {
                            faceEncoding = func.face_encoding;
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

                    const { error } = await supabase
                        .from('pessoas')
                        .upsert(funcData, {
                            onConflict: 'id',
                            ignoreDuplicates: false
                        });

                    if (error) {
                        throw error;
                    }

                    synced++;

                    await connection.request()
                        .input('id', sql.UniqueIdentifier, func.id)
                        .query(`
                            UPDATE pessoas 
                            SET sincronizado_supabase = 1 
                            WHERE id = @id
                        `);

                    logger.debug(`✅ Pessoa ${func.nome} sincronizada`);

                } catch (error) {
                    logger.error(`❌ Erro ao sincronizar pessoa ${func.id}:`, error.message);
                    failed++;
                }

                await this.sleep(100);
            }

            logger.info(`✅ Pessoas: ${synced} sincronizadas, ${failed} falhas`);

            return { synced, failed };

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
            const connection = await getConnection();

            await connection.request()
                .query(`
                    IF NOT EXISTS (
                        SELECT 1 FROM sys.columns 
                        WHERE name = 'sincronizado_supabase' 
                        AND object_id = OBJECT_ID('pessoas')
                    )
                    BEGIN
                        ALTER TABLE pessoas 
                        ADD sincronizado_supabase BIT DEFAULT 0;
                        PRINT '✅ Coluna sincronizado_supabase adicionada';
                    END
                `);

        } catch (error) {
            logger.error('Erro ao verificar colunas:', error);
        }
    }

    /**
     * ESTATÍSTICAS DETALHADAS
     */
    async getDetailedStats() {
        try {
            const connection = await getConnection();

            const result = await connection.request()
                .query(`
                    SELECT 
                        COUNT(*) as total_logs,
                        SUM(CASE WHEN sincronizado = 0 THEN 1 ELSE 0 END) as pendentes,
                        SUM(CASE WHEN sincronizado = 1 THEN 1 ELSE 0 END) as sincronizados,
                        AVG(CASE WHEN sincronizado = 0 
                            THEN DATEDIFF(minute, created_at, GETDATE()) 
                            ELSE NULL END) as media_minutos_pendente,
                        SUM(CASE WHEN sincronizado = 0 AND sync_attempts > 3 
                            THEN 1 ELSE 0 END) as logs_criticos
                    FROM logs_acesso
                `);

            const queueResult = await connection.request()
                .query('SELECT COUNT(*) as total FROM sync_retry_queue');

            return {
                ...this.stats,
                database: result.recordset[0],
                retryQueue: queueResult.recordset[0].total,
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
            results.logsDown = await this.syncAccessLogsDown(); // Traz da Cloud se MSSQL falhou no checkout
            results.logs = await this.syncAccessLogs();
            results.pessoas = await this.syncPessoas();

            this.emit('sync:all:complete', results);  // ← EMITINDO EVENTO

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
     * SINCRONIZAR USUÁRIO ESPECÍFICO PARA TODOS OS TERMINAIS ATIVOS
     * Chamado quando um funcionário é criado ou editado.
     */
    async syncUserToAllDevices(pessoa) {
        try {
            logger.info(`🔄 Auto-Sync: Iniciando push de ${pessoa.nome} para terminais...`);

            // 1. Buscar terminais faciais do evento
            const { data: terminais, error } = await supabase
                .from('dispositivos_acesso')
                .select('*')
                .eq('evento_id', pessoa.evento_id)
                .eq('tipo', 'terminal_facial')
                .eq('status_online', 'online'); // Tenta apenas nos online

            if (error) {
                logger.error('Erro ao buscar terminais:', error);
                return;
            }

            if (!terminais || terminais.length === 0) {
                logger.warn('⚠️ Nenhum terminal online para sincronizar.');
                return;
            }

            logger.info(`📍 Encontrados ${terminais.length} terminais online.`);

            // 2. Importar DeviceFactory
            const DeviceFactory = require('./adapters/DeviceFactory');

            // 3. Iterar e enviar
            const results = await Promise.allSettled(terminais.map(async (terminal) => {
                const service = DeviceFactory.getDevice(terminal);

                // Variável para armazenar a foto final em Base64
                let fotoBase64 = pessoa.foto_base64_cache || pessoa.foto_base64_internal;

                // Se não tem Base64 mas tem URL, vamos tentar baixar
                if (!fotoBase64 && pessoa.foto_url) {
                    try {
                        logger.info(`📥 Baixando foto de ${pessoa.foto_url}...`);
                        const response = await fetch(pessoa.foto_url);
                        if (!response.ok) throw new Error(`Falha ao baixar imagem: ${response.statusText}`);

                        const arrayBuffer = await response.arrayBuffer();
                        const buffer = Buffer.from(arrayBuffer);
                        fotoBase64 = `data:image/jpeg;base64,${buffer.toString('base64')}`;
                    } catch (err) {
                        logger.error(`❌ Erro ao baixar foto para sync: ${err.message}`);
                        throw new Error('Falha ao obter imagem da pessoa para envio ao terminal.');
                    }
                }

                if (!fotoBase64) {
                    throw new Error('Sem foto válida (Base64 ou URL) para sincronizar.');
                }

                await service.enrollUser(pessoa, fotoBase64);
                return terminal.nome;
            }));

            // 4. Logar resultados
            const success = results.filter(r => r.status === 'fulfilled').map(r => r.value);
            const failures = results.filter(r => r.status === 'rejected').map(r => r.reason.message);

            logger.info(`✅ Auto-Sync Finalizado: ${success.length} sucessos, ${failures.length} falhas.`);
            if (failures.length > 0) logger.warn(`Falhas: ${failures.join(', ')}`);

            return { success, failures };

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