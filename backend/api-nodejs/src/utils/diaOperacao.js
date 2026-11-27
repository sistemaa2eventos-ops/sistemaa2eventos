/**
 * Dia de operação de um evento.
 *
 * O turno de um evento vira no `horario_reset` (ex.: 06:00 para festas que passam da meia-noite).
 * Com 00:00:00 (padrão) o dia de operação é o dia civil. Use estas funções em TODO lugar que
 * pergunta "quem está dentro hoje", "o que aconteceu hoje" ou "qual é o dia do turno", para que
 * check-in, fiscalização, pulseira, monitor e relatório usem a mesma janela.
 */
const { getHojeLocal, ultimaOcorrenciaHorario } = require('./dateUtils');
const { supabase } = require('../config/supabase');

const HORARIO_PADRAO = '00:00:00';

/** horario_reset do evento ("HH:MM:SS"). Sem evento ou sem valor: 00:00:00. */
async function horarioResetDoEvento(eventoId) {
    if (!eventoId) return HORARIO_PADRAO;
    const { data, error } = await supabase
        .from('eventos')
        .select('horario_reset')
        .eq('id', eventoId)
        .maybeSingle();
    if (error) throw error;
    return data?.horario_reset || HORARIO_PADRAO;
}

/**
 * Início (ISO UTC) do turno em andamento agora: última ocorrência do horario_reset.
 * Ex.: horario_reset 06:00 e agora 05:00 de quarta → início 06:00 de terça.
 */
async function inicioDiaOperacao(eventoId, agora = new Date()) {
    const horario = await horarioResetDoEvento(eventoId);
    return ultimaOcorrenciaHorario(horario, agora).toISOString();
}

/**
 * Data (YYYY-MM-DD, fuso local) do turno que está ENCERRANDO no instante `agora`.
 * Usa um minuto antes para que o fechamento disparado exatamente no horario_reset
 * arquive o turno que terminou, e não o que está começando.
 */
async function diaDoTurnoEncerrando(eventoId, agora = new Date()) {
    const horario = await horarioResetDoEvento(eventoId);
    const instanteAnterior = new Date(agora.getTime() - 60 * 1000);
    return getHojeLocal(ultimaOcorrenciaHorario(horario, instanteAnterior));
}

/** Data (YYYY-MM-DD, fuso local) do turno que está em andamento agora. */
async function diaDoTurnoAtual(eventoId, agora = new Date()) {
    const inicio = await inicioDiaOperacao(eventoId, agora);
    return getHojeLocal(new Date(inicio));
}

module.exports = {
    horarioResetDoEvento,
    inicioDiaOperacao,
    diaDoTurnoEncerrando,
    diaDoTurnoAtual,
};
