const { supabase } = require('../../config/supabase');
const logger = require('../../services/logger');
const cacheService = require('../../services/cacheService');
const { buscarTodos } = require('../../utils/buscarTodos');
const { getHojeLocal, getLimitesDiaLocalUTC, TIMEZONE } = require('../../utils/dateUtils');

// logs_acesso.created_at é UTC gravado sem fuso
const instante = (ts) => (ts ? Date.parse(/[zZ]|[+-]\d\d:?\d\d$/.test(ts) ? ts : `${ts}Z`) : NaN);
const horaLocal = (ms) => parseInt(new Intl.DateTimeFormat('en-US', { timeZone: TIMEZONE, hour: '2-digit', hourCycle: 'h23' }).format(new Date(ms)), 10);
const ehEntrada = (l) => l.tipo === 'checkin' || l.tipo === 'entrada';
const ehSaida = (l) => l.tipo === 'checkout' || l.tipo === 'saida';
const ehSaidaForcada = (l) => l.observacao === 'CHECKOUT_FORCADO_CRON';

const HORAS_DENTRO_ALERTA = 12;
const PCT_ATENCAO = 0.9;
const TTL_MS = 15000;

/** Promessa que nunca derruba o painel: uma fonte faltando vira lista vazia */
const seguro = (promessa, nome) => Promise.resolve(promessa)
    .then(r => (r && r.error ? (logger.warn(`[Operação] ${nome}: ${r.error.message}`), { data: null }) : r))
    .catch(e => { logger.warn(`[Operação] ${nome}: ${e.message}`); return { data: null }; });

/**
 * Operação de hoje no Dashboard: fluxo por hora, lotação por área e alertas que pedem ação
 * (gente dentro há muito tempo, negados, cota de empresa, leitor offline, documentos, pulseiras).
 */
class OperacaoService {
    async resumo(eventoId) {
        const chave = `operacao_${eventoId}`;
        const emCache = cacheService.get(chave);
        if (emCache) return emCache;

        const hoje = getHojeLocal();
        const ontem = new Date(`${hoje}T12:00:00Z`); ontem.setUTCDate(ontem.getUTCDate() - 1);
        const diaOntem = ontem.toISOString().slice(0, 10);
        const { start: inicioHoje } = getLimitesDiaLocalUTC(hoje);
        const { start: inicioOntem } = getLimitesDiaLocalUTC(diaOntem);
        const msInicioHoje = Date.parse(inicioHoje);
        const agora = Date.now();

        const [logsRes, presentesRes, eventoRes, areasRes, empresasRes, quotasRes, dispRes, vinculosRes, docs] = await Promise.all([
            // desde ontem: entrada aberta antes da meia-noite e saídas forçadas do reset de ontem
            seguro(buscarTodos(supabase.from('logs_acesso')
                .select('id, pessoa_id, tipo, area_id, observacao, created_at')
                .eq('evento_id', eventoId)
                .in('tipo', ['checkin', 'checkout', 'entrada', 'saida', 'negado'])
                .gte('created_at', inicioOntem)), 'logs'),
            seguro(buscarTodos(supabase.from('pessoas')
                .select('id, nome_completo, empresa_id, funcao')
                .eq('evento_id', eventoId)
                .eq('status_acesso', 'checkin_feito')), 'presentes'),
            seguro(supabase.from('eventos').select('capacidade_total').eq('id', eventoId).single(), 'evento'),
            seguro(supabase.from('evento_areas').select('id, nome_area, capacidade_maxima').eq('evento_id', eventoId), 'areas'),
            seguro(supabase.from('empresas').select('id, nome').eq('evento_id', eventoId), 'empresas'),
            seguro(supabase.from('quotas_diarias').select('empresa_id, quota').eq('evento_id', eventoId).eq('data', hoje), 'quotas'),
            seguro(supabase.from('dispositivos_acesso').select('id, nome, status_online, ultimo_ping').eq('evento_id', eventoId), 'dispositivos'),
            seguro(buscarTodos(supabase.from('pulseira_vinculos').select('pessoa_id, numero_pulseira').eq('evento_id', eventoId).is('encerrado_em', null)), 'pulseiras'),
            require('../entities/documento.service').listarVencimentos(eventoId).catch(e => { logger.warn(`[Operação] documentos: ${e.message}`); return null; })
        ]);

        const logs = (logsRes.data || []).map(l => ({ ...l, ms: instante(l.created_at) })).sort((a, b) => a.ms - b.ms);
        const presentes = presentesRes.data || [];
        const empMap = Object.fromEntries((empresasRes.data || []).map(e => [e.id, e.nome]));
        const areas = areasRes.data || [];

        // ---------- Fluxo por hora (hoje) ----------
        const horaAtual = horaLocal(agora);
        const fluxo = Array.from({ length: horaAtual + 1 }, (_, h) => ({ hora: h, entradas: 0, saidas: 0, negados: 0, ocupacao: 0 }));
        const logsHoje = logs.filter(l => l.ms >= msInicioHoje);
        logsHoje.forEach(l => {
            const f = fluxo[horaLocal(l.ms)];
            if (!f) return;
            if (ehEntrada(l)) f.entradas++;
            else if (ehSaida(l)) f.saidas++;
            else if (l.tipo === 'negado') f.negados++;
        });
        // ocupação ao fim de cada hora: parte de quem está dentro agora e volta no tempo
        let ocupacao = presentes.length;
        for (let h = fluxo.length - 1; h >= 0; h--) {
            fluxo[h].ocupacao = Math.max(0, ocupacao);
            ocupacao -= fluxo[h].entradas - fluxo[h].saidas;
        }
        const pico = fluxo.reduce((p, f) => (f.ocupacao > p.ocupacao ? f : p), { hora: null, ocupacao: 0 });

        // ---------- Quem está dentro: última entrada e área ----------
        const ultimaEntrada = {};
        logs.forEach(l => { if (ehEntrada(l)) ultimaEntrada[l.pessoa_id] = l; });

        const porArea = {};
        presentes.forEach(p => {
            const id = ultimaEntrada[p.id]?.area_id || 'sem_area';
            porArea[id] = (porArea[id] || 0) + 1;
        });
        const lotacao = areas.map(a => ({
            id: a.id,
            nome: a.nome_area,
            presentes: porArea[a.id] || 0,
            capacidade: Number(a.capacidade_maxima) || 0
        }));
        if (porArea.sem_area) lotacao.push({ id: 'sem_area', nome: 'Sem área registrada', presentes: porArea.sem_area, capacidade: 0 });
        lotacao.sort((a, b) => b.presentes - a.presentes);

        // ---------- Alertas ----------
        const alertas = [];
        const limiteDentro = agora - HORAS_DENTRO_ALERTA * 3600000;
        const msJanela = Date.parse(inicioOntem);
        const dentroHaMuito = presentes
            .map(p => {
                const e = ultimaEntrada[p.id];
                // sem entrada desde ontem: está dentro há mais tempo que a janela
                const desde = e ? e.ms : null;
                return { id: p.id, nome: p.nome_completo, empresa: empMap[p.empresa_id] || 'Sem Empresa', desde,
                    horas: desde ? Math.floor((agora - desde) / 3600000) : Math.floor((agora - msJanela) / 3600000) };
            })
            .filter(p => p.desde === null || p.desde < limiteDentro)
            .sort((a, b) => b.horas - a.horas);
        if (dentroHaMuito.length) {
            alertas.push({
                id: 'dentro_muito_tempo', nivel: 'warning',
                titulo: `${dentroHaMuito.length} pessoa(s) dentro há mais de ${HORAS_DENTRO_ALERTA}h`,
                texto: 'Provável saída não registrada. Confira e registre o checkout; senão as horas ficam "a conferir".',
                itens: dentroHaMuito.slice(0, 8).map(p => `${p.nome} (${p.empresa}) • ${p.desde ? '' : 'mais de '}${p.horas}h`),
                link: '/checkout'
            });
        }

        const negados = logsHoje.filter(l => l.tipo === 'negado');
        if (negados.length) {
            const motivos = {};
            negados.forEach(l => {
                const m = String(l.observacao || 'Sem motivo informado').replace(/\s+/g, ' ').trim().slice(0, 80);
                motivos[m] = (motivos[m] || 0) + 1;
            });
            const top = Object.entries(motivos).sort((a, b) => b[1] - a[1]);
            alertas.push({
                id: 'negados', nivel: negados.length >= 10 ? 'warning' : 'info',
                titulo: `${negados.length} acesso(s) negado(s) hoje`,
                texto: 'Motivos mais comuns:',
                itens: top.slice(0, 4).map(([m, n]) => `${m} • ${n}x`),
                link: '/reports'
            });
        }

        const capacidade = Number(eventoRes.data?.capacidade_total) || 0;
        if (capacidade > 0 && presentes.length >= capacidade * PCT_ATENCAO) {
            alertas.push({
                id: 'capacidade', nivel: presentes.length >= capacidade ? 'error' : 'warning',
                titulo: `Evento com ${Math.round((presentes.length / capacidade) * 100)}% da capacidade`,
                texto: `${presentes.length} pessoas dentro para ${capacidade} vagas.`
            });
        }

        const areasCheias = lotacao.filter(a => a.capacidade > 0 && a.presentes >= a.capacidade * PCT_ATENCAO);
        if (areasCheias.length) {
            alertas.push({
                id: 'areas_cheias', nivel: areasCheias.some(a => a.presentes >= a.capacidade) ? 'error' : 'warning',
                titulo: `${areasCheias.length} área(s) perto ou acima da lotação`,
                itens: areasCheias.map(a => `${a.nome}: ${a.presentes}/${a.capacidade}`)
            });
        }

        // cota do dia: pessoas diferentes que entraram hoje por empresa
        const quotas = (quotasRes.data || []).filter(q => Number(q.quota) > 0);
        if (quotas.length) {
            const empresaDaPessoa = {};
            presentes.forEach(p => { empresaDaPessoa[p.id] = p.empresa_id; });
            const pessoasSemEmpresa = [...new Set(logsHoje.filter(l => ehEntrada(l) && !(l.pessoa_id in empresaDaPessoa)).map(l => l.pessoa_id))];
            if (pessoasSemEmpresa.length) {
                const { data } = await seguro(supabase.from('pessoas').select('id, empresa_id').in('id', pessoasSemEmpresa.slice(0, 1000)), 'empresas das pessoas');
                (data || []).forEach(p => { empresaDaPessoa[p.id] = p.empresa_id; });
            }
            const entraramHoje = {};
            logsHoje.filter(ehEntrada).forEach(l => {
                const emp = empresaDaPessoa[l.pessoa_id];
                if (emp) (entraramHoje[emp] || (entraramHoje[emp] = new Set())).add(l.pessoa_id);
            });
            const estouradas = quotas
                .map(q => ({ nome: empMap[q.empresa_id] || 'Empresa', usados: entraramHoje[q.empresa_id]?.size || 0, quota: Number(q.quota) }))
                .filter(q => q.usados >= q.quota * PCT_ATENCAO)
                .sort((a, b) => b.usados / b.quota - a.usados / a.quota);
            if (estouradas.length) {
                alertas.push({
                    id: 'cotas', nivel: estouradas.some(q => q.usados > q.quota) ? 'error' : 'warning',
                    titulo: `${estouradas.length} empresa(s) no limite da cota de hoje`,
                    itens: estouradas.slice(0, 6).map(q => `${q.nome}: ${q.usados} de ${q.quota}`),
                    link: '/empresas'
                });
            }
        }

        const offline = (dispRes.data || []).filter(d => d.status_online !== 'online');
        if (offline.length) {
            alertas.push({
                id: 'leitores_offline', nivel: 'error',
                titulo: `${offline.length} leitor(es) sem conexão`,
                itens: offline.slice(0, 6).map(d => d.nome || 'Leitor'),
                link: '/config/dispositivos'
            });
        }

        const donos = {};
        (vinculosRes.data || []).forEach(v => { (donos[v.numero_pulseira] || (donos[v.numero_pulseira] = new Set())).add(v.pessoa_id); });
        const duplicadas = Object.entries(donos).filter(([, s]) => s.size > 1).map(([n]) => n);
        if (duplicadas.length) {
            alertas.push({
                id: 'pulseiras_duplicadas', nivel: 'error',
                titulo: `${duplicadas.length} pulseira(s) com o mesmo número em duas pessoas`,
                itens: duplicadas.slice(0, 6).map(n => `Pulseira ${n}`),
                link: '/reports'
            });
        }

        if (docs?.data?.length) {
            const vencidos = new Set(docs.data.filter(d => d.situacao === 'vencido').map(d => d.pessoa_id));
            const aVencer = new Set(docs.data.filter(d => d.situacao !== 'vencido').map(d => d.pessoa_id));
            alertas.push({
                id: 'documentos', nivel: vencidos.size ? 'warning' : 'info',
                titulo: vencidos.size
                    ? `${vencidos.size} pessoa(s) com documento vencido`
                    : `${aVencer.size} pessoa(s) com documento vencendo em ${docs.janela_dias} dias`,
                texto: vencidos.size && aVencer.size ? `E ${aVencer.size} com documento vencendo em ${docs.janela_dias} dias.` : null,
                link: '/auditoria'
            });
        }

        // turnos encerrados pelo reset nas últimas 24h: horas ficam a conferir no fechamento
        const forcadasOntem = new Set(logs.filter(l => l.ms >= agora - 24 * 3600000 && ehSaidaForcada(l)).map(l => l.pessoa_id));
        if (forcadasOntem.size) {
            alertas.push({
                id: 'a_conferir', nivel: 'info',
                titulo: `${forcadasOntem.size} turno(s) encerrado(s) pelo reset sem saída registrada (últimas 24h)`,
                texto: 'Ficam "a conferir" no relatório diário e nas diárias até alguém corrigir.',
                link: '/reports'
            });
        }

        const ordem = { error: 0, warning: 1, info: 2 };
        alertas.sort((a, b) => ordem[a.nivel] - ordem[b.nivel]);

        const resultado = {
            atualizado_em: new Date(agora).toISOString(),
            presentes: presentes.length,
            capacidade,
            fluxo,
            pico: pico.hora === null ? null : pico,
            entradas_hoje: fluxo.reduce((s, f) => s + f.entradas, 0),
            saidas_hoje: fluxo.reduce((s, f) => s + f.saidas, 0),
            lotacao,
            alertas
        };
        cacheService.set(chave, resultado, TTL_MS);
        return resultado;
    }
}

module.exports = new OperacaoService();
