'use strict';

/**
 * Servidor de IA central A2 Eventos
 *
 * Roda num PC com placa de vídeo (casa/escritório), junto com o motor de IA
 * (backend/microservice-face-python). Conecta na nuvem SAINDO da rede (nenhuma porta aberta),
 * recebe rostos já recortados e alinhados dos PCs dos eventos e devolve quem é cada um.
 *
 * Biometria: a nuvem só entrega os cadastrados dos eventos que mandou este servidor atender, e o
 * motor os guarda na MEMÓRIA (nada em disco). Evento parado há DESCARREGAR_MS sai da memória.
 *
 * Variáveis (.env): VPS_URL, SERVIDOR_TOKEN, SERVIDOR_NOME, IA_URL (padrão http://127.0.0.1:8000)
 */
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { io } = require('socket.io-client');

const VERSAO = '1.0.0';
const VPS_URL = (process.env.VPS_URL || '').replace(/\/+$/, '');
const TOKEN = (process.env.SERVIDOR_TOKEN || '').trim();
const NOME = process.env.SERVIDOR_NOME || 'Servidor de IA';
const IA_URL = (process.env.IA_URL || 'http://127.0.0.1:8000').replace(/\/+$/, '');
const ARQ_CHAVE_IA = path.resolve(__dirname, '..', '..', 'microservice-face-python', '.chave-interna');
const SINCRONIZAR_MS = 60000;
const COMPLETO_MS = 15 * 60000;
const DESCARREGAR_MS = 3 * 3600000;

const log = (nivel, msg) => console.log(`[${new Date().toISOString()}] ${nivel.toUpperCase()} ${msg}`);

if (!VPS_URL || TOKEN.length < 32) {
    log('error', 'Defina VPS_URL e SERVIDOR_TOKEN no arquivo .env (veja .env.example).');
    process.exit(1);
}

// ------------------------------------------------------------------ motor de IA local
let chaveIa = null;
function cabecalhosIa() {
    if (!chaveIa) {
        chaveIa = (process.env.IA_CHAVE_INTERNA || '').trim() || null;
        if (!chaveIa) { try { chaveIa = fs.readFileSync(ARQ_CHAVE_IA, 'utf8').trim() || null; } catch { chaveIa = null; } }
    }
    return { 'Content-Type': 'application/json', ...(chaveIa ? { 'X-IA-Chave': chaveIa } : {}) };
}

async function motor(caminho, corpo, timeoutMs = 10000) {
    const opcoes = () => ({
        method: corpo ? 'POST' : 'GET', headers: cabecalhosIa(),
        ...(corpo ? { body: JSON.stringify(corpo) } : {}), signal: AbortSignal.timeout(timeoutMs)
    });
    let res = await fetch(`${IA_URL}${caminho}`, opcoes());
    if (res.status === 401) { chaveIa = null; res = await fetch(`${IA_URL}${caminho}`, opcoes()); }
    if (!res.ok) throw new Error(`motor respondeu HTTP ${res.status}`);
    return res.json();
}

// ------------------------------------------------------------------ eventos na memória
const eventos = new Map();    // evento_id → { desde, ultimoCompleto, uso }
const carregando = new Map(); // evento_id → Promise
let geracao = 0;              // muda a cada reconexão: carga antiga terminando depois é descartada

const pedirRostos = (pedido) => socket.timeout(30000).emitWithAck('servidor:rostos', pedido);

/**
 * Carga completa: lista de ids do evento e, em lotes de 200, o vetor de quem falta, até não faltar
 * ninguém (o motor informa no máximo 2.000 faltantes por vez). Só então o evento passa a responder:
 * antes disso a nuvem recebe "carregando" e o PC do evento reconhece sozinho.
 */
async function carregarCompleto(eventoId) {
    const minhaGeracao = geracao;
    const lista = await pedirRostos({ evento_id: eventoId, modo: 'ids' });
    if (!lista?.ok) throw new Error(lista?.erro || 'nuvem não entregou a lista do evento');
    for (let rodada = 0; rodada < 20; rodada++) {
        const r = await motor('/api/central/rostos', { evento_id: eventoId, completo: true, ids: lista.ids }, 30000);
        const faltando = r.faltando || [];
        if (!faltando.length) break;
        let recebidos = 0;
        for (let i = 0; i < faltando.length; i += 200) {
            const lote = await pedirRostos({ evento_id: eventoId, modo: 'pessoas', ids: faltando.slice(i, i + 200) });
            if (lote?.pessoas?.length) {
                await motor('/api/central/rostos', { evento_id: eventoId, pessoas: lote.pessoas }, 30000);
                recebidos += lote.pessoas.length;
            }
        }
        if (!recebidos) break; // a nuvem não tem o vetor de quem falta (biometria apagada no meio)
    }
    if (minhaGeracao !== geracao) return; // reconectou no meio: a nuvem não conta com este evento
    const atual = eventos.get(eventoId) || { uso: Date.now() };
    eventos.set(eventoId, { ...atual, desde: lista.ate, ultimoCompleto: Date.now() });
    log('info', `evento ${eventoId.slice(0, 8)}: ${lista.ids.length} pessoa(s) na memória do motor`);
}

function garantirEvento(eventoId) {
    if (eventos.has(eventoId)) return null;
    if (!carregando.has(eventoId)) {
        const p = carregarCompleto(eventoId)
            .catch(err => log('warn', `evento ${eventoId.slice(0, 8)}: ${err.message}`))
            .finally(() => carregando.delete(eventoId));
        carregando.set(eventoId, p);
    }
    return carregando.get(eventoId);
}

async function atualizarEvento(eventoId, ev) {
    if (Date.now() - ev.ultimoCompleto > COMPLETO_MS || !ev.desde) return carregarCompleto(eventoId);
    for (let pagina = 0; pagina < 20; pagina++) {
        const lote = await pedirRostos({ evento_id: eventoId, modo: 'desde', desde: ev.desde });
        if (!lote?.ok) return;
        if (lote.pessoas?.length) await motor('/api/central/rostos', { evento_id: eventoId, pessoas: lote.pessoas }, 30000);
        ev.desde = lote.ate || ev.desde;
        if (!lote.mais) return;
    }
}

let manutencao = false;
setInterval(async () => {
    if (manutencao || !socket.connected) return;
    manutencao = true;
    try {
        for (const [eventoId, ev] of [...eventos]) {
            if (Date.now() - ev.uso > DESCARREGAR_MS) {
                eventos.delete(eventoId);
                await motor('/api/central/descarregar', { evento_id: eventoId }).catch(() => {});
                socket.emit('servidor:descarregou', { evento_id: eventoId });
                log('info', `evento ${eventoId.slice(0, 8)} parado: cadastrados retirados da memória`);
                continue;
            }
            await atualizarEvento(eventoId, ev).catch(err => log('warn', `evento ${eventoId.slice(0, 8)}: ${err.message}`));
        }
    } finally {
        manutencao = false;
    }
}, SINCRONIZAR_MS);

// ------------------------------------------------------------------ conexão com a nuvem
const socket = io(`${VPS_URL}/ia-servidor`, {
    auth: { token: TOKEN },
    transports: ['websocket'],
    reconnection: true, reconnectionDelay: 3000, reconnectionDelayMax: 15000, reconnectionAttempts: Infinity
});

socket.on('connect', async () => {
    log('info', `Conectado a ${VPS_URL} como "${NOME}"`);
    geracao++;
    // A nuvem perdeu a lista de eventos atribuídos ao reconectar: recomeça do zero
    for (const eventoId of eventos.keys()) await motor('/api/central/descarregar', { evento_id: eventoId }).catch(() => {});
    eventos.clear();
    let hardware = null;
    try { hardware = (await motor('/api/central/status')).hardware; } catch { hardware = 'motor desligado'; }
    socket.emit('servidor:pronto', { nome: NOME, versao: VERSAO, hardware });
});
socket.on('disconnect', (motivo) => log('warn', `Desconectado (${motivo}). Tentando reconectar...`));
socket.on('connect_error', (err) => log('error', `Falha ao conectar: ${err.message}`));

/** Evento voltou a reconhecer no PC do evento: tira os cadastrados dele da memória */
socket.on('ia_descarregar', async ({ evento_id: eventoId } = {}) => {
    if (!eventoId) return;
    eventos.delete(eventoId);
    await motor('/api/central/descarregar', { evento_id: eventoId }).catch(() => {});
    log('info', `evento ${eventoId.slice(0, 8)}: dispensado pela nuvem, cadastrados retirados da memória`);
});

/** Rostos alinhados de um evento → quem é cada um */
socket.on('ia_reconhecer', async ({ evento_id: eventoId, itens } = {}, ack) => {
    if (typeof ack !== 'function') return;
    if (!eventoId || !Array.isArray(itens)) return ack({ resultados: [] });
    if (garantirEvento(eventoId)) return ack({ carregando: true }); // primeiro pedido: carregando os cadastrados
    const ev = eventos.get(eventoId);
    if (ev) ev.uso = Date.now();
    try {
        const r = await motor('/api/central/reconhecer', { evento_id: eventoId, itens }, 1800);
        if (r?.carregado === false) { // motor reiniciou e perdeu a memória
            eventos.delete(eventoId);
            garantirEvento(eventoId);
            return ack({ carregando: true });
        }
        ack({ resultados: r?.resultados || [] });
    } catch (err) {
        log('warn', `reconhecimento falhou: ${err.message}`);
        ack({ erro: 'motor indisponível' });
    }
});

const encerrar = () => { socket.disconnect(); process.exit(0); };
process.on('SIGINT', encerrar);
process.on('SIGTERM', encerrar);
process.on('unhandledRejection', (m) => log('error', `promessa rejeitada sem tratamento: ${m?.stack || m}`));
