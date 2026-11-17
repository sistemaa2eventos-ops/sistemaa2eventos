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
const { spawn, execFile } = require('child_process');
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
    // Queda curta (segundos) NÃO apaga a memória dos eventos: recarregar todos os cadastrados levava
    // minutos e o evento caía no reconhecimento local. A nuvem re-autoriza cada evento no próximo pedido
    // (servidor:rostos aceita de novo) e a vigilância é reenviada pela API a cada 20 s.
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

// ------------------------------------------------------------------ vigilância direta (evento "servidor central")
// A nuvem manda as câmeras RTSP do evento (alcançáveis por VPN); o motor deste PC as analisa com o
// cadastro do evento e as detecções voltam para a nuvem pelo socket. Eventos independentes: cada um
// tem as próprias câmeras e o próprio cadastro (ver /api/central/rostos).
const vigiando = new Map();   // evento_id → [cameras]
let vigilanciaSeq = 0;        // última detecção entregue à nuvem
let vigilanciaInicio = null;  // identifica a execução do motor (muda se ele reiniciar)

async function aplicarVigilancia(eventoId, cameras) {
    await motor('/api/vigilancia', { cameras, evento_id: eventoId }, 15000);
}

async function pararVigilancia(eventoId) {
    vigiando.delete(eventoId);
    await aplicarVigilancia(eventoId, []).catch(() => {}); // lista vazia: só as câmeras deste evento saem
    log('info', `evento ${eventoId.slice(0, 8)}: vigilância direta parada`);
}

// ------------------------------------------------------------------ motor de IA: ligar e desligar pelo painel
// O processo deste servidor é sempre mantido pelo vigia (ligar-servidor-ia.bat, em segundo plano).
// O painel liga e desliga só o MOTOR, que sobe escondido e não depende de janela aberta.
const DIR_MOTOR = path.resolve(__dirname, '..', '..', 'microservice-face-python');
const ARQ_MOTOR_DESLIGADO = path.join(DIR_MOTOR, '.motor-desligado'); // o vigia respeita este sinal
const DIR_LOGS_MOTOR = path.resolve(__dirname, '..', '..', '..', 'logs', 'servidor-ia');
const PORTA_MOTOR = 8000;
let motorIniciando = false;

const motorDesligadoPeloPainel = () => fs.existsSync(ARQ_MOTOR_DESLIGADO);

function pythonDoMotor() {
    for (const p of [path.join(DIR_MOTOR, 'venv-ia', 'Scripts', 'python.exe'), path.join(DIR_MOTOR, 'venv', 'Scripts', 'python.exe')]) {
        if (fs.existsSync(p)) return p;
    }
    return null;
}

async function saudeDoMotor() {
    try {
        const r = await fetch(`${IA_URL}/health`, { signal: AbortSignal.timeout(4000) });
        return r.ok ? await r.json() : null;
    } catch {
        return null;
    }
}

function pidNaPorta(porta) {
    return new Promise((resolve) => {
        const cmd = `(Get-NetTCPConnection -LocalPort ${porta} -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1).OwningProcess`;
        execFile('powershell.exe', ['-NoProfile', '-Command', cmd], { windowsHide: true }, (err, out) => {
            resolve(Number(String(out || '').trim()) || null);
        });
    });
}

function matarArvore(pid) {
    return new Promise((resolve) => execFile('taskkill', ['/PID', String(pid), '/F', '/T'], { windowsHide: true }, () => resolve()));
}

/** Sobe o motor escondido, sem janela, em processo independente (sobrevive ao reinício deste servidor). */
async function ligarMotor() {
    fs.rmSync(ARQ_MOTOR_DESLIGADO, { force: true });
    if (await saudeDoMotor()) return 'ja_ligado';
    if (motorIniciando) return 'iniciando';
    const py = pythonDoMotor();
    if (!py) { log('error', 'Motor de IA: Python da IA não encontrado (venv-ia)'); return 'sem_python'; }
    motorIniciando = true;
    fs.mkdirSync(DIR_LOGS_MOTOR, { recursive: true });
    const carimbo = new Date().toISOString().replace(/[:.]/g, '-');
    const saida = fs.openSync(path.join(DIR_LOGS_MOTOR, `motor-${carimbo}.log`), 'a');
    const erros = fs.openSync(path.join(DIR_LOGS_MOTOR, `motor-${carimbo}-erros.log`), 'a');
    const env = { ...process.env, PYTHONUNBUFFERED: '1', PYTHONIOENCODING: 'utf-8' };
    // Sem chave do banco: no servidor central os cadastrados chegam pela nuvem, só na memória
    delete env.SUPABASE_SERVICE_ROLE_KEY; delete env.SUPABASE_URL; delete env.PYTHONPATH;
    const filho = spawn(py, ['-I', 'src\\main.py'], {
        cwd: DIR_MOTOR, env, detached: true, windowsHide: true, stdio: ['ignore', saida, erros]
    });
    filho.unref();
    log('info', 'Motor de IA: iniciando (o modelo leva de 1 a 2 min para carregar)');
    for (let i = 0; i < 60; i++) {
        await new Promise((r) => setTimeout(r, 3000));
        if (await saudeDoMotor()) {
            motorIniciando = false;
            log('info', 'Motor de IA: LIGADO');
            return 'ligado';
        }
    }
    motorIniciando = false;
    log('error', 'Motor de IA não respondeu em 180 s (veja logs/servidor-ia)');
    return 'falhou';
}

/** Desliga o motor e marca o sinal para o vigia não religá-lo */
async function desligarMotor() {
    fs.writeFileSync(ARQ_MOTOR_DESLIGADO, new Date().toISOString());
    const pid = await pidNaPorta(PORTA_MOTOR);
    if (pid) await matarArvore(pid);
    log('info', pid ? `Motor de IA desligado pelo painel (PID ${pid})` : 'Motor de IA já estava desligado');
    return pid ? 'desligado' : 'ja_desligado';
}

/** Comando do painel: { acao: 'ligar' | 'parar' }. Responde na hora; o estado real vem no servidor:estado. */
socket.on('ia_motor', (pedido = {}, ack) => {
    if (typeof ack !== 'function') return;
    if (pedido.acao === 'ligar') {
        ligarMotor().catch((err) => log('error', `Motor de IA: ${err.message}`));
        return ack({ ok: true, estado: 'iniciando' });
    }
    if (pedido.acao === 'parar') {
        desligarMotor()
            .then((estado) => ack({ ok: true, estado }))
            .catch((err) => ack({ ok: false, erro: err.message }));
        return;
    }
    ack({ ok: false, erro: 'ação inválida' });
});

/** Estado do motor a cada 30 s para o painel */
setInterval(async () => {
    if (!socket.connected) return;
    const s = await saudeDoMotor();
    socket.emit('servidor:estado', {
        motor_ligado: !!s,
        desligado_pelo_painel: motorDesligadoPeloPainel(),
        iniciando: motorIniciando,
        engine: s?.engine || null,
        perfil: s?.perfil || null,
        providers: Array.isArray(s?.providers) ? s.providers.slice(0, 4) : [],
        cameras_em_uso: s?.cameras_em_uso ?? null
    });
}, 30000);

socket.on('ia_vigilancia', async ({ evento_id: eventoId, cameras } = {}, ack) => {
    if (typeof ack !== 'function') return;
    if (!eventoId || !Array.isArray(cameras)) return ack({ ok: false, erro: 'pedido inválido' });
    try {
        await aplicarVigilancia(eventoId, cameras);
        vigiando.set(eventoId, cameras);
        log('info', `evento ${eventoId.slice(0, 8)}: ${cameras.length} câmera(s) na vigilância direta`);
        ack({ ok: true, cameras: cameras.length });
    } catch (err) {
        log('warn', `vigilância do evento ${eventoId.slice(0, 8)}: ${err.message}`);
        ack({ ok: false, erro: 'motor indisponível' });
    }
});

socket.on('ia_vigilancia_parar', ({ evento_id: eventoId } = {}) => {
    if (eventoId) pararVigilancia(eventoId);
});

// Detecções do motor → nuvem, na ordem; só avança quando a nuvem confirma (nada se perde na queda)
let entregandoDeteccoes = false;
setInterval(async () => {
    if (entregandoDeteccoes || !socket.connected || !vigiando.size) return;
    entregandoDeteccoes = true;
    try {
        const res = await motor(`/api/vigilancia/deteccoes?desde=${vigilanciaSeq}&max_idade_s=60`, null, 5000);
        if (res.inicio !== undefined && res.inicio !== vigilanciaInicio) {
            // Motor reiniciou (ou primeira vez): a configuração das câmeras se perdeu, reenvia tudo
            vigilanciaInicio = res.inicio;
            vigilanciaSeq = 0;
            for (const [eventoId, cameras] of vigiando) await aplicarVigilancia(eventoId, cameras).catch(() => {});
            return;
        }
        if (res.seq < vigilanciaSeq) { vigilanciaSeq = 0; return; }
        for (const d of res.deteccoes || []) {
            if (!vigiando.has(d.evento_id)) { vigilanciaSeq = d.seq; continue; }
            await socket.timeout(10000).emitWithAck('servidor:deteccao', d);
            vigilanciaSeq = d.seq;
        }
    } catch {
        // motor ou nuvem fora: tenta de novo no próximo ciclo
    } finally {
        entregandoDeteccoes = false;
    }
}, 1000);

const encerrar = () => { socket.disconnect(); process.exit(0); };
process.on('SIGINT', encerrar);
process.on('SIGTERM', encerrar);
process.on('unhandledRejection', (m) => log('error', `promessa rejeitada sem tratamento: ${m?.stack || m}`));
