/**
 * Escolha do lote de pulseira para a faixa numérica lida.
 *
 * Um mesmo número pode existir em lotes diferentes (montagem, evento, desmontagem), cada um com
 * cor/áreas próprias, data específica e janela de horário. Aqui fica a regra única: só vale o lote
 * que está ativo AGORA e, entre os válidos, o mais específico.
 */
const { getHojeLocal, getNowLocal } = require('../../utils/dateUtils');
const { buscarEvento } = require('../../middleware/eventMiddleware');
const logger = require('../../services/logger');

const COLUNAS_BASE = 'id, nome_tipo, cor_hex, alerta_duplicidade, numero_inicial, numero_final, pulseira_areas_permitidas (area_id, evento_areas (id, nome_area))';
const COLUNAS_LOTE = 'fase, data_especifica, hora_inicio, hora_fim';

// Fase gravada no lote → lista de datas do evento que a define
const CAMPO_FASE = { montagem: 'datas_montagem', evento: 'datas_evento', showday: 'datas_evento', desmontagem: 'datas_desmontagem' };

const colunaInexistente = (error) => error && (error.code === '42703' || error.code === 'PGRST204' || /column|coluna/i.test(error.message || ''));

const minutosDo = (horario) => {
    const [h = 0, m = 0] = String(horario).split(':').map(n => parseInt(n, 10) || 0);
    return h * 60 + m;
};

const diaAnterior = (dia) => {
    const d = new Date(`${dia}T12:00:00Z`);
    d.setUTCDate(d.getUTCDate() - 1);
    return d.toISOString().slice(0, 10);
};

/** Fases do evento que ocorrem no dia (sem datas configuradas, nenhuma fase é restrita) */
function fasesDoDia(evento, dia) {
    const ativas = Object.values(CAMPO_FASE).some(campo => (evento?.[campo] || []).length > 0);
    if (!ativas) return null;
    const fases = new Set();
    for (const [fase, campo] of Object.entries(CAMPO_FASE)) {
        if ((evento[campo] || []).includes(dia)) fases.add(fase === 'showday' ? 'evento' : fase);
    }
    return fases;
}

/**
 * Busca os lotes que cobrem o número. Banco sem a migration 20261111_pulseiras_fase_data: lê sem as
 * colunas novas (lotes antigos valem sempre) e avisa no log, em vez de engolir o erro.
 */
async function buscarLotesDaFaixa(client, eventoId, numero) {
    const consultar = (colunas) => client.from('evento_tipos_pulseira')
        .select(colunas)
        .eq('evento_id', eventoId)
        .lte('numero_inicial', numero)
        .gte('numero_final', numero)
        .order('numero_inicial', { ascending: true })
        .order('id', { ascending: true });

    let { data, error } = await consultar(`${COLUNAS_BASE}, ${COLUNAS_LOTE}`);
    if (colunaInexistente(error)) {
        logger.warn(`[Pulseiras] Colunas de fase/horário ausentes: rode a migration 20261111_pulseiras_fase_data.sql. Usando lotes sem restrição.`);
        ({ data, error } = await consultar(COLUNAS_BASE));
    }
    if (error) throw error;
    return data || [];
}

/**
 * Escolhe o lote válido agora.
 * @returns {{ lote: object|null, bloqueado: boolean, motivo: string|null }}
 *  - sem lote cadastrado para o número → lote null, não bloqueado (comportamento antigo)
 *  - há lotes, mas nenhum vale agora → bloqueado com motivo
 */
async function escolherLote(candidatos, eventoId = null, agora = getNowLocal()) {
    if (!candidatos || candidatos.length === 0) return { lote: null, bloqueado: false, motivo: null };

    const hoje = agora.slice(0, 10);
    const minutoAgora = minutosDo(agora.slice(11, 16));
    const evento = eventoId ? (await buscarEvento(eventoId).then(r => r.evento).catch(() => null)) : null;
    const fasesCache = new Map();
    const fasesDe = (dia) => {
        if (!fasesCache.has(dia)) fasesCache.set(dia, fasesDoDia(evento, dia));
        return fasesCache.get(dia);
    };

    const validos = [];
    for (const lote of candidatos) {
        const inicio = lote.hora_inicio;
        const fim = lote.hora_fim;
        let dia = hoje;
        if (inicio && fim && minutosDo(inicio) !== minutosDo(fim)) {
            const a = minutosDo(inicio);
            const b = minutosDo(fim);
            if (a < b) {
                if (minutoAgora < a || minutoAgora >= b) continue;
            } else if (minutoAgora >= a) {
                // ex.: 16:00 às 02:00 — a parte da noite pertence ao dia que começou
            } else if (minutoAgora < b) {
                dia = diaAnterior(hoje); // madrugada de um lote que começou ontem
            } else {
                continue;
            }
        }
        if (lote.data_especifica && lote.data_especifica !== dia) continue;
        const fase = lote.fase || 'todas';
        if (fase !== 'todas') {
            const fases = fasesDe(dia);
            if (fases && !fases.has(fase === 'showday' ? 'evento' : fase)) continue;
        }
        const especificidade = (lote.data_especifica ? 4 : 0) + (fase !== 'todas' ? 2 : 0) + (inicio && fim ? 1 : 0);
        validos.push({ lote, especificidade });
    }

    if (validos.length === 0) {
        const nome = candidatos[0].nome_tipo || 'pulseira';
        return { lote: null, bloqueado: true, motivo: `Esta pulseira (${nome}) não está liberada agora: fora da fase, data ou horário de uso do lote.` };
    }
    // maior especificidade vence; empate mantém a ordem (número inicial, id)
    validos.sort((x, y) => y.especificidade - x.especificidade);
    return { lote: validos[0].lote, bloqueado: false, motivo: null };
}

module.exports = { buscarLotesDaFaixa, escolherLote, colunaInexistente };
