const { supabase } = require('../../../config/supabase');

/**
 * Tipo de operação de cada área (evento_areas.tipo_area):
 *   - checkin_checkout  : entrada e saída de pulseira livres (padrão; controla_entrada = false)
 *   - liberacao_acesso  : portão. Entrada única por etapa/dia e reentrada com liberação (controla_entrada = true)
 *   - monitoramento     : só vigilância. Não registra entrada nem saída (bloqueado nos endpoints de acesso)
 *
 * controla_entrada continua sendo a regra usada pela função registrar_acesso_etapa no banco; ao salvar o tipo,
 * a tela grava controla_entrada de acordo com ele para não haver duas fontes de verdade.
 */
const TIPOS_AREA = ['checkin_checkout', 'liberacao_acesso', 'monitoramento'];

const CONTROLA_ENTRADA_POR_TIPO = {
    checkin_checkout: false,
    liberacao_acesso: true,
    monitoramento: false
};

const MSG_SO_MONITORAMENTO = 'Esta área é só de monitoramento: a entrada e a saída não são registradas nela.';

// Migration 20261119g ainda não aplicada: a coluna não existe e nenhuma área é bloqueada
const colunaAusente = (error) => error?.code === '42703' || /tipo_area/.test(error?.message || '');

/**
 * Devolve a mensagem de bloqueio quando a área é só de monitoramento, ou null quando o acesso pode seguir.
 * Área geral (sem área informada) nunca é bloqueada aqui.
 */
async function bloqueioPorTipoArea(areaId, client = supabase) {
    if (!areaId) return null;
    const { data, error } = await client
        .from('evento_areas')
        .select('tipo_area')
        .eq('id', areaId)
        .maybeSingle();
    if (error) {
        if (colunaAusente(error)) return null;
        throw error;
    }
    return data?.tipo_area === 'monitoramento' ? MSG_SO_MONITORAMENTO : null;
}

module.exports = { TIPOS_AREA, CONTROLA_ENTRADA_POR_TIPO, MSG_SO_MONITORAMENTO, bloqueioPorTipoArea };
