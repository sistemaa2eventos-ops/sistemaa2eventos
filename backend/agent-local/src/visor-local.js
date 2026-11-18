'use strict';

/**
 * Visor local: o vídeo da central de operação vai direto do PC do evento para o navegador da rede local,
 * sem passar pela VPS. Só escuta em 127.0.0.1.
 *
 * Proteção: o painel pede uma sessão em GET /sessao. Esse pedido só é aceito de origens do próprio
 * sistema (CORS), e só essa origem consegue LER o token (outra página do navegador recebe erro de CORS).
 * Os vídeos exigem o token na URL (?t=...). A sessão vale 1 hora e é reaproveitada enquanto vale.
 *
 * Rotas: /camera/:id/webrtc (ao vivo sem atraso), /camera/:id/mp4 (reserva) e /camera/:id/deteccoes
 * (caixas da IA lidas do motor deste PC).
 */
const http = require('http');
const crypto = require('crypto');
const video = require('./video');
const central = require('./central');

const PORTA = Number(process.env.VISOR_LOCAL_PORTA || 8766);
const ORIGENS = new Set(['https://painel.nzt.app.br', 'http://localhost:5173', 'http://localhost:3000']);
const SESSAO_MS = 60 * 60 * 1000;
let sessao = null; // { token, ate }

function novaSessao() {
    sessao = { token: crypto.randomBytes(24).toString('hex'), ate: Date.now() + SESSAO_MS };
    return sessao;
}

function sessaoValida(token) {
    return !!sessao && !!token && sessao.token === token && Date.now() < sessao.ate;
}

function cabecalhosCors(res, origem) {
    res.setHeader('Access-Control-Allow-Origin', origem);
    res.setHeader('Vary', 'Origin');
    // Chrome pede esta permissão para uma página pública falar com um endereço local
    res.setHeader('Access-Control-Allow-Private-Network', 'true');
}

const SDP_MAX = 64 * 1024;

function lerCorpo(req, max) {
    return new Promise((ok, falha) => {
        const partes = [];
        let total = 0;
        req.on('data', (p) => {
            total += p.length;
            if (total > max) { falha(new Error('corpo grande demais')); req.destroy(); return; }
            partes.push(p);
        });
        req.on('end', () => ok(Buffer.concat(partes).toString('utf8')));
        req.on('error', falha);
    });
}

/** Mesmo formato das caixas que a API da VPS devolve em /cameras/:id/deteccoes */
const caixaParaPainel = (f) => ({
    id: f.track_id,
    caixa: f.bbox_n,
    qualidade: f.quality_status,
    pessoa: f.matched_person ? {
        nome: f.matched_person.nome,
        semelhanca: f.matched_person.similarity,
        bloqueado: !!(f.matched_person.bloqueado || f.matched_person.status_acesso === 'bloqueado')
    } : null
});

/**
 * @param {Function} log
 * @param {{ fetchIa?: Function }} opcoes  fetchIa: chamada ao motor de IA local (com a chave interna)
 */
function iniciar(log, opcoes = {}) {
    const { fetchIa } = opcoes;
    // CENTRAL_REDE=1: a Central também atende outros computadores da rede (com a chave de acesso)
    const naRede = /^(1|true|sim)$/i.test(String(process.env.CENTRAL_REDE || ''));
    central.iniciar({ log, fetchIa, porta: PORTA, soLocal: !naRede });
    const server = http.createServer(async (req, res) => {
        const url = new URL(req.url, 'http://127.0.0.1');
        const origem = req.headers.origin;
        const origemOk = !!origem && ORIGENS.has(origem);

        if (req.method === 'OPTIONS') {
            if (!origemOk) { res.statusCode = 403; return res.end(); }
            cabecalhosCors(res, origem);
            res.setHeader('Access-Control-Allow-Methods', 'GET, POST');
            res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
            res.setHeader('Access-Control-Max-Age', '600');
            res.statusCode = 204;
            return res.end();
        }

        if (req.method === 'GET' && url.pathname === '/sessao') {
            if (!origemOk) { res.statusCode = 403; return res.end(); }
            cabecalhosCors(res, origem);
            // Reaproveita o token enquanto valer: várias câmeras abertas usam o mesmo sem invalidar umas às outras
            const s = sessao && Date.now() < sessao.ate ? sessao : novaSessao();
            res.setHeader('Content-Type', 'application/json');
            res.setHeader('Cache-Control', 'no-store');
            return res.end(JSON.stringify({ token: s.token, ate: s.ate }));
        }

        if (req.method === 'GET' && url.pathname === '/health') {
            res.setHeader('Content-Type', 'application/json');
            return res.end(JSON.stringify({ ok: true, retransmissor: video.disponivel() }));
        }

        // Ao vivo sem atraso (WebRTC): oferta SDP no corpo, resposta SDP de volta
        const mw = url.pathname.match(/^\/camera\/([^/]+)\/webrtc$/);
        if (req.method === 'POST' && mw) {
            if (origemOk) cabecalhosCors(res, origem);
            if (!sessaoValida(url.searchParams.get('t'))) { res.statusCode = 401; return res.end(); }
            const cameraId = decodeURIComponent(mw[1]);
            if (!video.conhece(cameraId)) { res.statusCode = 404; return res.end(); }
            const qualidade = url.searchParams.get('qualidade') === 'foco' ? 'foco' : 'mini';
            try {
                const oferta = await lerCorpo(req, SDP_MAX);
                if (!oferta.startsWith('v=0')) { res.statusCode = 400; return res.end(); }
                const resposta = await video.abrirWebrtc(cameraId, qualidade, oferta);
                res.statusCode = 201;
                res.setHeader('Content-Type', 'application/sdp');
                res.setHeader('Cache-Control', 'no-store');
                return res.end(resposta);
            } catch (err) {
                log('warn', `visor local (webrtc): ${err.message}`);
                res.statusCode = 503;
                return res.end();
            }
        }

        // Caixas da IA direto do motor deste PC (pela VPS cada consulta fazia uma ida e volta pela internet)
        const md = url.pathname.match(/^\/camera\/([^/]+)\/deteccoes$/);
        if (req.method === 'GET' && md) {
            if (origemOk) cabecalhosCors(res, origem);
            if (!sessaoValida(url.searchParams.get('t'))) { res.statusCode = 401; return res.end(); }
            const cameraId = decodeURIComponent(md[1]);
            if (!video.conhece(cameraId) || !fetchIa) { res.statusCode = 404; return res.end(); }
            const qualidade = url.searchParams.get('qualidade') === 'mini' ? 'mini' : 'foco';
            res.setHeader('Content-Type', 'application/json');
            res.setHeader('Cache-Control', 'no-store');
            try {
                const q = new URLSearchParams({ camera_id: cameraId, qualidade, quadro: 'false' });
                const r = await fetchIa(`/api/track/live?${q}`, { signal: AbortSignal.timeout(3000) });
                if (!r.ok) return res.end(JSON.stringify({ success: false, motor: r.status !== 404, results: [] }));
                const j = await r.json();
                return res.end(JSON.stringify({ success: true, motor: true, results: (j.results || []).map(caixaParaPainel) }));
            } catch {
                return res.end(JSON.stringify({ success: false, motor: false, results: [] }));
            }
        }

        // Central de Monitoramento local (página própria, mesma origem do vídeo)
        try {
            if (await central.tratar(req, res, url)) return;
        } catch (err) {
            log('warn', `central: ${err.message}`);
            if (!res.headersSent) { res.statusCode = 500; return res.end(); }
            return;
        }

        const m = url.pathname.match(/^\/camera\/([^/]+)\/mp4$/);
        if (req.method === 'GET' && m) {
            if (!sessaoValida(url.searchParams.get('t'))) { res.statusCode = 401; return res.end(); }
            const cameraId = decodeURIComponent(m[1]);
            if (!video.conhece(cameraId)) { res.statusCode = 404; return res.end(); }
            const qualidade = url.searchParams.get('qualidade') === 'foco' ? 'foco' : 'mini';
            const ctrl = new AbortController();
            req.on('close', () => ctrl.abort());
            try {
                const r = await video.abrirMp4(cameraId, qualidade, '', ctrl.signal);
                res.statusCode = 200;
                res.setHeader('Content-Type', r.headers.get('content-type') || 'video/mp4');
                res.setHeader('Cache-Control', 'no-store');
                const leitor = r.body.getReader();
                while (!ctrl.signal.aborted) {
                    const { done, value } = await leitor.read();
                    if (done) break;
                    if (!res.write(Buffer.from(value))) await new Promise(ok => res.once('drain', ok));
                }
                res.end();
            } catch (err) {
                if (!res.headersSent) res.statusCode = 503;
                res.end();
            }
            return;
        }

        res.statusCode = 404;
        res.end();
    });

    server.on('error', (err) => log('warn', `visor local: ${err.message}`));
    const host = naRede ? '0.0.0.0' : '127.0.0.1';
    server.listen(PORTA, host, () => log('info', `Central de Monitoramento: http://localhost:${PORTA}/central/ (vídeo direto, sem passar pela VPS${naRede ? '; aberta para a rede local' : ''})`));
    return server;
}

module.exports = { iniciar, PORTA, ORIGENS, caixaParaPainel };
