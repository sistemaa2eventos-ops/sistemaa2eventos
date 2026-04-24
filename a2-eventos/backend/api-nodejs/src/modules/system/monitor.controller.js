const { supabase } = require('../../config/supabase');
const { testPgConnection } = require('../../config/pgEdge');
const logger = require('../../services/logger');
const syncService = require('../devices/sync.service');
const cacheService = require('../../services/cacheService');
const { extractRole } = require('../../middleware/auth');
const os = require('os');
const fsSync = require('fs');
const fs = fsSync.promises;
const path = require('path');
const { getInicioHojeLocal } = require('../../utils/dateUtils');

// Helper: filtra strings 'undefined'/'null' que o frontend pode enviar
const _s = (v) => (v && v !== 'undefined' && v !== 'null') ? v : null;

class MonitorController {
    /**
     * Dashboard principal
     */
    async dashboard(req, res) {
        try {
            // --- NEXUS CONTEXT FALLBACK (v25.0) ---
            const evento_id = _s(req.event?.id) || _s(req.query.evento_id) || _s(req.user?.evento_id) || _s(req.headers['x-evento-id']);

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
                    .eq('status_online', 'online'),

                // Últimos check-ins (Resiliente: Sem Join)
                supabase.from('logs_acesso')
                    .select('*')
                    .eq('evento_id', evento_id)
                    .eq('tipo', 'checkin')
                    .order('created_at', { ascending: false })
                    .limit(5),

                // Últimos funcionários adicionados (Resiliente: Sem Join)
                supabase.from('pessoas')
                    .select('*')
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
            const [pendentesRes, checkinRes, checkoutRes, logsCheckoutHoje] = await Promise.all([
                supabase.from('pessoas').select('*', { count: 'exact', head: true }).eq('evento_id', evento_id).eq('status_acesso', 'pendente'),
                supabase.from('pessoas').select('*', { count: 'exact', head: true }).eq('evento_id', evento_id).eq('status_acesso', 'checkin_feito'),
                supabase.from('pessoas').select('*', { count: 'exact', head: true }).eq('evento_id', evento_id).eq('status_acesso', 'checkout_feito'),
                supabase.from('logs_acesso').select('*', { count: 'exact', head: true }).eq('evento_id', evento_id).eq('tipo', 'checkout').gte('created_at', getInicioHojeLocal())
            ]);

            res.json({
                success: true,
                data: {
                    cards: {
                        total_empresas: empresas.count || 0,
                        total_pessoas: pessoas.count || 0,
                        total_checkins_hoje: logs.count || 0,
                        total_checkouts_hoje: logsCheckoutHoje.count || 0,
                        dispositivos_online: dispositivos.count || 0,
                        pendentes: pendentesRes.count || 0,
                        checkin: checkinRes.count || 0,
                        checkout: checkoutRes.count || 0
                    },
                    fluxo_24h: fluxData,
                    ultimos_checkins: (ultimosCheckins.data || []).map(log => {
                        // Enriquecimento manual pode ser feito aqui se necessário, 
                        // mas para o dashboard v16.1 priorizamos não quebrar
                        return log;
                    }),
                    ultimos_adicionados: (ultimosAdicionados.data || []).map(p => {
                        return p;
                    })
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
            const { error: supabaseError } = await supabase
                .from('eventos')
                .select('count')
                .limit(1);

            // Sincronização
            const syncStats = syncService.getStats();
            const cacheStats = {
                size: cacheService.cache?.size || 0,
                status: 'online'
            };

            // Sistema
            const uptime = process.uptime();
            const memory = process.memoryUsage();
            const loadAvg = os.loadavg();

            res.json({
                success: true,
                timestamp: new Date(),
                services: {
                    sql_server: 'migrado', // Operação Êxodo Supremo v27.5
                    postgresql_edge: await testPgConnection() ? 'online' : 'offline',
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
     * Terminais (Status Real)
     */
    async getTerminais(req, res) {
        try {
            const evento_id = _s(req.tenantId) || _s(req.event?.id) || _s(req.query.evento_id) || _s(req.headers['x-evento-id']);
            if (!evento_id) return res.status(400).json({ error: 'evento_id obrigatório' });

            let { data, error } = await supabase
                .from('dispositivos_acesso')
                .select('id, nome, tipo, status:status_online, area_id, ultimo_ping, evento_areas(nome)')
                .eq('evento_id', evento_id)
                .order('status_online', { ascending: false });

            // Fallback: se o join com evento_areas falhar, buscar sem o join
            if (error) {
                logger.warn('Fallback getTerminais sem join evento_areas:', error.message);
                const retry = await supabase
                    .from('dispositivos_acesso')
                    .select('id, nome, tipo, status:status_online, area_id, ultimo_ping')
                    .eq('evento_id', evento_id)
                    .order('status_online', { ascending: false });

                if (retry.error) throw retry.error;
                data = retry.data;
            }

            res.json({ success: true, data: data || [] });
        } catch (error) {
            logger.error('Erro ao buscar terminais:', error);
            res.status(500).json({ error: 'Erro ao buscar terminais' });
        }
    }

    /**
     * Logs do sistema
     */
    async systemLogs(req, res) {
        try {
            const { lines = 100, level } = req.query;
            const logFile = path.join(process.cwd(), 'logs', 'combined.log');

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
                health: { status: 'OK', services: 'Supabase Nexus Active' },
                slow_queries: [],
                active_connections: 0
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
            if (!['admin', 'admin_master'].includes(extractRole(req.user))) {
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
            if (!['admin', 'admin_master'].includes(extractRole(req.user))) {
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
     * CONSOLIDADO: Usa tabela `watchlist` (mesma do watchlist.controller.js)
     * para evitar fragmentação de dados em cenários de alta carga (10k+)
     */
    async listWatchlist(req, res) {
        try {
            const evento_id = _s(req.event?.id) || _s(req.query.evento_id) || _s(req.user?.evento_id) || _s(req.headers['x-evento-id']);

            if (!evento_id) {
                return res.status(400).json({ error: 'Falta vincular evento ativo para carregar watchlist.' });
            }

            const { data: watchlist, error } = await supabase
                .from('watchlist')
                .select('*')
                .eq('evento_id', evento_id)
                .eq('ativo', true)
                .order('created_at', { ascending: false });

            if (error) throw error;

            res.json({ success: true, data: watchlist || [] });
        } catch (error) {
            logger.error('Erro ao listar watchlist:', error);
            res.status(500).json({ error: 'Erro interno no servidor' });
        }
    }

    /**
     * Adicionar à Watchlist
     * CONSOLIDADO: Usa tabela `watchlist` com upsert por evento+cpf
     */
    async addToWatchlist(req, res) {
        try {
            const evento_id = _s(req.event?.id) || _s(req.body?.evento_id) || _s(req.user?.evento_id) || _s(req.headers['x-evento-id']);

            if (!evento_id) {
                return res.status(400).json({ error: 'Falta vincular evento ativo para adicionar à watchlist.' });
            }
            const { cpf, nome, motivo } = req.body;

            if (!cpf) {
                return res.status(400).json({ error: 'CPF é obrigatório' });
            }

            const { data, error } = await supabase
                .from('watchlist')
                .upsert([{
                    evento_id,
                    cpf: String(cpf).replace(/\D/g, ''),
                    nome: nome || 'Alvo Monitorado',
                    motivo: motivo || 'Adicionado via monitor',
                    nivel_alerta: 'alto',
                    ativo: true,
                    adicionado_por: req.user?.id
                }], { onConflict: 'evento_id,cpf' })
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
     * CONSOLIDADO: Usa tabela `watchlist`
     */
    async removeFromWatchlist(req, res) {
        try {
            const { id } = req.params;
            const evento_id = _s(req.event?.id) || _s(req.query.evento_id) || _s(req.user?.evento_id) || _s(req.headers['x-evento-id']);

            if (!evento_id) {
                return res.status(400).json({ error: 'Falta vincular evento ativo para remover da watchlist.' });
            }

            const { error } = await supabase
                .from('watchlist')
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
