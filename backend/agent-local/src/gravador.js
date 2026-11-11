'use strict';

/**
 * Gravação das câmeras NO PC do evento (o vídeo não sai da rede do evento).
 *
 *  - Contínua: blocos de 5 min em <pasta>/continua/<câmera>/AAAA-MM-DD_HH-MM-SS.mp4
 *  - Em alertas: o PC mantém um buffer de blocos de 10 s e, quando chega um alerta (IA ou leitor),
 *    junta de 10 s antes a 30 s depois em <pasta>/alertas/<câmera>/…_alerta.mp4 (alertas seguidos
 *    estendem o mesmo trecho até 3 min). O buffer é apagado sozinho após 60 s.
 *
 * Cópia direta do vídeo (-c copy, sem recodificar: pouca CPU) a partir do retransmissor local
 * (go2rtc), sem áudio. MP4 fragmentado: queda de energia no meio de um bloco não perde o bloco.
 * Pasta só para o usuário do Windows que roda o agente (e administradores). Limite de espaço e prazo
 * de guarda apagam os mais antigos primeiro (contínuas antes dos alertas).
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn, execFile } = require('child_process');
const video = require('./video');

const PASTA = path.resolve(process.env.GRAVACOES_DIR || path.join(os.homedir(), 'NZT-Gravacoes'));
const ARQ_REPORTADOS = path.join(__dirname, '..', '.gravacoes-reportadas.json');
const BLOCO_CONTINUO_S = 300;
const BLOCO_BUFFER_S = 10;
const ANTES_MS = 10000;
const DEPOIS_MS = 30000;
const TRECHO_MAX_MS = 180000;
const LIVRE_MINIMO = 2 * 1024 ** 3; // sempre deixa 2 GB livres no disco

let log = (nivel, msg) => console.log(`[${new Date().toISOString()}] ${nivel.toUpperCase()} ${msg}`);
let reportar = async () => {};

const cfg = { recebida: false, ativa: false, limite_gb: 40, retencao_dias: 30, cameras: [] };
const processos = new Map();   // camera_id → { proc, modo, stream, desde, erro, falhas, parar, timer }
const pendentes = new Map();   // camera_id → { inicio, fim, descricoes: [] }
const nomes = new Map();       // camera_id → nome
let reportados = new Set();

const dois = (n) => String(n).padStart(2, '0');
const carimbo = (d) => `${d.getFullYear()}-${dois(d.getMonth() + 1)}-${dois(d.getDate())}_${dois(d.getHours())}-${dois(d.getMinutes())}-${dois(d.getSeconds())}`;
const idSeguro = (id) => String(id).replace(/[^a-zA-Z0-9-]/g, '');

/** "2026-11-11_14-05-00.mp4" ou "20261111-140500.mp4" → Date (hora local) */
function inicioDoNome(nome) {
    let m = nome.match(/^(\d{4})-(\d{2})-(\d{2})_(\d{2})-(\d{2})-(\d{2})/);
    if (!m) m = nome.match(/^(\d{4})(\d{2})(\d{2})-(\d{2})(\d{2})(\d{2})/);
    if (!m) return null;
    return new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6]);
}

function protegerPasta(dir) {
    if (process.platform !== 'win32') { try { fs.chmodSync(dir, 0o700); } catch { /* ignora */ } return; }
    const usuario = `${process.env.USERDOMAIN || os.hostname()}\\${process.env.USERNAME || os.userInfo().username}`;
    // Sem herança: só este usuário, o SYSTEM e os administradores (SIDs fixos, independem do idioma)
    execFile('icacls', [dir, '/inheritance:r', '/grant:r', `${usuario}:(OI)(CI)F`, '*S-1-5-18:(OI)(CI)F', '*S-1-5-32-544:(OI)(CI)F'],
        { windowsHide: true }, (err) => { if (err) log('warn', `não foi possível restringir o acesso à pasta de gravações: ${err.message}`); });
}

function garantirPasta() {
    const nova = !fs.existsSync(PASTA);
    fs.mkdirSync(PASTA, { recursive: true });
    if (nova) {
        protegerPasta(PASTA);
        log('info', `Pasta de gravações criada e protegida: ${PASTA}`);
    }
}

function lerReportados() {
    try { reportados = new Set(JSON.parse(fs.readFileSync(ARQ_REPORTADOS, 'utf8'))); } catch { reportados = new Set(); }
}
function salvarReportados() {
    try { fs.writeFileSync(ARQ_REPORTADOS, JSON.stringify([...reportados])); } catch { /* ignora */ }
}

// ------------------------------------------------------------------ processos ffmpeg
function argumentos(url, modo, dir) {
    const bloco = modo === 'continua' ? BLOCO_CONTINUO_S : BLOCO_BUFFER_S;
    const padrao = modo === 'continua' ? '%Y-%m-%d_%H-%M-%S.mp4' : '%Y%m%d-%H%M%S.mp4';
    return [
        '-hide_banner', '-loglevel', 'error', '-nostdin',
        '-rtsp_transport', 'tcp', '-timeout', '10000000',
        '-i', url,
        '-map', '0:v:0', '-c:v', 'copy', '-an',
        '-f', 'segment', '-segment_time', String(bloco), '-segment_atclocktime', '1',
        '-reset_timestamps', '1', '-strftime', '1', '-segment_format', 'mp4',
        '-segment_format_options', 'movflags=+frag_keyframe+empty_moov+default_base_moof',
        path.join(dir, padrao)
    ];
}

function pastaDe(modo, cameraId) {
    return path.join(PASTA, modo === 'continua' ? 'continua' : 'buffer', idSeguro(cameraId));
}

function iniciarCamera(cam) {
    const id = String(cam.id);
    const url = video.urlRtspLocal(id, cam.gravacao_stream === 'principal' ? 'foco' : 'mini');
    const atual = processos.get(id) || { falhas: 0 };
    if (!url) {
        atual.erro = 'Câmera fora do retransmissor local (webcam/OBS não grava)';
        processos.set(id, atual);
        return;
    }
    const dir = pastaDe(cam.gravacao_modo, id);
    fs.mkdirSync(dir, { recursive: true });
    const proc = spawn(video.caminhoFfmpeg(), argumentos(url, cam.gravacao_modo, dir), { stdio: ['ignore', 'ignore', 'pipe'], windowsHide: true });
    const reg = { ...atual, proc, modo: cam.gravacao_modo, stream: cam.gravacao_stream, desde: Date.now(), erro: null, parar: false };
    processos.set(id, reg);
    let ultimoErro = '';
    proc.stderr.on('data', (d) => { ultimoErro = d.toString().replace(/(\/\/[^:/@\s]+:)[^@/\s]*@/g, '$1***@').trim().slice(-300); });
    proc.on('exit', (codigo) => {
        if (processos.get(id) !== reg) return;
        reg.proc = null;
        if (reg.parar) return;
        reg.falhas = (reg.falhas || 0) + 1;
        reg.erro = ultimoErro || `gravador saiu (código ${codigo})`;
        const espera = Math.min(60000, 5000 * reg.falhas);
        if (reg.falhas === 1 || reg.falhas % 10 === 0) log('warn', `gravação ${nomes.get(id) || id}: ${reg.erro}; nova tentativa em ${espera / 1000} s`);
        reg.timer = setTimeout(() => {
            const c = cfg.cameras.find(x => String(x.id) === id);
            if (c && cfg.ativa && processos.get(id) === reg) iniciarCamera(c);
        }, espera);
    });
    // Rodando por 2 min sem cair: zera a contagem de falhas
    setTimeout(() => { if (reg.proc === proc) reg.falhas = 0; }, 120000);
}

function pararCamera(id) {
    const reg = processos.get(id);
    if (!reg) return;
    reg.parar = true;
    clearTimeout(reg.timer);
    if (reg.proc) reg.proc.kill();
    processos.delete(id);
}

/**
 * Configuração vinda do painel: { ativa, limite_gb, retencao_dias, cameras: [{ id, nome, gravacao_modo, gravacao_stream }] }
 */
function configurar(nova = {}) {
    cfg.recebida = true;
    cfg.ativa = nova.ativa !== false;
    cfg.limite_gb = Math.max(2, Number(nova.limite_gb) || 40);
    cfg.retencao_dias = Math.max(1, Number(nova.retencao_dias) || 30);
    cfg.cameras = (nova.cameras || []).filter(c => c?.id && ['continua', 'alertas'].includes(c.gravacao_modo));
    for (const c of nova.cameras || []) if (c?.id) nomes.set(String(c.id), c.nome || String(c.id));

    const querem = new Map(cfg.ativa && video.temFfmpeg() ? cfg.cameras.map(c => [String(c.id), c]) : []);
    for (const id of [...processos.keys()]) {
        const c = querem.get(id);
        const reg = processos.get(id);
        if (!c || reg.modo !== c.gravacao_modo || reg.stream !== c.gravacao_stream) pararCamera(id);
    }
    if (querem.size) garantirPasta();
    for (const [id, c] of querem) if (!processos.has(id)) iniciarCamera(c);
    if (cfg.cameras.length && !video.temFfmpeg()) log('warn', 'Há câmeras para gravar, mas o ffmpeg não está instalado neste PC (rode ligar-ia-facial.bat).');
}

// ------------------------------------------------------------------ alertas
/** Alerta numa câmera em modo "alertas": guarda de 10 s antes a 30 s depois */
function marcar(cameraId, descricao = 'Alerta') {
    const id = String(cameraId);
    const c = cfg.cameras.find(x => String(x.id) === id);
    if (!c || c.gravacao_modo !== 'alertas' || !processos.get(id)?.proc) return false;
    const agora = Date.now();
    const p = pendentes.get(id);
    if (p && agora <= p.fim) {
        p.fim = Math.min(agora + DEPOIS_MS, p.inicio + TRECHO_MAX_MS);
        if (p.descricoes.length < 10) p.descricoes.push(descricao);
    } else {
        pendentes.set(id, { inicio: agora - ANTES_MS, fim: agora + DEPOIS_MS, descricoes: [descricao] });
    }
    return true;
}

function listarMp4(dir) {
    try {
        return fs.readdirSync(dir).filter(n => n.endsWith('.mp4')).sort()
            .map(n => ({ nome: n, caminho: path.join(dir, n), inicio: inicioDoNome(n) }))
            .filter(a => a.inicio);
    } catch {
        return [];
    }
}

function juntar(arquivos, destino) {
    return new Promise((resolve, reject) => {
        const lista = `${destino}.txt`;
        fs.writeFileSync(lista, arquivos.map(a => `file '${a.caminho.replace(/\\/g, '/').replace(/'/g, "'\\''")}'`).join('\n'));
        const proc = spawn(video.caminhoFfmpeg(), ['-hide_banner', '-loglevel', 'error', '-nostdin', '-f', 'concat', '-safe', '0',
            '-i', lista, '-c', 'copy', '-movflags', '+faststart', '-y', destino], { stdio: ['ignore', 'ignore', 'pipe'], windowsHide: true });
        let erro = '';
        proc.stderr.on('data', d => { erro += d.toString(); });
        proc.on('exit', (codigo) => {
            fs.rm(lista, { force: true }, () => {});
            if (codigo === 0) resolve();
            else reject(new Error(erro.trim().slice(-300) || `ffmpeg saiu com código ${codigo}`));
        });
    });
}

async function fecharTrechos() {
    const agora = Date.now();
    for (const [id, p] of [...pendentes]) {
        if (agora < p.fim + BLOCO_BUFFER_S * 1000 + 2000) continue;
        pendentes.delete(id);
        const blocos = listarMp4(pastaDe('alertas', id))
            .filter(a => a.inicio.getTime() >= p.inicio - BLOCO_BUFFER_S * 1000 && a.inicio.getTime() <= p.fim);
        if (!blocos.length) { log('warn', `alerta na câmera ${nomes.get(id) || id} sem vídeo no buffer`); continue; }
        const inicio = new Date(p.inicio);
        const dir = path.join(PASTA, 'alertas', idSeguro(id));
        fs.mkdirSync(dir, { recursive: true });
        const destino = path.join(dir, `${carimbo(inicio)}_alerta.mp4`);
        try {
            await juntar(blocos, destino);
            const rel = path.relative(PASTA, destino);
            const tamanho = fs.statSync(destino).size;
            await enviarRegistro({
                camera_id: id, arquivo: rel, motivo: 'alerta', alerta_descricao: [...new Set(p.descricoes)].join(' · ').slice(0, 500),
                inicio: inicio.toISOString(), fim: new Date(p.fim).toISOString(), tamanho_bytes: tamanho
            });
            log('info', `trecho de alerta gravado: ${nomes.get(id) || id} (${Math.round(tamanho / 1024)} KB)`);
        } catch (err) {
            log('error', `não foi possível montar o trecho de alerta da câmera ${nomes.get(id) || id}: ${err.message}`);
        }
    }
    // Buffer: apaga o que tem mais de 60 s e não pertence a um trecho em aberto
    for (const id of processos.keys()) {
        if (processos.get(id).modo !== 'alertas') continue;
        const p = pendentes.get(id);
        for (const a of listarMp4(pastaDe('alertas', id))) {
            const t = a.inicio.getTime();
            if (t > agora - 60000) continue;
            if (p && t >= p.inicio - BLOCO_BUFFER_S * 1000) continue;
            fs.rm(a.caminho, { force: true }, () => {});
        }
    }
}

// ------------------------------------------------------------------ registro na nuvem
async function enviarRegistro(dados) {
    try {
        await reportar('agent:gravacao', dados);
        reportados.add(dados.arquivo);
        salvarReportados();
        filaReenvio.delete(dados.arquivo);
        return true;
    } catch {
        // Sem internet ou erro do servidor: blocos contínuos a varredura reencontra sozinha; trechos
        // de alerta (montados uma vez só) ficam na fila, um por arquivo
        if (dados.motivo === 'alerta') filaReenvio.set(dados.arquivo, dados);
        return false;
    }
}
const filaReenvio = new Map(); // arquivo → registro de alerta ainda não aceito pelo servidor
let varrendo = false;

async function varrerContinuas() {
    if (varrendo) return;
    varrendo = true;
    try {
        await varrerContinuasAgora();
    } finally {
        varrendo = false;
    }
}

async function varrerContinuasAgora() {
    for (const f of [...filaReenvio.values()]) if (!(await enviarRegistro(f))) return; // ainda sem conexão
    const base = path.join(PASTA, 'continua');
    let cams = [];
    try { cams = fs.readdirSync(base); } catch { return; }
    for (const camDir of cams) {
        const arquivos = listarMp4(path.join(base, camDir));
        const gravando = [...processos.entries()].some(([id, r]) => idSeguro(id) === camDir && r.proc && r.modo === 'continua');
        const prontos = gravando ? arquivos.slice(0, -1) : arquivos;
        for (const a of prontos) {
            const rel = path.relative(PASTA, a.caminho);
            if (reportados.has(rel)) continue;
            let st;
            try { st = fs.statSync(a.caminho); } catch { continue; }
            if (st.size < 1024) { fs.rm(a.caminho, { force: true }, () => {}); continue; } // bloco vazio (câmera caiu)
            const id = [...nomes.keys()].find(k => idSeguro(k) === camDir) || camDir;
            const ok = await enviarRegistro({
                camera_id: id, arquivo: rel, motivo: 'continua',
                inicio: a.inicio.toISOString(), fim: st.mtime.toISOString(), tamanho_bytes: st.size
            });
            if (!ok) return; // sem conexão: tenta tudo de novo na próxima varredura
        }
    }
}

// ------------------------------------------------------------------ espaço e prazo
function todosArquivos() {
    const lista = [];
    for (const tipo of ['continua', 'alertas']) {
        const base = path.join(PASTA, tipo);
        let cams = [];
        try { cams = fs.readdirSync(base); } catch { continue; }
        for (const c of cams) {
            for (const a of listarMp4(path.join(base, c))) {
                try {
                    const st = fs.statSync(a.caminho);
                    lista.push({ ...a, tipo, tamanho: st.size, mtime: st.mtimeMs, rel: path.relative(PASTA, a.caminho) });
                } catch { /* apagado */ }
            }
        }
    }
    return lista;
}

function espacoLivre() {
    try {
        const s = fs.statfsSync(PASTA);
        return s.bavail * s.bsize;
    } catch {
        return null;
    }
}

async function limpar() {
    // Sem a configuração do painel (PC religado sem internet e sem cópia em disco), o limite seria o
    // padrão de 40 GB e apagaria gravações de um evento configurado para mais: não limpa
    if (!cfg.recebida || !fs.existsSync(PASTA)) return;
    const arquivos = todosArquivos();
    const apagar = [];
    const limiteIdade = Date.now() - cfg.retencao_dias * 86400000;
    const emUso = new Set([...processos.entries()].filter(([, r]) => r.proc && r.modo === 'continua').map(([id]) => idSeguro(id)));
    const restantes = [];
    for (const a of arquivos) {
        if (a.mtime < limiteIdade) apagar.push(a);
        else restantes.push(a);
    }
    // Limite de espaço (e 2 GB livres no disco): contínuas mais antigas primeiro, depois alertas
    let total = restantes.reduce((s, a) => s + a.tamanho, 0);
    const limite = cfg.limite_gb * 1024 ** 3;
    let livre = espacoLivre();
    restantes.sort((a, b) => (a.tipo === b.tipo ? a.mtime - b.mtime : a.tipo === 'continua' ? -1 : 1));
    for (const a of restantes) {
        if (total <= limite && (livre === null || livre >= LIVRE_MINIMO)) break;
        if (a.tipo === 'continua' && emUso.has(path.basename(path.dirname(a.caminho))) && Date.now() - a.mtime < 15000) continue; // bloco sendo gravado
        apagar.push(a);
        total -= a.tamanho;
        if (livre !== null) livre += a.tamanho;
    }
    if (!apagar.length) return;
    for (const a of apagar) {
        try { fs.rmSync(a.caminho, { force: true }); } catch { /* em uso */ }
        reportados.delete(a.rel);
    }
    salvarReportados();
    log('info', `gravações: ${apagar.length} arquivo(s) antigo(s) apagado(s) (prazo de ${cfg.retencao_dias} dias / limite de ${cfg.limite_gb} GB)`);
    try { await reportar('agent:gravacao_apagadas', { arquivos: apagar.map(a => a.rel) }); } catch { /* reenvia na próxima limpeza */ }
}

// ------------------------------------------------------------------ leitura (painel assistindo/baixando)
const LEITURA_MAX = 768 * 1024;

/** Pedaço de um arquivo de gravação: { total, base64 }. Só arquivos .mp4 dentro da pasta. */
function ler({ arquivo, inicio = 0, tamanho = LEITURA_MAX }) {
    const alvo = path.resolve(PASTA, String(arquivo || ''));
    if (!alvo.startsWith(PASTA + path.sep) || !alvo.toLowerCase().endsWith('.mp4')) throw new Error('Arquivo de gravação inválido');
    if (!fs.existsSync(alvo)) throw new Error('Gravação não existe mais neste PC (apagada pelo prazo ou limite de espaço)');
    const total = fs.statSync(alvo).size;
    const de = Math.max(0, Math.min(Number(inicio) || 0, total));
    const qtd = Math.max(0, Math.min(Number(tamanho) || LEITURA_MAX, LEITURA_MAX, total - de));
    const buf = Buffer.alloc(qtd);
    const fd = fs.openSync(alvo, 'r');
    try { fs.readSync(fd, buf, 0, qtd, de); } finally { fs.closeSync(fd); }
    return { total, inicio: de, base64: buf.toString('base64') };
}

function status() {
    let usado = 0;
    try { usado = todosArquivos().reduce((s, a) => s + a.tamanho, 0); } catch { /* sem pasta */ }
    return {
        pasta: PASTA,
        ativa: cfg.ativa,
        ffmpeg: video.temFfmpeg(),
        limite_gb: cfg.limite_gb,
        retencao_dias: cfg.retencao_dias,
        usado_bytes: usado,
        livre_bytes: espacoLivre(),
        cameras: cfg.cameras.map(c => {
            const r = processos.get(String(c.id));
            return { id: c.id, modo: c.gravacao_modo, gravando: !!r?.proc, desde: r?.proc ? new Date(r.desde).toISOString() : null, erro: r?.erro || null };
        })
    };
}

function iniciar({ logger, reportador }) {
    if (logger) log = logger;
    if (reportador) reportar = reportador;
    video.encerrarOrfaos('ffmpeg.exe', PASTA);
    lerReportados();
    setInterval(() => { fecharTrechos().catch(e => log('error', `trechos de alerta: ${e.message}`)); }, 3000).unref();
    setInterval(() => { varrerContinuas().catch(e => log('error', `registro de gravações: ${e.message}`)); }, 30000).unref();
    setInterval(() => { limpar().catch(e => log('error', `limpeza de gravações: ${e.message}`)); }, 10 * 60000).unref();
    setTimeout(() => { limpar().catch(() => {}); }, 60000).unref();
}

function pararTudo() {
    for (const id of [...processos.keys()]) pararCamera(id);
}

module.exports = { iniciar, configurar, marcar, ler, status, pararTudo, PASTA };
