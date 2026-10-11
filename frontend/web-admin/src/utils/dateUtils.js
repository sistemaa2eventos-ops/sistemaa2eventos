import timeSyncService from '../services/timeSyncService';

/**
 * Converte qualquer representação de data para um objeto Date ajustado com segurança.
 * Se a string do Supabase/PostgreSQL for UTC sem o sufixo 'Z', adiciona 'Z' para que o navegador
 * interprete corretamente como UTC e converta para a hora local.
 */
export const parseLocalDate = (dateInput) => {
    return timeSyncService.parseDate(dateInput);
};

/**
 * Retorna a hora formatada rigorosamente no fuso horário da geolocalização do operador (HH:mm:ss)
 */
export const formatLocalTime = (dateInput) => {
    return timeSyncService.formatTime(dateInput);
};

/**
 * Formata data e hora segundo o fuso da geolocalização do operador (dd/MM/yyyy HH:mm:ss)
 */
export const formatLocalDateTime = (dateInput) => {
    return timeSyncService.formatDateTime(dateInput);
};

/**
 * Retorna a data de hoje no fuso da geolocalização do operador no formato YYYY-MM-DD
 * Evita o bug de virada de dia precoce causada por toISOString() que converte para UTC
 */
export const getHojeLocal = () => {
    return timeSyncService.getTodayDateString();
};

/**
 * Retorna a data e hora atual sincronizada com o servidor e ajustada à geolocalização
 */
export const getSyncedNow = () => {
    return timeSyncService.getSyncedDate();
};

/**
 * Retorna o rótulo do fuso do operador (ex: 'Brasília (UTC-3)')
 */
export const getOperatorTimezoneLabel = () => {
    return timeSyncService.timezoneLabel;
};

export default {
    parseLocalDate,
    formatLocalTime,
    formatLocalDateTime,
    getHojeLocal,
    getSyncedNow,
    getOperatorTimezoneLabel
};
