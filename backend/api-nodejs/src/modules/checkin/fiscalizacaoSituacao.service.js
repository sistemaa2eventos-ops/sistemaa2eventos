'use strict';

// Situação de uma pessoa para a Fiscalização de áreas: credenciada? dentro do evento? qual pulseira está
// em uso HOJE, com tipo e horário em que foi colocada, e o histórico de entradas e saídas de hoje.
// Pulseira de outro dia nunca aparece aqui: nem a descredenciada, nem a que ficou sem devolução.

const pulseiraService = require('../pulseiras/pulseira.service');
const { getHojeLocal, getLimitesDiaLocalUTC } = require('../../utils/dateUtils');

// Situações que não credenciam (pendente, recusada, em verificação ou bloqueada)
const SITUACOES_NAO_CREDENCIADAS = ['pendente', 'recusado', 'verificacao', 'bloqueado'];

// created_at do banco é UTC sem marcador de fuso: sem o "Z" a data sai 3 h errada
const comoIsoUtc = (valor) => {
    if (!valor) return null;
    const texto = String(valor);
    const comFuso = /[zZ]|[+-]\d\d:?\d\d$/.test(texto) ? texto : `${texto}Z`;
    const data = new Date(comFuso);
    return Number.isNaN(data.getTime()) ? null : data.toISOString();
};

async function buscarTipoPulseira(client, tipoId) {
    if (!tipoId) return null;
    const { data } = await client.from('evento_tipos_pulseira')
        .select('nome_tipo, cor_hex')
        .eq('id', tipoId)
        .maybeSingle();
    return data || null;
}

/**
 * @returns {Promise<{
 *   credenciado: boolean,
 *   motivo_nao_credenciado: string|null,
 *   dentro_do_evento: boolean,
 *   ultimo_evento_hoje: 'checkin'|'checkout'|null,
 *   pulseira: { numero: string, tipo_nome: string|null, cor_hex: string|null, colocada_em: string|null } | null,
 *   historico_hoje: Array<{ tipo: string, horario: string|null, numero_pulseira: string|null, metodo: string|null, area_nome: string|null, observacao: string|null }>
 * }>}
 */
async function situacaoFiscal(client, eventoId, pessoa) {
    // 1. Credencial: cadastro ativo e situação que credencia
    let motivoNaoCredenciado = null;
    if (pessoa.ativo === false) motivoNaoCredenciado = 'Cadastro desativado neste evento';
    else if (SITUACOES_NAO_CREDENCIADAS.includes(pessoa.status_acesso)) motivoNaoCredenciado = `Situação: ${pessoa.status_acesso}`;
    else if (pessoa.bloqueado) motivoNaoCredenciado = 'Bloqueada';

    // 2. Movimentos de hoje (horário de Brasília)
    const { start, end } = getLimitesDiaLocalUTC(getHojeLocal());
    const { data: movimentos, error } = await client.from('logs_acesso')
        .select('tipo, created_at, numero_pulseira, metodo, observacao, evento_areas(nome_area)')
        .eq('evento_id', eventoId)
        .eq('pessoa_id', pessoa.id)
        .in('tipo', ['checkin', 'checkout'])
        .gte('created_at', start)
        .lte('created_at', end)
        .order('created_at', { ascending: true });
    if (error) throw error;
    const hoje = movimentos || [];

    // 3. Pulseira em uso hoje (regra única do serviço de pulseiras: check-in de hoje sem saída depois)
    const status = await pulseiraService.buscarStatusPulseira(eventoId, pessoa.id);
    const numero = status?.emUso ? String(status.emUso) : null;

    const ultimoEvento = hoje.length ? hoje[hoje.length - 1].tipo : null;
    const entradaDaPulseira = numero
        ? [...hoje].reverse().find(m => m.tipo === 'checkin' && String(m.numero_pulseira || '').trim() === numero)
        : null;
    const tipo = numero ? await buscarTipoPulseira(client, pessoa.tipo_pulseira_id) : null;

    return {
        credenciado: motivoNaoCredenciado === null,
        motivo_nao_credenciado: motivoNaoCredenciado,
        dentro_do_evento: Boolean(numero) && ultimoEvento === 'checkin',
        ultimo_evento_hoje: ultimoEvento,
        pulseira: numero ? {
            numero,
            tipo_nome: tipo?.nome_tipo || null,
            cor_hex: tipo?.cor_hex || null,
            colocada_em: comoIsoUtc(entradaDaPulseira?.created_at)
        } : null,
        historico_hoje: hoje.map(m => ({
            tipo: m.tipo,
            horario: comoIsoUtc(m.created_at),
            numero_pulseira: m.numero_pulseira || null,
            metodo: m.metodo || null,
            area_nome: m.evento_areas?.nome_area || null,
            observacao: m.observacao || null
        }))
    };
}

module.exports = { situacaoFiscal, SITUACOES_NAO_CREDENCIADAS, comoIsoUtc };
