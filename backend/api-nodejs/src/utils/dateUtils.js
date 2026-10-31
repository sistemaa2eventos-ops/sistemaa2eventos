/**
 * Utilitário de Data/Hora - Sempre sincronizado com o fuso horário local (America/Sao_Paulo)
 *
 * O problema: `new Date().toISOString()` retorna UTC.
 * No Brasil (UTC-3), às 22:00 locais, o ISO retorna o dia SEGUINTE em UTC.
 * Isso quebra queries de "hoje" no banco de dados.
 */

const TIMEZONE = process.env.TZ || 'America/Sao_Paulo';

/**
 * Retorna a data de HOJE no fuso local no formato YYYY-MM-DD
 * Correto para uso em queries de banco de dados (Supabase, SQL Server)
 */
function getHojeLocal() {
    const now = new Date();
    // Usa Intl para formatar no timezone correto
    const partes = new Intl.DateTimeFormat('pt-BR', {
        timeZone: TIMEZONE,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
    }).formatToParts(now);

    const ano = partes.find(p => p.type === 'year').value;
    const mes = partes.find(p => p.type === 'month').value;
    const dia = partes.find(p => p.type === 'day').value;

    return `${ano}-${mes}-${dia}`; // YYYY-MM-DD
}

/**
 * Retorna o datetime atual no fuso local como ISO8601
 * Ex: 2026-02-19T22:00:00-03:00
 */
function getNowLocal() {
    const now = new Date();
    // Calcula o offset do TZ em milissegundos
    const formatter = new Intl.DateTimeFormat('en-US', {
        timeZone: TIMEZONE,
        hour12: false,
        year: 'numeric', month: '2-digit', day: '2-digit',
        hour: '2-digit', minute: '2-digit', second: '2-digit',
    });
    const parts = formatter.formatToParts(now);
    const get = (type) => parts.find(p => p.type === type).value;

    // Construir string ISO sem problemas de timezone
    return `${get('year')}-${get('month')}-${get('day')}T${get('hour')}:${get('minute')}:${get('second')}`;
}

/**
 * Retorna o início do dia de hoje no fuso local (00:00:00) como Date
 * Útil para queries .gte()
 */
function getInicioHojeLocal() {
    const hoje = getHojeLocal(); // YYYY-MM-DD
    return `${hoje}T00:00:00`;
}

/**
 * Formata uma data para exibição no fuso local
 * @param {Date|string} date
 * @param {object} options - Intl.DateTimeFormat options
 */
function formatarDataLocal(date, options = {}) {
    return new Intl.DateTimeFormat('pt-BR', {
        timeZone: TIMEZONE,
        ...options
    }).format(new Date(date));
}

/**
 * Limites (início/fim) de um dia LOCAL convertidos para ISO UTC.
 * logs_acesso.created_at é gravado em UTC, então "hoje" precisa ser
 * 03:00Z → 02:59:59.999Z do dia seguinte (America/Sao_Paulo).
 */
function getLimitesDiaLocalUTC(dia = getHojeLocal()) {
    const ref = new Date(`${dia}T12:00:00Z`);
    const local = new Date(ref.toLocaleString('en-US', { timeZone: TIMEZONE }));
    const utc = new Date(ref.toLocaleString('en-US', { timeZone: 'UTC' }));
    const offsetMs = local - utc;
    const start = new Date(Date.parse(`${dia}T00:00:00Z`) - offsetMs);
    const end = new Date(start.getTime() + 24 * 60 * 60 * 1000 - 1);
    return { start: start.toISOString(), end: end.toISOString() };
}

/**
 * Próxima ocorrência (futura) de um horário local "HH:MM[:SS]" — hoje, se ainda não passou;
 * senão, amanhã. Ex.: horário de reset do evento às 06:00.
 * @returns {Date}
 */
function proximaOcorrenciaHorario(horario = '00:00:00', agora = new Date()) {
    const [h = 0, m = 0, s = 0] = String(horario).split(':').map(n => parseInt(n, 10) || 0);
    const offsetMs = ((h * 60 + m) * 60 + s) * 1000;
    const hojeLocal = getHojeLocal();
    let alvo = new Date(new Date(getLimitesDiaLocalUTC(hojeLocal).start).getTime() + offsetMs);
    if (alvo <= agora) alvo = new Date(alvo.getTime() + 24 * 60 * 60 * 1000);
    return alvo;
}

/**
 * Última ocorrência (já passada) de um horário local "HH:MM[:SS]": início do dia de operação
 * de um evento que vira no horário de reset (ex.: 06:00 para turnos que passam da meia-noite).
 * @returns {Date}
 */
function ultimaOcorrenciaHorario(horario = '00:00:00', agora = new Date()) {
    return new Date(proximaOcorrenciaHorario(horario, agora).getTime() - 24 * 60 * 60 * 1000);
}

/**
 * Limite do filtro de período em UTC. Aceita "YYYY-MM-DD" (dia inteiro), o horário local do
 * datetime-local ("YYYY-MM-DDTHH:mm") ou ISO com fuso. Antes cada aba comparava de um jeito e
 * o horário local ia direto contra o UTC do banco (3h de diferença).
 */
function limiteFiltro(valor, fim = false) {
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
}

module.exports = {
    limiteFiltro,
    proximaOcorrenciaHorario,
    ultimaOcorrenciaHorario,
    getHojeLocal,
    getNowLocal,
    getInicioHojeLocal,
    getLimitesDiaLocalUTC,
    formatarDataLocal,
    TIMEZONE,
};
