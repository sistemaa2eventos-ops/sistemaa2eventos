const { supabase } = require('../../config/supabase');
const logger = require('../../services/logger');
const pdfService = require('../../services/pdf.service');
const ExcelJS = require('exceljs');
const { getHojeLocal, getLimitesDiaLocalUTC, TIMEZONE } = require('../../utils/dateUtils');
// PostgREST limita a 1000 linhas: relatórios que somam em memória buscam todas as páginas
const { buscarTodos, buscarPorIdsEmLotes } = require('../../utils/buscarTodos');

// logs_acesso.created_at é UTC gravado sem fuso ("2026-10-11T21:59:40"): sempre ler como UTC
const instante = (ts) => {
    if (typeof ts === 'number') return ts;
    if (!ts) return NaN;
    return Date.parse(/[zZ]|[+-]\d\d:?\d\d$/.test(ts) ? ts : `${ts}Z`);
};
// Horário devolvido ao painel com o "Z" (sem ele o navegador exibia a hora UTC como se fosse local)
const isoUTC = (ts) => {
    const ms = instante(ts);
    return isNaN(ms) ? null : new Date(ms).toISOString();
};

const partesLocais = (ms) => {
    const p = new Intl.DateTimeFormat('en-CA', {
        timeZone: TIMEZONE, hourCycle: 'h23',
        year: 'numeric', month: '2-digit', day: '2-digit',
        hour: '2-digit', minute: '2-digit', second: '2-digit'
    }).formatToParts(new Date(ms));
    const get = (t) => parseInt(p.find(x => x.type === t).value, 10);
    return { ano: get('year'), mes: get('month'), dia: get('day'), hora: get('hour'), min: get('minute'), seg: get('second') };
};
const diaLocal = (ms) => {
    const { ano, mes, dia } = partesLocais(ms);
    return `${ano}-${String(mes).padStart(2, '0')}-${String(dia).padStart(2, '0')}`;
};
const horaLocal = (ms) => partesLocais(ms).hora;
// ExcelJS grava a data como UTC: monta com o relógio local para a célula mostrar a hora do evento
const dataExcel = (ts) => {
    const ms = instante(ts);
    if (isNaN(ms)) return null;
    const { ano, mes, dia, hora, min, seg } = partesLocais(ms);
    return new Date(Date.UTC(ano, mes - 1, dia, hora, min, seg));
};

/**
 * Limite do filtro de período em UTC. Aceita "YYYY-MM-DD" (dia inteiro), o horário local do
 * datetime-local ("YYYY-MM-DDTHH:mm") ou ISO com fuso. Antes cada aba comparava de um jeito e
 * o horário local ia direto contra o UTC do banco (3h de diferença).
 */
const limiteFiltro = (valor, fim = false) => {
    if (!valor) return null;
    const v = String(valor).trim();
    if (/[zZ]|[+-]\d\d:?\d\d$/.test(v)) {
        const ms = Date.parse(v);
        return isNaN(ms) ? null : new Date(ms).toISOString();
    }
    const m = v.match(/^(\d{4}-\d{2}-\d{2})(?:[T ](\d{2}):(\d{2})(?::(\d{2}))?)?/);
    if (!m) return null;
    const limites = getLimitesDiaLocalUTC(m[1]);
    if (!m[2]) return fim ? limites.end : limites.start;
    const deslocamento = ((parseInt(m[2], 10) * 60 + parseInt(m[3], 10)) * 60 + parseInt(m[4] || '0', 10)) * 1000;
    // "até 23:59" inclui o minuto inteiro
    const extra = fim ? (m[4] ? 999 : 59999) : 0;
    return new Date(Date.parse(limites.start) + deslocamento + extra).toISOString();
};
const aplicarPeriodo = (query, { data_inicio, data_fim } = {}, coluna = 'created_at') => {
    const inicio = limiteFiltro(data_inicio);
    const fim = limiteFiltro(data_fim, true);
    if (inicio) query = query.gte(coluna, inicio);
    if (fim) query = query.lte(coluna, fim);
    return query;
};

const ehEntrada = (l) => l.tipo === 'checkin' || l.tipo === 'entrada';
const ehSaida = (l) => l.tipo === 'checkout' || l.tipo === 'saida';
// Saída gravada pelo reset/fechamento de turno para quem ficou "dentro": não é horário real
const ehSaidaForcada = (l) => l.observacao === 'CHECKOUT_FORCADO_CRON';

/** Logs brutos → linhas da aba "Logs de acesso" (empresa e equipamento pelo nome, não pelo id) */
async function formatarLogs(logs, evento_id) {
    const empIds = [...new Set((logs || []).map(l => l.pessoas?.empresa_id).filter(Boolean))];
    const [empRes, dispRes] = await Promise.all([
        empIds.length > 0
            ? buscarPorIdsEmLotes(empIds, (lote) => supabase.from('empresas').select('id, nome').in('id', lote))
            : { data: [] },
        supabase.from('dispositivos_acesso').select('id, nome, localizacao').eq('evento_id', evento_id)
    ]);
    const empMap = (empRes.data || []).reduce((acc, e) => { acc[e.id] = e.nome; return acc; }, {});
    const dispMap = (dispRes.data || []).reduce((acc, d) => { acc[d.id] = d.nome || d.localizacao; return acc; }, {});

    return (logs || []).map(log => ({
        id: log.id,
        tipo: log.tipo,
        metodo: log.metodo,
        dispositivo_id: log.dispositivo_id,
        equipamento: dispMap[log.dispositivo_id] || (log.dispositivo_id ? 'Equipamento removido' : 'Painel / manual'),
        confianca: log.confianca,
        observacao: ehSaidaForcada(log) ? 'Saída automática do fechamento de turno' : log.observacao,
        numero_pulseira: log.numero_pulseira || null,
        horario: isoUTC(log.created_at),
        pessoa: log.pessoas?.nome_completo || 'Desconhecido',
        cpf: log.pessoas?.cpf,
        empresa: empMap[log.pessoas?.empresa_id] || 'Sem Empresa'
    }));
}

class ReportController {
    /**
     * Relatório Diário de Acessos
     * Agrupado por empresa e horário
     */
    async dailyReport(req, res) {
        try {
            const { empresa_id, page = 1, limit = 50 } = req.query;
            const evento_id = req.event.id;
            const from = (parseInt(page) - 1) * parseInt(limit);

            // Passo 1: Buscar logs de acesso brutos
            let query = supabase
                .from('logs_acesso')
                .select('id, tipo, metodo, dispositivo_id, confianca, observacao, numero_pulseira, created_at, pessoa_id, pessoas!inner(id, nome_completo, cpf, empresa_id)', { count: 'exact' })
                .eq('evento_id', evento_id);

            query = aplicarPeriodo(query, req.query);
            if (empresa_id) query = query.eq('pessoas.empresa_id', empresa_id);

            const { data: logs, count, error } = await query
                .order('created_at', { ascending: false })
                .range(from, from + parseInt(limit) - 1);

            if (error) throw error;

            res.json({ success: true, total: count || 0, data: await formatarLogs(logs, evento_id) });
        } catch (error) {
            logger.error('Erro ao gerar relatório diário:', {
                message: error.message,
                code: error.code,
                details: error.details,
                stack: error.stack
            });
            res.status(500).json({ error: 'Erro ao processar relatório' });
        }
    }

    /**
     * Estatísticas Consolidadas por Empresa
     */
    async companySummary(req, res) {
        try {
            const evento_id = req.event.id;

            const { data: pessoas, error } = await buscarTodos(supabase
                .from('pessoas')
                .select('id, status_acesso, empresa_id')
                .eq('evento_id', evento_id));

            if (error) throw error;

            const empIds = [...new Set(pessoas.map(p => p.empresa_id).filter(id => id))];
            const { data: empresasData } = empIds.length > 0
                ? await supabase.from('empresas').select('id, nome').in('id', empIds)
                : { data: [] };

            const empMap = (empresasData || []).reduce((acc, e) => { acc[e.id] = e; return acc; }, {});

            const summary = pessoas.reduce((acc, curr) => {
                const empresaNome = empMap[curr.empresa_id]?.nome || 'Sem Empresa';
                if (!acc[empresaNome]) {
                    acc[empresaNome] = { total: 0, presentes: 0, ausentes: 0 };
                }
                acc[empresaNome].total++;
                if (curr.status_acesso === 'checkin_feito' || curr.status_acesso === 'entrada') acc[empresaNome].presentes++;
                else acc[empresaNome].ausentes++;
                return acc;
            }, {});

            res.json({ success: true, summary });
        } catch (error) {
            logger.error('Erro no resumo por empresa:', {
                message: error.message,
                code: error.code,
                details: error.details,
                stack: error.stack
            });
            res.status(500).json({ error: 'Erro interno' });
        }
    }

    async porArea(req, res) {
        try {
            const { data_inicio, data_fim } = req.query;
            const evento_id = req.event.id;

            logger.info(`📊 porArea solicitado`, {
                evento_id,
                data_inicio,
                data_fim,
                user: req.event?.user_id
            });

            // Não há FK entre logs_acesso e dispositivos
            // Fazer query separadas e combinar manualmente
            const logsQuery = aplicarPeriodo(supabase
                .from('logs_acesso')
                .select('id, dispositivo_id, tipo, created_at')
                .eq('evento_id', evento_id), req.query);

            const { data: logs, error: logsError } = await buscarTodos(logsQuery);
            if (logsError) {
                logger.error(`❌ Erro ao buscar logs:`, {
                    message: logsError.message,
                    code: logsError.code,
                    details: logsError.details
                });
                throw logsError;
            }

            // Se não houver logs, retornar relatório vazio
            if (!logs || logs.length === 0) {
                return res.json({ success: true, data: [] });
            }

            // Buscar todos os dispositivos do evento
            const { data: dispositivos, error: dispError } = await supabase
                .from('dispositivos_acesso')
                .select('id, localizacao')
                .eq('evento_id', evento_id);

            if (dispError) {
                logger.error(`❌ Erro ao buscar dispositivos:`, {
                    message: dispError.message,
                    code: dispError.code
                });
                throw dispError;
            }

            // Criar mapa de dispositivos para lookup rápido
            const dispositivoMap = {};
            (dispositivos || []).forEach(d => {
                dispositivoMap[d.id] = d.localizacao || 'Localização Desconhecida';
            });

            // Agrupar por localização do dispositivo
            const stats = {};
            logs.forEach(log => {
                const localizacao = dispositivoMap[log.dispositivo_id] || 'Localização Desconhecida';
                const key = log.dispositivo_id || 'unknown';

                if (!stats[key]) {
                    stats[key] = {
                        area: localizacao,
                        entradas: 0,
                        saidas: 0,
                        picos: {}
                    };
                }

                if (log.tipo === 'checkin' || log.tipo === 'entrada') stats[key].entradas++;
                if (log.tipo === 'checkout' || log.tipo === 'saida') stats[key].saidas++;

                // hora no fuso do evento (getHours() lia a hora UTC do banco como local: pico 3h adiantado)
                const hora = horaLocal(instante(log.created_at));
                stats[key].picos[hora] = (stats[key].picos[hora] || 0) + 1;
            });

            // Consolidar por nome de área (agrupar dispositivos da mesma área)
            const consolidado = {};
            Object.values(stats).forEach(stat => {
                const areaNome = stat.area;
                if (!consolidado[areaNome]) {
                    consolidado[areaNome] = {
                        area: areaNome,
                        entradas: 0,
                        saidas: 0,
                        picos: {}
                    };
                }
                consolidado[areaNome].entradas += stat.entradas;
                consolidado[areaNome].saidas += stat.saidas;

                // Mesclar picos
                Object.entries(stat.picos).forEach(([hora, qtd]) => {
                    consolidado[areaNome].picos[hora] =
                        (consolidado[areaNome].picos[hora] || 0) + qtd;
                });
            });

            const data = Object.values(consolidado).map(s => {
                const picoHora = Object.entries(s.picos).sort((a, b) => b[1] - a[1])[0];
                return {
                    area: s.area,
                    entradas: s.entradas,
                    saidas: s.saidas,
                    pico: picoHora ? `${String(picoHora[0]).padStart(2, '0')}:00` : '—'
                };
            });

            res.json({ success: true, data });
        } catch (error) {
            const errorInfo = {
                message: error.message || String(error),
                code: error.code,
                status: error.status,
                hint: error.hint,
                details: error.details,
                fullError: JSON.stringify(error)
            };
            console.error('❌ ERRO porArea:', errorInfo);
            logger.error('Erro no relatório por área: ' + JSON.stringify(errorInfo));
            res.status(500).json({
                error: 'Erro ao processar relatório',
                details: process.env.NODE_ENV === 'development' ? errorInfo.message : undefined
            });
        }
    }

    async porEmpresa(req, res) {
        try {
            const { data_inicio, data_fim } = req.query;
            const evento_id = req.event.id;

            // Validar formato de datas (YYYY-MM-DD)
            if (data_inicio && !/^\d{4}-\d{2}-\d{2}/.test(data_inicio)) {
                return res.status(400).json({ error: 'data_inicio deve estar em formato YYYY-MM-DD' });
            }
            if (data_fim && !/^\d{4}-\d{2}-\d{2}/.test(data_fim)) {
                return res.status(400).json({ error: 'data_fim deve estar em formato YYYY-MM-DD' });
            }

            const query = aplicarPeriodo(supabase.from('logs_acesso').select('id, tipo, pessoas!inner(empresa_id, empresas(nome))').eq('evento_id', evento_id), req.query);

            const { data: logs, error } = await buscarTodos(query);
            if (error) throw error;

            const { data: pessoasCount } = await buscarTodos(supabase.from('pessoas').select('id, empresa_id, status_acesso, bloqueado, empresas(nome)').eq('evento_id', evento_id));

            const stats = {};
            // Contar todas as pessoas por empresa (independente de terem logs no período)
            (pessoasCount || []).forEach(p => {
                const empNome = p.empresas?.nome || 'Sem Empresa';
                if (!stats[empNome]) stats[empNome] = { empresa: empNome, pessoas: 0, entradas: 0, saidas: 0, bloqueados: 0, expulsos: 0 };
                stats[empNome].pessoas++;
                // situação atual do cadastro (antes as duas colunas ficavam sempre em 0)
                if (p.status_acesso === 'expulso') stats[empNome].expulsos++;
                else if (p.bloqueado || p.status_acesso === 'bloqueado') stats[empNome].bloqueados++;
            });

            logs.forEach(log => {
                const empNome = log.pessoas?.empresas?.nome || 'Sem Empresa';
                if (!stats[empNome]) stats[empNome] = { empresa: empNome, pessoas: 0, entradas: 0, saidas: 0, bloqueados: 0, expulsos: 0 };
                if (log.tipo === 'checkin' || log.tipo === 'entrada') stats[empNome].entradas++;
                if (log.tipo === 'checkout' || log.tipo === 'saida') stats[empNome].saidas++;
            });

            res.json({ success: true, data: Object.values(stats) });
        } catch (error) {
            logger.error('Erro no relatório por empresa:', {
                message: error.message,
                code: error.code,
                details: error.details,
                stack: error.stack
            });
            res.status(500).json({ error: 'Erro interno' });
        }
    }

    async porLeitor(req, res) {
        try {
            const evento_id = req.event.id;

            const query = aplicarPeriodo(supabase.from('logs_acesso').select('id, dispositivo_id, tipo, observacao').eq('evento_id', evento_id), req.query);

            const { data: logs, error } = await buscarTodos(query);
            if (error) throw error;

            const { data: dispositivos } = await supabase.from('dispositivos_acesso').select('id, nome, localizacao').eq('evento_id', evento_id);
            const dispMap = (dispositivos || []).reduce((acc, d) => { acc[d.id] = d; return acc; }, {});

            const stats = {};
            logs.forEach(log => {
                const disp = dispMap[log.dispositivo_id] || { nome: 'Terminal Desconhecido', localizacao: '—' };
                const key = log.dispositivo_id || 'unknown';
                if (!stats[key]) stats[key] = { terminal: disp.nome, localizacao: disp.localizacao, total: 0, entradas: 0, saidas: 0, erros: 0 };

                stats[key].total++;
                if (log.tipo === 'checkin' || log.tipo === 'entrada') stats[key].entradas++;
                else if (log.tipo === 'checkout' || log.tipo === 'saida') stats[key].saidas++;

                const obs = log.observacao?.toLowerCase() || '';
                if (log.tipo === 'negado' || obs.includes('erro') || obs.includes('negado')) stats[key].erros++;
            });

            res.json({ success: true, data: Object.values(stats) });
        } catch (error) {
            logger.error('Erro no relatório por leitor:', {
                message: error.message,
                code: error.code,
                details: error.details,
                stack: error.stack
            });
            res.status(500).json({ error: 'Erro interno' });
        }
    }

    async porFuncao(req, res) {
        try {
            const evento_id = req.event.id;
            const { data_inicio, data_fim } = req.query;

            const { data: pessoas, error } = await buscarTodos(supabase
                .from('pessoas')
                .select('id, funcao, status_acesso')
                .eq('evento_id', evento_id));

            if (error) throw error;

            const stats = {};
            pessoas.forEach(p => {
                const func = p.funcao || 'NÃO DEFINIDO';
                if (!stats[func]) stats[func] = { funcao: func, total: 0, presentes: 0, entradas_periodo: 0, saidas_periodo: 0 };
                stats[func].total++;
                if (p.status_acesso === 'checkin_feito' || p.status_acesso === 'entrada') stats[func].presentes++;
            });

            // Buscar logs do período filtrado (data_inicio/data_fim ou hoje como padrão)
            const logsQuery = aplicarPeriodo(supabase
                .from('logs_acesso')
                .select('id, tipo, pessoas!inner(funcao)')
                .eq('evento_id', evento_id), { data_inicio: data_inicio || getHojeLocal(), data_fim });
            const { data: logsHoje } = await buscarTodos(logsQuery);

            (logsHoje || []).forEach(log => {
                const func = log.pessoas?.funcao || 'NÃO DEFINIDO';
                if (stats[func]) {
                    if (log.tipo === 'checkin' || log.tipo === 'entrada') stats[func].entradas_periodo++;
                    if (log.tipo === 'checkout' || log.tipo === 'saida') stats[func].saidas_periodo++;
                }
            });

            res.json({ success: true, data: Object.values(stats) });
        } catch (error) {
            logger.error('Erro no relatório por função:', {
                message: error.message,
                code: error.code,
                details: error.details,
                stack: error.stack
            });
            res.status(500).json({ error: 'Erro interno' });
        }
    }

    async porStatus(req, res) {
        try {
            const evento_id = req.event.id;
            const { data: counts, error } = await supabase.rpc('count_pessoas_by_status', { ev_id: evento_id });

            // Fallback se a RPC não existir
            if (error) {
                const { data: pessoas } = await buscarTodos(supabase.from('pessoas').select('id, status_acesso').eq('evento_id', evento_id));
                const stats = (pessoas || []).reduce((acc, p) => {
                    const s = p.status_acesso || 'pendente';
                    acc[s] = (acc[s] || 0) + 1;
                    return acc;
                }, {});
                const data = Object.entries(stats).map(([status, qtd]) => ({ status, quantidade: qtd }));
                return res.json({ success: true, data });
            }

            res.json({ success: true, data: counts });
        } catch (error) {
            logger.error('Erro no relatório por status:', {
                message: error.message,
                code: error.code,
                details: error.details,
                stack: error.stack
            });
            res.status(500).json({ error: 'Erro interno' });
        }
    }

    /**
     * Relatório de Ponto — Todas as entradas/saídas por pessoa/área/dia
     * GET /reports/ponto?data_inicio=...&data_fim=...&pessoa_id=...&empresa_id=...&area_id=...
     */
    async ponto(req, res) {
        try {
            const { pessoa_id, empresa_id, area_id, page = 1, limit = 100 } = req.query;
            const evento_id = req.event.id;
            const from = (parseInt(page) - 1) * parseInt(limit);

            // Buscar logs de checkin/checkout ordenados
            let query = supabase
                .from('logs_acesso')
                .select(`
                    id, tipo, metodo, area_id, numero_pulseira, observacao, created_at, pessoa_id,
                    pessoas!inner(id, nome_completo, cpf, empresa_id, foto_url, numero_pulseira)
                `, { count: 'exact' })
                .eq('evento_id', evento_id)
                .in('tipo', ['checkin', 'checkout', 'entrada', 'saida'])
                .order('created_at', { ascending: true });

            query = aplicarPeriodo(query, req.query);
            if (pessoa_id) query = query.eq('pessoa_id', pessoa_id);
            if (empresa_id) query = query.eq('pessoas.empresa_id', empresa_id);
            if (area_id) query = query.eq('area_id', area_id);

            const { data: logs, count, error } = await query.range(from, from + parseInt(limit) - 1);
            if (error) throw error;

            // Buscar nomes de empresas e áreas
            const empIds = [...new Set((logs || []).map(l => l.pessoas?.empresa_id).filter(Boolean))];
            const areaIds = [...new Set((logs || []).map(l => l.area_id).filter(Boolean))];

            const [empRes, areaRes] = await Promise.all([
                empIds.length > 0
                    ? supabase.from('empresas').select('id, nome').in('id', empIds)
                    : { data: [] },
                areaIds.length > 0
                    ? supabase.from('evento_areas').select('id, nome_area').in('id', areaIds)
                    : { data: [] }
            ]);

            const empMap = (empRes.data || []).reduce((a, e) => { a[e.id] = e.nome; return a; }, {});
            const areaMap = (areaRes.data || []).reduce((a, e) => { a[e.id] = e.nome_area; return a; }, {});

            // Formatar resposta
            const data = (logs || []).map(log => ({
                id: log.id,
                tipo: log.tipo,
                metodo: log.metodo,
                horario: isoUTC(log.created_at),
                saida_nao_registrada: ehSaidaForcada(log),
                area: areaMap[log.area_id] || null,
                area_id: log.area_id,
                pulseira: log.numero_pulseira,
                pessoa_id: log.pessoa_id,
                pessoa: log.pessoas?.nome_completo,
                cpf: log.pessoas?.cpf,
                foto_url: log.pessoas?.foto_url,
                empresa: empMap[log.pessoas?.empresa_id] || 'Sem Empresa'
            }));

            res.json({ success: true, total: count || 0, data });
        } catch (error) {
            logger.error('Erro no relatório de ponto:', { message: error.message, code: error.code });
            res.status(500).json({ error: 'Erro ao processar relatório de ponto' });
        }
    }

    /**
     * Relatório de Ponto Resumido — Primeira entrada, última saída, total horas por pessoa/dia
     * GET /reports/ponto-resumo?data_inicio=...&data_fim=...&empresa_id=...&area_id=...
     */
    async pontoResumo(req, res) {
        try {
            const { empresa_id, area_id } = req.query;
            const evento_id = req.event.id;

            // Buscar todos os logs de checkin/checkout do período
            let query = supabase
                .from('logs_acesso')
                .select(`
                    id, tipo, area_id, numero_pulseira, observacao, created_at, pessoa_id,
                    pessoas!inner(id, nome_completo, cpf, empresa_id, numero_pulseira)
                `)
                .eq('evento_id', evento_id)
                .in('tipo', ['checkin', 'checkout', 'entrada', 'saida'])
                .order('created_at', { ascending: true });

            query = aplicarPeriodo(query, req.query);
            if (empresa_id) query = query.eq('pessoas.empresa_id', empresa_id);
            if (area_id) query = query.eq('area_id', area_id);

            const { data: logs, error } = await buscarTodos(query);
            if (error) throw error;

            // Agrupar por pessoa + dia do TURNO: o dia é o da entrada (no fuso do evento), e a saída
            // vai para o turno da última entrada. Antes o dia era o UTC do log: entrada às 22h caía no
            // dia seguinte e a saída da madrugada abria um "dia" sem entrada.
            const grouped = {};
            const diaDoTurno = {}; // pessoa_id → dia da última entrada vista
            (logs || []).forEach(log => {
                const ms = instante(log.created_at);
                const entrada = ehEntrada(log);
                const dia = entrada || !diaDoTurno[log.pessoa_id] ? diaLocal(ms) : diaDoTurno[log.pessoa_id];
                if (entrada) diaDoTurno[log.pessoa_id] = dia;
                const key = `${log.pessoa_id}_${dia}`;

                if (!grouped[key]) {
                    grouped[key] = {
                        pessoa_id: log.pessoa_id,
                        pessoa: log.pessoas?.nome_completo,
                        cpf: log.pessoas?.cpf,
                        pulseira: null,
                        empresa_id: log.pessoas?.empresa_id,
                        dia,
                        primeira_entrada: null,
                        ultima_saida: null,
                        saida_nao_registrada: false,
                        entradas: 0,
                        saidas: 0
                    };
                }
                const g = grouped[key];

                if (entrada) {
                    g.entradas++;
                    if (g.primeira_entrada === null || ms < g.primeira_entrada) {
                        g.primeira_entrada = ms;
                        // pulseira usada naquele turno, não a que a pessoa tem hoje
                        g.pulseira = log.numero_pulseira || g.pulseira;
                    }
                } else {
                    g.saidas++;
                    if (g.ultima_saida === null || ms > g.ultima_saida) {
                        g.ultima_saida = ms;
                        g.saida_nao_registrada = ehSaidaForcada(log);
                    }
                }
            });

            // Resolver nomes de empresas
            const empIds = [...new Set(Object.values(grouped).map(g => g.empresa_id).filter(Boolean))];
            const { data: empData } = empIds.length > 0
                ? await supabase.from('empresas').select('id, nome').in('id', empIds)
                : { data: [] };
            const empMap = (empData || []).reduce((a, e) => { a[e.id] = e.nome; return a; }, {});

            // Calcular total de horas e formatar
            // só a saída automática de um turno aberto antes do período não é um dia de trabalho
            const data = Object.values(grouped).filter(g => g.entradas > 0 || !g.saida_nao_registrada).map(g => {
                let totalHoras = null;
                // saída gravada pelo fechamento de turno não é horário real: horas ficam "a conferir"
                if (g.primeira_entrada !== null && g.ultima_saida !== null && !g.saida_nao_registrada && g.ultima_saida > g.primeira_entrada) {
                    const diffMs = g.ultima_saida - g.primeira_entrada;
                    totalHoras = Math.round((diffMs / 3600000) * 100) / 100; // 2 casas decimais
                }

                return {
                    pessoa: g.pessoa,
                    cpf: g.cpf,
                    pulseira: g.pulseira,
                    empresa: empMap[g.empresa_id] || 'Sem Empresa',
                    dia: g.dia,
                    primeira_entrada: g.primeira_entrada !== null ? new Date(g.primeira_entrada).toISOString() : null,
                    ultima_saida: g.ultima_saida !== null ? new Date(g.ultima_saida).toISOString() : null,
                    saida_nao_registrada: g.saida_nao_registrada,
                    total_horas: totalHoras,
                    entradas: g.entradas,
                    saidas: g.saidas
                };
            }).sort((a, b) => a.dia.localeCompare(b.dia) || a.pessoa.localeCompare(b.pessoa));

            res.json({ success: true, total: data.length, data });
        } catch (error) {
            logger.error('Erro no resumo de ponto:', { message: error.message, code: error.code });
            res.status(500).json({ error: 'Erro ao processar resumo de ponto' });
        }
    }

    /**
     * Ranking de Engajamento (Gamificação)
    */
    async getRanking(req, res) {
        try {
            const evento_id = req.event.id;

            const { data: settingsData } = await supabase
                .from('system_settings')
                .select('gamification_enabled, gamification_points_scan, gamification_points_earlybird, gamification_points_checkin')
                .eq('id', 1)
                .maybeSingle();

            const settings = settingsData || {
                gamification_enabled: false,
                gamification_points_checkin: 10
            };

            if (!settings.gamification_enabled) return res.json({ success: true, enabled: false, data: [] });

            // 1. Logs
            const { data: logs, error: logsError } = await buscarTodos(supabase
                .from('logs_acesso')
                .select('id, pessoa_id, tipo, created_at')
                .eq('evento_id', evento_id)
                .not('pessoa_id', 'is', null));

            if (logsError) throw logsError;

            // 2. Unificação de Pessoas em Memória
            const pIds = [...new Set(logs.map(l => l.pessoa_id))];
            const { data: pData } = await buscarPorIdsEmLotes(pIds, (lote) => supabase.from('pessoas').select('id, nome_completo, foto_url, empresa_id').in('id', lote));
            const pMap = (pData || []).reduce((acc, p) => { acc[p.id] = p; return acc; }, {});

            // 3. Unificação de Empresas em Memória
            const eIds = [...new Set((pData || []).map(p => p.empresa_id).filter(id => id))];
            const { data: eData } = await supabase.from('empresas').select('id, nome').in('id', eIds);
            const eMap = (eData || []).reduce((acc, e) => { acc[e.id] = e; return acc; }, {});

            const scores = {};
            logs.forEach(log => {
                const pid = log.pessoa_id;
                const pessoa = pMap[pid];
                if (!pessoa) return;

                if (!scores[pid]) {
                    scores[pid] = {
                        id: pid,
                        nome: pessoa.nome_completo,
                        empresa: eMap[pessoa.empresa_id]?.nome || 'S/ Empresa',
                        foto: pessoa.foto_url,
                        score: 0,
                        atividades: 0
                    };
                }

                scores[pid].atividades++;
                if (log.tipo === 'checkin') scores[pid].score += settings.gamification_points_checkin;
            });

            const ranking = Object.values(scores).sort((a, b) => b.score - a.score).slice(0, 10);
            res.json({ success: true, enabled: true, data: ranking });
        } catch (error) {
            logger.error('Erro ao gerar ranking:', {
                message: error.message,
                code: error.code,
                details: error.details,
                stack: error.stack
            });
            res.status(500).json({ error: 'Erro ao calcular gamificação' });
        }
    }

    /**
     * Download de Lista de Presença em PDF
     */
    async attendancePDF(req, res) {
        try {
            const evento_id = req.event.id;
            const evento_nome = req.event.nome;
            const { empresa_id } = req.query;

            // 1. Pessoas
            let query = supabase.from('pessoas').select('id, nome_completo, cpf, empresa_id').eq('evento_id', evento_id).order('nome_completo');
            if (empresa_id) query = query.eq('empresa_id', empresa_id);
            const { data: pessoas, error } = await buscarTodos(query);
            if (error) throw error;

            // 2. Empresas para unificação
            const empIds = [...new Set(pessoas.map(p => p.empresa_id).filter(id => id))];
            const { data: eData } = await supabase.from('empresas').select('id, nome').in('id', empIds);
            const eMap = (eData || []).reduce((acc, e) => { acc[e.id] = e; return acc; }, {});

            const finalPessoas = pessoas.map(p => ({
                ...p,
                nome_completo: p.nome_completo, // Para compatibilidade com PDF service
                empresas: { nome: eMap[p.empresa_id]?.nome || 'Sem Empresa' }
            }));

            const pdfBuffer = await pdfService.generateAttendanceList({ nome: evento_nome }, finalPessoas);
            res.setHeader('Content-Type', 'application/pdf');
            res.send(pdfBuffer);
        } catch (error) {
            logger.error('Erro ao gerar PDF de presença:', {
                message: error.message,
                code: error.code,
                details: error.details,
                stack: error.stack
            });
            res.status(500).json({ error: 'Falha ao gerar relatório PDF.' });
        }
    }

    // =========================================================================
    // RELATÓRIOS DIÁRIOS CONSOLIDADOS (PADRÃO NZT RELATÓRIOS)
    // Colunas: Empresa | Colaborador | CPF | Função | Nº Pulseira | Check-in | Check-out | Permanência
    // =========================================================================

    /**
     * Formata CPF no padrão 000.000.000-00
     */
    _formatarCPF(cpf) {
        if (!cpf) return '—';
        const clean = String(cpf).replace(/\D/g, '');
        if (clean.length === 11) {
            return clean.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4');
        }
        return cpf;
    }

    /**
     * Formata Timestamp para dd/MM/yyyy HH:mm:ss
     */
    _formatarDataHora(dateStr) {
        if (!dateStr && dateStr !== 0) return '—';
        try {
            // Horário sem fuso vindo do banco (logs_acesso) é UTC; exibe sempre no fuso do evento
            const naive = typeof dateStr === 'string' && !/[zZ]|[+-]\d\d:?\d\d$/.test(dateStr);
            const d = new Date(naive ? `${dateStr}Z` : dateStr);
            if (isNaN(d.getTime())) return '—';
            return d.toLocaleString('pt-BR', {
                timeZone: TIMEZONE,
                day: '2-digit', month: '2-digit', year: 'numeric',
                hour: '2-digit', minute: '2-digit', second: '2-digit'
            });
        } catch {
            return '—';
        }
    }

    /**
     * Formata Duração em Milissegundos para XXh YYm ZZs
     */
    _formatarDuracaoMs(ms) {
        if (!ms || ms <= 0) return '00h 00m 00s';
        const totalSecs = Math.floor(ms / 1000);
        const hours = Math.floor(totalSecs / 3600);
        const mins = Math.floor((totalSecs % 3600) / 60);
        const secs = totalSecs % 60;
        return `${String(hours).padStart(2, '0')}h ${String(mins).padStart(2, '0')}m ${String(secs).padStart(2, '0')}s`;
    }

    /**
     * Resolve contexto de evento com fallback seguro para req.query e req.headers
     */
    _resolveEvento(req) {
        const id = req.event?.id || req.query?.evento_id || req.headers?.['x-evento-id'] || req.user?.evento_id;
        const nome = req.event?.nome || req.query?.evento_nome || 'A2 Eventos';
        return { id, nome };
    }

    /**
     * Core: Processa dados consolidados do relatório diário
     * Regras NZT:
     * 1. A pulseira vinculada é SOMENTE a do check-in realizado naquele dia (ou turno estendido).
     *    Colaboradores ausentes no dia NÃO exibem pulseira (fica '—').
     * 2. Se o checkout foi realizado no dia seguinte, ele é computado com a data/hora exata do dia seguinte
     *    e o tempo de permanência contabiliza todo o turno estendido.
     * 3. Se o check-in foi no dia anterior e o checkout ocorreu no dia do relatório, o registro também é exibido.
     */
    async gerarDadosRelatorioDiarioConsolidado(evento_id, dataReferencia, empresa_id = null) {
        try {
            const dataRef = dataReferencia || getHojeLocal();

            // Janela estendida (dia anterior até dia seguinte para turnos que atravessam a madrugada)
            const dRef = new Date(dataRef + 'T12:00:00Z');
            const dOntem = new Date(dRef);
            dOntem.setDate(dOntem.getDate() - 1);
            const ontemStr = dOntem.toISOString().split('T')[0];

            const dAmanha = new Date(dRef);
            dAmanha.setDate(dAmanha.getDate() + 1);
            const amanhaStr = dAmanha.toISOString().split('T')[0];

            // logs_acesso.created_at é UTC sem fuso ("2026-10-11T21:59:40"): comparar como instante, nunca como
            // texto (antes uma entrada às 22h do dia 9 caía no dia 10). Limites do dia local já em UTC.
            const inicioOntem = getLimitesDiaLocalUTC(ontemStr).start;
            const inicioDia = getLimitesDiaLocalUTC(dataRef).start;
            const fimDia = getLimitesDiaLocalUTC(dataRef).end;
            const fimAmanha = getLimitesDiaLocalUTC(amanhaStr).end;
            const msInicioDia = Date.parse(inicioDia);
            const msFimDia = Date.parse(fimDia);
            const msFimAmanha = Date.parse(fimAmanha);

            if (!evento_id) {
                return {
                    registros: [],
                    totais: {
                        total_colaboradores: 0,
                        total_presentes: 0,
                        total_finalizados: 0,
                        total_ausentes: 0,
                        total_checkins: 0,
                        tempo_medio_minutos: 0,
                        tempo_medio_formatado: '00h 00m 00s'
                    },
                    dataReferencia: dataRef
                };
            }

            // 1. Pessoas do evento
            let pessoasQuery = supabase
                .from('pessoas')
                .select('id, nome_completo, cpf, funcao, numero_pulseira, empresa_id, status_acesso')
                .eq('evento_id', evento_id);

            if (empresa_id) {
                pessoasQuery = pessoasQuery.eq('empresa_id', empresa_id);
            }

            const { data: pessoas, error: pError } = await buscarTodos(pessoasQuery.order('nome_completo'));
            if (pError) throw pError;

            // 2. Empresas do evento
            const { data: empresas, error: eError } = await supabase
                .from('empresas')
                .select('id, nome')
                .eq('evento_id', evento_id);
            if (eError) throw eError;

            const empMap = (empresas || []).reduce((acc, e) => {
                acc[e.id] = e;
                return acc;
            }, {});

            // 3. Logs de acesso na janela expandida (ontem até amanhã para capturar viradas de turno)
            const { data: logs, error: lError } = await buscarTodos(supabase
                .from('logs_acesso')
                .select('id, pessoa_id, tipo, numero_pulseira, observacao, created_at')
                .eq('evento_id', evento_id)
                .gte('created_at', inicioOntem)
                .lte('created_at', fimAmanha)
                .order('created_at', { ascending: true }));

            if (lError) throw lError;

            // Agrupar logs por pessoa_id
            const logsPorPessoa = {};
            (logs || []).forEach(log => {
                if (!log.pessoa_id) return;
                if (!logsPorPessoa[log.pessoa_id]) logsPorPessoa[log.pessoa_id] = [];
                logsPorPessoa[log.pessoa_id].push({ ...log, ms: instante(log.created_at) });
            });

            const hojeStr = getHojeLocal();
            const isHoje = dataRef === hojeStr;
            const now = new Date();

            let totalPresentes = 0;
            let totalFinalizados = 0;
            let totalAusentes = 0;
            let totalMinutosAcumulado = 0;
            let contagemComTempo = 0;

            const registros = (pessoas || []).map(p => {
                const pLogs = logsPorPessoa[p.id] || [];

                // Entradas e saídas categorizadas por janela temporal
                const entradasHoje = pLogs.filter(l => ehEntrada(l) && l.ms >= msInicioDia && l.ms <= msFimDia);
                const saidasHoje = pLogs.filter(l => ehSaida(l) && l.ms >= msInicioDia && l.ms <= msFimDia);
                const saidasAmanha = pLogs.filter(l => ehSaida(l) && l.ms > msFimDia && l.ms <= msFimAmanha);
                const proximaEntradaAmanha = pLogs.find(l => ehEntrada(l) && l.ms > msFimDia);

                let checkinAt = '—';
                let checkoutAt = '—';
                let tempoPermanencia = '—';
                let tempoMinutos = 0;
                let status = 'ausente';
                let pulseiraDoTurno = '—';
                let saidaNaoRegistrada = false;
                let turnoAnterior = false;

                if (entradasHoje.length > 0) {
                    // CENÁRIO 1: turno aberto no dia de referência. O turno começa na PRIMEIRA entrada
                    // do dia (antes, com várias entradas e a última em aberto, começava na última e
                    // perdia as horas da manhã) e termina na saída que fecha a última entrada.
                    const primeiraEntrada = entradasHoje[0];
                    const ultimaEntrada = entradasHoje[entradasHoje.length - 1];

                    checkinAt = this._formatarDataHora(primeiraEntrada.ms);
                    // A pulseira deve ser estritamente a do check-in realizado
                    pulseiraDoTurno = primeiraEntrada.numero_pulseira || (isHoje ? p.numero_pulseira : null) || '—';

                    // Saída no mesmo dia (a última depois da última entrada) ou, em turno que vira a
                    // madrugada, a primeira saída do dia seguinte — desde que antes de uma nova entrada
                    const saidaDoDia = saidasHoje.filter(s => s.ms > ultimaEntrada.ms).pop();
                    const saidaFinal = saidaDoDia || saidasAmanha.find(s => s.ms > ultimaEntrada.ms
                        && (!proximaEntradaAmanha || s.ms < proximaEntradaAmanha.ms));

                    if (saidaFinal && ehSaidaForcada(saidaFinal)) {
                        // Ficou "dentro" até o fechamento de turno: não houve saída real.
                        // Não soma horas (antes contava até a hora do reset).
                        checkoutAt = 'Não registrada';
                        tempoPermanencia = 'Saída não registrada';
                        status = 'finalizado';
                        saidaNaoRegistrada = true;
                        totalFinalizados++;
                    } else if (saidaFinal) {
                        const ms = saidaFinal.ms - primeiraEntrada.ms;
                        checkoutAt = this._formatarDataHora(saidaFinal.ms);
                        tempoPermanencia = this._formatarDuracaoMs(ms);
                        tempoMinutos = Math.max(0, Math.round(ms / 60000));
                        status = 'finalizado';
                        totalFinalizados++;
                        totalMinutosAcumulado += tempoMinutos;
                        contagemComTempo++;
                    } else {
                        // Ainda presente no evento (em andamento) — fora da média até sair
                        checkoutAt = 'No evento';
                        const refTime = isHoje ? now.getTime() : msFimDia;
                        const ms = Math.max(0, refTime - primeiraEntrada.ms);
                        tempoPermanencia = `Em andamento (${this._formatarDuracaoMs(ms)})`;
                        tempoMinutos = Math.max(0, Math.round(ms / 60000));
                        status = 'presente';
                        totalPresentes++;
                    }
                } else {
                    // CENÁRIO 2: entrou no dia anterior e o turno ainda não tinha fechado à meia-noite.
                    // O turno pertence ao dia da ENTRADA: as horas já estão no relatório de ontem e aqui
                    // não somam de novo (antes o mesmo turno contava nos dois dias).
                    const entradaAnterior = pLogs.filter(l => ehEntrada(l) && l.ms < msInicioDia).pop();
                    const fechouAntes = entradaAnterior && pLogs.some(l => ehSaida(l) && l.ms > entradaAnterior.ms && l.ms < msInicioDia);
                    const saidaHoje = entradaAnterior && saidasHoje.find(s => s.ms > entradaAnterior.ms);
                    const aindaDentro = isHoje || p.status_acesso === 'checkin_feito' || p.status_acesso === 'entrada';

                    // saída forçada do fechamento não é presença no dia: segue como ausente
                    if (entradaAnterior && !fechouAntes && ((saidaHoje && !ehSaidaForcada(saidaHoje)) || (!saidaHoje && aindaDentro))) {
                        turnoAnterior = true;
                        pulseiraDoTurno = entradaAnterior.numero_pulseira || (isHoje ? p.numero_pulseira : null) || '—';
                        checkinAt = this._formatarDataHora(entradaAnterior.ms);

                        if (saidaHoje) {
                            checkoutAt = this._formatarDataHora(saidaHoje.ms);
                            tempoPermanencia = 'Turno do dia anterior';
                            status = 'finalizado';
                            totalFinalizados++;
                        } else {
                            checkoutAt = 'No evento';
                            const refTime = isHoje ? now.getTime() : msFimDia;
                            const ms = Math.max(0, refTime - entradaAnterior.ms);
                            tempoPermanencia = `Em andamento (${this._formatarDuracaoMs(ms)})`;
                            tempoMinutos = Math.max(0, Math.round(ms / 60000));
                            status = 'presente';
                            totalPresentes++;
                        }
                    } else {
                        // CENÁRIO 3: Não compareceu no dia de referência (ausente)
                        // A pulseira deve ser estritamente '—' pois não houve check-in no dia
                        totalAusentes++;
                    }
                }

                return {
                    id: p.id,
                    empresa_nome: empMap[p.empresa_id]?.nome || 'Sem Empresa',
                    colaborador_nome: p.nome_completo || 'Sem Nome',
                    cpf: this._formatarCPF(p.cpf),
                    funcao: p.funcao || '—',
                    numero_pulseira: pulseiraDoTurno,
                    checkin_at: checkinAt,
                    checkout_at: checkoutAt,
                    tempo_permanencia: tempoPermanencia,
                    tempo_minutos: tempoMinutos,
                    saida_nao_registrada: saidaNaoRegistrada,
                    turno_anterior: turnoAnterior,
                    status
                };
            });

            // Ordenar: presentes primeiro, finalizados depois, por empresa e colaborador
            registros.sort((a, b) => {
                const prioridade = { presente: 1, finalizado: 2, ausente: 3 };
                if (prioridade[a.status] !== prioridade[b.status]) {
                    return prioridade[a.status] - prioridade[b.status];
                }
                const empCmp = a.empresa_nome.localeCompare(b.empresa_nome);
                if (empCmp !== 0) return empCmp;
                return a.colaborador_nome.localeCompare(b.colaborador_nome);
            });

            const mediaMinutos = contagemComTempo > 0 ? Math.round(totalMinutosAcumulado / contagemComTempo) : 0;
            const tempoMedioFmt = this._formatarDuracaoMs(mediaMinutos * 60000);

            const totais = {
                total_colaboradores: (pessoas || []).length,
                total_presentes: totalPresentes,
                total_finalizados: totalFinalizados,
                total_ausentes: totalAusentes,
                total_checkins: totalPresentes + totalFinalizados,
                tempo_medio_minutos: mediaMinutos,
                tempo_medio_formatado: tempoMedioFmt
            };

            return { registros, totais, dataReferencia: dataRef };
        } catch (error) {
            logger.error('Erro em gerarDadosRelatorioDiarioConsolidado:', error);
            throw error;
        }
    }

    /**
     * Endpoint API: Retorna relatório diário consolidado para visualização em tela
     */
    async relatorioDiarioConsolidado(req, res) {
        try {
            const { id: evento_id } = this._resolveEvento(req);
            const { data, empresa_id, status, search, fechamento_id } = req.query;
            const dataRef = data || getHojeLocal();

            if (!evento_id) {
                return res.json({
                    success: true,
                    data: [],
                    totais: {
                        total_colaboradores: 0,
                        total_presentes: 0,
                        total_finalizados: 0,
                        total_ausentes: 0,
                        total_checkins: 0,
                        tempo_medio_formatado: '00h 00m'
                    },
                    data_referencia: dataRef
                });
            }

            let registros = [];
            let totais = {};
            let fechamentoInfo = null;

            // Se solicitado por fechamento salvo específico
            if (fechamento_id) {
                try {
                    const { data: fechamento } = await supabase
                        .from('relatorios_diarios_fechados')
                        .select('*')
                        .eq('id', fechamento_id)
                        .eq('evento_id', evento_id)
                        .maybeSingle();

                    if (fechamento) {
                        registros = fechamento.dados_relatorio || [];
                        // Totais saem da própria lista arquivada (antes "presentes" vinha fixo em 0
                        // enquanto a lista mostrava gente "No evento")
                        const contar = (st) => registros.filter(r => r.status === st).length;
                        // média só de turnos encerrados com saída real (igual ao relatório ao vivo)
                        const comTempo = registros.filter(r => r.status === 'finalizado' && r.tempo_minutos > 0);
                        const mediaMin = comTempo.length ? Math.round(comTempo.reduce((a, r) => a + r.tempo_minutos, 0) / comTempo.length) : 0;
                        totais = {
                            total_colaboradores: registros.length || fechamento.total_colaboradores || 0,
                            total_presentes: contar('presente'),
                            total_finalizados: contar('finalizado'),
                            total_ausentes: contar('ausente'),
                            total_checkins: contar('presente') + contar('finalizado'),
                            tempo_medio_minutos: mediaMin,
                            tempo_medio_formatado: this._formatarDuracaoMs(mediaMin * 60000)
                        };
                        fechamentoInfo = {
                            id: fechamento.id,
                            hora_fechamento: fechamento.hora_fechamento,
                            tipo_reset: fechamento.tipo_reset
                        };
                    }
                } catch (snapErr) {
                    logger.warn('Aviso ao consultar snapshot fechado:', snapErr.message);
                }
            }

            if (!fechamentoInfo) {
                const dados = await this.gerarDadosRelatorioDiarioConsolidado(evento_id, dataRef, empresa_id);
                registros = dados.registros;
                totais = dados.totais;
            }

            // Filtro por status
            if (status && status !== 'todos') {
                registros = registros.filter(r => r.status === status);
            }

            // Filtro de busca textual
            if (search) {
                const q = search.toLowerCase().trim();
                registros = registros.filter(r =>
                    (r.colaborador_nome && r.colaborador_nome.toLowerCase().includes(q)) ||
                    (r.empresa_nome && r.empresa_nome.toLowerCase().includes(q)) ||
                    (r.cpf && r.cpf.includes(q)) ||
                    (r.funcao && r.funcao.toLowerCase().includes(q)) ||
                    (r.numero_pulseira && r.numero_pulseira.toLowerCase().includes(q))
                );
            }

            res.json({
                success: true,
                data: registros,
                totais,
                data_referencia: dataRef,
                fechamento_info: fechamentoInfo
            });
        } catch (error) {
            logger.error('Erro ao consultar relatório diário consolidado:', error);
            res.status(500).json({ error: 'Erro ao processar relatório diário consolidado.' });
        }
    }

    /**
     * Salva snapshot completo do relatório diário no reset diário (manual ou automático)
     */
    async salvarFechamentoDiario(evento_id, dataReferencia, executado_por = null, tipo_reset = 'manual') {
        try {
            const dataRef = dataReferencia || getHojeLocal();
            const { registros, totais } = await this.gerarDadosRelatorioDiarioConsolidado(evento_id, dataRef);

            let saved = null;
            try {
                const { data: inserted, error: insertErr } = await supabase
                    .from('relatorios_diarios_fechados')
                    .insert({
                        evento_id,
                        data_referencia: dataRef,
                        hora_fechamento: new Date().toISOString(),
                        tipo_reset,
                        executado_por,
                        total_colaboradores: totais.total_colaboradores || registros.length,
                        total_checkins: totais.total_checkins || 0,
                        total_checkouts: totais.total_finalizados || 0,
                        dados_relatorio: registros
                    })
                    .select()
                    .single();

                if (insertErr) {
                    logger.warn(`[Reset Diário] Erro ao gravar snapshot em relatorios_diarios_fechados: ${insertErr.message}`);
                } else {
                    saved = inserted;
                    logger.info(`✅ [Reset Diário] Snapshot do relatório diário gravado com sucesso (${registros.length} registros).`);
                }
            } catch (tableErr) {
                logger.warn(`[Reset Diário] Tabela relatorios_diarios_fechados não disponível: ${tableErr.message}`);
            }

            // Notifica WebSocket para os clientes da sala do evento
            try {
                const websocketService = require('../../services/websocketService');
                websocketService.emit('relatorio_diario_gerado', {
                    evento_id,
                    data_referencia: dataRef,
                    tipo_reset,
                    totais,
                    snapshot_id: saved?.id || null
                }, evento_id);
            } catch (wsErr) {
                // silencia erro de socket
            }

            return { success: true, saved, totais, registros };
        } catch (error) {
            logger.error('[Reset Diário] Falha ao processar fechamento diário:', error);
            return { success: false, error: error.message };
        }
    }

    /**
     * Lista relatórios diários fechados já gravados
     */
    async listarFechamentosDiarios(req, res) {
        try {
            const { id: evento_id } = this._resolveEvento(req);
            if (!evento_id) return res.json({ success: true, data: [] });

            const { data: fechamentos, error } = await supabase
                .from('relatorios_diarios_fechados')
                .select('id, data_referencia, hora_fechamento, tipo_reset, total_colaboradores, total_checkins, total_checkouts, created_at')
                .eq('evento_id', evento_id)
                .order('hora_fechamento', { ascending: false });

            if (error) {
                if (!error.message?.includes('schema cache')) {
                    logger.warn('Erro ao listar relatórios fechados:', error.message);
                }
                return res.json({ success: true, data: [] });
            }

            res.json({ success: true, data: fechamentos || [] });
        } catch (error) {
            logger.error('Erro ao listar fechamentos diários:', error);
            res.json({ success: true, data: [] });
        }
    }

    /**
     * Exporta Relatório Diário em XLSX com formatação premium NZT
     */
    async exportarRelatorioDiarioXLSX(req, res) {
        try {
            const { id: evento_id, nome: evento_nome } = this._resolveEvento(req);
            const { data, empresa_id } = req.query;
            const dataRef = data || getHojeLocal();

            const workbook = await this.gerarWorkbookRelatorioDiario(evento_id, evento_nome, dataRef, empresa_id);

            res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
            res.setHeader('Content-Disposition', `attachment; filename=relatorio_diario_${dataRef}.xlsx`);
            const buffer = await workbook.xlsx.writeBuffer();
            res.send(buffer);
        } catch (error) {
            logger.error('Erro ao exportar relatório diário XLSX:', error);
            res.status(500).json({ error: 'Falha ao gerar planilha Excel.' });
        }
    }

    /**
     * Planilha do relatório diário consolidado (usada no download e no envio automático por e-mail).
     */
    async gerarWorkbookRelatorioDiario(evento_id, evento_nome, dataRef, empresa_id = null) {
            const { registros, totais } = await this.gerarDadosRelatorioDiarioConsolidado(evento_id, dataRef, empresa_id);

            const workbook = new ExcelJS.Workbook();
            workbook.creator = 'NZT Relatórios';
            workbook.created = new Date();

            const sheet = workbook.addWorksheet(`Relatório Diário ${dataRef}`);

            // Título Superior
            sheet.mergeCells('A1:I1');
            const titleCell = sheet.getCell('A1');
            titleCell.value = 'NZT RELATÓRIOS — FECHAMENTO DIÁRIO DE CONTROLE DE ACESSO';
            titleCell.font = { name: 'Calibri', size: 14, bold: true, color: { argb: 'FFFFFFFF' } };
            titleCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0A1929' } };
            titleCell.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 };
            sheet.getRow(1).height = 32;

            // Subtítulo
            sheet.mergeCells('A2:I2');
            const subCell = sheet.getCell('A2');
            subCell.value = `EVENTO: ${(evento_nome || '').toUpperCase()}  |  DATA REFERÊNCIA: ${dataRef}  |  EMISSÃO: ${new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })}`;
            subCell.font = { name: 'Calibri', size: 10, italic: true, color: { argb: 'FF94A3B8' } };
            subCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0F172A' } };
            subCell.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 };
            sheet.getRow(2).height = 22;

            // Métricas (Linha 4)
            sheet.getRow(4).values = [
                'Total Colaboradores:', totais.total_colaboradores,
                'Presentes:', totais.total_presentes,
                'Finalizados:', totais.total_finalizados,
                'Ausentes:', totais.total_ausentes,
                'Tempo Médio:', totais.tempo_medio_formatado
            ];
            sheet.getRow(4).font = { bold: true, size: 9 };

            // Cabeçalho da Tabela (Linha 6)
            sheet.getRow(6).values = [
                'EMPRESA',
                'NOME DO COLABORADOR',
                'CPF',
                'FUNÇÃO',
                'Nº PULSEIRA',
                'CHECK-IN (ENTRADA)',
                'CHECK-OUT (SAÍDA)',
                'TEMPO DE PERMANÊNCIA',
                'STATUS'
            ];
            sheet.getRow(6).height = 26;
            sheet.getRow(6).font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 9.5 };
            sheet.getRow(6).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E293B' } };
            sheet.getRow(6).alignment = { vertical: 'middle', horizontal: 'center' };

            // Largura das Colunas
            sheet.columns = [
                { width: 28 }, // Empresa
                { width: 34 }, // Colaborador
                { width: 18 }, // CPF
                { width: 24 }, // Função
                { width: 16 }, // Pulseira
                { width: 22 }, // Checkin
                { width: 22 }, // Checkout
                { width: 24 }, // Permanência
                { width: 16 }  // Status
            ];

            let currentRow = 7;
            registros.forEach((r, idx) => {
                const row = sheet.addRow([
                    r.empresa_nome,
                    r.colaborador_nome,
                    r.cpf,
                    r.funcao,
                    r.numero_pulseira,
                    r.checkin_at,
                    r.checkout_at,
                    r.tempo_permanencia,
                    r.status ? r.status.toUpperCase() : '—'
                ]);

                if (idx % 2 === 0) {
                    row.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF8FAFC' } };
                }

                row.alignment = { vertical: 'middle' };
                row.getCell(3).alignment = { horizontal: 'center' };
                row.getCell(5).alignment = { horizontal: 'center' };
                row.getCell(6).alignment = { horizontal: 'center' };
                row.getCell(7).alignment = { horizontal: 'center' };
                row.getCell(8).alignment = { horizontal: 'right' };
                row.getCell(9).alignment = { horizontal: 'center' };

                currentRow++;
            });

            return workbook;
    }

    /**
     * Exporta Relatório Diário em PDF paisagem com formatação premium NZT
     */
    async exportarRelatorioDiarioPDF(req, res) {
        try {
            const { id: evento_id, nome: evento_nome } = this._resolveEvento(req);
            const { data, empresa_id } = req.query;
            const dataRef = data || getHojeLocal();

            const { registros, totais } = await this.gerarDadosRelatorioDiarioConsolidado(evento_id, dataRef, empresa_id);

            const pdfBuffer = await pdfService.generateDailyReportPDF({
                evento: { nome: evento_nome },
                dataReferencia: dataRef,
                registros,
                totais
            });

            res.setHeader('Content-Type', 'application/pdf');
            res.setHeader('Content-Disposition', `attachment; filename=relatorio_diario_${dataRef}.pdf`);
            res.send(pdfBuffer);
        } catch (error) {
            logger.error('Erro ao exportar relatório diário PDF:', error);
            res.status(500).json({ error: 'Falha ao gerar PDF do relatório diário.' });
        }
    }

    /**
     * Linhas e colunas de uma aba agregada — mesma fonte para o PDF e o Excel
     */
    async _dadosAba(req, aba) {
        // Executa o handler da aba sem passar pelo HTTP (o handler responde via res.json/res.status)
        const executar = async (handler) => {
            let resposta = null;
            let codigo = 200;
            const res = {
                status(c) { codigo = c; return this; },
                json(d) { resposta = d; }
            };
            await handler.call(this, req, res);
            if (codigo >= 400) throw new Error(resposta?.error || 'Falha ao montar a aba');
            return resposta?.data || [];
        };

        const abas = {
            logs: {
                titulo: 'Logs de Acesso',
                colunas: [
                    { id: 'horario', label: 'Horário', tipo: 'data' },
                    { id: 'pessoa', label: 'Participante' },
                    { id: 'cpf', label: 'CPF' },
                    { id: 'empresa', label: 'Empresa' },
                    { id: 'tipo', label: 'Tipo', align: 'center' },
                    { id: 'metodo', label: 'Método', align: 'center' },
                    { id: 'numero_pulseira', label: 'Pulseira', align: 'center' },
                    { id: 'equipamento', label: 'Equipamento' },
                    { id: 'observacao', label: 'Observação' }
                ],
                carregar: async () => {
                    let query = supabase
                        .from('logs_acesso')
                        .select('id, tipo, metodo, dispositivo_id, confianca, observacao, numero_pulseira, created_at, pessoa_id, pessoas!inner(id, nome_completo, cpf, empresa_id)')
                        .eq('evento_id', req.event.id);
                    query = aplicarPeriodo(query, req.query);
                    if (req.query.empresa_id) query = query.eq('pessoas.empresa_id', req.query.empresa_id);
                    const { data, error } = await buscarTodos(query.order('created_at', { ascending: true }));
                    if (error) throw error;
                    return formatarLogs(data, req.event.id);
                }
            },
            area: {
                titulo: 'Relatório de Fluxo por Área',
                colunas: [
                    { id: 'area', label: 'Área / Localização' },
                    { id: 'entradas', label: 'Entradas', align: 'center', tipo: 'numero' },
                    { id: 'saidas', label: 'Saídas', align: 'center', tipo: 'numero' },
                    { id: 'pico', label: 'Pico de Fluxo', align: 'center' }
                ],
                carregar: () => executar(this.porArea)
            },
            empresa: {
                titulo: 'Relatório por Empresa',
                colunas: [
                    { id: 'empresa', label: 'Empresa' },
                    { id: 'pessoas', label: 'Pessoas', align: 'center', tipo: 'numero' },
                    { id: 'entradas', label: 'Entradas', align: 'center', tipo: 'numero' },
                    { id: 'saidas', label: 'Saídas', align: 'center', tipo: 'numero' },
                    { id: 'bloqueados', label: 'Bloqueados', align: 'center', tipo: 'numero' },
                    { id: 'expulsos', label: 'Expulsos', align: 'center', tipo: 'numero' }
                ],
                carregar: () => executar(this.porEmpresa)
            },
            leitor: {
                titulo: 'Relatório por Terminal e Leitor',
                colunas: [
                    { id: 'terminal', label: 'Terminal' },
                    { id: 'localizacao', label: 'Localização' },
                    { id: 'total', label: 'Total Leituras', align: 'center', tipo: 'numero' },
                    { id: 'entradas', label: 'Entradas', align: 'center', tipo: 'numero' },
                    { id: 'saidas', label: 'Saídas', align: 'center', tipo: 'numero' },
                    { id: 'erros', label: 'Erros / Negados', align: 'center', tipo: 'numero' }
                ],
                carregar: () => executar(this.porLeitor)
            },
            funcao: {
                titulo: 'Relatório por Função / Cargo',
                colunas: [
                    { id: 'funcao', label: 'Função / Cargo' },
                    { id: 'total', label: 'Total Cadastrado', align: 'center', tipo: 'numero' },
                    { id: 'presentes', label: 'Presentes Agora', align: 'center', tipo: 'numero' },
                    { id: 'entradas_periodo', label: 'Entradas Período', align: 'center', tipo: 'numero' },
                    { id: 'saidas_periodo', label: 'Saídas Período', align: 'center', tipo: 'numero' }
                ],
                carregar: () => executar(this.porFuncao)
            },
            status: {
                titulo: 'Relatório por Status de Acesso',
                colunas: [
                    { id: 'status', label: 'Status' },
                    { id: 'quantidade', label: 'Quantidade', align: 'center', tipo: 'numero' }
                ],
                carregar: () => executar(this.porStatus)
            }
        };

        const def = abas[aba];
        if (!def) return null;
        return { titulo: def.titulo, colunas: def.colunas, linhas: await def.carregar() };
    }

    /** Texto do período filtrado, para o cabeçalho dos arquivos */
    _textoPeriodo(query) {
        const fmt = (iso) => iso ? this._formatarDataHora(iso).slice(0, 17) : null;
        const ini = fmt(limiteFiltro(query.data_inicio));
        const fim = fmt(limiteFiltro(query.data_fim, true));
        if (!ini && !fim) return 'Todo o período';
        return `Período: ${ini || 'início'} a ${fim || 'agora'}`;
    }

    /**
     * Exporta Qualquer Aba do Menu em PDF com layout padronizado
     */
    async exportarAbaPDF(req, res) {
        try {
            const { nome: evento_nome } = this._resolveEvento(req);
            const { aba = 'area' } = req.query;

            const dados = await this._dadosAba(req, aba);
            if (!dados) return res.status(400).json({ error: 'Aba de relatório desconhecida.' });

            const linhas = dados.linhas.map(l => {
                const out = { ...l };
                dados.colunas.filter(c => c.tipo === 'data').forEach(c => { out[c.id] = this._formatarDataHora(l[c.id]); });
                return out;
            });

            const pdfBuffer = await pdfService.generateAggregatedPDF({
                titulo: dados.titulo,
                evento: { nome: evento_nome },
                subtitulo: this._textoPeriodo(req.query),
                colunas: dados.colunas,
                linhas
            });

            res.setHeader('Content-Type', 'application/pdf');
            res.setHeader('Content-Disposition', `attachment; filename=relatorio_${aba}_${Date.now()}.pdf`);
            res.send(pdfBuffer);
        } catch (error) {
            logger.error('Erro ao exportar aba em PDF:', error);
            res.status(500).json({ error: 'Falha ao exportar PDF da aba.' });
        }
    }

    /**
     * Exporta Qualquer Aba do Menu em Excel (antes o painel chamava rotas /excel/export-* que não existiam)
     */
    async exportarAbaXLSX(req, res) {
        try {
            const { nome: evento_nome } = this._resolveEvento(req);
            const { aba = 'area' } = req.query;

            const dados = await this._dadosAba(req, aba);
            if (!dados) return res.status(400).json({ error: 'Aba de relatório desconhecida.' });
            const { titulo, colunas, linhas } = dados;

            const workbook = new ExcelJS.Workbook();
            workbook.creator = 'NZT Relatórios';
            workbook.created = new Date();
            const sheet = workbook.addWorksheet(titulo.slice(0, 31));
            const ultimaCol = colunas.length;

            sheet.mergeCells(1, 1, 1, ultimaCol);
            const titleCell = sheet.getCell(1, 1);
            titleCell.value = `NZT RELATÓRIOS — ${titulo.toUpperCase()}`;
            titleCell.font = { name: 'Calibri', size: 14, bold: true, color: { argb: 'FFFFFFFF' } };
            titleCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0A1929' } };
            titleCell.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 };
            sheet.getRow(1).height = 30;

            sheet.mergeCells(2, 1, 2, ultimaCol);
            const subCell = sheet.getCell(2, 1);
            subCell.value = `EVENTO: ${(evento_nome || '').toUpperCase()}  |  ${this._textoPeriodo(req.query)}  |  EMISSÃO: ${new Date().toLocaleString('pt-BR', { timeZone: TIMEZONE })}`;
            subCell.font = { name: 'Calibri', size: 10, italic: true, color: { argb: 'FF94A3B8' } };
            subCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0F172A' } };
            subCell.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 };

            const header = sheet.getRow(4);
            header.values = colunas.map(c => c.label.toUpperCase());
            header.height = 24;
            header.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 9.5 };
            header.alignment = { vertical: 'middle', horizontal: 'center' };
            colunas.forEach((_, i) => {
                header.getCell(i + 1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E293B' } };
            });

            linhas.forEach((l, idx) => {
                const row = sheet.addRow(colunas.map(c => {
                    const v = l[c.id];
                    if (c.tipo === 'data') return dataExcel(v);
                    if (c.tipo === 'numero') return Number(v) || 0;
                    return v ?? '—';
                }));
                colunas.forEach((c, i) => {
                    const cell = row.getCell(i + 1);
                    if (c.tipo === 'data') cell.numFmt = 'dd/mm/yyyy hh:mm:ss';
                    if (c.align) cell.alignment = { horizontal: c.align };
                    if (idx % 2 === 0) cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF8FAFC' } };
                });
            });

            // Totais das colunas numéricas (SUBTOTAL respeita o autofiltro)
            if (linhas.length > 0 && colunas.some(c => c.tipo === 'numero')) {
                const primeira = 5;
                const ultima = 4 + linhas.length;
                const total = sheet.addRow(colunas.map((c, i) => {
                    if (i === 0) return 'TOTAL';
                    if (c.tipo !== 'numero') return '';
                    const letra = sheet.getColumn(i + 1).letter;
                    return { formula: `SUBTOTAL(109,${letra}${primeira}:${letra}${ultima})` };
                }));
                total.font = { bold: true };
                colunas.forEach((c, i) => {
                    const cell = total.getCell(i + 1);
                    if (c.align) cell.alignment = { horizontal: c.align };
                    cell.border = { top: { style: 'thin' } };
                });
            }

            colunas.forEach((c, i) => {
                const maior = Math.max(c.label.length, ...linhas.slice(0, 500).map(l => String(l[c.id] ?? '').length));
                sheet.getColumn(i + 1).width = c.tipo === 'data' ? 20 : Math.min(45, Math.max(12, maior + 2));
            });
            sheet.views = [{ state: 'frozen', ySplit: 4 }];
            sheet.autoFilter = { from: { row: 4, column: 1 }, to: { row: 4, column: ultimaCol } };

            res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
            res.setHeader('Content-Disposition', `attachment; filename=relatorio_${aba}_${Date.now()}.xlsx`);
            res.send(await workbook.xlsx.writeBuffer());
        } catch (error) {
            logger.error('Erro ao exportar aba em Excel:', error);
            res.status(500).json({ error: 'Falha ao exportar Excel da aba.' });
        }
    }
}

module.exports = new ReportController();
