'use strict';

/**
 * Agente local A2 Eventos
 *
 * Roda num computador da rede do evento e mantém uma conexão de saída com o
 * servidor na nuvem. O servidor envia chamadas CGI para os leitores faciais
 * (cadastro de faces, configuração, relógio, abertura de porta, snapshot) e o
 * agente as executa na rede local, devolvendo a resposta.
 *
 * Câmeras: o vídeo vem do retransmissor local (go2rtc, ver video.js) e funciona com o motor de IA
 * desligado. O motor de IA facial (microservice-face-python) só recebe as câmeras com IA ligada e
 * lê o vídeo do retransmissor. Gravação no próprio PC (gravador.js).
 *
 * Variáveis (.env): VPS_URL, AGENT_TOKEN, AGENT_NAME, IA_URL (padrão http://127.0.0.1:8000),
 * GRAVACOES_DIR (padrão <pasta do usuário>\NZT-Gravacoes), IA_CHAVE_INTERNA (opcional)
 */
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { io } = require('socket.io-client');
const video = require('./video');
const gravador = require('./gravador');

const VPS_URL = (process.env.VPS_URL || '').replace(/\/+$/, '');
const AGENT_TOKEN = process.env.AGENT_TOKEN;
const AGENT_NAME = process.env.AGENT_NAME || 'Agente Local';
const IA_URL = (process.env.IA_URL || 'http://127.0.0.1:8000').replace(/\/+$/, '');
const VERSAO = '3.0.0';
const RAIZ_PROJETO = path.resolve(__dirname, '..', '..', '..');
// Motor de IA desligado pelo painel: o vigia (ligar-ia-facial.ps1) não o religa enquanto existir
const ARQ_MOTOR_DESLIGADO = path.join(__dirname, '..', '.motor-desligado');
const ARQ_CHAVE_IA = path.join(RAIZ_PROJETO, 'backend', 'microservice-face-python', '.chave-interna');
const ARQUIVO_ESTADO = path.join(__dirname, '..', '.estado.json');
// Detecções lidas do motor e ainda não entregues à nuvem (internet do evento caiu): ficam em
// disco e sobem quando a conexão voltar. Cada uma leva a foto anotada, por isso o limite.
const ARQUIVO_FILA = path.join(__dirname, '..', '.deteccoes-pendentes.json');
const FILA_MAX = 300;
const DETECCAO_MAX_IDADE_S = 60; // só na 1ª leitura após (re)iniciar: o motor guarda as últimas detecções
const QUADROS_EM_VOO = 2;        // quadros enviados sem confirmação: a taxa não depende mais da distância até a nuvem

const log = (nivel, msg) => console.log(`[${new Date().toISOString()}] ${nivel.toUpperCase()} ${msg}`);

if (!VPS_URL || !AGENT_TOKEN) {
    log('error', 'Defina VPS_URL e AGENT_TOKEN no arquivo .env (veja .env.example).');
    process.exit(1);
}

// Chave interna do motor de IA (o motor só atende quem a envia; ver main.py)
let chaveIa = null;
function cabecalhosIa(extras = {}) {
    if (!chaveIa) {
        chaveIa = (process.env.IA_CHAVE_INTERNA || '').trim() || null;
        if (!chaveIa) {
            try { chaveIa = fs.readFileSync(ARQ_CHAVE_IA, 'utf8').trim() || null; } catch { chaveIa = null; }
        }
    }
    return chaveIa ? { ...extras, 'X-IA-Chave': chaveIa } : { ...extras };
}
/** fetch ao motor com a chave; motor recriou a chave (401): relê o arquivo e tenta 1x de novo */
async function fetchIa(caminho, opcoes = {}) {
    const url = `${IA_URL}${caminho}`;
    let res = await fetch(url, { ...opcoes, headers: cabecalhosIa(opcoes.headers) });
    if (res.status === 401) {
        chaveIa = null;
        res = await fetch(url, { ...opcoes, headers: cabecalhosIa(opcoes.headers) });
    }
    return res;
}
const motorDesligadoPeloPainel = () => fs.existsSync(ARQ_MOTOR_DESLIGADO);

video.iniciar(log);
gravador.iniciar({
    logger: log,
    reportador: async (evento, dados) => {
        if (!socket.connected) throw new Error('sem conexão');
        const r = await socket.timeout(15000).emitWithAck(evento, dados);
        if (r && r.ok === false) throw new Error(r.erro || 'servidor recusou'); // tenta de novo depois
        return r;
    }
});

// Última lista de câmeras e chaves do evento recebida do painel: aplicada ao religar o PC, para o
// vídeo e a gravação voltarem mesmo sem internet. Leva senhas das câmeras: só para este usuário.
const ARQ_CONFIG_CAMERAS = path.join(__dirname, '..', '.config-cameras.json');
function salvarConfigCameras(payload) {
    try { fs.writeFileSync(ARQ_CONFIG_CAMERAS, JSON.stringify(payload), { mode: 0o600 }); } catch { /* ignora */ }
}
function lerConfigCameras() {
    try { return JSON.parse(fs.readFileSync(ARQ_CONFIG_CAMERAS, 'utf8')); } catch { return null; }
}

// Cliente Digest por leitor (reaproveita o nonce entre chamadas)
const clientes = new Map();
async function clienteDigest({ ip, port = 80, user = 'admin', password }) {
    // a senha entra na chave: trocada no painel, o agente não fica preso na antiga até reiniciar
    const chave = `${ip}:${port}:${user}:${password}`;
    if (!clientes.has(chave)) {
        const lib = await import('digest-fetch');
        const DigestFetch = lib.default || lib;
        clientes.set(chave, new DigestFetch(user, password));
    }
    return clientes.get(chave);
}

/**
 * Executa uma chamada CGI no leitor.
 * @returns {{ status: number, ok: boolean, text?: string, base64?: string }}
 */
async function executarCgi({ config, method = 'GET', path, body = null, contentType = null, binary = false, timeoutMs = 15000 }) {
    if (!config?.ip || !path?.startsWith('/')) throw new Error('Parâmetros inválidos (ip/path)');
    const client = await clienteDigest(config);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
        const res = await client.fetch(`http://${config.ip}:${config.port || 80}${path}`, {
            method,
            ...(body !== null && body !== undefined ? { body } : {}),
            ...(contentType ? { headers: { 'Content-Type': contentType } } : {}),
            signal: controller.signal
        });
        if (binary) {
            const buffer = Buffer.from(await res.arrayBuffer());
            return { status: res.status, ok: res.ok, base64: buffer.toString('base64') };
        }
        return { status: res.status, ok: res.ok, text: await res.text() };
    } catch (err) {
        if (err.name === 'AbortError') throw new Error(`Leitor ${config.ip} não respondeu (timeout)`);
        throw new Error(`Leitor ${config.ip} inacessível: ${err.message}`);
    } finally {
        clearTimeout(timer);
    }
}

const handlers = {
    /** Leitor alcançável? */
    async ping({ config }) {
        const r = await executarCgi({ config, path: '/cgi-bin/magicBox.cgi?action=getDeviceType', timeoutMs: 5000 });
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return { online: true, info: (r.text || '').trim() };
    },

    /** Chamada CGI genérica (usada por todo o serviço Intelbras do servidor) */
    async cgi(payload) {
        return executarCgi(payload);
    },

    /** Chamada ao motor de IA facial local: GET {IA_URL}{path}?{params} */
    async ia({ path, params = {}, binary = false, timeoutMs = 8000 }) {
        if (typeof path !== 'string' || !path.startsWith('/api/')) throw new Error('Caminho inválido para a IA');
        const query = new URLSearchParams(Object.entries(params).filter(([, v]) => v !== undefined && v !== null).map(([k, v]) => [k, String(v)]));
        let res;
        try {
            res = await fetchIa(`${path}?${query}`, { signal: AbortSignal.timeout(timeoutMs) });
        } catch (err) {
            throw new Error(err.name === 'TimeoutError' ? 'Motor de IA local não respondeu (timeout)' : 'Motor de IA local não está ligado');
        }
        if (binary) {
            const buffer = Buffer.from(await res.arrayBuffer());
            return { status: res.status, ok: res.ok, contentType: res.headers.get('content-type'), base64: buffer.toString('base64') };
        }
        return { status: res.status, ok: res.ok, json: await res.json().catch(() => null) };
    },

    /**
     * Vídeo ao vivo para o painel na nuvem: envia quadros sem esperar pedido. Repetir o comando renova
     * o prazo (e pode trocar fps/qualidade); sem renovação por ttlMs, para sozinho.
     * qualidade: 'mini' (miniatura, sub-stream da câmera) ou 'foco' (tela grande, stream principal).
     */
    async video_iniciar({ streamId, stream_url, camera_id = '', fonte = 'motor', annotate = true, qualidade = 'foco', fps = 12, max_width = 960, quality = 70, ttlMs = 30000 }) {
        if (!streamId || !stream_url) throw new Error('streamId e stream_url são obrigatórios');
        // fonte 'local': MJPEG do retransmissor (sem motor de IA); câmera fora dele: segue pelo motor
        const local = fonte === 'local' && camera_id && video.conhece(camera_id) && video.temFfmpeg();
        const params = { stream_url, camera_id, annotate, qualidade, fps, max_width, quality };
        const atual = videos.get(streamId);
        if (atual) {
            atual.expiraEm = Date.now() + ttlMs;
            atual.params = params;
            return { ativo: true, renovado: true, local: atual.local };
        }
        const reg = { expiraEm: Date.now() + ttlMs, parar: false, params, local };
        videos.set(streamId, reg);
        (local ? enviarVideoLocal(streamId, reg) : enviarVideo(streamId, reg))
            .catch(err => log('error', `vídeo ${streamId}: ${err.message}`));
        return { ativo: true, local };
    },

    /**
     * Vídeo MP4 (H.264 copiado, sem recodificar) de uma câmera para UM espectador do painel.
     * Os pedaços vão pelo canal de vídeo ('agent:video_mp4'); para quando o painel pedir, a internet
     * não der conta ou a conexão cair.
     */
    async video_mp4_iniciar({ streamId, camera_id, qualidade = 'mini', ua = '' }) {
        if (!streamId || !camera_id) throw new Error('streamId e camera_id são obrigatórios');
        if (!video.disponivel()) throw new Error('Retransmissor de vídeo local não instalado neste PC');
        if (!video.conhece(camera_id)) throw new Error('Câmera não está no retransmissor local');
        if (!socketVideo.connected) throw new Error('Canal de vídeo indisponível');
        const ctrl = new AbortController();
        // Câmera que não responde não segura o pedido: o painel desiste em 12 s
        const prazo = setTimeout(() => ctrl.abort(), 10000);
        let res;
        try {
            res = await video.abrirMp4(camera_id, qualidade, ua, ctrl.signal);
        } finally {
            clearTimeout(prazo);
        }
        // O painel desistiu enquanto a câmera abria: não envia nada
        if (mp4Cancelados.has(streamId)) {
            mp4Cancelados.delete(streamId);
            ctrl.abort();
            return { ativo: false };
        }
        const reg = { ctrl, parar: false };
        mp4s.set(streamId, reg);
        bombearMp4(streamId, reg, res).catch(err => log('warn', `vídeo mp4 ${streamId}: ${err.message}`));
        return { ativo: true, tipo: res.headers.get('content-type') || 'video/mp4' };
    },

    async video_mp4_parar({ streamId }) {
        const reg = mp4s.get(streamId);
        if (reg) { reg.parar = true; reg.ctrl.abort(); }
        else if (streamId) {
            // Chegou antes do vídeo abrir: lembra por 30 s para cancelar na abertura
            mp4Cancelados.set(streamId, Date.now());
            for (const [id, t] of mp4Cancelados) if (Date.now() - t > 30000) mp4Cancelados.delete(id);
        }
        return { ativo: false };
    },

    /** Imagem da câmera pelo retransmissor (sem motor de IA) */
    async snapshot_local({ camera_id, qualidade = 'mini' }) {
        const jpeg = await video.snapshot(camera_id, qualidade);
        return { contentType: 'image/jpeg', base64: jpeg.toString('base64') };
    },

    /** A câmera manda vídeo? (pelo retransmissor) */
    async camera_testar({ camera_id }) {
        if (!video.conhece(camera_id)) throw new Error('Câmera não está no retransmissor local');
        const inicio = Date.now();
        try {
            await video.snapshot(camera_id, 'mini', 10000);
            return { online: true, latencia_ms: Date.now() - inicio };
        } catch (err) {
            return { online: false, motivo: err.message };
        }
    },

    /** POST no motor de IA (biometria, verificação 1:1 dos leitores) */
    async ia_post({ path: caminho, body = {}, timeoutMs = 8000 }) {
        if (!['/api/verificar', '/api/extract', '/api/rostos'].includes(caminho)) throw new Error('Caminho inválido para a IA');
        if (motorDesligadoPeloPainel()) throw new Error('Motor de IA desligado pelo painel');
        let res;
        try {
            res = await fetchIa(caminho, {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body), signal: AbortSignal.timeout(timeoutMs)
            });
        } catch (err) {
            throw new Error(err.name === 'TimeoutError' ? 'Motor de IA local não respondeu (timeout)' : 'Motor de IA local não está ligado');
        }
        return { status: res.status, ok: res.ok, json: await res.json().catch(() => null) };
    },

    /** Liga/desliga o motor de IA deste PC (chave "Motor de IA do evento" no painel) */
    async motor_definir({ ativo }) {
        return definirMotor(ativo !== false);
    },

    /** Alerta numa câmera em modo "gravar em alertas" */
    async gravacao_marcar({ camera_ids = [], descricao = 'Alerta' }) {
        const marcadas = camera_ids.filter(id => gravador.marcar(id, String(descricao).slice(0, 200)));
        return { marcadas };
    },

    /** Pedaço de uma gravação deste PC (painel assistindo ou baixando) */
    async gravacao_ler(payload) {
        return gravador.ler(payload);
    },

    async gravacao_status() {
        return { ...gravador.status(), video: video.status() };
    },

    /**
     * Câmeras do evento e as chaves gerais (motor de IA, gravação). Todas as câmeras RTSP entram no
     * retransmissor (vídeo); só as com IA ligada vão ao motor, lendo do retransmissor; as marcadas
     * para gravar vão ao gravador. Servidor antigo (sem `evento`): mantém motor e gravação como estão.
     */
    async vigilancia_configurar({ cameras = [], evento = null }) {
        if (evento) salvarConfigCameras({ cameras, evento });
        await video.configurarCameras(cameras); // antes de montar a lista do motor (usa o RTSP local)
        if (evento) {
            vigilancia.evento = evento;
            iaCentral.modo = evento.ia_onde === 'auto' ? 'auto' : 'local';
            aplicarModoIa();
            gravador.configurar({
                ativa: evento.gravacao_ativa !== false,
                limite_gb: evento.gravacao_limite_gb,
                retencao_dias: evento.gravacao_retencao_dias,
                cameras
            });
            if ((evento.motor_ia_ativo !== false) === motorDesligadoPeloPainel()) {
                definirMotor(evento.motor_ia_ativo !== false).catch(err => log('warn', `motor de IA: ${err.message}`));
            }
        }
        vigilancia.cameras = camerasParaMotor(cameras);
        await aplicarVigilancia().catch(() => {}); // motor desligado: a lista vai quando ele subir
        return { cameras: cameras.length, ia: vigilancia.cameras.length, video_local: video.disponivel() };
    },

    /** Perfil e ajustes da IA definidos no painel (Configurações > IA facial e câmeras) */
    async ia_config({ perfil, ajustes = {} }) {
        vigilancia.config = { perfil, ajustes };
        const r = await aplicarConfigIa();
        return { perfil: r?.config?.perfil };
    },

    /** Status do motor (GPU, fps e IA por câmera) para a tela de configurações */
    async ia_status() {
        if (motorDesligadoPeloPainel()) throw new Error('Motor de IA desligado pelo painel');
        const res = await fetchIa('/api/engine/status', { signal: AbortSignal.timeout(5000) })
            .catch(() => { throw new Error('Motor de IA local não está ligado'); });
        return res.json();
    },

    /** Inicia o motor de IA facial local caso esteja desligado */
    async ia_iniciar() {
        return definirMotor(true);
    },

    async video_parar({ streamId }) {
        const video = videos.get(streamId);
        if (video) video.parar = true;
        return { ativo: false };
    },

    /** Imagem de câmera HTTP da rede local (snapshot CGI), com autenticação Digest ou Basic */
    async http({ url, user, password, timeoutMs = 5000 }) {
        const alvo = new URL(url);
        if (!['http:', 'https:'].includes(alvo.protocol)) throw new Error('URL inválida');
        const opcoes = () => ({ signal: AbortSignal.timeout(timeoutMs) });
        try {
            let res;
            if (user) {
                const client = await clienteDigest({ ip: alvo.hostname, port: alvo.port || 80, user, password });
                res = await client.fetch(url, opcoes());
                if (res.status === 401 && /^basic/i.test(res.headers.get('www-authenticate') || '')) {
                    res = await fetch(url, { ...opcoes(), headers: { Authorization: 'Basic ' + Buffer.from(`${user}:${password || ''}`).toString('base64') } });
                }
            } else {
                res = await fetch(url, opcoes());
            }
            const buffer = Buffer.from(await res.arrayBuffer());
            return { status: res.status, ok: res.ok, contentType: res.headers.get('content-type'), base64: buffer.toString('base64') };
        } catch (err) {
            throw new Error(`Câmera ${alvo.host} inacessível: ${err.name === 'TimeoutError' ? 'timeout' : err.message}`);
        }
    }
};

// Vídeos sendo enviados ao servidor: streamId → { expiraEm, parar }
const videos = new Map();
const esperar = (ms) => new Promise(r => setTimeout(r, ms));

/**
 * Envia o vídeo de uma câmera. Até QUADROS_EM_VOO quadros sem confirmação (antes: um por vez, então o
 * fps caía com a distância até a nuvem); internet lenta faz a taxa cair sozinha em vez de acumular
 * atraso. apos_seq: o motor responde 204 se a câmera não mandou quadro novo, e nada é reenviado.
 */
async function enviarVideo(streamId, video) {
    let emVoo = 0;
    let seq = -1;
    let falhas = 0;
    let anunciado = '';
    while (!video.parar && Date.now() < video.expiraEm && socket.connected) {
        const { stream_url, camera_id, annotate, qualidade, fps, max_width, quality } = video.params;
        const intervalo = 1000 / Math.min(Math.max(fps, 1), 30);
        const resumo = `${qualidade}, ${fps} fps, ${max_width}px`;
        if (resumo !== anunciado) log('info', `vídeo ${streamId} → painel (${resumo})`);
        anunciado = resumo;
        const inicio = Date.now();
        if (emVoo >= QUADROS_EM_VOO) {
            await esperar(20);
            continue;
        }
        try {
            const query = new URLSearchParams({
                stream_url, annotate: String(annotate), qualidade, max_width: String(max_width), quality: String(quality), apos_seq: String(seq),
                ...(camera_id ? { camera_id: String(camera_id) } : {})
            });
            const res = await fetchIa(`/api/camera/snapshot?${query}`, { signal: AbortSignal.timeout(5000) });
            if (res.status === 204) {
                await res.arrayBuffer().catch(() => {});
            } else {
                const jpeg = Buffer.from(await res.arrayBuffer());
                seq = parseInt(res.headers.get('x-frame-seq') || '-1', 10);
                // Sem o canal de vídeo, o quadro é descartado: na conexão principal ele atrasava
                // os comandos dos leitores faciais (abrir porta, cadastrar face)
                if (!socketVideo.connected) {
                    await esperar(500);
                    continue;
                }
                emVoo++;
                socketVideo.timeout(5000).emitWithAck('agent:video_quadro', { streamId, jpeg })
                    .catch(() => {})
                    .finally(() => { emVoo--; });
            }
            falhas = 0;
        } catch (err) {
            if (++falhas === 5) log('warn', `vídeo ${streamId}: ${err.message} (seguindo)`);
            await esperar(500);
        }
        await esperar(Math.max(0, intervalo - (Date.now() - inicio)));
    }
    videos.delete(streamId);
    log('info', `vídeo ${streamId} encerrado`);
}

const SOI = Buffer.from([0xff, 0xd8, 0xff]);
const EOI = Buffer.from([0xff, 0xd9]);

/**
 * Vídeo MJPEG do retransmissor local (sem motor de IA): extrai os quadros JPEG do stream.mjpeg do
 * go2rtc e envia o mais recente na taxa pedida — internet lenta pula quadros em vez de atrasar.
 */
async function enviarVideoLocal(streamId, reg) {
    const ctrl = new AbortController();
    let acumulado = Buffer.alloc(0);
    let ultimoEnvio = 0;
    let emVoo = 0;
    try {
        const res = await video.abrirMjpeg(reg.params.camera_id, reg.params.qualidade, ctrl.signal);
        log('info', `vídeo ${streamId} → painel (retransmissor local, ${reg.params.qualidade})`);
        const leitor = res.body.getReader();
        while (!reg.parar && Date.now() < reg.expiraEm && socket.connected) {
            const { value, done } = await leitor.read();
            if (done) break;
            acumulado = acumulado.length ? Buffer.concat([acumulado, Buffer.from(value)]) : Buffer.from(value);
            const fim = acumulado.lastIndexOf(EOI);
            if (fim < 0) {
                if (acumulado.length > 8e6) acumulado = Buffer.alloc(0);
                continue;
            }
            const ini = acumulado.lastIndexOf(SOI, fim);
            const quadro = ini >= 0 ? acumulado.subarray(ini, fim + 2) : null;
            acumulado = Buffer.from(acumulado.subarray(fim + 2));
            const intervalo = 1000 / Math.min(Math.max(reg.params.fps || 10, 1), 30);
            if (!quadro || Date.now() - ultimoEnvio < intervalo || emVoo >= QUADROS_EM_VOO || !socketVideo.connected) continue;
            ultimoEnvio = Date.now();
            emVoo++;
            socketVideo.timeout(5000).emitWithAck('agent:video_quadro', { streamId, jpeg: Buffer.from(quadro) })
                .catch(() => {})
                .finally(() => { emVoo--; });
        }
    } finally {
        ctrl.abort();
        videos.delete(streamId);
        log('info', `vídeo ${streamId} encerrado`);
    }
}

// Vídeos MP4 (um por espectador do painel): streamId → { ctrl, parar }
const mp4s = new Map();
const mp4Cancelados = new Map(); // streamId → quando o painel pediu para parar antes de abrir
const MP4_EM_VOO = 6;
const MP4_PEDACO = 64 * 1024;

async function bombearMp4(streamId, reg, res) {
    const leitor = res.body.getReader();
    let emVoo = 0;
    let pendentes = [];
    let tamanho = 0;
    let ultimoEnvio = Date.now();
    const enviar = () => {
        if (!tamanho) return;
        const dados = pendentes.length === 1 ? Buffer.from(pendentes[0]) : Buffer.concat(pendentes.map(p => Buffer.from(p)));
        pendentes = [];
        tamanho = 0;
        ultimoEnvio = Date.now();
        emVoo++;
        socketVideo.timeout(10000).emitWithAck('agent:video_mp4', { streamId, dados })
            .then((r) => { if (r?.parar) { reg.parar = true; reg.ctrl.abort(); } }) // ninguém mais assiste
            .catch(() => { reg.parar = true; })
            .finally(() => { emVoo--; });
    };
    try {
        while (!reg.parar && socket.connected && socketVideo.connected) {
            const esperaDesde = Date.now();
            while (emVoo >= MP4_EM_VOO && !reg.parar) {
                if (Date.now() - esperaDesde > 8000) throw new Error('internet lenta demais para este vídeo');
                await esperar(15);
            }
            const { value, done } = await leitor.read();
            if (done) break;
            pendentes.push(value);
            tamanho += value.length;
            if (tamanho >= MP4_PEDACO || Date.now() - ultimoEnvio >= 80) enviar();
        }
        if (!reg.parar) enviar();
    } finally {
        reg.ctrl.abort();
        mp4s.delete(streamId);
        if (socketVideo.connected) socketVideo.emit('agent:video_mp4', { streamId, fim: true });
    }
}

/** Câmeras com IA ligada, lendo do retransmissor local (uma conexão só na câmera) */
function camerasParaMotor(cameras) {
    return cameras.filter(c => c.ia_ativa !== false).map((c) => {
        if (!video.conhece(c.id)) return c;
        const principal = video.urlRtspLocal(c.id, 'foco');
        const sub = video.streamDa(c.id, 'mini') !== video.streamDa(c.id, 'foco') ? video.urlRtspLocal(c.id, 'mini') : null;
        return { ...c, stream_url: principal, url_substream: sub, usar_substream: !!sub };
    });
}

/** Liga ou desliga o motor de IA deste PC. Desligado, o vigia não o religa (arquivo .motor-desligado). */
async function definirMotor(ativo) {
    const scriptPs1 = path.join(RAIZ_PROJETO, 'scripts', 'ligar-ia-facial.ps1');
    if (!ativo) {
        fs.writeFileSync(ARQ_MOTOR_DESLIGADO, new Date().toISOString());
        if (process.platform === 'win32' && fs.existsSync(scriptPs1)) {
            const { spawn } = require('child_process');
            spawn('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', scriptPs1, 'parar-motor'],
                { cwd: RAIZ_PROJETO, detached: true, stdio: 'ignore', windowsHide: true }).unref();
        }
        log('info', 'Motor de IA desligado pelo painel (câmeras seguem com vídeo pelo retransmissor)');
        return { ativo: false };
    }
    fs.rmSync(ARQ_MOTOR_DESLIGADO, { force: true });
    try {
        const res = await fetchIa('/api/engine/status', { signal: AbortSignal.timeout(3000) });
        if (res.ok) return { ativo: true, iniciado: true, ja_rodando: true, status: await res.json() };
    } catch {
        // motor desligado: liga pelo ligar-ia-facial.ps1
    }
    if (process.platform === 'win32' && fs.existsSync(scriptPs1)) {
        const { spawn } = require('child_process');
        spawn('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', scriptPs1, 'unico'],
            { cwd: RAIZ_PROJETO, detached: true, stdio: 'ignore', windowsHide: true }).unref();
        log('info', 'Motor de IA: ligando');
        return { ativo: true, iniciado: true, ja_rodando: false, mensagem: 'Inicialização do motor de IA facial disparada no PC local.' };
    }
    throw new Error('Script ligar-ia-facial.ps1 não encontrado no PC do agente.');
}

// Vigilância: o servidor manda a lista de câmeras e a configuração da IA; o agente repassa ao motor
// (de novo a cada 30 s, caso o motor reinicie) e leva à nuvem as pessoas que o motor reconhecer.
// O ponto de leitura das detecções fica em disco: reiniciar o agente não reenvia detecções antigas.
const vigilancia = { cameras: null, config: null, ...lerEstado() };

function lerEstado() {
    try {
        const { desde = 0, inicio = null } = JSON.parse(fs.readFileSync(ARQUIVO_ESTADO, 'utf8'));
        return { desde, inicio };
    } catch {
        return { desde: 0, inicio: null };
    }
}

function salvarEstado() {
    try {
        fs.writeFileSync(ARQUIVO_ESTADO, JSON.stringify({ desde: vigilancia.desde, inicio: vigilancia.inicio }));
    } catch (err) {
        log('warn', `não foi possível salvar ${ARQUIVO_ESTADO}: ${err.message}`);
    }
}

async function postarNoMotor(caminho, corpo) {
    const res = await fetchIa(caminho, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(corpo),
        signal: AbortSignal.timeout(10000)
    });
    if (!res.ok) throw new Error(`motor respondeu HTTP ${res.status}`);
    return res.json();
}

async function aplicarVigilancia() {
    if (!vigilancia.cameras) return;
    await postarNoMotor('/api/vigilancia', { cameras: vigilancia.cameras });
}

async function aplicarConfigIa() {
    if (!vigilancia.config) return null;
    return postarNoMotor('/api/config', vigilancia.config);
}

setInterval(() => {
    aplicarConfigIa().catch(() => {});
    aplicarVigilancia().catch(() => {});
}, 30000);

/**
 * Biometrias para o motor de IA: a API envia só as pessoas do evento deste agente (o PC não guarda a
 * chave do banco). A cada 60 s só o que mudou; a cada 15 min (ou com o motor reiniciado) a lista
 * completa de ids, para tirar do índice quem saiu.
 */
const rostos = { desde: null, ultimoCompleto: 0, rodando: false, avisou: false };
const ROSTOS_COMPLETO_MS = 15 * 60000;

async function pedirRostos(pedido) {
    return socket.timeout(30000).emitWithAck('agent:rostos', pedido);
}

async function sincronizarRostos() {
    if (rostos.rodando || !socket.connected || motorDesligadoPeloPainel()) return;
    rostos.rodando = true;
    try {
        const saude = await fetchIa('/health', { signal: AbortSignal.timeout(3000) }).then(r => r.json()).catch(() => null);
        if (!saude) return; // motor desligado
        if (saude.supabase_direto) return; // motor com chave própria (modo antigo)
        const completo = !rostos.desde || Date.now() - rostos.ultimoCompleto > ROSTOS_COMPLETO_MS;
        if (completo) {
            const lista = await pedirRostos({ modo: 'ids' });
            if (!lista?.ok) throw new Error(lista?.erro || 'servidor sem suporte a biometria pelo agente');
            const r = await postarNoMotor('/api/rostos', { completo: true, ids: lista.ids });
            const faltando = r.faltando || [];
            for (let i = 0; i < faltando.length; i += 200) {
                const lote = await pedirRostos({ modo: 'pessoas', ids: faltando.slice(i, i + 200) });
                if (lote?.pessoas?.length) await postarNoMotor('/api/rostos', { pessoas: lote.pessoas });
            }
            rostos.desde = lista.ate;
            rostos.ultimoCompleto = Date.now();
            log('info', `biometria: ${lista.ids.length} pessoa(s) do evento no motor de IA`);
        } else {
            for (let pagina = 0; pagina < 20; pagina++) {
                const lote = await pedirRostos({ modo: 'desde', desde: rostos.desde });
                if (!lote?.ok) break;
                if (lote.pessoas?.length) await postarNoMotor('/api/rostos', { pessoas: lote.pessoas });
                rostos.desde = lote.ate || rostos.desde;
                if (!lote.mais) break;
            }
        }
        rostos.avisou = false;
    } catch (err) {
        if (!rostos.avisou) log('warn', `biometria para o motor de IA: ${err.message}`);
        rostos.avisou = true;
    } finally {
        rostos.rodando = false;
    }
}
setInterval(() => { sincronizarRostos(); }, 60000);
setTimeout(() => { sincronizarRostos(); }, 8000);

/**
 * Reconhecimento no SERVIDOR DE IA CENTRAL (evento em "auto"): o motor deste PC acha e acompanha os
 * rostos e deixa numa fila só o rosto alinhado (~4 KB). Este laço leva a fila à nuvem (canal de
 * vídeo), que repassa a um servidor de IA, e devolve as respostas ao motor. Sem servidor, o motor
 * deste PC reconhece sozinho (reserva).
 */
const iaCentral = { modo: 'local', avisou: false };

async function aplicarModoIa() {
    if (motorDesligadoPeloPainel()) return;
    try {
        // Disponível = canal de vídeo conectado E a nuvem confirma um servidor de IA ligado
        let disponivel = false;
        if (iaCentral.modo === 'auto' && socketVideo.connected) {
            disponivel = await socketVideo.timeout(3000).emitWithAck('agent:ia_servidor_status', {})
                .then(r => r?.disponivel === true).catch(() => false);
        }
        await postarNoMotor('/api/remoto/estado', { modo: iaCentral.modo, disponivel });
    } catch { /* motor desligado: reaplica no próximo ciclo */ }
}
setInterval(aplicarModoIa, 5000);

/** Uma leva: até 50 rostos do motor → nuvem → respostas ao motor. Devolve quantos levou. */
async function levarLeva() {
    const r = await fetchIa('/api/remoto/pendentes?limite=50', { signal: AbortSignal.timeout(2000) });
    const { itens = [] } = await r.json();
    if (!itens.length) return 0;
    let resposta = { indisponivel: true };
    if (socketVideo.connected) {
        try {
            resposta = await socketVideo.timeout(2200).emitWithAck('agent:ia_reconhecer', { itens });
        } catch { /* nuvem não respondeu a tempo: reserva local */ }
    }
    if (resposta?.indisponivel && !iaCentral.avisou) {
        log('warn', `servidor de IA central indisponível${resposta.carregando ? ' (carregando os cadastrados do evento)' : ''}: reconhecendo neste PC`);
        iaCentral.avisou = true;
    } else if (!resposta?.indisponivel) iaCentral.avisou = false;
    await postarNoMotor('/api/remoto/resultados', { resultados: resposta?.resultados || [], indisponivel: !!resposta?.indisponivel });
    return itens.length;
}

// Até 2 levas ao mesmo tempo; com a fila cheia (50), pede a próxima na hora em vez de esperar o ciclo
let levasEmVoo = 0;
setInterval(() => {
    if (levasEmVoo >= 2 || iaCentral.modo !== 'auto' || motorDesligadoPeloPainel()) return;
    levasEmVoo++;
    (async () => {
        try {
            for (let i = 0; i < 4; i++) {
                if ((await levarLeva()) < 50) break;
            }
        } catch {
            // motor desligado ou reiniciando
        } finally {
            levasEmVoo--;
        }
    })();
}, 250);

// PC religado: aplica a última configuração conhecida até o painel mandar a atual
{
    const ultima = lerConfigCameras();
    if (ultima?.cameras) {
        handlers.vigilancia_configurar(ultima)
            .then(() => log('info', `Configuração de câmeras salva aplicada (${ultima.cameras.length} câmera(s))`))
            .catch(err => log('warn', `configuração de câmeras salva: ${err.message}`));
    }
}

const filaDeteccoes = lerFila();
if (filaDeteccoes.length) log('info', `${filaDeteccoes.length} detecção(ões) de antes de reiniciar aguardando envio`);

function lerFila() {
    try {
        const fila = JSON.parse(fs.readFileSync(ARQUIVO_FILA, 'utf8'));
        return Array.isArray(fila) ? fila : [];
    } catch {
        return [];
    }
}

function salvarFila() {
    try {
        if (filaDeteccoes.length) fs.writeFileSync(ARQUIVO_FILA, JSON.stringify(filaDeteccoes));
        else if (fs.existsSync(ARQUIVO_FILA)) fs.unlinkSync(ARQUIVO_FILA);
    } catch (err) {
        log('warn', `não foi possível salvar ${ARQUIVO_FILA}: ${err.message}`);
    }
}

/** Entrega à nuvem o que está na fila, na ordem; para no primeiro envio sem confirmação. */
async function entregarFila() {
    let enviadas = 0;
    while (filaDeteccoes.length && socket.connected) {
        const d = filaDeteccoes[0];
        const atrasada = Date.now() / 1000 - d.ts > DETECCAO_MAX_IDADE_S;
        try {
            await socket.timeout(10000).emitWithAck('agent:deteccao', atrasada ? { ...d, atrasada: true } : d);
        } catch {
            break; // sem confirmação: fica na fila para a próxima rodada
        }
        filaDeteccoes.shift();
        enviadas++;
        log('info', `vigilância: ${d.results.map(r => r.matched_person?.nome).join(', ')} (câmera ${d.camera_id}) → painel${atrasada ? ' (atrasada)' : ''}`);
    }
    if (enviadas) salvarFila();
}

let buscandoDeteccoes = false;
setInterval(async () => {
    if (buscandoDeteccoes || !vigilancia.cameras) return;
    buscandoDeteccoes = true;
    try {
        // Lê do motor mesmo sem internet: o motor guarda só as últimas detecções por pouco tempo,
        // então elas vêm para a fila em disco do agente e sobem quando a conexão voltar
        if (motorDesligadoPeloPainel()) return;
        const res = await fetchIa(`/api/vigilancia/deteccoes?desde=${vigilancia.desde}&max_idade_s=${DETECCAO_MAX_IDADE_S}`,
            { signal: AbortSignal.timeout(5000) });
        const { seq, inicio, deteccoes = [] } = await res.json();
        if (inicio !== undefined && inicio !== vigilancia.inicio) {
            // Motor reiniciou (ou primeira vez): a contagem recomeçou, e a configuração precisa ser reaplicada
            vigilancia.inicio = inicio;
            vigilancia.desde = 0;
            rostos.desde = null; // motor novo começa sem biometrias: envio completo
            salvarEstado();
            aplicarConfigIa().catch(() => {});
            aplicarVigilancia().catch(() => {});
            return;
        }
        if (seq < vigilancia.desde) { vigilancia.desde = 0; salvarEstado(); return; } // motor antigo reiniciou
        for (const d of deteccoes) {
            vigilancia.desde = d.seq;
            if (Date.now() / 1000 - d.ts > DETECCAO_MAX_IDADE_S) continue;
            filaDeteccoes.push(d);
        }
        if (filaDeteccoes.length > FILA_MAX) {
            const descartadas = filaDeteccoes.splice(0, filaDeteccoes.length - FILA_MAX);
            log('warn', `fila de detecções cheia: ${descartadas.length} mais antiga(s) descartada(s)`);
        }
        if (deteccoes.length) {
            salvarEstado();
            salvarFila();
        }
    } catch {
        // motor desligado: tenta de novo no próximo segundo
    } finally {
        try {
            await entregarFila();
        } finally {
            buscandoDeteccoes = false;
        }
    }
}, 1000);

// Namespace /agent do Socket.IO (o caminho HTTP continua o padrão /socket.io)
const opcoesSocket = {
    auth: { token: AGENT_TOKEN },
    transports: ['websocket'],
    reconnection: true,
    reconnectionDelay: 3000,
    reconnectionDelayMax: 15000,
    reconnectionAttempts: Infinity
};
const socket = io(`${VPS_URL}/agent`, opcoesSocket);

// Vídeo numa conexão própria: quadros grandes não atrasam os comandos dos leitores faciais nem o
// batimento da conexão principal. Servidor antigo sem /agent-video: o vídeo segue pela principal.
const socketVideo = io(`${VPS_URL}/agent-video`, { ...opcoesSocket, forceNew: true });
let avisouVideo = false;
socketVideo.on('connect', () => { avisouVideo = false; log('info', 'Canal de vídeo separado conectado'); });
socketVideo.on('connect_error', (err) => {
    if (!avisouVideo) log('warn', `Canal de vídeo separado indisponível (${err.message}); vídeo segue pela conexão principal`);
    avisouVideo = true;
    // Recusa do servidor (ex.: versão antiga sem /agent-video) não é retentada pelo socket.io:
    // tenta de novo a cada 30 s, para o canal voltar sozinho depois de um deploy
    if (!socketVideo.active) setTimeout(() => { if (!socketVideo.connected) socketVideo.connect(); }, 30000);
});

socket.on('connect', () => {
    log('info', `Conectado a ${VPS_URL} como "${AGENT_NAME}"`);
    socket.emit('agent:ready', {
        name: AGENT_NAME, version: VERSAO, ts: new Date().toISOString(),
        // O que este PC sabe fazer: o painel escolhe o caminho do vídeo e mostra o que falta instalar
        recursos: { video_local: video.disponivel(), ffmpeg: video.temFfmpeg(), gravacao: video.temFfmpeg(), rostos_pelo_agente: true }
    });
    setTimeout(() => { sincronizarRostos(); }, 5000);
});
socket.on('disconnect', (motivo) => log('warn', `Desconectado (${motivo}). Tentando reconectar...`));
socket.on('connect_error', (err) => log('error', `Falha ao conectar: ${err.message}`));

// Comandos chegam pela conexão principal; os pesados (pedaços de gravação) pela de vídeo
socket.on('agent:command', (msg) => atenderComando(socket, msg));
socketVideo.on('agent:command', (msg) => {
    if (msg?.command !== 'gravacao_ler') {
        socketVideo.emit('agent:response', { requestId: msg?.requestId, success: false, error: 'Comando não permitido no canal de vídeo' });
        return;
    }
    atenderComando(socketVideo, msg);
});

async function atenderComando(canal, { requestId, command, payload } = {}) {
    const handler = handlers[command];
    if (!handler) {
        canal.emit('agent:response', { requestId, success: false, error: `Comando desconhecido: ${command}` });
        return;
    }
    const inicio = Date.now();
    try {
        const data = await handler(payload || {});
        canal.emit('agent:response', { requestId, success: true, data });
        // IA, imagens e renovação de vídeo chegam toda hora: só os erros vão para o log
        if (!['ia', 'ia_post', 'http', 'video_iniciar', 'video_mp4_iniciar', 'video_mp4_parar', 'ia_status', 'snapshot_local', 'gravacao_ler', 'gravacao_status'].includes(command)) log('info',`${command} ${payload?.method || ''} ${payload?.config?.ip || ''}${(payload?.path || '').split('?')[0]} → ok (${Date.now() - inicio} ms)`);
    } catch (err) {
        canal.emit('agent:response', { requestId, success: false, error: err.message });
        log('error', `${command} ${payload?.config?.ip || payload?.path || ''} → ${err.message}`);
    }
}

const encerrar = () => { salvarEstado(); salvarFila(); gravador.pararTudo(); video.parar(); socket.disconnect(); socketVideo.disconnect(); process.exit(0); };
process.on('SIGINT', encerrar);
process.on('SIGTERM', encerrar);

// Erro inesperado num comando não pode derrubar o agente (leitores e câmeras ficariam sem comando)
process.on('unhandledRejection', (motivo) => log('error', `promessa rejeitada sem tratamento: ${motivo?.stack || motivo}`));
process.on('uncaughtException', (err) => {
    // estado incerto: registra, guarda a fila e sai — o vigia (ligar-ia-facial.ps1) religa o agente
    log('error', `exceção não tratada, reiniciando: ${err?.stack || err}`);
    salvarEstado();
    salvarFila();
    try { gravador.pararTudo(); video.parar(); } catch { /* saindo de qualquer forma */ }
    process.exit(1);
});
