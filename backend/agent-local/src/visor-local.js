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
const fs = require('fs');
const path = require('path');
const os = require('os');
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

// ------------------------------------------------------------------------------------------------
// Quem pode abrir a Central: 'local' (só este PC), 'rede' (outros computadores da rede do evento, com
// a chave) ou 'tailscale' (este PC + operador remoto pela rede virtual do Tailscale). Escolhido no painel
// (Agentes locais) e gravado neste PC, para valer também sem internet. Sem escolha no painel, vale o
// .env antigo (CENTRAL_REDE=1 / CENTRAL_TAILSCALE=1).
// ------------------------------------------------------------------------------------------------
const ACESSOS = ['local', 'rede', 'tailscale'];
const ARQ_ACESSO = process.env.CENTRAL_ACESSO_ARQ || path.join(__dirname, '..', '.central-acesso.json');
const sim = (v) => /^(1|true|sim)$/i.test(String(v || ''));
const vis = { log: () => {}, atender: null, servidor: null, servidorTs: null, acesso: 'local', origem: 'padrao', ts: null, vigiaTs: null };

function acessoInicial() {
    try {
        const salvo = JSON.parse(fs.readFileSync(ARQ_ACESSO, 'utf8'));
        if (ACESSOS.includes(salvo?.acesso)) return { acesso: salvo.acesso, origem: 'painel' };
    } catch { /* sem escolha no painel */ }
    if (sim(process.env.CENTRAL_REDE)) return { acesso: 'rede', origem: 'env' };
    if (sim(process.env.CENTRAL_TAILSCALE)) return { acesso: 'tailscale', origem: 'env' };
    return { acesso: 'local', origem: 'padrao' };
}

/** Fecha um servidor HTTP sem esperar conexões longas (vídeo) terminarem */
function fechar(srv) {
    if (!srv) return Promise.resolve();
    return new Promise((ok) => {
        srv.close(() => ok());
        try { srv.closeAllConnections?.(); } catch { /* Node antigo */ }
        setTimeout(ok, 1500);
    });
}

function escutar(srv, host, aoOuvir) {
    return new Promise((ok) => {
        srv.once('listening', () => { aoOuvir(); ok(true); });
        srv.once('error', (err) => { vis.log('warn', `visor local (${host}): ${err.message}`); ok(false); });
        srv.listen(PORTA, host);
    });
}

/** IPv4 da rede local deste PC (para mostrar no painel os endereços da Central) */
function ipsDaRede() {
    const ips = [];
    for (const lista of Object.values(os.networkInterfaces())) {
        for (const i of lista || []) {
            if ((i.family !== 'IPv4' && i.family !== 4) || i.internal) continue;
            const [a, b] = i.address.split('.').map(Number);
            if (a === 169 && b === 254) continue;          // sem DHCP
            if (a === 100 && b >= 64 && b <= 127) continue; // Tailscale (mostrado à parte)
            ips.push(i.address);
        }
    }
    return ips;
}

/** O que o painel mostra: modo atual, de onde veio e os endereços para abrir a Central */
function statusCentral() {
    const enderecos = [`http://localhost:${PORTA}/central/`];
    if (vis.acesso === 'rede') for (const ip of ipsDaRede()) enderecos.push(`http://${ip}:${PORTA}/central/`);
    if (vis.acesso === 'tailscale' && vis.ts) enderecos.push(`http://${vis.ts.ip}:${PORTA}/central/`, `http://${vis.ts.nome}:${PORTA}/central/`);
    return {
        acesso: vis.acesso,
        origem: vis.origem,
        tailscale_conectado: !!interfaceTailscale(),
        enderecos
    };
}

/**
 * Aplica o modo de acesso: reabre o servidor no endereço certo (127.0.0.1 ou 0.0.0.0) e liga/desliga o
 * servidor do Tailscale. @param salvar grava a escolha neste PC (vinda do painel)
 */
async function aplicarAcesso(acesso, { salvar = false } = {}) {
    if (!ACESSOS.includes(acesso)) throw new Error('Modo de acesso inválido');
    if (salvar) {
        try { fs.writeFileSync(ARQ_ACESSO, JSON.stringify({ acesso, em: new Date().toISOString() })); } catch (err) { vis.log('warn', `central: não gravou o modo de acesso (${err.message})`); }
        vis.origem = 'painel';
    }
    vis.acesso = acesso;
    const naRede = acesso === 'rede';
    vis.ts = acesso === 'tailscale' ? interfaceTailscale() : null;
    if (acesso === 'tailscale' && !vis.ts) vis.log('warn', 'Central pelo Tailscale: o Tailscale não está conectado neste PC (sem endereço 100.64.0.0/10); tento de novo a cada minuto');
    central.definirAcesso({ porta: PORTA, soLocal: !naRede, tailscale: vis.ts });

    await Promise.all([fechar(vis.servidor), fechar(vis.servidorTs)]);
    vis.servidor = null;
    vis.servidorTs = null;
    if (vis.atender) {
        const host = naRede ? '0.0.0.0' : '127.0.0.1';
        const srv = http.createServer(vis.atender);
        srv.on('error', (err) => vis.log('warn', `visor local: ${err.message}`));
        if (await escutar(srv, host, () => vis.log('info', `Central de Monitoramento: http://localhost:${PORTA}/central/ (vídeo direto, sem passar pela VPS${naRede ? '; aberta para a rede local' : ''})`))) vis.servidor = srv;
    }
    if (vis.ts) vis.servidorTs = await servidorTailscale(vis.ts, vis.log);

    // Tailscale escolhido mas desconectado: assume sozinho quando ele conectar
    clearInterval(vis.vigiaTs);
    vis.vigiaTs = null;
    if (acesso === 'tailscale' && !vis.ts) {
        vis.vigiaTs = setInterval(() => {
            if (vis.acesso === 'tailscale' && !vis.ts && interfaceTailscale()) aplicarAcesso('tailscale').catch(() => {});
        }, 60000);
        vis.vigiaTs.unref?.();
    }
    return statusCentral();
}

/**
 * @param {Function} log
 * @param {{ fetchIa?: Function }} opcoes  fetchIa: chamada ao motor de IA local (com a chave interna)
 */
function iniciar(log, opcoes = {}) {
    const { fetchIa } = opcoes;
    vis.log = log;
    const inicial = acessoInicial();
    vis.origem = inicial.origem;
    central.iniciar({ log, fetchIa, porta: PORTA, soLocal: inicial.acesso !== 'rede', tailscale: null });
    vis.atender = async (req, res) => {
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
    };

    return aplicarAcesso(inicial.acesso);
}

/** IPv4 do Tailscale neste PC (faixa CGNAT 100.64.0.0/10), ou null */
function interfaceTailscale() {
    for (const lista of Object.values(os.networkInterfaces())) {
        for (const i of lista || []) {
            if (i.family !== 'IPv4' && i.family !== 4) continue;
            const [a, b] = i.address.split('.').map(Number);
            if (a === 100 && b >= 64 && b <= 127) return { ip: i.address, nome: os.hostname().toLowerCase() };
        }
    }
    return null;
}

/**
 * Segundo servidor, só no IP do Tailscale e só com a Central (chave, sessão e Host conferidos). As rotas do
 * painel da internet (/sessao, /camera/...) continuam só em 127.0.0.1.
 */
function servidorTailscale(ts, log) {
    const srv = http.createServer(async (req, res) => {
        try {
            const url = new URL(req.url, 'http://127.0.0.1');
            if (await central.tratar(req, res, url)) return;
        } catch (err) {
            log('warn', `central (tailscale): ${err.message}`);
            if (!res.headersSent) { res.statusCode = 500; return res.end(); }
            return;
        }
        res.statusCode = 404;
        res.end();
    });
    srv.on('error', (err) => log('warn', `central (tailscale): ${err.message}`));
    return escutar(srv, ts.ip, () => log('info', `Central também pelo Tailscale: http://${ts.ip}:${PORTA}/central/ (ou http://${ts.nome}:${PORTA}/central/)`))
        .then(ok => (ok ? srv : null));
}

/** Fecha os servidores da Central (encerramento e testes) */
async function parar() {
    clearInterval(vis.vigiaTs);
    vis.vigiaTs = null;
    await Promise.all([fechar(vis.servidor), fechar(vis.servidorTs)]);
    vis.servidor = null;
    vis.servidorTs = null;
}

module.exports = { iniciar, aplicarAcesso, parar, statusCentral, PORTA, ORIGENS, caixaParaPainel, interfaceTailscale, ACESSOS };
