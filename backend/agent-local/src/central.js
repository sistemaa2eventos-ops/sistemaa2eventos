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
 * Acesso: login e senha do operador (cadastrado no painel, Monitor > Operadores da Central). A lista de
 * operadores vem da VPS com o hash da senha e fica em disco: o login funciona sem internet. Enquanto o
 * evento não tem nenhum operador, vale a chave de backend/agent-local/.central-chave (instalação).
 * A entrada vira um cookie de sessão HttpOnly/SameSite=Strict de 12 h. Escutando só em 127.0.0.1,
 * o cabeçalho Host também é conferido (protege contra "DNS rebinding").
 *
 * Registro (LGPD/LAI): entrar, sair, assistir, ouvir, falar, girar e o controle ficam numa fila em disco
 * com o nome do operador e o horário; o agente envia à VPS e apaga só o que ela confirmou.
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
const ARQ_OPERADORES = process.env.CENTRAL_OPERADORES_ARQ || path.join(__dirname, '..', '.central-operadores.json');
const ARQ_AUDITORIA = process.env.CENTRAL_AUDITORIA_ARQ || path.join(__dirname, '..', '.central-auditoria.json');
const AUDITORIA_MAX = 5000;   // fila no PC sem internet; passando disso, os mais antigos saem
// Ações que se repetem muito viram um registro só por janela (girar segurando a seta, reconexão do vídeo)
const AGRUPAR_MS = { girar: 5000, assistir: 10 * 60 * 1000, ouvir: 10 * 60 * 1000 };
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
    sessoes: new Map(),       // token → { ate, operador: { id, nome, login } | null (entrou pela chave) }
    tentativas: [],           // instantes de logins errados (limite por minuto)
    operadores: new Map(),    // login → { id, nome, login, senha_hash } (só ativos, vindos da VPS)
    auditoria: [],            // registros ainda não confirmados pela VPS
    agrupados: new Map(),     // `${token}:${acao}:${camera}` → último registro (ver AGRUPAR_MS)
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
    controle.nome = null;
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
    const s = t && estado.sessoes.get(t);
    if (!s) return false;
    if (Date.now() > s.ate) { estado.sessoes.delete(t); return false; }
    return true;
}

/** Operador da sessão do pedido ({ id, nome, login }), ou null se entrou pela chave */
function operadorDe(req) {
    const t = lerCookie(req);
    return (t && estado.sessoes.get(t)?.operador) || null;
}

function novaSessao(res, operador = null) {
    const agora = Date.now();
    for (const [t, s] of estado.sessoes) if (s.ate < agora) estado.sessoes.delete(t);
    const token = crypto.randomBytes(24).toString('hex');
    estado.sessoes.set(token, { ate: agora + SESSAO_MS, operador });
    res.setHeader('Set-Cookie', `${COOKIE}=${token}; HttpOnly; SameSite=Strict; Path=/central; Max-Age=${SESSAO_MS / 1000}`);
    return token;
}

// ------------------------------------------------------------------ operadores (login e senha)
/** Mesmo formato do painel (scrypt$salt$hash); a senha é aparada antes, como no cadastro */
function verificarSenha(senha, hash) {
    const partes = String(hash || '').split('$');
    if (partes.length !== 3 || partes[0] !== 'scrypt' || !partes[1] || !partes[2]) return false;
    try {
        const calculado = crypto.scryptSync(String(senha || '').trim(), partes[1], 64);
        const esperado = Buffer.from(partes[2], 'hex');
        return calculado.length === esperado.length && crypto.timingSafeEqual(calculado, esperado);
    } catch { return false; }
}

/** Operadores ativos do evento (vêm da VPS). A lista fica em disco: o login funciona sem internet. */
function definirOperadores(lista = [], { salvar = true } = {}) {
    const validos = (Array.isArray(lista) ? lista : []).filter(o => o && o.id && o.login && o.nome && String(o.senha_hash || '').startsWith('scrypt$'));
    estado.operadores = new Map(validos.map(o => [String(o.login).toLowerCase(), {
        id: String(o.id), nome: String(o.nome).slice(0, 80), login: String(o.login).toLowerCase(), senha_hash: String(o.senha_hash)
    }]));
    // Operador desativado ou excluído no painel sai na hora
    for (const [t, s] of estado.sessoes) {
        if (s.operador && !estado.operadores.has(s.operador.login)) { estado.sessoes.delete(t); liberarDaSessao(t); }
    }
    if (salvar) {
        try { fs.writeFileSync(ARQ_OPERADORES, JSON.stringify([...estado.operadores.values()]), { mode: 0o600 }); } catch { /* segue em memória */ }
    }
}

function carregarOperadoresSalvos() {
    try { definirOperadores(JSON.parse(fs.readFileSync(ARQ_OPERADORES, 'utf8')), { salvar: false }); } catch { /* sem lista ainda */ }
}

/** Login e senha do operador; null se não confere. Tempo parecido com ou sem login (não revela quem existe). */
function autenticar(login, senha) {
    const op = estado.operadores.get(String(login || '').trim().toLowerCase());
    const ok = verificarSenha(senha, op ? op.senha_hash : 'scrypt$00$00');
    return ok && op ? { id: op.id, nome: op.nome, login: op.login } : null;
}

// ------------------------------------------------------------------ registro de atividades
function salvarAuditoria() {
    try { fs.writeFileSync(ARQ_AUDITORIA, JSON.stringify(estado.auditoria), { mode: 0o600 }); } catch { /* segue em memória */ }
}

function carregarAuditoriaSalva() {
    try {
        const j = JSON.parse(fs.readFileSync(ARQ_AUDITORIA, 'utf8'));
        if (Array.isArray(j)) estado.auditoria = j.slice(-AUDITORIA_MAX);
    } catch { /* fila vazia */ }
}

/**
 * Registra quem fez o quê. `operador` null = entrou pela chave de instalação. Ações repetidas (girar,
 * assistir, ouvir) viram um registro só por janela, para a lista mostrar o que aconteceu e não ruído.
 */
function auditar({ operador, token = '', acao, cameraId = null, detalhe = {}, nomeTentado = null }) {
    const agora = Date.now();
    const janela = AGRUPAR_MS[acao];
    if (janela) {
        const chave = `${token}:${acao}:${cameraId || ''}`;
        if (agora - (estado.agrupados.get(chave) || 0) < janela) return;
        estado.agrupados.set(chave, agora);
        if (estado.agrupados.size > 2000) estado.agrupados.clear();
    }
    estado.auditoria.push({
        uid: crypto.randomBytes(12).toString('hex'),
        operador_id: operador ? operador.id : null,
        operador_nome: operador ? operador.nome : (nomeTentado ? `login tentado: ${String(nomeTentado).slice(0, 40)}` : 'chave de acesso (instalação)'),
        operador_login: operador ? operador.login : null,
        acao,
        camera_id: cameraId,
        detalhe,
        ocorrido_em: new Date(agora).toISOString()
    });
    if (estado.auditoria.length > AUDITORIA_MAX) estado.auditoria.splice(0, estado.auditoria.length - AUDITORIA_MAX);
    salvarAuditoria();
}

/** Registros para enviar à VPS (os mais antigos primeiro) */
function auditoriaPendente(max = 200) {
    return estado.auditoria.slice(0, max);
}

/** A VPS confirmou: estes saem da fila */
function confirmarAuditoria(uids = []) {
    const feitos = new Set(uids);
    const antes = estado.auditoria.length;
    estado.auditoria = estado.auditoria.filter(r => !feitos.has(r.uid));
    if (estado.auditoria.length !== antes) salvarAuditoria();
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
const controle = { token: null, visto: 0, nome: null };

/** Token de quem tem o controle agora, ou null (libera sozinho se ficou ocioso) */
function controleAtivo() {
    if (controle.token && Date.now() - controle.visto > CONTROLE_OCIOSO_MS) { controle.token = null; controle.nome = null; }
    return controle.token;
}

function temControle(req) {
    const t = lerCookie(req);
    return !!t && controleAtivo() === t;
}

/** O que a tela precisa saber: se é ela quem tem o controle, se há alguém com ele e quem é */
function estadoDoControle(req) {
    const ativo = controleAtivo();
    return { meu: !!ativo && ativo === lerCookie(req), ocupado: !!ativo, quem: ativo ? controle.nome : null };
}

/** Fecha a sessão de quem tinha o controle: o controle volta a ficar livre */
function liberarDaSessao(token) {
    if (token && controle.token === token) { controle.token = null; controle.nome = null; }
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
        const acaoRegistro = { mover: 'girar', ir: 'ir_posicao', gravar: 'gravar_posicao' }[pedido.acao];
        if (acaoRegistro) {
            const detalhe = pedido.acao === 'gravar' ? { posicao: pedido.nome } : pedido.acao === 'ir' ? { posicao: pedido.token } : {};
            auditar({ operador: operadorDe(req), token: lerCookie(req), acao: acaoRegistro, cameraId: camId, detalhe });
        }
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

/**
 * Página de entrada. Com operadores cadastrados: login e senha (cada acesso tem nome). Sem nenhum ainda
 * (instalação do evento): a chave de acesso deste PC, com o aviso de como cadastrar os operadores.
 * Os textos de erro são só os deste arquivo (nada que o usuário digitou volta para a página).
 */
const PAGINA_ENTRADA = (erro, { comChave = false } = {}) => `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><title>Central de Monitoramento</title>
<link rel="stylesheet" href="/central/central.css"></head><body class="entrada">
<form method="post" action="/central/entrar" class="cartao-entrada">
<h1>Central de Monitoramento</h1>
${comChave
        ? `<p>Nenhum operador cadastrado neste evento ainda. Entre com a chave de acesso deste PC e cadastre os operadores no painel, em <b>Monitor &gt; Operadores da Central</b>.</p>
${erro ? `<p class="erro">${erro}</p>` : ''}
<label for="chave">Chave de acesso</label>
<input id="chave" name="chave" type="password" autocomplete="off" autofocus>`
        : `<p>Entre com o seu login de operador. Cada acesso e cada ação nas câmeras ficam registrados com o seu nome.</p>
${erro ? `<p class="erro">${erro}</p>` : ''}
<label for="usuario">Login</label>
<input id="usuario" name="usuario" autocomplete="username" autocapitalize="none" spellcheck="false" maxlength="40" autofocus required>
<label for="senha">Senha</label>
<input id="senha" name="senha" type="password" autocomplete="current-password" maxlength="128" required>`}
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
        const semOperadores = estado.operadores.size === 0;
        let chave = url.searchParams.get('chave');
        let usuario = null;
        let senha = null;
        if (req.method === 'POST') {
            const corpo = new URLSearchParams(await lerCorpo(req, 2048).catch(() => ''));
            chave = corpo.get('chave');
            usuario = corpo.get('usuario');
            senha = corpo.get('senha');
        }
        const pagina = (status, erro) => {
            res.statusCode = status;
            res.setHeader('Content-Type', 'text/html; charset=utf-8');
            res.end(PAGINA_ENTRADA(erro, { comChave: semOperadores }));
            return true;
        };
        const entrar = (operador) => {
            const token = novaSessao(res, operador);
            auditar({ operador, token, acao: 'entrar' });
            res.statusCode = 303;
            res.setHeader('Location', '/central/'); // tira a chave da barra de endereço
            res.end();
            return true;
        };
        if (bloqueadoPorTentativas()) return pagina(429, 'Muitas tentativas. Aguarde 1 minuto.');

        if (usuario || senha) {
            const operador = autenticar(usuario, senha);
            if (operador) return entrar(operador);
            estado.tentativas.push(Date.now());
            auditar({ operador: null, acao: 'entrar_falhou', nomeTentado: usuario || '(vazio)' });
            return pagina(401, 'Login ou senha incorretos.');
        }
        if (chave) {
            // A chave só vale na instalação (nenhum operador ainda): depois, todo acesso tem nome.
            // O atalho que abre a Central com a chave na URL só mostra a tela de login (não é tentativa).
            if (!semOperadores) return pagina(req.method === 'POST' ? 401 : 200, req.method === 'POST' ? 'Entre com o seu login e senha de operador.' : '');
            if (iguais(chave.trim(), chaveDeAcesso())) return entrar(null);
            estado.tentativas.push(Date.now());
            return pagina(401, 'Chave incorreta.');
        }
        return pagina(200, '');
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
        auditar({ operador: operadorDe(req), token: t, acao: 'sair' });
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
            // Só o fato fica no registro; a senha nunca
            auditar({ operador: operadorDe(req), token: tokenDaSessao, acao: 'senha_app_camera', cameraId: mct[1], detalhe: { senha: senha ? 'definida' : 'apagada' } });
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
            const jaEra = ativo === meu;
            const operador = operadorDe(req);
            controle.token = meu;
            controle.visto = Date.now();
            controle.nome = operador ? operador.nome : 'Acesso pela chave';
            if (!jaEra) auditar({ operador, token: meu, acao: 'assumir_controle' });
        } else if (corpo.acao === 'liberar') {
            if (controleAtivo() !== meu) { json(res, 403, { erro: 'Só quem tem o controle pode liberá-lo.', ...estadoDoControle(req) }); return true; }
            controle.token = null;
            controle.nome = null;
            auditar({ operador: operadorDe(req), token: meu, acao: 'liberar_controle' });
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
            controle: estadoDoControle(req),
            operador: (() => { const o = operadorDe(req); return o ? { nome: o.nome, login: o.login } : null; })()
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
            const fala = url.searchParams.get('fala') === '1';
            const resposta = await video.abrirWebrtc(mw[1], qualidade, oferta, { fala });
            // Quem viu, ouviu ou falou com a câmera (assistir e ouvir agrupados: reconexões não viram ruído)
            const acao = fala ? 'falar' : /\bm=audio\b/.test(oferta) ? 'ouvir' : 'assistir';
            auditar({ operador: operadorDe(req), token: tokenDaSessao, acao, cameraId: mw[1], detalhe: acao === 'assistir' ? { qualidade } : {} });
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
    carregarOperadoresSalvos();
    carregarAuditoriaSalva();
}

/** Quem pode abrir a Central (trocado pelo painel sem reiniciar o agente) */
function definirAcesso({ porta = estado.porta, soLocal, tailscale = null }) {
    estado.porta = porta;
    estado.soLocal = soLocal !== false;
    estado.tailscale = !!tailscale;
    estado.hostsExtras = new Set(tailscale ? [`${tailscale.ip}:${porta}`, `${tailscale.nome}:${porta}`] : []);
}

module.exports = {
    iniciar, definirAcesso, _credenciaisDoStream: credenciaisDoStream, _camerasComGiro: camerasComGiro, gerarNovaChave, tratar,
    configurarCameras, definirAlvos, chaveDeAcesso, ARQ_CHAVE, _estado: estado, _caixaParaTela: caixaParaTela,
    definirOperadores, auditoriaPendente, confirmarAuditoria, _verificarSenha: verificarSenha
};
