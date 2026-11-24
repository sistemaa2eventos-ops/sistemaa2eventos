'use strict';

/**
 * Pulseira repetida DENTRO DO MESMO LOTE (tipo_pulseira_id). Um número pode existir em lotes diferentes
 * (montagem, evento, desmontagem); só o repetido dentro do mesmo lote é conflito.
 * Sem lote (tipo_pulseira_id nulo) o "mesmo lote" é o grupo sem lote.
 */
const { buscarLotesDaFaixa, escolherLote } = require('../pulseiras/loteSelecao');

/**
 * Outra pessoa do evento com o mesmo número no mesmo lote. Só leitura: quem chama decide o 409 e não grava.
 * @returns {Promise<{ id: string, nome_completo: string } | null>}
 */
async function outraPessoaNoLote(cliente, eventoId, numero, pessoaId, loteId) {
    let consulta = cliente.from('pessoas')
        .select('id, nome_completo')
        .eq('evento_id', eventoId)
        .eq('numero_pulseira', String(numero))
        .neq('id', pessoaId);
    consulta = loteId ? consulta.eq('tipo_pulseira_id', loteId) : consulta.is('tipo_pulseira_id', null);
    const { data, error } = await consulta.limit(1);
    if (error) throw error;
    return data?.[0] || null;
}

/**
 * Id do lote que vale AGORA para o número (fase, data e horário). Null se o número não tem lote
 * ou se nenhum lote vale neste momento.
 */
async function loteAtivoDaPulseira(cliente, eventoId, numero) {
    const numeroInt = parseInt(numero, 10);
    if (Number.isNaN(numeroInt)) return null;
    const candidatos = await buscarLotesDaFaixa(cliente, eventoId, numeroInt);
    const escolha = await escolherLote(candidatos, eventoId);
    return escolha.lote?.id ?? null;
}

module.exports = { outraPessoaNoLote, loteAtivoDaPulseira };
