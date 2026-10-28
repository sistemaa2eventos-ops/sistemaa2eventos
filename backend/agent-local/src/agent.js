'use strict';

/**
 * Agente local A2 Eventos
 *
 * Roda num computador da rede do evento e mantém uma conexão de saída com o
 * servidor na nuvem. O servidor envia chamadas CGI para os leitores faciais
 * (cadastro de faces, configuração, relógio, abertura de porta, snapshot) e o
 * agente as executa na rede local, devolvendo a resposta.
 *
 * Também repassa ao motor de IA facial local (microservice-face-python) as chamadas
 * das câmeras (rastreamento, snapshot, teste) e busca imagens de câmeras HTTP da rede.
 *
 * Variáveis (.env): VPS_URL, AGENT_TOKEN, AGENT_NAME, IA_URL (padrão http://127.0.0.1:8000)
 */
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { io } = require('socket.io-client');

const VPS_URL = (process.env.VPS_URL || '').replace(/\/+$/, '');
const AGENT_TOKEN = process.env.AGENT_TOKEN;
const AGENT_NAME = process.env.AGENT_NAME || 'Agente Local';
const IA_URL = (process.env.IA_URL || 'http://127.0.0.1:8000').replace(/\/+$/, '');
const VERSAO = '2.4.0';
const ARQUIVO_ESTADO = path.join(__dirname, '..', '.estado.json');
const DETECCAO_MAX_IDADE_S = 60; // detecção mais velha que isso não vira alerta (ex.: agente ficou fora do ar)
const QUADROS_EM_VOO = 2;        // quadros enviados sem confirmação: a taxa não depende mais da distância até a nuvem

const log = (nivel, msg) => console.log(`[${new Date().toISOString()}] ${nivel.toUpperCase()} ${msg}`);

if (!VPS_URL || !AGENT_TOKEN) {
    log('error', 'Defina VPS_URL e AGENT_TOKEN no arquivo .env (veja .env.example).');
    process.exit(1);
}

// Cliente Digest por leitor (reaproveita o nonce entre chamadas)
const clientes = new Map();
async function clienteDigest({ ip, port = 80, user = 'admin', password }) {
    const chave = `${ip}:${port}:${user}`;
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
            res = await fetch(`${IA_URL}${path}?${query}`, { signal: AbortSignal.timeout(timeoutMs) });
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
    async video_iniciar({ streamId, stream_url, annotate = true, qualidade = 'foco', fps = 12, max_width = 960, quality = 70, ttlMs = 30000 }) {
        if (!streamId || !stream_url) throw new Error('streamId e stream_url são obrigatórios');
        const params = { stream_url, annotate, qualidade, fps, max_width, quality };
        const atual = videos.get(streamId);
        if (atual) {
            atual.expiraEm = Date.now() + ttlMs;
            atual.params = params;
            return { ativo: true, renovado: true };
        }
        const video = { expiraEm: Date.now() + ttlMs, parar: false, params };
        videos.set(streamId, video);
        enviarVideo(streamId, video).catch(err => log('error', `vídeo ${streamId}: ${err.message}`));
        return { ativo: true };
    },

    /** Câmeras do evento que o motor vigia sem ninguém assistindo (alertas com o painel fechado) */
    async vigilancia_configurar({ cameras = [] }) {
        vigilancia.cameras = cameras;
        await aplicarVigilancia();
        return { cameras: cameras.length };
    },

    /** Perfil e ajustes da IA definidos no painel (Configurações > IA facial e câmeras) */
    async ia_config({ perfil, ajustes = {} }) {
        vigilancia.config = { perfil, ajustes };
        const r = await aplicarConfigIa();
        return { perfil: r?.config?.perfil };
    },

    /** Status do motor (GPU, fps e IA por câmera) para a tela de configurações */
    async ia_status() {
        const res = await fetch(`${IA_URL}/api/engine/status`, { signal: AbortSignal.timeout(5000) })
            .catch(() => { throw new Error('Motor de IA local não está ligado'); });
        return res.json();
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
        const { stream_url, annotate, qualidade, fps, max_width, quality } = video.params;
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
                stream_url, annotate: String(annotate), qualidade, max_width: String(max_width), quality: String(quality), apos_seq: String(seq)
            });
            const res = await fetch(`${IA_URL}/api/camera/snapshot?${query}`, { signal: AbortSignal.timeout(5000) });
            if (res.status === 204) {
                await res.arrayBuffer().catch(() => {});
            } else {
                const jpeg = Buffer.from(await res.arrayBuffer());
                seq = parseInt(res.headers.get('x-frame-seq') || '-1', 10);
                const canal = canalVideo();
                emVoo++;
                canal.timeout(5000).emitWithAck('agent:video_quadro', { streamId, jpeg })
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
    const res = await fetch(`${IA_URL}${caminho}`, {
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

let buscandoDeteccoes = false;
setInterval(async () => {
    if (buscandoDeteccoes || !vigilancia.cameras || !socket.connected) return;
    buscandoDeteccoes = true;
    try {
        const res = await fetch(`${IA_URL}/api/vigilancia/deteccoes?desde=${vigilancia.desde}&max_idade_s=${DETECCAO_MAX_IDADE_S}`,
            { signal: AbortSignal.timeout(5000) });
        const { seq, inicio, deteccoes = [] } = await res.json();
        if (inicio !== undefined && inicio !== vigilancia.inicio) {
            // Motor reiniciou (ou primeira vez): a contagem recomeçou, e a configuração precisa ser reaplicada
            vigilancia.inicio = inicio;
            vigilancia.desde = 0;
            salvarEstado();
            aplicarConfigIa().catch(() => {});
            aplicarVigilancia().catch(() => {});
            return;
        }
        if (seq < vigilancia.desde) { vigilancia.desde = 0; salvarEstado(); return; } // motor antigo reiniciou
        for (const d of deteccoes) {
            if (Date.now() / 1000 - d.ts > DETECCAO_MAX_IDADE_S) { vigilancia.desde = d.seq; continue; }
            await socket.timeout(10000).emitWithAck('agent:deteccao', d);
            vigilancia.desde = d.seq;
            log('info', `vigilância: ${d.results.map(r => r.matched_person?.nome).join(', ')} (câmera ${d.camera_id}) → painel`);
        }
        if (deteccoes.length) salvarEstado();
    } catch {
        // motor desligado ou servidor sem resposta: tenta de novo no próximo segundo
    } finally {
        buscandoDeteccoes = false;
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
const canalVideo = () => (socketVideo.connected ? socketVideo : socket);
let avisouVideo = false;
socketVideo.on('connect', () => { avisouVideo = false; log('info', 'Canal de vídeo separado conectado'); });
socketVideo.on('connect_error', (err) => {
    if (!avisouVideo) log('warn', `Canal de vídeo separado indisponível (${err.message}); vídeo segue pela conexão principal`);
    avisouVideo = true;
});

socket.on('connect', () => {
    log('info', `Conectado a ${VPS_URL} como "${AGENT_NAME}"`);
    socket.emit('agent:ready', { name: AGENT_NAME, version: VERSAO, ts: new Date().toISOString() });
});
socket.on('disconnect', (motivo) => log('warn', `Desconectado (${motivo}). Tentando reconectar...`));
socket.on('connect_error', (err) => log('error', `Falha ao conectar: ${err.message}`));

socket.on('agent:command', async ({ requestId, command, payload }) => {
    const handler = handlers[command];
    if (!handler) {
        socket.emit('agent:response', { requestId, success: false, error: `Comando desconhecido: ${command}` });
        return;
    }
    const inicio = Date.now();
    try {
        const data = await handler(payload || {});
        socket.emit('agent:response', { requestId, success: true, data });
        // IA, imagens e renovação de vídeo chegam toda hora: só os erros vão para o log
        if (!['ia', 'http', 'video_iniciar', 'ia_status'].includes(command)) log('info',`${command} ${payload?.method || ''} ${payload?.config?.ip || ''}${(payload?.path || '').split('?')[0]} → ok (${Date.now() - inicio} ms)`);
    } catch (err) {
        socket.emit('agent:response', { requestId, success: false, error: err.message });
        log('error', `${command} ${payload?.config?.ip || payload?.path || ''} → ${err.message}`);
    }
});

const encerrar = () => { salvarEstado(); socket.disconnect(); socketVideo.disconnect(); process.exit(0); };
process.on('SIGINT', encerrar);
process.on('SIGTERM', encerrar);
