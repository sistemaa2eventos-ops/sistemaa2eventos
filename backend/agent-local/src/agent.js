'use strict';

/**
 * Agente local A2 Eventos
 *
 * Roda num computador da rede do evento e mantém uma conexão de saída com o
 * servidor na nuvem. O servidor envia chamadas CGI para os leitores faciais
 * (cadastro de faces, configuração, relógio, abertura de porta, snapshot) e o
 * agente as executa na rede local, devolvendo a resposta.
 *
 * Variáveis (.env): VPS_URL, AGENT_TOKEN, AGENT_NAME
 */
require('dotenv').config();
const { io } = require('socket.io-client');

const VPS_URL = (process.env.VPS_URL || '').replace(/\/+$/, '');
const AGENT_TOKEN = process.env.AGENT_TOKEN;
const AGENT_NAME = process.env.AGENT_NAME || 'Agente Local';
const VERSAO = '2.0.0';

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
    }
};

// Namespace /agent do Socket.IO (o caminho HTTP continua o padrão /socket.io)
const socket = io(`${VPS_URL}/agent`, {
    auth: { token: AGENT_TOKEN },
    transports: ['websocket'],
    reconnection: true,
    reconnectionDelay: 3000,
    reconnectionDelayMax: 15000,
    reconnectionAttempts: Infinity
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
        log('info', `${command} ${payload?.method || ''} ${payload?.config?.ip || ''}${(payload?.path || '').split('?')[0]} → ok (${Date.now() - inicio} ms)`);
    } catch (err) {
        socket.emit('agent:response', { requestId, success: false, error: err.message });
        log('error', `${command} ${payload?.config?.ip || ''} → ${err.message}`);
    }
});

process.on('SIGINT', () => { socket.disconnect(); process.exit(0); });
process.on('SIGTERM', () => { socket.disconnect(); process.exit(0); });
