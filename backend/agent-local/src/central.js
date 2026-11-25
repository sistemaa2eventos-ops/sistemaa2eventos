'use strict';

/**
 * Central de Monitoramento local: painel de vigilância servido pelo próprio PC do evento.
 *
 * Por que existe: o painel da internet (https://painel...) só alcança o vídeo deste PC se o navegador
 * der a permissão de "rede local", e sem ela o vídeo dava a volta pela VPS (segundos de atraso e
 * imagem travando). A Central abre em http://localhost:8766/central/ — mesma origem do vídeo, sem
 * permissão de navegador, sem internet no meio:
 *  - vídeo ao vivo por WebRTC direto do retransmissor (go2rtc), ~30 ms de buffer;
 *  - caixas da IA de todas as câmeras numa consulta só ao motor deste PC;
 *  - alertas da watchlist marcados aqui mesmo (lista de alvos vem da VPS a cada minuto e fica em disco).
 *
 * Acesso: chave em backend/agent-local/.central-chave (criada no 1º uso; o atalho abrir-central.bat a
 * usa). A chave vira um cookie de sessão HttpOnly/SameSite=Strict de 12 h. Escutando só em 127.0.0.1,
 * o cabeçalho Host também é conferido (protege contra "DNS rebinding").
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const video = require('./video');
const onvif = require('./onvif');
const ptz = require('./ptz');

const DIR_ESTATICO = path.join(__dirname, '..', 'central');
const ARQ_CHAVE = process.env.CENTRAL_CHAVE_ARQ || path.join(__dirname, '..', '.central-chave');
const ARQ_ALVOS = process.env.CENTRAL_ALVOS_ARQ || path.join(__dirname, '..', '.central-alvos.json');
const SESSAO_MS = 12 * 60 * 60 * 1000;
const COOKIE = 'nzt_central';
// Controle das câmeras (giro e fala): uma tela por vez. Quem assume é o único que mexe; libera sozinho
// depois deste tempo sem atividade, para o controle não ficar preso se a tela fechar sem liberar.
const CONTROLE_OCIOSO_MS = 10 * 60 * 1000;
const TIPOS = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml' };

const estado = {
    log: () => {},
    fetchIa: null,
    porta: 8766,
    soLocal: true,
    tailscale: false,         // também atende pela interface do Tailscale (operador remoto na mesma rede virtual)
    hostsExtras: new Set(),   // "100.x.y.z:8766", "nome-do-pc:8766"
    cameras: [],              // [{ id, nome, ia }]
    alvos: new Map(),         // pessoa_id → { motivo, nivel }
    alvosEm: 0,
    sessoes: new Map(),       // token → expira
    tentativas: [],           // instantes de logins errados (limite por minuto)
    lote: null                // motor sem /api/track/lote: false (usa 1 consulta por câmera)
};

// ------------------------------------------------------------------ chave e sessões
function chaveDeAcesso() {
    try {
        const c = fs.readFileSync(ARQ_CHAVE, 'utf8').trim();
        if (c.length >= 32) return c;
    } catch { /* cria abaixo */ }
    const nova = crypto.randomBytes(24).toString('hex');
    fs.writeFileSync(ARQ_CHAVE, nova, { mode: 0o600 });
    return nova;
}

/** Troca a chave (painel: "Gerar nova chave"): quem entrou com a antiga sai na hora */
function gerarNovaChave() {
    const nova = crypto.randomBytes(24).toString('hex');
    fs.writeFileSync(ARQ_CHAVE, nova, { mode: 0o600 });
    estado.sessoes.clear();
    controle.token = null;
    return nova;
}

function iguais(a, b) {
    const x = Buffer.from(String(a));
    const y = Buffer.from(String(b));
    return x.length === y.length && crypto.timingSafeEqual(x, y);
}

function lerCookie(req) {
    const m = String(req.headers.cookie || '').match(new RegExp(`(?:^|;\\s*)${COOKIE}=([a-f0-9]{48})`));
    return m ? m[1] : null;
}

function sessaoOk(req) {
    const t = lerCookie(req);
    const ate = t && estado.sessoes.get(t);
    if (!ate) return false;
    if (Date.now() > ate) { estado.sessoes.delete(t); return false; }
    return true;
}

function novaSessao(res) {
    const agora = Date.now();
    for (const [t, ate] of estado.sessoes) if (ate < agora) estado.sessoes.delete(t);
    const token = crypto.randomBytes(24).toString('hex');
    estado.sessoes.set(token, agora + SESSAO_MS);
    res.setHeader('Set-Cookie', `${COOKIE}=${token}; HttpOnly; SameSite=Strict; Path=/central; Max-Age=${SESSAO_MS / 1000}`);
}

function bloqueadoPorTentativas() {
    const agora = Date.now();
    estado.tentativas = estado.tentativas.filter(t => agora - t < 60000);
    return estado.tentativas.length >= 10;
}

// ------------------------------------------------------------------ dados vindos do agente
/** Câmeras do evento (mesma lista que vai ao retransmissor) */
// Câmeras com giro (ONVIF): IP e porta vêm do painel; usuário e senha, da própria URL da câmera
const camerasComGiro = new Map();

/** Usuário e senha que já estão na URL RTSP da câmera (a mesma conta serve ao giro) */
function credenciaisDoStream(url) {
    try {
        const u = new URL(String(url));
        return { usuario: decodeURIComponent(u.username || ''), senha: decodeURIComponent(u.password || '') };
    } catch {
        return { usuario: '', senha: '' };
    }
}

function configurarCameras(cameras = []) {
    estado.cameras = cameras.filter(c => c && c.id).map(c => ({
        id: String(c.id),
        nome: String(c.nome || 'Câmera').slice(0, 80),
        ia: c.ia_ativa !== false
    }));
    camerasComGiro.clear();
    for (const c of cameras) {
        if (!c || !c.id || !c.ptz || !c.ptz.ip) continue;
        camerasComGiro.set(String(c.id), {
            id: String(c.id),
            ip_address: String(c.ptz.ip),
            ptz_porta: Number(c.ptz.porta) || 2020,
            ...credenciaisDoStream(c.stream_url)
        });
    }
}

/** Envio das mensagens ONVIF à câmera (a resposta de erro da câmera também vem como texto) */
async function enviarOnvif(url, xml) {
    const r = await fetch(url, { method: 'POST', headers: { 'Content-Type': onvif.CONTENT_TYPE }, body: xml, signal: AbortSignal.timeout(6000) });
    return r.text();
}

/** Giro da câmera pela Central: mover, parar, listar, ir e gravar posições */
/** Controle das câmeras: guarda o token da sessão que tem o controle (nunca sai deste processo) */
const controle = { token: null, visto: 0 };

/** Token de quem tem o controle agora, ou null (libera sozinho se ficou ocioso) */
function controleAtivo() {
    if (controle.token && Date.now() - controle.visto > CONTROLE_OCIOSO_MS) controle.token = null;
    return controle.token;
}

function temControle(req) {
    const t = lerCookie(req);
    return !!t && controleAtivo() === t;
}

/** O que a tela precisa saber: se é ela quem tem o controle, e se há alguém com ele */
function estadoDoControle(req) {
    const ativo = controleAtivo();
    return { meu: !!ativo && ativo === lerCookie(req), ocupado: !!ativo };
}

/** Fecha a sessão de quem tinha o controle: o controle volta a ficar livre */
function liberarDaSessao(token) {
    if (token && controle.token === token) controle.token = null;
}

async function tratarPtz(req, res, camId, listar) {
    const cam = camerasComGiro.get(camId);
    if (!cam) { json(res, 409, { erro: 'Esta câmera não tem giro ligado no painel.' }); return; }
    let pedido = { acao: 'listar' };
    if (!listar && !temControle(req)) {
        json(res, 403, { erro: 'Só quem tem o controle mexe na câmera. Assuma o controle primeiro.', sem_controle: true });
        return;
    }
    if (!listar) {
        let corpo;
        try { corpo = JSON.parse(await lerCorpo(req, 4096)) || {}; } catch { json(res, 400, { erro: 'pedido inválido' }); return; }
        const num = (v) => { const n = Number(v); return Number.isFinite(n) ? Math.max(-1, Math.min(1, n)) : 0; };
        pedido = corpo.acao === 'mover' ? { acao: 'mover', pan: num(corpo.pan), tilt: num(corpo.tilt), zoom: num(corpo.zoom) }
            : corpo.acao === 'gravar' ? { acao: 'gravar', nome: String(corpo.nome || '').slice(0, 40) }
            : corpo.acao === 'ir' ? { acao: 'ir', token: String(corpo.token || '').slice(0, 40) }
            : { acao: corpo.acao };
    }
    try {
        const r = await ptz.executar(cam, enviarOnvif, pedido);
        json(res, 200, { ok: true, ...r });
    } catch (err) {
        json(res, err.status || 502, { erro: err.status ? err.message : `Sem resposta da câmera: ${err.message}` });
    }
}

/** Alvos da watchlist entre as pessoas que este PC reconhece (vem da VPS; guardado para funcionar sem internet) */
function definirAlvos(alvos = []) {
    estado.alvos = new Map(alvos.filter(a => a && a.pessoa_id).map(a => [String(a.pessoa_id), {
        motivo: a.motivo ? String(a.motivo).slice(0, 200) : null,
        nivel: a.nivel ? String(a.nivel).slice(0, 20) : 'alto'
    }]));
    estado.alvosEm = Date.now();
    try {
        fs.writeFileSync(ARQ_ALVOS, JSON.stringify({ em: estado.alvosEm, alvos: [...estado.alvos].map(([id, v]) => ({ pessoa_id: id, ...v })) }), { mode: 0o600 });
    } catch { /* só cache */ }
}

function carregarAlvosSalvos() {
    try {
        const j = JSON.parse(fs.readFileSync(ARQ_ALVOS, 'utf8'));
        definirAlvos(j.alvos || []);
        estado.alvosEm = j.em || 0;
    } catch { /* sem cache ainda */ }
}

// ------------------------------------------------------------------ formato para a tela
function pessoaParaTela(mp) {
    if (!mp) return null;
    const alvo = estado.alvos.get(String(mp.id)) || null;
    return {
        id: mp.id,
        nome: mp.nome,
        semelhanca: mp.similarity,
        bloqueado: !!(mp.bloqueado || mp.status_acesso === 'bloqueado'),
        watchlist: alvo,
        // Rosto grande e semelhança alta (decidido pelo motor): só assim toca alarme. Motor antigo: vale.
        alerta_ok: mp.alerta_ok !== false
    };
}

const caixaParaTela = (f) => ({ id: f.track_id, caixa: f.bbox_n, qualidade: f.quality_status, pessoa: pessoaParaTela(f.matched_person) });

// ------------------------------------------------------------------ HTTP
function json(res, status, corpo) {
    res.statusCode = status;
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Cache-Control', 'no-store');
    res.end(JSON.stringify(corpo));
}

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

function hostPermitido(req) {
    if (!estado.soLocal) return true;
    const h = String(req.headers.host || '').toLowerCase();
    if (h === `127.0.0.1:${estado.porta}` || h === `localhost:${estado.porta}`) return true;
    // Acesso pelo Tailscale (CENTRAL_TAILSCALE=1): o IP 100.x deste PC, o nome da máquina ou o nome MagicDNS (*.ts.net)
    if (estado.hostsExtras.has(h)) return true;
    return estado.tailscale && new RegExp(`^[a-z0-9-]+(\\.[a-z0-9-]+)*\\.ts\\.net:${estado.porta}$`).test(h);
}

function cabecalhosSeguranca(res) {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('Content-Security-Policy',
        "default-src 'self'; img-src 'self' data: blob:; media-src 'self' blob:; connect-src 'self'; style-src 'self' 'unsafe-inline'; script-src 'self'; frame-ancestors 'none'");
}

function servirArquivo(res, nome) {
    const arq = path.join(DIR_ESTATICO, nome);
    if (!arq.startsWith(DIR_ESTATICO + path.sep)) { res.statusCode = 404; return res.end(); }
    fs.readFile(arq, (err, dados) => {
        if (err) { res.statusCode = 404; return res.end(); }
        res.setHeader('Content-Type', TIPOS[path.extname(arq)] || 'application/octet-stream');
        res.setHeader('Cache-Control', 'no-cache');
        res.end(dados);
    });
}

const PAGINA_ENTRADA = (erro) => `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><title>Central de Monitoramento</title>
<link rel="stylesheet" href="/central/central.css"></head><body class="entrada">
<form method="post" action="/central/entrar" class="cartao-entrada">
<h1>Central de Monitoramento</h1><p>Use o atalho <b>abrir-central.bat</b> deste PC ou cole a chave de acesso.</p>
${erro ? `<p class="erro">${erro}</p>` : ''}
<input name="chave" type="password" autocomplete="off" placeholder="Chave de acesso" autofocus>
<button type="submit">Entrar</button></form></body></html>`;

async function consultarMotor(caminho, opcoes = {}) {
    if (!estado.fetchIa) throw new Error('motor indisponível');
    return estado.fetchIa(caminho, { ...opcoes, signal: AbortSignal.timeout(opcoes.timeout || 3000) });
}

/** Caixas de várias câmeras: 1 consulta ao motor (ou 1 por câmera em motor antigo) */
async function caixasDoMotor(foco, mini) {
    if (estado.lote !== false) {
        const r = await consultarMotor('/api/track/lote', {
            method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ foco, mini })
        });
        if (r.status !== 404) {
            if (!r.ok) throw new Error(`motor ${r.status}`);
            estado.lote = true;
            return (await r.json()).cameras || {};
        }
        estado.lote = false;
    }
    const saida = {};
    await Promise.all([...foco.map(id => [id, 'foco']), ...mini.map(id => [id, 'mini'])].map(async ([id, q]) => {
        const p = new URLSearchParams({ camera_id: id, qualidade: q, quadro: 'false' });
        const r = await consultarMotor(`/api/track/live?${p}`).catch(() => null);
        if (r && r.ok) saida[id] = await r.json();
    }));
    return saida;
}

const idsValidos = (txt) => String(txt || '').split(',').filter(id => /^[A-Za-z0-9-]{1,64}$/.test(id)).slice(0, 64);

/**
 * Trata pedidos em /central. Devolve true se tratou.
 * @param {import('http').IncomingMessage} req
 */
async function tratar(req, res, url) {
    if (!url.pathname.startsWith('/central')) return false;
    if (!hostPermitido(req)) { res.statusCode = 421; res.end(); return true; }
    cabecalhosSeguranca(res);
    const p = url.pathname;

    // ---------------- entrada
    if (p === '/central/entrar') {
        let chave = url.searchParams.get('chave');
        if (req.method === 'POST') {
            const corpo = await lerCorpo(req, 2048).catch(() => '');
            chave = new URLSearchParams(corpo).get('chave');
        }
        if (bloqueadoPorTentativas()) {
            res.statusCode = 429;
            res.setHeader('Content-Type', 'text/html; charset=utf-8');
            res.end(PAGINA_ENTRADA('Muitas tentativas. Aguarde 1 minuto.'));
            return true;
        }
        if (chave && iguais(chave.trim(), chaveDeAcesso())) {
            novaSessao(res);
            res.statusCode = 303;
            res.setHeader('Location', '/central/'); // tira a chave da barra de endereço
            res.end();
            return true;
        }
        if (chave) estado.tentativas.push(Date.now());
        res.statusCode = chave ? 401 : 200;
        res.setHeader('Content-Type', 'text/html; charset=utf-8');
        res.end(PAGINA_ENTRADA(chave ? 'Chave incorreta.' : ''));
        return true;
    }
    if (p === '/central/central.css') { servirArquivo(res, 'central.css'); return true; }

    if (!sessaoOk(req)) {
        if (p.startsWith('/central/api/')) { json(res, 401, { erro: 'sessão expirada' }); return true; }
        res.statusCode = 303;
        res.setHeader('Location', '/central/entrar');
        res.end();
        return true;
    }

    // Qualquer pedido de quem tem o controle conta como atividade (o controle não cai enquanto ela usa a tela)
    const tokenDaSessao = lerCookie(req);
    if (controle.token && controle.token === tokenDaSessao) controle.visto = Date.now();

    // ---------------- página
    if (p === '/central' || p === '/central/') { servirArquivo(res, 'index.html'); return true; }
    if (p === '/central/central.js') { servirArquivo(res, 'central.js'); return true; }
    if (p === '/central/sair' && req.method === 'POST') {
        const t = lerCookie(req);
        if (t) estado.sessoes.delete(t);
        liberarDaSessao(t);
        res.setHeader('Set-Cookie', `${COOKIE}=; HttpOnly; SameSite=Strict; Path=/central; Max-Age=0`);
        json(res, 200, { ok: true });
        return true;
    }

    // ---------------- API
    const mpz = p.match(/^\/central\/api\/camera\/([A-Za-z0-9-]{1,64})\/ptz(\/posicoes)?$/);
    if (mpz && (req.method === 'POST' || req.method === 'GET')) {
        await tratarPtz(req, res, mpz[1], !!mpz[2]);
        return true;
    }

    // Diagnóstico do áudio: quais faixas o retransmissor tem para a câmera (entrada e envio de voz)
    const mmd = p.match(/^\/central\/api\/camera\/([A-Za-z0-9-]{1,64})\/midias$/);
    if (mmd && req.method === 'GET') {
        json(res, 200, await video.midiasDaCamera(mmd[1]));
        return true;
    }

    // Senha da conta do app (Mercusys/Tapo) para falar com a câmera. Só quem tem o controle grava.
    // A senha fica só neste PC (video.definirSenhaTapo) e nunca volta para a tela.
    const mct = p.match(/^\/central\/api\/camera\/([A-Za-z0-9-]{1,64})\/conta-tapo$/);
    if (mct && req.method === 'POST') {
        if (!temControle(req)) { json(res, 403, { erro: 'Assuma o controle para configurar a fala.', sem_controle: true }); return true; }
        let corpo;
        try { corpo = JSON.parse(await lerCorpo(req, 1024)) || {}; } catch { json(res, 400, { erro: 'pedido inválido' }); return true; }
        const senha = typeof corpo.senha === 'string' ? corpo.senha : '';
        if (senha.length > 128) { json(res, 400, { erro: 'Senha longa demais.' }); return true; }
        try {
            await video.definirSenhaTapo(mct[1], senha);
            json(res, 200, { ok: true });
        } catch (err) {
            json(res, err.status || 500, { erro: err.message });
        }
        return true;
    }

    // Assumir ou liberar o controle das câmeras (giro e fala). Uma tela por vez.
    if (p === '/central/api/controle' && req.method === 'POST') {
        let corpo;
        try { corpo = JSON.parse(await lerCorpo(req, 256)) || {}; } catch { json(res, 400, { erro: 'pedido inválido' }); return true; }
        const meu = tokenDaSessao;
        if (corpo.acao === 'assumir') {
            const ativo = controleAtivo();
            if (ativo && ativo !== meu) { json(res, 409, { erro: 'Outra tela já está com o controle. Ela precisa liberar primeiro.', ...estadoDoControle(req) }); return true; }
            controle.token = meu;
            controle.visto = Date.now();
        } else if (corpo.acao === 'liberar') {
            if (controleAtivo() !== meu) { json(res, 403, { erro: 'Só quem tem o controle pode liberá-lo.', ...estadoDoControle(req) }); return true; }
            controle.token = null;
        } else {
            json(res, 400, { erro: 'ação inválida' });
            return true;
        }
        json(res, 200, estadoDoControle(req));
        return true;
    }

    if (p === '/central/api/estado' && req.method === 'GET') {
        json(res, 200, {
            cameras: estado.cameras.filter(c => video.conhece(c.id)).map(c => ({ ...c, ptz: camerasComGiro.has(c.id) })),
            retransmissor: video.status(),
            watchlist: { alvos: estado.alvos.size, atualizada_em: estado.alvosEm || null },
            controle: estadoDoControle(req)
        });
        return true;
    }

    const mw = p.match(/^\/central\/api\/camera\/([A-Za-z0-9-]{1,64})\/webrtc$/);
    if (mw && req.method === 'POST') {
        if (!video.conhece(mw[1])) { json(res, 404, { erro: 'câmera desconhecida' }); return true; }
        const qualidade = url.searchParams.get('qualidade') === 'foco' ? 'foco' : 'mini';
        // Falar (voz de volta) só com o controle
        if (url.searchParams.get('fala') === '1' && !temControle(req)) {
            json(res, 403, { erro: 'Só quem tem o controle pode falar com a câmera.', sem_controle: true });
            return true;
        }
        try {
            const oferta = await lerCorpo(req, 64 * 1024);
            if (!oferta.startsWith('v=0')) { res.statusCode = 400; res.end(); return true; }
            const resposta = await video.abrirWebrtc(mw[1], qualidade, oferta, { fala: url.searchParams.get('fala') === '1' });
            res.statusCode = 201;
            res.setHeader('Content-Type', 'application/sdp');
            res.setHeader('Cache-Control', 'no-store');
            res.end(resposta);
        } catch (err) {
            estado.log('warn', `central (webrtc): ${err.message}`);
            // Câmera recusou o login (caso da fala pelo protocolo Tapo): a tela precisa saber que foi isso
            if (/\b401\b|Unauthorized/i.test(err.message)) {
                json(res, 502, { erro: 'A câmera recusou o login (401).', motivo: 'login_recusado' });
                return true;
            }
            res.statusCode = 503;
            res.end();
        }
        return true;
    }

    if (p === '/central/api/caixas' && req.method === 'GET') {
        const foco = idsValidos(url.searchParams.get('foco'));
        const mini = idsValidos(url.searchParams.get('mini')).filter(id => !foco.includes(id));
        try {
            const dados = await caixasDoMotor(foco, mini);
            const cameras = {};
            for (const [id, d] of Object.entries(dados)) {
                cameras[id] = { conectada: d.conectada !== false, ia_ms: d.ia_ms, caixas: (d.results || []).map(caixaParaTela) };
            }
            json(res, 200, { motor: true, cameras });
        } catch {
            json(res, 200, { motor: false, cameras: {} });
        }
        return true;
    }

    if (p === '/central/api/reconhecimentos' && req.method === 'GET') {
        const desde = Math.max(0, parseInt(url.searchParams.get('desde'), 10) || 0);
        try {
            const r = await consultarMotor(`/api/vigilancia/deteccoes?desde=${desde}&max_idade_s=120`);
            const j = await r.json();
            const nomes = new Map(estado.cameras.map(c => [c.id, c.nome]));
            const itens = (j.deteccoes || []).map(d => {
                const pessoas = (d.results || []).map(f => ({ ...pessoaParaTela(f.matched_person), rosto: f.face_crop_base64 || null }));
                const alerta = pessoas.some(x => (x.watchlist || x.bloqueado) && x.alerta_ok);
                return {
                    seq: d.seq, ts: d.ts, camera_id: d.camera_id, camera: nomes.get(d.camera_id) || 'Câmera',
                    pessoas, alerta,
                    // A cena inteira só nos alertas (é o que o operador precisa para achar o alvo)
                    quadro: alerta ? d.annotated_frame_base64 || null : null
                };
            });
            json(res, 200, { motor: true, seq: j.seq, inicio: j.inicio, itens });
        } catch {
            json(res, 200, { motor: false, itens: [] });
        }
        return true;
    }

    if (p === '/central/api/saude' && req.method === 'GET') {
        try {
            const r = await consultarMotor('/api/engine/status');
            const j = await r.json();
            json(res, 200, {
                motor: true,
                gpu: j.hardware_acceleration || null,
                perfil: j.config?.perfil || null,
                ocupacao: j.ia?.ocupacao ?? null,
                cameras: (j.cameras || []).map(c => ({
                    camera_id: c.camera_id, fps: c.video_fps, conectada: c.conectada,
                    resolucao: c.resolucao?.principal || null, ia_ms: c.ia_ms, reconexoes: c.reconexoes
                }))
            });
        } catch {
            json(res, 200, { motor: false, cameras: [] });
        }
        return true;
    }

    json(res, 404, { erro: 'não encontrado' });
    return true;
}

function iniciar({ log, fetchIa, porta, soLocal, tailscale = null }) {
    if (log) estado.log = log;
    estado.fetchIa = fetchIa || null;
    estado.porta = porta;
    definirAcesso({ porta, soLocal, tailscale });
    chaveDeAcesso();
    carregarAlvosSalvos();
}

/** Quem pode abrir a Central (trocado pelo painel sem reiniciar o agente) */
function definirAcesso({ porta = estado.porta, soLocal, tailscale = null }) {
    estado.porta = porta;
    estado.soLocal = soLocal !== false;
    estado.tailscale = !!tailscale;
    estado.hostsExtras = new Set(tailscale ? [`${tailscale.ip}:${porta}`, `${tailscale.nome}:${porta}`] : []);
}

module.exports = { iniciar, definirAcesso, _credenciaisDoStream: credenciaisDoStream, _camerasComGiro: camerasComGiro, gerarNovaChave, tratar, configurarCameras, definirAlvos, chaveDeAcesso, ARQ_CHAVE, _estado: estado, _caixaParaTela: caixaParaTela };
