'use strict';

/**
 * Entrada única por etapa.
 *
 * Regra da operação: uma pessoa não tem duas ENTRADAS (tipo 'checkin') na mesma etapa, no mesmo dia
 * civil (America/Sao_Paulo), na mesma área (área vazia = portaria/geral). Vale para todos os caminhos
 * (leitor rápido, pulseira, credenciamento, facial, câmera, manual). Saída não é afetada.
 *
 * Etapa = fase do lote que vale agora (montagem, evento, desmontagem). "showday" é a fase "evento"
 * (mesma normalização do loteSelecao.js). Lote sem fase = 'todas'.
 *
 * Credenciamento (observação CREDENCIAMENTO) não conta como passagem para os leitores (é a entrega
 * da pulseira). Por isso: entrada de leitor só conflita com passagens reais; credenciamento só conflita
 * com outro credenciamento. Os dois casos têm índice único parcial no banco (migration
 * 20261118_logs_entrada_etapa.sql) para a checagem não depender de corrida.
 */
const { supabase } = require('../../../config/supabase');
const { formatarDataLocal, getHojeLocal } = require('../../../utils/dateUtils');
const logger = require('../../../services/logger');

const MARCADOR_CREDENCIAMENTO = 'CREDENCIAMENTO';
const INDICE_ENTRADA = 'uq_logs_entrada_etapa_dia';
const INDICE_CREDENCIAMENTO = 'uq_logs_credenciamento_etapa_dia';
const AREA_GERAL = '00000000-0000-0000-0000-000000000000';

/** Coluna que o banco não tem (migration ainda não aplicada). Mesma regra de loteSelecao.colunaInexistente */
const colunaInexistente = (error) => !!error && (error.code === '42703' || error.code === 'PGRST204' || /column|coluna/i.test(error.message || ''));

/** Fase do lote → etapa (showday = evento). Sem fase vira 'todas'. */
function normalizarEtapa(fase) {
    if (!fase || fase === 'todas') return 'todas';
    return fase === 'showday' ? 'evento' : fase;
}

/** Etapa de um lote de pulseira (objeto com fase opcional) */
const etapaDoLote = (lote) => (lote ? normalizarEtapa(lote.fase) : null);

/** Dia civil local (YYYY-MM-DD) do instante do acesso */
const diaDoAcesso = (instante) => getHojeLocal(instante);

/** Mensagem exibida ao operador e ao reenvio offline (que vira erro_negocio no painel) */
const mensagemEntradaDuplicada = (createdAt) =>
    `Entrada já registrada nesta etapa hoje às ${formatarDataLocal(createdAt, { hour: '2-digit', minute: '2-digit' })}`;

/** Erro com status 409 para a resposta da API */
function erroEntradaDuplicada(createdAt) {
    const erro = new Error(mensagemEntradaDuplicada(createdAt));
    erro.status = 409;
    erro.is_entrada_duplicada = true;
    return erro;
}

/** A violação de unicidade veio de um dos dois índices de entrada? */
function ehViolacaoEntrada(erro) {
    if (!erro || erro.code !== '23505') return false;
    const texto = `${erro.message || ''} ${erro.details || ''}`;
    return texto.includes(INDICE_ENTRADA) || texto.includes(INDICE_CREDENCIAMENTO);
}

/**
 * Entrada já existente da pessoa na etapa/dia/área. Credenciamento confere também outros
 * credenciamentos; leitor só confere passagens reais.
 * @returns {Promise<{ id: string, created_at: string } | null>} null também se a migration ainda não
 *          foi aplicada (colunas ausentes): nesse caso a checagem fica desligada e registra aviso.
 */
async function buscarEntradaNaEtapa(client, { evento_id, pessoa_id, etapa, dia, area_id, credenciamento }) {
    let q = (client || supabase).from('logs_acesso')
        .select('id, created_at')
        .eq('evento_id', evento_id)
        .eq('pessoa_id', pessoa_id)
        .eq('tipo', 'checkin')
        .eq('etapa', etapa)
        .eq('dia_civil', dia)
        .order('created_at', { ascending: false })
        .limit(1);
    q = area_id ? q.eq('area_id', area_id) : q.is('area_id', null);
    q = credenciamento
        ? q.eq('observacao', MARCADOR_CREDENCIAMENTO)
        : q.or(`observacao.is.null,observacao.neq.${MARCADOR_CREDENCIAMENTO}`);

    const { data, error } = await q.maybeSingle();
    if (error) {
        if (colunaInexistente(error)) {
            logger.warn('[Entrada] Colunas etapa/dia_civil ausentes em logs_acesso: rode a migration 20261118_logs_entrada_etapa.sql. Entrada única por etapa desligada.');
            return null;
        }
        throw error;
    }
    return data || null;
}

/**
 * Etapa da pessoa para o acesso sem lote conhecido (leitor de CPF/QR, facial, câmera): fase do lote do
 * tipo de pulseira dela. Sem lote = 'todas'. Erro ao ler a fase cai em 'todas' (não bloqueia o acesso).
 */
async function etapaDaPessoa(client, pessoa) {
    if (!pessoa?.tipo_pulseira_id) return 'todas';
    const { data, error } = await (client || supabase).from('evento_tipos_pulseira')
        .select('fase').eq('id', pessoa.tipo_pulseira_id).maybeSingle();
    if (error) {
        if (!colunaInexistente(error)) logger.warn(`[Entrada] Fase do lote não lida: ${error.message}`);
        return 'todas';
    }
    return normalizarEtapa(data?.fase);
}

module.exports = {
    etapaDaPessoa,
    MARCADOR_CREDENCIAMENTO,
    INDICE_ENTRADA,
    INDICE_CREDENCIAMENTO,
    AREA_GERAL,
    normalizarEtapa,
    etapaDoLote,
    diaDoAcesso,
    mensagemEntradaDuplicada,
    erroEntradaDuplicada,
    ehViolacaoEntrada,
    buscarEntradaNaEtapa,
    colunaInexistente
};
