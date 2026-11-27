/**
 * Presença do evento: quem está dentro AGORA no dia de operação.
 *
 * Critério único (usado pelo KPI do check-in e pelo Monitor): a pessoa está dentro se o último
 * movimento de check-in/check-out dela no turno em andamento é check-in. Não depende do campo
 * pessoas.status_acesso, que é só um estado auxiliar e pode ficar defasado.
 */
const { supabase } = require('../config/supabase');
const { buscarTodos } = require('./buscarTodos');
const { inicioDiaOperacao } = require('./diaOperacao');

/**
 * Último movimento (check-in/check-out) de cada pessoa do evento desde o início do turno.
 * @param {string} eventoId
 * @param {string|null} inicio  ISO UTC do início do turno; se omitido, é calculado pelo horario_reset
 * @returns {Promise<Map<string, 'checkin'|'checkout'>>} pessoa_id → tipo do último movimento
 */
async function ultimoMovimentoDoTurno(eventoId, inicio = null) {
    const desde = inicio || await inicioDiaOperacao(eventoId);
    const { data, error } = await buscarTodos(
        supabase.from('logs_acesso')
            .select('pessoa_id, tipo, created_at')
            .eq('evento_id', eventoId)
            .in('tipo', ['checkin', 'checkout'])
            .gte('created_at', desde)
            .order('created_at', { ascending: false })
    );
    if (error) throw error;

    const ultimo = new Map();
    for (const l of data || []) {
        if (l.pessoa_id && !ultimo.has(l.pessoa_id)) ultimo.set(l.pessoa_id, l.tipo);
    }
    return ultimo;
}

/** Conjunto de pessoa_id que estão dentro agora (último movimento = check-in). */
function conjuntoPresentes(ultimoMovimento) {
    const presentes = new Set();
    for (const [pessoaId, tipo] of ultimoMovimento) {
        if (tipo === 'checkin') presentes.add(pessoaId);
    }
    return presentes;
}

module.exports = { ultimoMovimentoDoTurno, conjuntoPresentes };
