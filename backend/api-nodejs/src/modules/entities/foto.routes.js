const express = require('express');
const router = express.Router();
const { supabase } = require('../../config/supabase');
const logger = require('../../services/logger');
const { authenticate } = require('../../middleware/auth');
const { ehSoberano, eventoPermitido } = require('../../utils/escopoEvento');
const {
    caminhoDeStorage, urlAssinada, assinarFotos, SEGUNDOS_PADRAO, BUCKETS_FOTO
} = require('../../services/storageSeguro');
const ApiResponse = require('../../utils/apiResponse');

const MAX_IDS_LOTE = 100;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

router.use(authenticate);

const _s = (v) => (v && v !== 'undefined' && v !== 'null') ? v : null;

/**
 * Evento da requisição, pelo mesmo critério do checkPermission (rotas de documento):
 *  - admin e admin_master: sem filtro de evento (funciona também sem evento selecionado);
 *  - demais: evento pedido (x-evento-id / ?evento_id) ou o do usuário, que precisa estar entre os
 *    eventos permitidos (isAllowedEvent).
 * @returns {{ soberano: true } | { eventoId: string } | { status: number, erro: string }}
 */
function contextoDeEvento(req) {
    if (ehSoberano(req.user)) return { soberano: true };

    const eventoId = _s(req.headers['x-evento-id']) || _s(req.query.evento_id) || _s(req.user?.evento_id);
    if (!eventoId) return { status: 400, erro: 'Sua sessão não possui um evento vinculado. Refaça o login.' };
    if (!eventoPermitido(req.user, eventoId)) {
        logger.warn(`🚨 [Fotos] Evento não autorizado: usuário ${req.user.id} pediu foto do evento ${eventoId}`);
        return { status: 403, erro: 'Acesso negado: você não possui autorização para este evento.' };
    }
    return { eventoId };
}

const consultaPessoas = (ctx) => {
    const q = supabase.from('pessoas').select('id, foto_url');
    return ctx.eventoId ? q.eq('evento_id', ctx.eventoId) : q;
};

/**
 * GET /api/fotos/:pessoaId/url → { url } assinada (600 s) da foto da pessoa.
 */
router.get('/:pessoaId/url', async (req, res) => {
    try {
        const ctx = contextoDeEvento(req);
        if (ctx.erro) return ApiResponse.error(res, ctx.erro, ctx.status);

        const { data: pessoa, error } = await consultaPessoas(ctx).eq('id', req.params.pessoaId).maybeSingle();
        if (error || !pessoa) return ApiResponse.error(res, 'Pessoa não encontrada ou acesso negado.', 404);
        if (!pessoa.foto_url) return ApiResponse.error(res, 'Pessoa sem foto cadastrada.', 404);

        const ref = caminhoDeStorage(pessoa.foto_url, { buckets: BUCKETS_FOTO });
        if (!ref) {
            // Arquivo do nosso storage, mas fora dos buckets de foto: não assina nem devolve
            if (caminhoDeStorage(pessoa.foto_url)) return ApiResponse.error(res, 'Foto fora do armazenamento de fotos.', 422);
            // Data URI ou link de outro endereço: não há arquivo do storage para assinar
            return ApiResponse.success(res, { url: pessoa.foto_url, assinada: false });
        }

        const url = await urlAssinada(ref.bucket, ref.path, SEGUNDOS_PADRAO);
        return ApiResponse.success(res, { url, assinada: true, expira_em_segundos: SEGUNDOS_PADRAO });
    } catch (error) {
        logger.error(`[Fotos] Falha ao gerar URL da foto: ${error.message}`);
        return ApiResponse.error(res, 'Não foi possível gerar o link da foto. Tente de novo.', 502);
    }
});

/**
 * POST /api/fotos/urls { ids: [...] } (até 100) → { urls: { [pessoaId]: url | null }, expira_em_segundos }
 * Para as listas do painel: um pedido e uma assinatura por bucket. Pessoa fora do evento, sem foto
 * ou com foto fora dos buckets de foto volta com null.
 */
router.post('/urls', async (req, res) => {
    try {
        const ids = req.body?.ids;
        if (!Array.isArray(ids) || ids.length === 0) return ApiResponse.error(res, 'Informe a lista ids.', 400);
        if (ids.length > MAX_IDS_LOTE) return ApiResponse.error(res, `No máximo ${MAX_IDS_LOTE} ids por pedido.`, 400);
        const unicos = [...new Set(ids.map(String))];
        // id que não é UUID volta null no mapa, sem derrubar o lote (nem ir ao banco)
        const validos = unicos.filter(id => UUID.test(id));

        const ctx = contextoDeEvento(req);
        if (ctx.erro) return ApiResponse.error(res, ctx.erro, ctx.status);

        let pessoas = [];
        if (validos.length) {
            const { data, error } = await consultaPessoas(ctx).in('id', validos);
            if (error) throw error;
            pessoas = data || [];
        }

        const assinadas = await assinarFotos(pessoas || [], SEGUNDOS_PADRAO);
        const porId = new Map((pessoas || []).map(p => [String(p.id), p]));
        const urls = {};
        for (const id of unicos) {
            const p = porId.get(id);
            if (!p || !p.foto_url) { urls[id] = null; continue; }
            if (assinadas.has(p.id)) { urls[id] = assinadas.get(p.id); continue; }
            // Data URI ou link de outro endereço: devolve como está; arquivo do storage que não assinou: null
            urls[id] = caminhoDeStorage(p.foto_url) ? null : p.foto_url;
        }
        return ApiResponse.success(res, { urls, expira_em_segundos: SEGUNDOS_PADRAO });
    } catch (error) {
        logger.error(`[Fotos] Falha ao gerar URLs das fotos: ${error.message}`);
        return ApiResponse.error(res, 'Não foi possível gerar os links das fotos. Tente de novo.', 502);
    }
});

module.exports = router;
module.exports.contextoDeEvento = contextoDeEvento;
