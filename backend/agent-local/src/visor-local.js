'use strict';

/**
 * Visor local: o vídeo da central de operação vai direto do PC do evento para o navegador da rede local,
 * sem passar pela VPS. Só escuta em 127.0.0.1.
 *
 * Proteção: o painel pede uma sessão em GET /sessao. Esse pedido só é aceito de origens do próprio
 * sistema (CORS), e só essa origem consegue LER o token (outra página do navegador recebe erro de CORS).
 * Os vídeos exigem o token na URL (?t=...). A sessão vale 1 hora e é trocada a cada pedido de /sessao.
 */
const http = require('http');
const crypto = require('crypto');
const video = require('./video');

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

function iniciar(log) {
    const server = http.createServer(async (req, res) => {
        const url = new URL(req.url, 'http://127.0.0.1');
        const origem = req.headers.origin;
        const origemOk = !!origem && ORIGENS.has(origem);

        if (req.method === 'OPTIONS') {
            if (!origemOk) { res.statusCode = 403; return res.end(); }
            cabecalhosCors(res, origem);
            res.setHeader('Access-Control-Allow-Methods', 'GET');
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
    server.listen(PORTA, '127.0.0.1', () => log('info', `Visor local pronto em 127.0.0.1:${PORTA} (vídeo sem passar pela VPS)`));
    return server;
}

module.exports = { iniciar, PORTA, ORIGENS };
