'use strict';

/**
 * POST /api/checkin/liberar-reentrada: o controlador de acesso libera uma nova entrada de uma pessoa numa
 * área de portão (controla_entrada), depois de uma saída. A liberação é por pessoa, área, etapa e dia civil,
 * e vale só para saídas anteriores a ela. Fica gravada em liberacoes_reentrada (quem liberou e quando).
 *
 * Corpo: { pessoa_id (obrigatório), area_id (uuid ou null = área geral), etapa (opcional: montagem, evento,
 *          desmontagem, todas; sem ela usa a etapa atual da pessoa pelo lote) }
 * Respostas:
 *   200 { success: true, data: { id } }
 *   400 corpo inválido, área de outro evento
 *   403 sem permissão de check-in no evento (checkAnyPermission na rota)
 *   404 pessoa não existe neste evento
 *   503 tabela liberacoes_reentrada ausente (migration 20261119 pendente)
 */
const { supabase } = require('../../config/supabase');
const logger = require('../../services/logger');
const ApiResponse = require('../../utils/apiResponse');
const { eventoPermitido } = require('../../utils/escopoEvento');
const { diaDoAcesso, etapaDaPessoa, normalizarEtapa, TABELA_LIBERACOES, ehTabelaAusente } = require('./services/entradaEtapa');

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ETAPAS_VALIDAS = ['todas', 'montagem', 'evento', 'desmontagem'];

async function liberarReentrada(req, res) {
    try {
        const eventoId = req.event?.id || req.tenantId;
        if (!eventoId || !eventoPermitido(req.user, eventoId)) {
            return ApiResponse.error(res, 'Acesso negado: você não possui autorização para operar este evento.', 403);
        }

        const { pessoa_id, area_id, etapa } = req.body || {};
        if (!pessoa_id || !UUID_RE.test(pessoa_id)) {
            return ApiResponse.error(res, 'pessoa_id é obrigatório (uuid)', 400);
        }
        if (area_id !== undefined && area_id !== null && !UUID_RE.test(area_id)) {
            return ApiResponse.error(res, 'area_id deve ser uuid ou null (área geral)', 400);
        }
        if (etapa !== undefined && etapa !== null) {
            const etapaNorm = normalizarEtapa(etapa);
            if (typeof etapa !== 'string' || !ETAPAS_VALIDAS.includes(etapaNorm)) {
                return ApiResponse.error(res, `etapa inválida. Use: ${ETAPAS_VALIDAS.join(', ')}`, 400);
            }
        }

        // Pessoa do evento (outro evento = 404, sem revelar que existe)
        const { data: pessoa, error: pErr } = await supabase.from('pessoas')
            .select('id, evento_id, tipo_pulseira_id')
            .eq('id', pessoa_id).eq('evento_id', eventoId)
            .maybeSingle();
        if (pErr) throw pErr;
        if (!pessoa) return ApiResponse.error(res, 'Pessoa não encontrada neste evento', 404);

        const areaId = area_id || null;
        if (areaId) {
            const { data: area, error: aErr } = await supabase.from('evento_areas')
                .select('id').eq('id', areaId).eq('evento_id', eventoId).maybeSingle();
            if (aErr) throw aErr;
            if (!area) return ApiResponse.error(res, 'Área não pertence a este evento', 400);
        }

        const etapaFinal = etapa ? normalizarEtapa(etapa) : await etapaDaPessoa(supabase, pessoa);
        const { data, error } = await supabase.from(TABELA_LIBERACOES)
            .insert([{
                evento_id: eventoId,
                pessoa_id: pessoa.id,
                area_id: areaId,
                etapa: etapaFinal,
                dia_civil: diaDoAcesso(new Date()),       // dia civil local (America/Sao_Paulo)
                liberado_por: req.user?.id || null
            }])
            .select('id')
            .single();

        if (error) {
            if (ehTabelaAusente(error)) {
                return ApiResponse.error(res, 'Liberação de reentrada indisponível: falta a migration 20261119_controle_entrada_portao.sql', 503);
            }
            throw error;
        }

        logger.info(`[Entrada] Reentrada liberada: pessoa ${pessoa.id}, área ${areaId || 'geral'}, etapa ${etapaFinal} (por ${req.user?.id || '?'})`);
        return ApiResponse.success(res, { id: data.id });
    } catch (error) {
        logger.error('Erro ao liberar reentrada:', error);
        return ApiResponse.error(res, 'Erro ao registrar a liberação de reentrada', 500);
    }
}

module.exports = { liberarReentrada };
