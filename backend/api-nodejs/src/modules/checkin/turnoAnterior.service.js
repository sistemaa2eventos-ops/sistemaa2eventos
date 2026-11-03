const { supabase } = require('../../config/supabase');
const logger = require('../../services/logger');
const { ultimaOcorrenciaHorario } = require('../../utils/dateUtils');

/**
 * Check-out de quem entrou num dia de operação anterior (esqueceu de sair ou de descredenciar).
 * Em vez de registrar uma saída "hoje" (turno de 30 h), o operador confirma e informa o horário
 * real; o sistema corrige o turno antigo: troca a saída automática do reset (CHECKOUT_FORCADO_CRON)
 * pelo horário escolhido, ou cria a saída que faltou.
 */
const FORCADA = 'CHECKOUT_FORCADO_CRON';
const JORNADA_PADRAO_MS = 8 * 60 * 60 * 1000;

const comFuso = (v) => new Date(/Z|[+-]\d{2}:\d{2}$/.test(v) ? v : `${v}Z`);
const partesLocais = (d) => {
    const p = Object.fromEntries(new Intl.DateTimeFormat('en-CA', {
        timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false
    }).formatToParts(d).map(x => [x.type, x.value]));
    return { dia: `${p.year}-${p.month}-${p.day}`, h: parseInt(p.hour, 10) % 24, m: parseInt(p.minute, 10) };
};
// "YYYY-MM-DD" + hora local (Brasil, sem horário de verão: UTC-3) → Date
const localParaDate = (dia, h, m) => new Date(`${dia}T${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:00-03:00`);

async function ultimosLogs(pessoa_id, evento_id, limite = 20) {
    const { data, error } = await supabase.from('logs_acesso')
        .select('id, tipo, created_at, observacao')
        .eq('pessoa_id', pessoa_id).eq('evento_id', evento_id)
        .in('tipo', ['checkin', 'checkout'])
        .order('created_at', { ascending: false }).limit(limite);
    if (error) throw error;
    // entrega de pulseira no credenciamento não é passagem
    return (data || []).filter(l => l.observacao !== 'CREDENCIAMENTO');
}

/**
 * Horário de saída sugerido: o horário em que a pessoa saiu no último dia trabalhado (aplicado
 * ao dia da entrada); sem histórico, entrada + 8 h. Nunca depois do fim daquele dia de operação.
 */
function sugerirSaida(entrada, logs, limite) {
    const saidaReal = logs.find(l => l.tipo === 'checkout' && l.observacao !== FORCADA && comFuso(l.created_at) < entrada);
    let sugestao;
    if (saidaReal) {
        const { h, m } = partesLocais(comFuso(saidaReal.created_at));
        sugestao = localParaDate(partesLocais(entrada).dia, h, m);
        if (sugestao <= entrada) sugestao = new Date(sugestao.getTime() + 24 * 60 * 60 * 1000);
    } else {
        sugestao = new Date(entrada.getTime() + JORNADA_PADRAO_MS);
    }
    if (limite && sugestao > limite) sugestao = new Date(limite.getTime() - 60 * 1000);
    return sugestao;
}

/**
 * Situação da pessoa para um check-out agora. null = turno de hoje (segue normal).
 * @returns {Promise<null | { entrada_em: string, saida_forcada_id: string|null, saida_forcada_em: string|null, saida_sugerida: string }>}
 */
async function verificar(pessoa_id, evento_id) {
    const { data: evento } = await supabase.from('eventos').select('horario_reset').eq('id', evento_id).maybeSingle();
    const inicioDia = ultimaOcorrenciaHorario(evento?.horario_reset || '00:00:00');
    const logs = await ultimosLogs(pessoa_id, evento_id);
    const ultimo = logs[0];
    if (!ultimo) return null;

    let entradaLog = null;
    let forcada = null;
    if (ultimo.tipo === 'checkin' && comFuso(ultimo.created_at) < inicioDia) {
        entradaLog = ultimo;                              // reset não rodou: ainda "dentro" desde outro dia
    } else if (ultimo.tipo === 'checkout' && ultimo.observacao === FORCADA) {
        forcada = ultimo;                                 // reset encerrou o turno sem a saída real
        entradaLog = logs.find(l => l.tipo === 'checkin' && comFuso(l.created_at) < comFuso(ultimo.created_at));
    }
    if (!entradaLog) return null;

    const entrada = comFuso(entradaLog.created_at);
    const limite = forcada ? comFuso(forcada.created_at) : inicioDia;
    return {
        entrada_em: entrada.toISOString(),
        saida_forcada_id: forcada?.id || null,
        saida_forcada_em: forcada ? comFuso(forcada.created_at).toISOString() : null,
        saida_sugerida: sugerirSaida(entrada, logs.slice(logs.indexOf(entradaLog) + 1), limite).toISOString()
    };
}

/** Corrige o turno anterior com o horário de saída informado pelo operador. */
async function corrigir({ pessoa_id, evento_id, saida_em, usuario_id }) {
    const turno = await verificar(pessoa_id, evento_id);
    if (!turno) return { error: 'Esta pessoa não tem turno de dia anterior em aberto.', status: 409 };

    const saida = new Date(saida_em);
    const entrada = new Date(turno.entrada_em);
    if (Number.isNaN(saida.getTime())) return { error: 'Horário de saída inválido.', status: 400 };
    if (saida <= entrada) return { error: 'A saída precisa ser depois da entrada.', status: 400 };
    if (saida > new Date()) return { error: 'A saída não pode ser no futuro.', status: 400 };

    const registro = { created_at: saida.toISOString(), observacao: 'SAIDA_CORRIGIDA', created_by: usuario_id || null };
    const q = turno.saida_forcada_id
        ? supabase.from('logs_acesso').update(registro).eq('id', turno.saida_forcada_id)
        : supabase.from('logs_acesso').insert({ ...registro, pessoa_id, evento_id, tipo: 'checkout', metodo: 'manual', dispositivo_id: 'web-dashboard' });
    const { error } = await q;
    if (error) throw error;

    // Sem reset no meio, a pessoa ainda constava como dentro
    await supabase.from('pessoas').update({ status_acesso: 'checkout_feito' }).eq('id', pessoa_id).eq('status_acesso', 'checkin_feito');
    logger.info(`🕓 [Turno] Saída corrigida: pessoa ${pessoa_id}, entrada ${turno.entrada_em}, saída ${saida.toISOString()} (por ${usuario_id})`);
    return { entrada_em: turno.entrada_em, saida_em: saida.toISOString(), substituiu_saida_automatica: !!turno.saida_forcada_id };
}

module.exports = { verificar, corrigir, sugerirSaida };
