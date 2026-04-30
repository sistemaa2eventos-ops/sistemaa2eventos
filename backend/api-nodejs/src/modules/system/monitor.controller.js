const { supabase } = require('../../config/supabase');
const { getConnection, testConnection: dbTestConnection } = require('../../config/database');
const logger = require('../../services/logger');
const syncService = require('../devices/sync.service');
const cacheService = require('../../services/cacheService');
const os = require('os');
const fsSync = require('fs');
const fs = fsSync.promises;
const path = require('path');
const { getInicioHojeLocal } = require('../../utils/dateUtils');

class MonitorController {
    /**
     * Dashboard principal
     */
    async dashboard(req, res) {
        try {
            // --- NEXUS CONTEXT FALLBACK (v25.0) ---
            const evento_id = req.event?.id || req.query.evento_id || req.user?.evento_id || req.headers['x-evento-id'];

            if (!evento_id) {
                return res.status(400).json({ error: 'Falta vincular evento ativo para carregar dashboard.' });
            }

            // Buscar estatísticas em paralelo
            const [
                empresas,
                pessoas,
                logs,
                dispositivos,
                ultimosCheckins,
                ultimosAdicionados,
                fluxo
            ] = await Promise.all([
                // Total de empresas
                supabase.from('empresas')
                    .select('*', { count: 'exact', head: true })
                    .eq('evento_id', evento_id)
                    .eq('ativo', true),

                // Total de funcionários
                supabase.from('pessoas')
                    .select('*', { count: 'exact', head: true })
                    .eq('evento_id', evento_id),

                // Logs de hoje (no fuso local)
                supabase.from('logs_acesso')
                    .select('*', { count: 'exact', head: true })
                    .eq('evento_id', evento_id)
                    .gte('created_at', getInicioHojeLocal()),

                // Dispositivos online
                supabase.from('dispositivos_acesso')
                    .select('*', { count: 'exact', head: true })
                    .eq('evento_id', evento_id)
                    .eq('status', 'online'),

                // Últimos check-ins
                supabase.from('logs_acesso')
                    .select(`
                        *,
                        pessoas (
                            nome,
                            foto_url,
                            empresas (nome)
                        )
                    `)
                    .eq('evento_id', evento_id)
                    .eq('tipo', 'checkin')
                    .order('created_at', { ascending: false })
                    .limit(5),

                // Últimos funcionários adicionados
                supabase.from('pessoas')
                    .select(`
                        *,
                        empresas (nome)
                    `)
                    .eq('evento_id', evento_id)
                    .order('created_at', { ascending: false })
                    .limit(5),

                // Fluxo de ocupação (últimas 24h por hora)
                supabase.rpc('get_occupancy_flow', {
                    p_evento_id: evento_id,
                    p_days: 1
                })
            ]);

            // Se o RPC falhar ou não existir, retornar array vazio
            const fluxData = fluxo?.data || [];

            // Contar por status
            const [pendentesRes, checkinRes, checkoutRes] = await Promise.all([
                supabase.from('pessoas').select('*', { count: 'exact', head: true }).eq('evento_id', evento_id).eq('status_acesso', 'pendente'),
                supabase.from('pessoas').select('*', { count: 'exact', head: true }).eq('evento_id', evento_id).eq('status_acesso', 'checkin'),
                supabase.from('pessoas').select('*', { count: 'exact', head: true }).eq('evento_id', evento_id).eq('status_acesso', 'checkout')
            ]);

            res.json({
                success: true,
                data: {
                    cards: {
                        total_empresas: empresas.count || 0,
                        total_pessoas: pessoas.count || 0,
                        total_checkins_hoje: logs.count || 0,
                        total_checkouts_hoje: 0,
                        dispositivos_online: dispositivos.count || 0,
                        pendentes: pendentesRes.count || 0,
                        checkin: checkinRes.count || 0,
                        checkout: checkoutRes.count || 0
                    },
                    fluxo_24h: fluxData,
                    ultimos_checkins: ultimosCheckins.data || [],
                    ultimos_adicionados: ultimosAdicionados.data || []
                }
            });

        } catch (error) {
            logger.error('Erro no dashboard:', error);
            res.status(500).json({ error: 'Erro interno no servidor' });
        }
    }

    /**
     * Status do sistema
     */
    async systemStatus(req, res) {
        try {
            // Conexões
            const sqlStatus = await dbTestConnection();

            const { error: supabaseError } = await supabase
                .from('eventos')
                .select('count')
                .limit(1);

            // Sincronização
            const syncStats = syncService.getStats();
            const cacheStats = cacheService.getStats();

            // Sistema
            const uptime = process.uptime();
            const memory = process.memoryUsage();
            const loadAvg = os.loadavg();

            res.json({
                success: true,
                timestamp: new Date(),
                services: {
                    sql_server: sqlStatus ? 'online' : 'offline',
                    supabase: supabaseError ? 'offline' : 'online'
                },
                sync: {
                    lastSync: syncStats.lastSync,
                    pending: syncStats.pendingItems,
                    synced: syncStats.totalSynced,
                    failed: syncStats.totalFailed,
                    retryQueue: syncStats.retryQueue
                },
                cache: cacheStats,
                system: {
                    uptime: Math.floor(uptime / 60) + ' minutos',
                    memory: {
                        rss: Math.round(memory.rss / 1024 / 1024) + 'MB',
                        heapTotal: Math.round(memory.heapTotal / 1024 / 1024) + 'MB',
                        heapUsed: Math.round(memory.heapUsed / 1024 / 1024) + 'MB'
                    },
                    load: loadAvg
                }
            });

        } catch (error) {
            logger.error('Erro no status do sistema:', error);
            res.status(500).json({ error: 'Erro interno no servidor' });
        }
    }

    /**
     * Logs do sistema
     */
    async systemLogs(req, res) {
        try {
            const { lines = 100, level } = req.query;


            const logFile = path.join(__dirname, '../../logs/combined.log');

            if (!fsSync.existsSync(logFile)) {
                return res.json({ success: true, logs: [] });
            }

            // Lê de forma ASSÍNCRONA para não quebrar o checkin de ninguém enquanto lê gigabytes
            const data = await fs.readFile(logFile, 'utf8');
            const lines_array = data.split('\n').filter(l => l.trim());

            let logs = lines_array.slice(-lines);

            // Filtrar por nível se solicitado
            if (level) {
                logs = logs.filter(l => l.includes(`[${level.toUpperCase()}]`));
            }

            res.json({
                success: true,
                logs: logs.map(l => {
                    // Tentar parsear JSON
                    try {
                        return JSON.parse(l);
                    } catch {
                        return l;
                    }
                })
            });

        } catch (error) {
            logger.error('Erro ao buscar logs:', error);
            res.status(500).json({ error: 'Erro interno no servidor' });
        }
    }

    /**
     * Limpar logs do sistema
     */
    async clearSystemLogs(req, res) {
        try {


            const logsDir = path.join(__dirname, '../../logs');
            if (fsSync.existsSync(logsDir)) {
                const files = await fs.readdir(logsDir);
                for (const file of files) {
                    if (file.endsWith('.log')) {
                        const filePath = path.join(logsDir, file);
                        try {
                            await fs.truncate(filePath, 0);
                        } catch (e) {
                            logger.warn(`Não foi possível truncar ${file}:`, e.message);
                        }
                    }
                }
            }

            logger.info(`🧹 Logs do sistema limpos manualmente por: ${req.user.email}`);
            res.json({ success: true, message: 'Logs do sistema limpos com sucesso' });
        } catch (error) {
            logger.error('Erro ao limpar logs do sistema:', error);
            res.status(500).json({ error: 'Erro interno no servidor' });
        }
    }

    /**
     * Monitor de performance
     */
    async performance(req, res) {
        try {
            // Métricas do processo Node.js (sempre disponíveis)
            const memory = process.memoryUsage();
            const uptime = process.uptime();
            const cpuUsage = process.cpuUsage();

            // Métricas do SO
            const totalMem = os.totalmem();
            const freeMem = os.freemem();
            const loadAvg = os.loadavg();
            const cpus = os.cpus();

            // Tentar buscar informações básicas do SQL Server sem VIEW SERVER STATE
            let sqlConnections = [];
            let sqlError = null;
            try {
                const connection = await getConnection();
                // Esta query não precisa de VIEW SERVER STATE
                const result = await connection.request().query(`
                    SELECT
                        DB_NAME() as database_name,
                        @@CONNECTIONS as total_connections,
                        GETDATE() as server_time
                `);
                sqlConnections = result.recordset;
            } catch (err) {
                sqlError = err.message;
                logger.warn('Performance SQL (sem permissão VIEW SERVER STATE):', err.message);
            }

            res.json({
                success: true,
                node: {
                    uptime_segundos: Math.floor(uptime),
                    uptime_formatado: `${Math.floor(uptime / 3600)}h ${Math.floor((uptime % 3600) / 60)}m`,
                    memoria: {
                        rss_mb: Math.round(memory.rss / 1024 / 1024),
                        heap_total_mb: Math.round(memory.heapTotal / 1024 / 1024),
                        heap_usado_mb: Math.round(memory.heapUsed / 1024 / 1024),
                        externo_mb: Math.round(memory.external / 1024 / 1024)
                    },
                    cpu: {
                        user_ms: Math.round(cpuUsage.user / 1000),
                        system_ms: Math.round(cpuUsage.system / 1000)
                    }
                },
                os: {
                    plataforma: os.platform(),
                    release: os.release(),
                    cpus: cpus.length,
                    modelo_cpu: cpus[0]?.model || 'Desconhecido',
                    memoria_total_mb: Math.round(totalMem / 1024 / 1024),
                    memoria_livre_mb: Math.round(freeMem / 1024 / 1024),
                    uso_memoria_pct: Math.round(((totalMem - freeMem) / totalMem) * 100),
                    load_avg: {
                        '1m': loadAvg[0].toFixed(2),
                        '5m': loadAvg[1].toFixed(2),
                        '15m': loadAvg[2].toFixed(2)
                    }
                },
                sql_server: sqlError
                    ? { status: 'sem_permissao', detail: 'VIEW SERVER STATE não concedida ao usuário da aplicação' }
                    : { status: 'ok', info: sqlConnections[0] || {} },
                slow_queries: [],
                active_connections: 0,
                connections: []
            });

        } catch (error) {
            logger.error('Erro no monitor de performance:', error);
            res.status(500).json({ error: 'Erro interno no servidor' });
        }
    }


    /**
     * Forçar sincronização manual
     */
    async forceSync(req, res) {
        try {
            // Verificar permissão
            if (req.user.role !== 'admin') {
                return res.status(403).json({ error: 'Acesso negado' });
            }

            const result = await syncService.syncAll();

            logger.info(`👤 Sincronização forçada por: ${req.user.email}`);

            res.json({
                success: true,
                message: 'Sincronização concluída',
                data: result
            });

        } catch (error) {
            logger.error('Erro ao forçar sincronização:', error);
            res.status(500).json({ error: 'Erro interno no servidor' });
        }
    }

    /**
     * Limpar cache
     */
    async clearCache(req, res) {
        try {
            if (req.user.role !== 'admin') {
                return res.status(403).json({ error: 'Acesso negado' });
            }

            const cleared = cacheService.clear();

            logger.info(`🧹 Cache limpo por: ${req.user.email} (${cleared} itens)`);

            res.json({
                success: true,
                message: `Cache limpo: ${cleared} itens removidos`
            });

        } catch (error) {
            logger.error('Erro ao limpar cache:', error);
            res.status(500).json({ error: 'Erro interno no servidor' });
        }
    }
    /**
     * Listar Watchlist de Monitoramento
     */
    async listWatchlist(req, res) {
        try {
            // --- NEXUS CONTEXT FALLBACK (v25.0) ---
            const evento_id = req.event?.id || req.query.evento_id || req.user?.evento_id || req.headers['x-evento-id'];

            if (!evento_id) {
                return res.status(400).json({ error: 'Falta vincular evento ativo para carregar watchlist.' });
            }
            const { data, error } = await supabase
                .from('monitor_watchlist')
                .select(`
                    *,
                    pessoas (
                        nome,
                        foto_url,
                        empresas (nome)
                    )
                `)
                .eq('evento_id', evento_id)
                .order('created_at', { ascending: false });

            if (error) throw error;
            res.json({ success: true, data });
        } catch (error) {
            logger.error('Erro ao listar watchlist:', error);
            res.status(500).json({ error: 'Erro interno no servidor' });
        }
    }

    /**
     * Adicionar à Watchlist
     */
    async addToWatchlist(req, res) {
        try {
            // --- NEXUS CONTEXT FALLBACK (v25.0) ---
            const evento_id = req.event?.id || req.body.evento_id || req.user?.evento_id || req.headers['x-evento-id'];

            if (!evento_id) {
                return res.status(400).json({ error: 'Falta vincular evento ativo para adicionar à watchlist.' });
            }
            const { cpf, pessoa_id, nome } = req.body;

            if (!cpf && !pessoa_id) {
                return res.status(400).json({ error: 'Informe CPF ou Pessoa' });
            }

            const { data, error } = await supabase
                .from('monitor_watchlist')
                .insert([{
                    evento_id,
                    pessoa_id: pessoa_id || null,
                    cpf: cpf || null,
                    nome: nome || 'Alvo Monitorado',
                    is_active: true
                }])
                .select()
                .single();

            if (error) throw error;
            res.json({ success: true, data });
        } catch (error) {
            logger.error('Erro ao adicionar à watchlist:', error);
            res.status(500).json({ error: 'Erro interno no servidor' });
        }
    }

    /**
     * Remover da Watchlist
     */
    async removeFromWatchlist(req, res) {
        try {
            const { id } = req.params;
            // --- NEXUS CONTEXT FALLBACK (v25.0) ---
            const evento_id = req.event?.id || req.query.evento_id || req.user?.evento_id || req.headers['x-evento-id'];

            if (!evento_id) {
                return res.status(400).json({ error: 'Falta vincular evento ativo para remover da watchlist.' });
            }

            const { error } = await supabase
                .from('monitor_watchlist')
                .delete()
                .eq('id', id)
                .eq('evento_id', evento_id);

            if (error) throw error;
            res.json({ success: true, message: 'Removido da watchlist' });
        } catch (error) {
            logger.error('Erro ao remover da watchlist:', error);
            res.status(500).json({ error: 'Erro interno no servidor' });
        }
    }
}

module.exports = new MonitorController();