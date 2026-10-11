const { supabase } = require('../../config/supabase');
const { buscarTodos } = require('../../utils/buscarTodos');
const { testPgConnection } = require('../../config/pgEdge');
const logger = require('../../services/logger');
const syncService = require('../devices/sync.service');
const cacheService = require('../../services/cacheService');
const { extractRole } = require('../../middleware/auth');
const os = require('os');
const fsSync = require('fs');
const fs = fsSync.promises;
const path = require('path');
const { getLimitesDiaLocalUTC } = require('../../utils/dateUtils');

// Início do dia LOCAL em UTC (logs_acesso.created_at é gravado em UTC)
const getInicioHojeLocal = () => getLimitesDiaLocalUTC().start;

/** Arquivo de log combinado mais recente (o winston rotaciona para combined1.log, combined2.log...) */
const arquivoLogAtual = () => {
    const dir = path.join(process.cwd(), 'logs');
    if (!fsSync.existsSync(dir)) return null;
    const candidatos = fsSync.readdirSync(dir)
        .filter(f => /^combined\d*\.log$/.test(f))
        .map(f => ({ f, mtime: fsSync.statSync(path.join(dir, f)).mtimeMs }))
        .sort((x, y) => y.mtime - x.mtime);
    return candidatos.length ? path.join(dir, candidatos[0].f) : null;
};

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

            // Buscar estatísticas em paralelo (os dois lotes rodam ao mesmo tempo)
            const lote1 = Promise.all([
                // Total de empresas
                supabase.from('empresas')
                    .select('*', { count: 'exact', head: true })
                    .eq('evento_id', evento_id)
                    .eq('ativo', true),

                // Total de funcionários
                supabase.from('pessoas')
                    .select('*', { count: 'exact', head: true })
                    .eq('evento_id', evento_id),

                // Logs de hoje (checkins no fuso local)
                supabase.from('logs_acesso')
                    .select('*', { count: 'exact', head: true })
                    .eq('evento_id', evento_id)
                    .eq('tipo', 'checkin')
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

                // Últimos funcionários adicionados (sem face_encoding, ~10 KB por pessoa)
                supabase.from('pessoas')
                    .select('id, nome_completo, funcao, foto_url, empresa_id, status_acesso, created_at')
                    .eq('evento_id', evento_id)
                    .order('created_at', { ascending: false })
                    .limit(5),

                // Fluxo de ocupação (últimas 24h por hora)
                supabase.rpc('get_occupancy_flow', {
                    p_evento_id: evento_id,
                    p_days: 1
                })
            ]);


            // Contar por status
            const [
                pendentesRes,
                checkinRes,
                checkoutRes,
                logsCheckoutHoje,
                empresasListaRes,
                pessoasListaRes,
                logsAcessoRes,
                dispositivosListaRes,
                terminaisFaciaisRes
            ] = await Promise.all([
                supabase.from('pessoas').select('*', { count: 'exact', head: true }).eq('evento_id', evento_id).eq('status_acesso', 'pendente'),
                supabase.from('pessoas').select('*', { count: 'exact', head: true }).eq('evento_id', evento_id).eq('status_acesso', 'checkin_feito'),
                supabase.from('pessoas').select('*', { count: 'exact', head: true }).eq('evento_id', evento_id).eq('status_acesso', 'checkout_feito'),
                supabase.from('logs_acesso').select('*', { count: 'exact', head: true }).eq('evento_id', evento_id).eq('tipo', 'checkout').gte('created_at', getInicioHojeLocal()),

                // Lista de empresas do evento
                supabase.from('empresas')
                    .select('id, nome, cnpj, servico, tipo_operacao, ativo')
                    .eq('evento_id', evento_id)
                    .order('nome'),

                // Pessoas para contabilização por empresa (todas as páginas: PostgREST corta em 1000)
                buscarTodos(supabase.from('pessoas')
                    .select('id, empresa_id, status_acesso')
                    .eq('evento_id', evento_id)),

                // Logs de acesso de HOJE para contabilização de check-in / checkout por empresa
                buscarTodos(supabase.from('logs_acesso')
                    .select('id, pessoa_id, tipo, created_at')
                    .eq('evento_id', evento_id)
                    .in('tipo', ['checkin', 'checkout'])
                    .gte('created_at', getInicioHojeLocal())
                    .order('created_at', { ascending: false })),

                // Dispositivos e terminais de acesso
                supabase.from('dispositivos_acesso')
                    .select('id, nome, tipo, modo, status_online, area_id, ultimo_ping, ip_address, config, evento_areas(nome_area)')
                    .eq('evento_id', evento_id)
                    .order('nome'),

                // Terminais faciais vinculados
                // terminais_faciais (modelo antigo) não existe mais: tudo está em dispositivos_acesso
                Promise.resolve({ data: [] })
            ]);

            const [
                empresas,
                pessoas,
                logs,
                dispositivos,
                ultimosCheckins,
                ultimosAdicionados,
                fluxo
            ] = await lote1;

            // Se o RPC falhar ou não existir, retornar array vazio
            const fluxData = fluxo?.data || [];

            // Mapeamento e métricas de cada empresa
            const pessoasList = pessoasListaRes.data || [];
            const logsList = logsAcessoRes.data || [];
            const empresasList = empresasListaRes.data || [];

            const pessoaToEmpresa = new Map();
            const empresaContagem = new Map();

            empresasList.forEach(emp => {
                empresaContagem.set(emp.id, {
                    id: emp.id,
                    nome: emp.nome,
                    cnpj: emp.cnpj,
                    categoria: emp.servico || emp.tipo_operacao || 'Geral',
                    ativo: emp.ativo !== false,
                    cadastros: 0,
                    checkins: 0,
                    checkouts: 0,
                    presentes: 0
                });
            });

            // Contar cadastros por empresa
            pessoasList.forEach(p => {
                if (p.empresa_id) {
                    pessoaToEmpresa.set(p.id, p.empresa_id);
                    const empData = empresaContagem.get(p.empresa_id);
                    if (empData) {
                        empData.cadastros += 1;
                    }
                }
            });

            // Mapear último status de acesso por logs e contar check-ins e checkouts
            const ultimoMovimentoPorPessoa = new Map();
            logsList.forEach(log => {
                const empId = pessoaToEmpresa.get(log.pessoa_id);
                if (empId) {
                    const empData = empresaContagem.get(empId);
                    if (empData) {
                        if (log.tipo === 'checkin') empData.checkins += 1;
                        if (log.tipo === 'checkout') empData.checkouts += 1;
                    }
                }
                // Como logsList está ordenado por created_at desc, o primeiro registro encontrado é o mais recente
                if (!ultimoMovimentoPorPessoa.has(log.pessoa_id)) {
                    ultimoMovimentoPorPessoa.set(log.pessoa_id, log.tipo);
                }
            });

            // Contar presentes no evento HOJE (quem tem último movimento de HOJE como check-in)
            pessoasList.forEach(p => {
                if (p.empresa_id) {
                    const empData = empresaContagem.get(p.empresa_id);
                    if (empData) {
                        const ultMovimento = ultimoMovimentoPorPessoa.get(p.id);
                        // Apenas presente se deu check-in hoje e ainda não fez checkout hoje
                        const estaPresente = ultMovimento === 'checkin';
                        if (estaPresente) {
                            empData.presentes += 1;
                        }
                    }
                }
            });

            const empresasMetricas = Array.from(empresaContagem.values()).sort((a, b) => b.cadastros - a.cadastros);
            const totalPresentesHoje = empresasMetricas.reduce((acc, curr) => acc + (curr.presentes || 0), 0);

            // Montar lista de terminais unificada
            let terminaisFormatados = [];
            const dispList = dispositivosListaRes.data || [];
            const tfList = terminaisFaciaisRes.data || [];

            if (dispList.length > 0) {
                terminaisFormatados = dispList.map(d => {
                    let fluxo = 'entrada e saida';
                    // Sentido do fluxo vem de config.fluxo (toggle = entrada e saída); não existe coluna direcao_fluxo
                    const df = String(d.config?.fluxo || '').toLowerCase();
                    if (df === 'entrada' || df === 'so entrada' || df === 'in') {
                        fluxo = 'so entrada';
                    } else if (df === 'saida' || df === 'so saida' || df === 'out') {
                        fluxo = 'so saida';
                    }

                    return {
                        id: d.id,
                        nome: d.nome || 'Terminal de Acesso',
                        local: d.evento_areas?.nome_area || (d.modo === 'credenciamento' ? 'Credenciamento' : 'Sem área definida'),
                        tipo_fluxo: fluxo,
                        status: d.status_online === 'online' ? 'online' : (d.status_online === 'sincronizando' ? 'sincronizando' : 'offline'),
                        tipo: d.tipo || 'leitor',
                        ip: d.ip_address || '—',
                        ultimo_ping: d.ultimo_ping
                    };
                });
            } else if (tfList.length > 0) {
                terminaisFormatados = tfList.map(t => {
                    let fluxo = 'entrada e saida';
                    const modo = String(t.modo || '').toLowerCase();
                    if (modo === 'checkin' || modo === 'so entrada' || modo === 'entrada') {
                        fluxo = 'so entrada';
                    } else if (modo === 'checkout' || modo === 'so saida' || modo === 'saida') {
                        fluxo = 'so saida';
                    }

                    return {
                        id: t.id,
                        nome: t.nome || 'Terminal Facial',
                        local: t.area_nome || 'Portaria Principal',
                        tipo_fluxo: fluxo,
                        status: t.ativo ? 'online' : 'offline',
                        tipo: 'facial',
                        ip: '—',
                        ultimo_ping: null
                    };
                });
            }

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
                        checkin: totalPresentesHoje, // Presentes agora dentro do evento hoje
                        checkout: logsCheckoutHoje.count || 0,
                        presentes_hoje: totalPresentesHoje
                    },
                    empresas_metricas: empresasMetricas,
                    terminais_lista: terminaisFormatados,
                    fluxo_24h: fluxData,
                    ultimos_checkins: (ultimosCheckins.data || []).map(log => log),
                    ultimos_adicionados: (ultimosAdicionados.data || []).map(p => {
                        const emp = p.empresa_id ? empresaContagem.get(p.empresa_id) : null;
                        return {
                            ...p,
                            nome: p.nome_completo, // a tela usa "nome"
                            empresas: emp ? { nome: emp.nome } : (p.empresas || null),
                            empresa_nome: emp ? emp.nome : (p.empresas?.nome || null)
                        };
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

            // Tempo real, agentes locais e fila de envio de faces aos leitores
            const websocketService = require('../../services/websocketService');
            const queueService = require('../../services/queue.service');
            const agentService = require('../../services/agentService');
            const evento_id = _s(req.event?.id) || _s(req.query.evento_id) || _s(req.headers['x-evento-id']);
            let filaLeitores = { pendente: 0, erro: 0 };
            try {
                const base = () => supabase.from('terminal_sync_queue').select('id', { count: 'exact', head: true });
                const filtrar = (q) => (evento_id ? q.eq('evento_id', evento_id) : q);
                const [pend, err] = await Promise.all([
                    filtrar(base().eq('status', 'pendente')),
                    filtrar(base().eq('status', 'erro'))
                ]);
                filaLeitores = { pendente: pend.count || 0, erro: err.count || 0 };
            } catch (_) { /* fila indisponível não derruba o status */ }

            res.json({
                success: true,
                timestamp: new Date(),
                services: {
                    sql_server: 'migrado', // Operação Êxodo Supremo v27.5
                    postgresql_edge: await testPgConnection().then(r => r === null ? 'desativado' : (r ? 'online' : 'offline')),
                    supabase: supabaseError ? 'offline' : 'online',
                    redis: queueService.isConnected ? 'online' : 'offline',
                    tempo_real: websocketService.io ? (websocketService.redisEnabled ? 'online' : 'local') : 'offline'
                },
                tempo_real: {
                    clientes_conectados: websocketService.io?.engine?.clientsCount || 0,
                    agentes_locais: agentService.getConnectedAgents().map(a => a.nome)
                },
                fila_leitores: filaLeitores,
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
                    uptime_segundos: Math.floor(uptime),
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
                .select('id, nome, tipo, status:status_online, area_id, ultimo_ping, evento_areas(nome_area)')
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
            const logFile = arquivoLogAtual();

            if (!logFile) {
                return res.json({ success: true, logs: [] });
            }

            // Lê de forma ASSÍNCRONA para não travar a aplicação
            const data = await fs.readFile(logFile, 'utf8');
            const lines_array = data.split('\n').filter(l => l.trim());

            const pinoLevels = { 10: 'trace', 20: 'debug', 30: 'info', 40: 'warn', 50: 'error', 60: 'fatal' };

            const parsedLogs = lines_array.map(l => {
                try {
                    const parsed = JSON.parse(l);
                    const lvlStr = typeof parsed.level === 'number'
                        ? (pinoLevels[parsed.level] || 'info')
                        : String(parsed.level || 'info').toLowerCase();
                    return {
                        timestamp: parsed.time || parsed.timestamp || new Date().toISOString(),
                        level: lvlStr,
                        message: parsed.msg || parsed.message || JSON.stringify(parsed),
                        service: parsed.service || 'backend'
                    };
                } catch {
                    // String legada (ex: [2026-02-24 23:45:00] [INFO] [a2-sync] mensagem)
                    const match = l.match(/^\[(.*?)\]\s*\[(.*?)\]\s*(?:\[(.*?)\])?\s*(.*)$/);
                    if (match) {
                        return {
                            timestamp: match[1],
                            level: (match[2] || 'info').toLowerCase(),
                            service: match[3] || 'sistema',
                            message: match[4] || l
                        };
                    }
                    return {
                        timestamp: '',
                        level: 'info',
                        message: l,
                        service: 'sistema'
                    };
                }
            });

            let logs = parsedLogs;
            // Filtrar por nível se solicitado
            if (level) {
                logs = logs.filter(l => l.level.toLowerCase() === level.toLowerCase());
            }

            logs = logs.slice(-parseInt(lines, 10));

            res.json({
                success: true,
                logs
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
            const logsDirs = [
                path.join(process.cwd(), 'logs'),
                path.join(__dirname, '../../../logs')
            ];

            for (const dir of logsDirs) {
                if (fsSync.existsSync(dir)) {
                    const files = await fs.readdir(dir);
                    for (const file of files) {
                        if (file.endsWith('.log')) {
                            const filePath = path.join(dir, file);
                            try {
                                await fs.truncate(filePath, 0);
                            } catch (e) {
                                logger.warn(`Não foi possível truncar ${file}:`, e.message);
                            }
                        }
                    }
                }
            }

            logger.info(`🧹 Logs do sistema limpos manualmente por: ${req.user?.email || 'admin'}`);
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

    /**
     * Reset Diário
     * Reinicia o status de acesso de todos os colaboradores do evento,
     * exceto aqueles que ainda estão presentes (checkin_feito).
     */
    async resetDiario(req, res) {
        try {
            const evento_id = _s(req.event?.id) || _s(req.body?.evento_id) || _s(req.user?.evento_id) || _s(req.headers['x-evento-id']);

            if (!evento_id) {
                return res.status(400).json({ error: 'Falta vincular evento ativo para reset diário.' });
            }

            const cronController = require('../events/cron.controller');
            await cronController.resetTurnos();
            
            // Gerar e salvar snapshot do relatório diário imediatamente ao clicar no reset diário
            let fechamentoResultado = null;
            try {
                const reportController = require('../reports/report.controller');
                const hojeLocal = new Date().toISOString().split('T')[0];
                fechamentoResultado = await reportController.salvarFechamentoDiario(evento_id, hojeLocal, req.user?.id, 'manual');
            } catch (repErr) {
                logger.error('[Reset Diário] Erro ao consolidar relatório diário no reset manual:', repErr);
            }

            logger.info(`🔄 Reset diário executado no evento ${evento_id} pelo usuário ${req.user?.id || 'Admin'}`);

            const websocketService = require('../../services/websocketService');
            websocketService.emit('reset_diario_executado', {
                evento_id,
                hora: new Date().toISOString(),
                fechamento_id: fechamentoResultado?.saved?.id || null,
                totais: fechamentoResultado?.totais || null
            }, evento_id);

            res.json({ 
                success: true, 
                message: 'Reset diário concluído com sucesso. Relatório diário emitido e arquivado.',
                totais: fechamentoResultado?.totais || null,
                snapshot_id: fechamentoResultado?.saved?.id || null
            });
        } catch (error) {
            logger.error('Erro no reset diário:', error);
            res.status(500).json({ error: 'Erro interno no servidor' });
        }
    }
}

module.exports = new MonitorController();
