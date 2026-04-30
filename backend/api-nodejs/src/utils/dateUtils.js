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

module.exports = {
    getHojeLocal,
    getNowLocal,
    getInicioHojeLocal,
    formatarDataLocal,
    TIMEZONE,
};
