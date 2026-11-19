'use strict';

/**
 * Lista de recusas (tabela acessos_recusados, migration 20261119c): passagens que a fila de retentativa
 * (CloudSyncWorker) não conseguiu gravar porque o banco recusou (P0409: entrada com a pessoa já dentro ou
 * saída sem liberação; 23505: duplicidade). O operador já tinha visto "ok" nessas passagens: a lista mostra
 * para o operador resolver.
 *
 * GET  /api/checkin/recusados                  → pendentes (resolvido_em nulo) do evento em foco, mais novas primeiro, máx. 200
 * POST /api/checkin/recusados/:id/resolver     → marca como resolvida (resolvido_em = agora, resolvido_por = operador)
 *
 * Escopo: sempre o evento em foco da sessão (requireEvent). O parâmetro ?evento só confirma esse evento:
 * se vier outro, responde 400.
 */
const { supabase } = require('../../config/supabase');
const logger = require('../../services/logger');
const ApiResponse = require('../../utils/apiResponse');
const { eventoPermitido } = require('../../utils/escopoEvento');
const { emLotes } = require('../../utils/lotes');

const TABELA = 'acessos_recusados';
const LIMITE = 200;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Tabela ausente (migration 20261119c não aplicada) */
const tabelaAusente = (error) => !!error && (
    error.code === '42P01' || error.code === 'PGRST205' || /acessos_recusados/.test(error.message || '')
);
const MSG_TABELA_AUSENTE = 'Lista de recusas indisponível: falta a migration 20261119c_acessos_recusados.sql';

/** Evento em foco e permissão no evento (além do checkAnyPermission da rota) */
function eventoDaSessao(req) {
    const eventoId = req.event?.id || req.tenantId;
    if (!eventoId || !eventoPermitido(req.user, eventoId)) return null;
    return eventoId;
}

async function listarRecusados(req, res) {
    try {
        const eventoId = eventoDaSessao(req);
        if (!eventoId) return ApiResponse.error(res, 'Acesso negado: você não possui autorização para operar este evento.', 403);

        const pedido = req.query?.evento || req.query?.evento_id;
        if (pedido && String(pedido) !== eventoId) {
            return ApiResponse.error(res, 'O evento pedido não é o evento em foco', 400);
        }

        const { data, error } = await supabase.from(TABELA)
            .select('id, pessoa_id, area_id, etapa, tipo, metodo, motivo, dados, criado_em')
            .eq('evento_id', eventoId)
            .is('resolvido_em', null)
            .order('criado_em', { ascending: false })
            .limit(LIMITE);
        if (error) {
            if (tabelaAusente(error)) return ApiResponse.error(res, MSG_TABELA_AUSENTE, 503);
            throw error;
        }

        // Nome da pessoa em consulta à parte (a tabela não tem chave estrangeira para pessoas)
        const ids = [...new Set((data || []).map(r => r.pessoa_id).filter(Boolean))];
        const nomes = new Map();
        for (const lote of emLotes(ids, 200)) {
            const { data: pessoas, error: pErr } = await supabase.from('pessoas')
                .select('id, nome_completo').eq('evento_id', eventoId).in('id', lote);
            if (pErr) throw pErr;
            for (const p of pessoas || []) nomes.set(p.id, p.nome_completo);
        }

        return ApiResponse.success(res, (data || []).map(r => ({ ...r, pessoa_nome: nomes.get(r.pessoa_id) || null })));
    } catch (error) {
        logger.error({ err: error }, 'Erro ao listar recusas da fila');
        return ApiResponse.error(res, 'Erro ao listar as recusas', 500);
    }
}

async function resolverRecusado(req, res) {
    try {
        const eventoId = eventoDaSessao(req);
        if (!eventoId) return ApiResponse.error(res, 'Acesso negado: você não possui autorização para operar este evento.', 403);

        const id = String(req.params?.id || '');
        if (!UUID_RE.test(id)) return ApiResponse.error(res, 'id inválido (uuid)', 400);

        const { data: atual, error } = await supabase.from(TABELA)
            .select('id, resolvido_em').eq('id', id).eq('evento_id', eventoId).maybeSingle();
        if (error) {
            if (tabelaAusente(error)) return ApiResponse.error(res, MSG_TABELA_AUSENTE, 503);
            throw error;
        }
        if (!atual) return ApiResponse.error(res, 'Recusa não encontrada neste evento', 404);
        if (atual.resolvido_em) {
            return ApiResponse.success(res, { id: atual.id, resolvido_em: atual.resolvido_em, ja_resolvida: true });
        }

        const quem = UUID_RE.test(req.user?.id || '') ? req.user.id : null;
        // Só marca se ainda estiver pendente (duas pessoas resolvendo ao mesmo tempo: a segunda recebe 409)
        const { data: marcada, error: upErr } = await supabase.from(TABELA)
            .update({ resolvido_em: new Date().toISOString(), resolvido_por: quem })
            .eq('id', id).eq('evento_id', eventoId).is('resolvido_em', null)
            .select('id, resolvido_em')
            .maybeSingle();
        if (upErr) throw upErr;
        if (!marcada) return ApiResponse.error(res, 'Esta recusa já foi resolvida por outra pessoa', 409);

        logger.info(`[Recusas] Recusa ${id} resolvida (operador ${quem || '?'})`);
        return ApiResponse.success(res, { id: marcada.id, resolvido_em: marcada.resolvido_em, ja_resolvida: false });
    } catch (error) {
        logger.error({ err: error }, 'Erro ao resolver recusa da fila');
        return ApiResponse.error(res, 'Erro ao resolver a recusa', 500);
    }
}

module.exports = { listarRecusados, resolverRecusado };
