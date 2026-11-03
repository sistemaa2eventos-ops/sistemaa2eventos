const { supabase } = require('../../config/supabase');
const logger = require('../../services/logger');
const { buscarTodos } = require('../../utils/buscarTodos');
const { limiteFiltro } = require('../../utils/dateUtils');

/**
 * Métricas de atendimento por operador (cadastro e credenciamento):
 *  - medido: o painel marca o início e o servidor grava o fim (tabela atendimentos);
 *  - estimado (eventos sem medição): intervalo entre atendimentos seguidos do mesmo operador,
 *    contando só intervalos de até 15 min (acima disso é pausa, não atendimento).
 * Diagnóstico: operadores necessários = pico de chegadas/hora × tempo médio ÷ 3600 ÷ ocupação (85%).
 */
const PAUSA_MS = 15 * 60 * 1000;
const OCUPACAO = 0.85;
const TIPOS = ['cadastro', 'credenciamento', 'checkin', 'checkout'];

const diaLocal = (d) => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(d);
const horaLocal = (d) => parseInt(new Intl.DateTimeFormat('en-GB', { timeZone: 'America/Sao_Paulo', hour: '2-digit', hour12: false }).format(d), 10) % 24;
const comFuso = (v) => new Date(/Z|[+-]\d{2}:\d{2}$/.test(v) ? v : `${v}Z`);
const mediana = (xs) => {
    if (!xs.length) return null;
    const s = [...xs].sort((a, b) => a - b);
    const m = Math.floor(s.length / 2);
    return Math.round(s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2);
};
const media = (xs) => (xs.length ? Math.round(xs.reduce((a, b) => a + b, 0) / xs.length) : null);

/** Grava um atendimento concluído (nunca lança: métrica não pode atrapalhar o atendimento). */
async function registrar({ evento_id, operador_id, pessoa_id, tipo, inicio, estacao }) {
    try {
        if (!evento_id || !inicio || !TIPOS.includes(tipo)) return;
        const ini = new Date(inicio);
        const agora = Date.now();
        // relógio do navegador errado ou aba esquecida aberta: não é tempo de atendimento
        if (Number.isNaN(ini.getTime()) || ini.getTime() > agora + 60000 || agora - ini.getTime() > 2 * 60 * 60 * 1000) return;
        const { error } = await supabase.from('atendimentos').insert({
            evento_id, operador_id: operador_id || null, pessoa_id: pessoa_id || null, tipo,
            estacao: estacao ? String(estacao).slice(0, 100) : null, inicio: ini.toISOString()
        });
        if (error && !/atendimentos/.test(error.message)) logger.warn(`[Atendimento] Não gravado: ${error.message}`);
    } catch (err) {
        logger.warn(`[Atendimento] ${err.message}`);
    }
}

/** Ações do operador no período (para a estimativa): cadastros (auditoria) e entradas com operador. */
async function acoesDoOperador(eventoId, inicio, fim) {
    const filtrar = (q, col) => {
        if (inicio) q = q.gte(col, inicio);
        if (fim) q = q.lte(col, fim);
        return q;
    };
    const [cad, ent] = await Promise.all([
        buscarTodos(filtrar(supabase.from('audit_logs').select('user_id, created_at')
            .eq('evento_id', eventoId).eq('recurso', 'PESSOAS').eq('acao', 'INSERT').not('user_id', 'is', null), 'created_at')),
        buscarTodos(filtrar(supabase.from('logs_acesso').select('created_by, created_at, metodo, observacao')
            .eq('evento_id', eventoId).eq('tipo', 'checkin').not('created_by', 'is', null), 'created_at'))
    ]);
    const acoes = [];
    for (const a of cad.data || []) acoes.push({ operador_id: a.user_id, em: comFuso(a.created_at), tipo: 'cadastro' });
    for (const l of ent.data || []) acoes.push({ operador_id: l.created_by, em: comFuso(l.created_at), tipo: l.metodo === 'pulseira' ? 'credenciamento' : 'checkin' });
    return acoes;
}

/** Intervalos entre ações seguidas do mesmo operador no mesmo dia, até 15 min. */
function estimar(acoes) {
    const porOpDia = new Map();
    for (const a of acoes) {
        const chave = `${a.operador_id}|${diaLocal(a.em)}`;
        (porOpDia.get(chave) || porOpDia.set(chave, []).get(chave)).push(a);
    }
    const amostras = [];
    for (const [chave, lista] of porOpDia) {
        const [operador_id, dia] = chave.split('|');
        lista.sort((x, y) => x.em - y.em);
        for (let i = 1; i < lista.length; i++) {
            const gap = lista[i].em - lista[i - 1].em;
            if (gap > 0 && gap <= PAUSA_MS) amostras.push({ operador_id, dia, tipo: lista[i].tipo, duracao_seg: Math.round(gap / 1000), em: lista[i].em, fonte: 'estimado' });
        }
    }
    return amostras;
}

/** Pico de chegadas por hora (todas as entradas do evento, qualquer método). */
async function picoChegadas(eventoId, inicio, fim) {
    let q = supabase.from('logs_acesso').select('created_at').eq('evento_id', eventoId).eq('tipo', 'checkin');
    if (inicio) q = q.gte('created_at', inicio);
    if (fim) q = q.lte('created_at', fim);
    const { data } = await buscarTodos(q);
    const porHora = new Map();
    for (const l of data || []) {
        const d = comFuso(l.created_at);
        const chave = `${diaLocal(d)} ${String(horaLocal(d)).padStart(2, '0')}h`;
        porHora.set(chave, (porHora.get(chave) || 0) + 1);
    }
    let pico = { hora: null, chegadas: 0 };
    for (const [hora, n] of porHora) if (n > pico.chegadas) pico = { hora, chegadas: n };
    return pico;
}

/** Operadores para atender `porHora` pessoas por hora, com tempo médio `seg` por pessoa. */
const operadoresNecessarios = (porHora, seg) => (porHora > 0 && seg > 0 ? Math.max(1, Math.ceil((porHora * seg) / 3600 / OCUPACAO)) : null);

async function metricas(eventoId, { data_inicio, data_fim } = {}) {
    const inicio = limiteFiltro(data_inicio);
    const fim = limiteFiltro(data_fim, true);

    let qMed = supabase.from('atendimentos').select('operador_id, tipo, inicio, duracao_seg, estacao').eq('evento_id', eventoId);
    if (inicio) qMed = qMed.gte('inicio', inicio);
    if (fim) qMed = qMed.lte('inicio', fim);
    const [medRes, acoes, pico] = await Promise.all([buscarTodos(qMed).catch(() => ({ data: [] })), acoesDoOperador(eventoId, inicio, fim), picoChegadas(eventoId, inicio, fim)]);

    const medidos = (medRes.data || []).map(m => ({ operador_id: m.operador_id, dia: diaLocal(new Date(m.inicio)), tipo: m.tipo, duracao_seg: m.duracao_seg, em: new Date(m.inicio), fonte: 'medido' }));
    // Onde há medição para o operador/dia, a estimativa daquele operador/dia não entra
    const comMedicao = new Set(medidos.map(m => `${m.operador_id}|${m.dia}`));
    const amostras = [...medidos, ...estimar(acoes).filter(e => !comMedicao.has(`${e.operador_id}|${e.dia}`))];

    const ids = [...new Set(amostras.map(a => a.operador_id).filter(Boolean))];
    const nomes = {};
    if (ids.length) {
        const { data: perfis } = await supabase.from('perfis').select('id, nome_completo, email').in('id', ids);
        for (const p of perfis || []) nomes[p.id] = p.nome_completo || p.email;
    }

    const agrupar = (chaveDe, rotulo) => {
        const g = new Map();
        for (const a of amostras) {
            const k = chaveDe(a);
            (g.get(k) || g.set(k, []).get(k)).push(a);
        }
        return [...g.entries()].map(([k, lista]) => {
            const dur = lista.map(a => a.duracao_seg);
            const horasAtivas = new Set(lista.map(a => `${a.dia} ${horaLocal(a.em)}`)).size || 1;
            return {
                ...rotulo(k, lista),
                atendimentos: lista.length,
                tempo_medio_seg: media(dur),
                mediana_seg: mediana(dur),
                por_hora: Math.round((lista.length / horasAtivas) * 10) / 10,
                fonte: lista.every(a => a.fonte === 'medido') ? 'medido' : lista.some(a => a.fonte === 'medido') ? 'misto' : 'estimado'
            };
        });
    };
    const nome = (id) => nomes[id] || 'Operador removido';

    const porOperador = agrupar(a => a.operador_id, (id) => ({ operador_id: id, operador: nome(id) }))
        .sort((x, y) => y.atendimentos - x.atendimentos);
    const porDia = agrupar(a => a.dia, (dia, lista) => ({ dia, operadores: new Set(lista.map(a => a.operador_id)).size }))
        .sort((x, y) => x.dia.localeCompare(y.dia));
    const porOperadorDia = agrupar(a => `${a.operador_id}|${a.dia}`, (k) => { const [id, dia] = k.split('|'); return { operador_id: id, operador: nome(id), dia }; })
        .sort((x, y) => x.dia.localeCompare(y.dia) || y.atendimentos - x.atendimentos);
    const porTipo = agrupar(a => a.tipo, (tipo) => ({ tipo }));

    const todos = amostras.map(a => a.duracao_seg);
    const tempoMedio = media(todos);
    return {
        resumo: {
            atendimentos: amostras.length,
            medidos: medidos.length,
            tempo_medio_seg: tempoMedio,
            mediana_seg: mediana(todos),
            operadores: ids.length,
            dias: porDia.length
        },
        por_operador: porOperador,
        por_dia: porDia,
        por_operador_dia: porOperadorDia,
        por_tipo: porTipo,
        pico,
        diagnostico: {
            ocupacao: OCUPACAO,
            operadores_no_pico: operadoresNecessarios(pico.chegadas, tempoMedio),
            texto: tempoMedio && pico.chegadas
                ? `No pico (${pico.hora}) chegaram ${pico.chegadas} pessoas. Com ${tempoMedio} s por atendimento, eram necessários ${operadoresNecessarios(pico.chegadas, tempoMedio)} operador(es) ao mesmo tempo para não formar fila.`
                : 'Ainda não há atendimentos suficientes no período para o diagnóstico.'
        }
    };
}

module.exports = { registrar, metricas, operadoresNecessarios, estimar, OCUPACAO };
