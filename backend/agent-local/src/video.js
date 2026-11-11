'use strict';

/**
 * Retransmissor de vídeo local (go2rtc) — vídeo das câmeras SEM depender do motor de IA.
 *
 * O go2rtc recebe o RTSP de cada câmera e redistribui sem recodificar (H.264/H.265 copiado):
 *  - para o painel: MP4 fragmentado (stream.mp4) e, como reserva, MJPEG (stream.mjpeg, usa ffmpeg);
 *  - para o motor de IA e o gravador: RTSP local em 127.0.0.1:8555 (a câmera recebe UMA conexão só,
 *    não importa quantas pessoas assistem, se a IA analisa e se grava);
 *  - só conecta na câmera quando alguém consome o vídeo.
 *
 * Segurança: API e RTSP escutam só em 127.0.0.1 e exigem usuário/senha aleatórios gerados a cada
 * início (a API do go2rtc consegue executar programas: sem a senha, nenhuma página do navegador nem
 * outro aparelho da rede consegue usá-la). WebRTC, RTMP e HomeKit desligados.
 *
 * Binários: backend/agent-local/bin/go2rtc.exe e bin/ffmpeg.exe (baixados com hash conferido pelo
 * scripts/ligar-ia-facial.ps1) ou no PATH. Sem go2rtc, o vídeo segue pelo motor de IA como antes.
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { spawn, execFileSync } = require('child_process');

const DIR_BIN = path.join(__dirname, '..', 'bin');
const PORTA_API = Number(process.env.GO2RTC_PORTA_API || 1984);
const PORTA_RTSP = Number(process.env.GO2RTC_PORTA_RTSP || 8555);
const ARQ_CONFIG = path.join(DIR_BIN, 'go2rtc.yaml');

let log = (nivel, msg) => console.log(`[${new Date().toISOString()}] ${nivel.toUpperCase()} ${msg}`);

const estado = {
    bin: null,
    ffmpeg: null,
    proc: null,
    usuario: 'nzt',
    senha: crypto.randomBytes(18).toString('base64url'),
    streams: new Map(),      // nome → url de origem (com credencial da câmera)
    cameras: new Map(),      // camera_id → { principal, sub }
    assinatura: '',
    reiniciando: null,
    falhas: 0,
    pronto: false
};

function acharBinario(nome) {
    const exe = process.platform === 'win32' ? `${nome}.exe` : nome;
    const local = path.join(DIR_BIN, exe);
    if (fs.existsSync(local)) return local;
    try {
        const cmd = process.platform === 'win32' ? 'where' : 'which';
        const saida = execFileSync(cmd, [exe], { stdio: ['ignore', 'pipe', 'ignore'] }).toString().split(/\r?\n/)[0].trim();
        return saida || null;
    } catch {
        return null;
    }
}

/** Sub-stream deduzido (mesma regra do motor): Intelbras/Dahua subtype=0→1, Hikvision 101→102 */
function derivarSubstream(url) {
    const u = url || '';
    if (u.includes('subtype=0')) return u.replace('subtype=0', 'subtype=1');
    const m = u.match(/(\/streaming\/channels?\/)(\d{3,})/i);
    if (m && m[2].endsWith('01')) return u.replace(m[0], `${m[1]}${m[2].slice(0, -2)}02`);
    return null;
}

// ------------------------------------------------------------------ webcam USB
// A webcam entra no retransmissor como as câmeras IP: o go2rtc abre o dispositivo (DirectShow) e
// codifica em H.264 só enquanto alguém consome. Um único dono do dispositivo (antes o motor de IA o
// abria e recomprimia em JPEG); o motor lê do RTSP local como qualquer câmera.
const webcams = { lista: null, modos: new Map() }; // nomes DirectShow; nome → melhor "LxA"

function listarWebcams() {
    if (webcams.lista || process.platform !== 'win32' || !estado.ffmpeg) return webcams.lista || [];
    try {
        const r = require('child_process').spawnSync(estado.ffmpeg, ['-hide_banner', '-list_devices', 'true', '-f', 'dshow', '-i', 'dummy'],
            { encoding: 'utf8', windowsHide: true, timeout: 10000 });
        webcams.lista = [...String(r.stderr || '').matchAll(/"([^"]+)"\s+\(video\)/g)].map(m => m[1]);
    } catch {
        webcams.lista = [];
    }
    return webcams.lista;
}

/** Maior resolução que a webcam oferece (ex.: "640x480"), para não abrir abaixo do que ela entrega */
function melhorModo(nome) {
    if (webcams.modos.has(nome)) return webcams.modos.get(nome);
    let melhor = null;
    try {
        const r = require('child_process').spawnSync(estado.ffmpeg, ['-hide_banner', '-list_options', 'true', '-f', 'dshow', '-i', `video=${nome}`],
            { encoding: 'utf8', windowsHide: true, timeout: 10000 });
        let area = 0;
        for (const m of String(r.stderr || '').matchAll(/max s=(\d+)x(\d+)/g)) {
            const a = Number(m[1]) * Number(m[2]);
            if (a > area && Number(m[1]) <= 1920) { area = a; melhor = `${m[1]}x${m[2]}`; }
        }
    } catch { /* usa o padrão do dispositivo */ }
    if (melhor) webcams.modos.set(nome, melhor); // dispositivo ocupado: tenta de novo na próxima vez
    return melhor;
}

function portaAberta(porta) {
    return new Promise((resolve) => {
        const s = require('net').connect(porta, '127.0.0.1');
        const fim = (ok) => { s.destroy(); resolve(ok); };
        s.once('connect', () => fim(true));
        s.once('error', () => fim(false));
        setTimeout(() => fim(false), 400);
    });
}

/**
 * Origem da câmera no go2rtc. "webcam", "webcam:1", "usb:0" ou o RTSP local do OBS (127.0.0.1:8554)
 * com o OBS fechado viram a webcam USB; o resto segue como RTSP.
 */
async function origemDaCamera(url) {
    const u = String(url || '').trim();
    const ehWebcam = /^(webcam|usb)\b/i.test(u) || /^\d+$/.test(u);
    const obsLocal = /^rtsp:\/\/(127\.0\.0\.1|localhost):8554\b/i.test(u);
    if (!ehWebcam && !obsLocal) return /^rtsps?:\/\//i.test(u) ? u : null;
    if (obsLocal && await portaAberta(8554)) return u; // OBS ligado: usa o RTSP dele
    if (!estado.ffmpeg) return null;
    const lista = listarWebcams();
    const indice = Number((u.match(/(\d+)\s*$/) || [])[1] || 0);
    const nome = lista[indice] || lista[0];
    if (!nome) return null;
    const modo = melhorModo(nome);
    const params = new URLSearchParams({ video: String(Math.max(0, lista.indexOf(nome))), framerate: '30', ...(modo ? { video_size: modo } : {}) });
    // Teto de taxa: sem ele, o ruído do sensor (pouca luz) passava de 2 Mbit/s para 640x480
    return `ffmpeg:device?${params}#video=h264#raw=-crf 26 -maxrate 900k -bufsize 1800k`;
}

const nomeStream = (cameraId, sub) => `c_${String(cameraId).replace(/[^a-zA-Z0-9]/g, '')}${sub ? '_sub' : ''}`;
const aspas = (t) => `"${String(t).replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;

function escreverConfig() {
    const linhas = [
        'api:',
        `  listen: "127.0.0.1:${PORTA_API}"`,
        `  username: ${aspas(estado.usuario)}`,
        `  password: ${aspas(estado.senha)}`,
        // Sem isto o go2rtc dispensa a senha para pedidos do próprio PC — justamente o caminho de
        // uma página maliciosa aberta no navegador deste computador
        '  local_auth: true',
        '  origin: ""',
        'rtsp:',
        `  listen: "127.0.0.1:${PORTA_RTSP}"`,
        `  username: ${aspas(estado.usuario)}`,
        `  password: ${aspas(estado.senha)}`,
        '  local_auth: true',
        'webrtc:',
        '  listen: ""',
        'rtmp:',
        '  listen: ""',
        'srtp:',
        '  listen: ""',
        'log:',
        '  level: warn',
        // Só o nome: o go2rtc corta o comando nos espaços ("C:\Users\Natália Alves\..." quebrava);
        // a pasta do ffmpeg vai na frente do PATH do processo (ver iniciarProcesso)
        ...(estado.ffmpeg ? ['ffmpeg:', '  bin: "ffmpeg"'] : []),
        'streams:',
        ...[...estado.streams].map(([nome, url]) => `  ${nome}: ${aspas(url)}`)
    ];
    fs.mkdirSync(DIR_BIN, { recursive: true });
    // O arquivo leva as senhas das câmeras: só para o usuário do Windows que roda o agente
    fs.writeFileSync(ARQ_CONFIG, linhas.join('\n') + '\n', { mode: 0o600 });
}

/**
 * Encerra o go2rtc com os filhos. No Windows, matar só o go2rtc deixava vivo o ffmpeg que ele abriu
 * para a webcam, segurando o dispositivo (a próxima abertura falhava com "I/O error").
 */
function encerrarProcesso(proc) {
    if (!proc) return;
    if (process.platform === 'win32' && proc.pid) {
        try {
            execFileSync('taskkill', ['/pid', String(proc.pid), '/T', '/F'], { stdio: 'ignore', windowsHide: true, timeout: 10000 });
            return;
        } catch { /* já saiu */ }
    }
    proc.kill();
}

function iniciarProcesso() {
    escreverConfig();
    const env = { ...process.env };
    if (estado.ffmpeg) {
        const chave = Object.keys(env).find(k => k.toUpperCase() === 'PATH') || 'PATH';
        env[chave] = `${path.dirname(estado.ffmpeg)}${path.delimiter}${env[chave] || ''}`;
    }
    const proc = spawn(estado.bin, ['-config', ARQ_CONFIG], { cwd: DIR_BIN, env, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
    estado.proc = proc;
    const registrar = (dados) => {
        const texto = dados.toString().trim();
        // Nunca registrar URLs com senha da câmera
        if (texto) log('warn', `go2rtc: ${texto.replace(/(\/\/[^:/@\s]+:)[^@/\s]*@/g, '$1***@').slice(0, 400)}`);
    };
    proc.stdout.on('data', registrar);
    proc.stderr.on('data', registrar);
    proc.on('exit', (codigo) => {
        if (estado.proc !== proc) return; // reinício intencional
        estado.proc = null;
        estado.pronto = false;
        estado.falhas++;
        const espera = Math.min(30000, 2000 * estado.falhas);
        log('warn', `go2rtc fechou (código ${codigo}); reabrindo em ${Math.round(espera / 1000)} s`);
        setTimeout(() => { if (!estado.proc) iniciarProcesso(); }, espera);
    });
    // Pronto quando a API responder
    const inicio = Date.now();
    const checar = async () => {
        if (estado.proc !== proc) return;
        try {
            const r = await chamarApi('/api', {}, 1500);
            if (r.ok) { estado.pronto = true; estado.falhas = 0; return; }
        } catch { /* ainda subindo */ }
        if (Date.now() - inicio < 15000) setTimeout(checar, 500);
    };
    setTimeout(checar, 300);
}

/**
 * Processos que sobraram de um agente anterior que caiu (no Windows o filho não morre com o pai):
 * go2rtc segurando a porta, ffmpeg gravando na mesma pasta. Só os que batem com o filtro.
 */
function encerrarOrfaos(nomeExe, trechoLinhaDeComando) {
    if (process.platform !== 'win32') return;
    const filtro = String(trechoLinhaDeComando).replace(/'/g, "''");
    const script = `Get-CimInstance Win32_Process -Filter "Name='${nomeExe}'" | Where-Object { $_.CommandLine -and $_.CommandLine.Contains('${filtro}') } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }`;
    try {
        execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script], { stdio: 'ignore', windowsHide: true, timeout: 15000 });
    } catch { /* nada a encerrar */ }
}

function iniciar(logger) {
    if (logger) log = logger;
    encerrarOrfaos('go2rtc.exe', ARQ_CONFIG);
    estado.bin = acharBinario('go2rtc');
    estado.ffmpeg = acharBinario('ffmpeg');
    if (!estado.bin) {
        log('warn', 'go2rtc não encontrado (backend/agent-local/bin): vídeo das câmeras segue pelo motor de IA. Rode ligar-ia-facial.bat para instalar.');
        return false;
    }
    if (!estado.ffmpeg) log('warn', 'ffmpeg não encontrado: sem gravação e sem vídeo de reserva (MJPEG) local.');
    iniciarProcesso();
    log('info', `Retransmissor de vídeo local ativo (go2rtc em 127.0.0.1:${PORTA_API})`);
    return true;
}

const disponivel = () => !!estado.bin;
const temFfmpeg = () => !!estado.ffmpeg;
const caminhoFfmpeg = () => estado.ffmpeg;

function autorizacao() {
    return 'Basic ' + Buffer.from(`${estado.usuario}:${estado.senha}`).toString('base64');
}

async function chamarApi(caminho, params = {}, timeoutMs = 8000, extras = {}) {
    const query = new URLSearchParams(params).toString();
    return fetch(`http://127.0.0.1:${PORTA_API}${caminho}${query ? `?${query}` : ''}`, {
        headers: { Authorization: autorizacao(), ...(extras.headers || {}) },
        signal: extras.signal || (timeoutMs ? AbortSignal.timeout(timeoutMs) : undefined)
    });
}

/**
 * Câmeras do evento (RTSP). Reinicia o go2rtc só se o conjunto de câmeras/URLs mudou
 * (cadastro ou edição): quem estava assistindo reconecta sozinho em segundos.
 */
async function configurarCameras(cameras = []) {
    if (!estado.bin) return;
    const streams = new Map();
    const camMap = new Map();
    for (const c of cameras) {
        if (!c.id) continue;
        const url = await origemDaCamera(c.stream_url);
        if (!url) continue;
        const principal = nomeStream(c.id, false);
        streams.set(principal, url);
        // Webcam não tem sub-stream: a miniatura usa o mesmo vídeo (já é leve)
        const subUrl = url.startsWith('ffmpeg:') ? null
            : (c.url_substream && /^rtsps?:\/\//i.test(c.url_substream)) ? c.url_substream : derivarSubstream(url);
        let sub = null;
        if (subUrl && subUrl !== url) {
            sub = nomeStream(c.id, true);
            streams.set(sub, subUrl);
        }
        camMap.set(String(c.id), { principal, sub });
    }
    estado.cameras = camMap;
    const assinatura = crypto.createHash('sha256').update(JSON.stringify([...streams])).digest('hex');
    if (assinatura === estado.assinatura) return;
    estado.assinatura = assinatura;
    estado.streams = streams;
    clearTimeout(estado.reiniciando);
    estado.reiniciando = setTimeout(() => {
        log('info', `Retransmissor: ${camMap.size} câmera(s) configurada(s)`);
        const antigo = estado.proc;
        estado.proc = null;
        estado.pronto = false;
        encerrarProcesso(antigo);
        setTimeout(iniciarProcesso, antigo ? 800 : 0);
    }, 1500);
}

/** Nome do stream da câmera na qualidade pedida ('mini' usa o sub-stream quando existe) */
function streamDa(cameraId, qualidade = 'foco') {
    const c = estado.cameras.get(String(cameraId));
    if (!c) return null;
    return qualidade === 'mini' || qualidade === 'sub' ? (c.sub || c.principal) : c.principal;
}

const conhece = (cameraId) => estado.cameras.has(String(cameraId));

/** URL RTSP local (com a senha do go2rtc, nunca a da câmera) para o motor e o gravador */
function urlRtspLocal(cameraId, qualidade = 'foco') {
    const nome = streamDa(cameraId, qualidade);
    if (!nome) return null;
    return `rtsp://${estado.usuario}:${encodeURIComponent(estado.senha)}@127.0.0.1:${PORTA_RTSP}/${nome}`;
}

async function esperarPronto(ms = 8000) {
    const fim = Date.now() + ms;
    while (!estado.pronto && Date.now() < fim) await new Promise(r => setTimeout(r, 200));
    if (!estado.pronto) throw new Error('Retransmissor de vídeo local ainda não está pronto');
}

/** Vídeo MP4 fragmentado (H.264 copiado) para o painel. Devolve o Response do fetch. */
async function abrirMp4(cameraId, qualidade, userAgent, signal) {
    const nome = streamDa(cameraId, qualidade);
    if (!nome) throw new Error('Câmera não está no retransmissor local');
    await esperarPronto();
    const res = await chamarApi('/api/stream.mp4', { src: nome }, 0, {
        signal,
        // O go2rtc escolhe os codecs pelo navegador de quem assiste (H.265 só se ele tocar)
        headers: userAgent ? { 'User-Agent': String(userAgent).slice(0, 300) } : {}
    });
    if (!res.ok) throw new Error(`Retransmissor respondeu HTTP ${res.status}`);
    return res;
}

/** MJPEG (reserva para navegador sem MP4 ou câmera em H.265): exige ffmpeg */
async function abrirMjpeg(cameraId, qualidade, signal) {
    const nome = streamDa(cameraId, qualidade);
    if (!nome) throw new Error('Câmera não está no retransmissor local');
    if (!estado.ffmpeg) throw new Error('ffmpeg ausente: sem MJPEG local');
    await esperarPronto();
    const res = await chamarApi('/api/stream.mjpeg', { src: nome }, 0, { signal });
    if (!res.ok) throw new Error(`Retransmissor respondeu HTTP ${res.status}`);
    return res;
}

/** Uma imagem JPEG da câmera (exige ffmpeg) */
async function snapshot(cameraId, qualidade = 'mini', timeoutMs = 8000) {
    const nome = streamDa(cameraId, qualidade);
    if (!nome) throw new Error('Câmera não está no retransmissor local');
    if (!estado.ffmpeg) throw new Error('ffmpeg ausente: sem imagem local');
    await esperarPronto();
    const res = await chamarApi('/api/frame.jpeg', { src: nome }, timeoutMs);
    if (!res.ok) throw new Error(`Câmera sem imagem (HTTP ${res.status})`);
    return Buffer.from(await res.arrayBuffer());
}

function status() {
    return {
        disponivel: !!estado.bin,
        pronto: estado.pronto,
        ffmpeg: !!estado.ffmpeg,
        cameras: estado.cameras.size
    };
}

function parar() {
    const p = estado.proc;
    estado.proc = null;
    encerrarProcesso(p);
}

module.exports = {
    iniciar, encerrarOrfaos, disponivel, temFfmpeg, caminhoFfmpeg, configurarCameras, conhece, streamDa, urlRtspLocal,
    abrirMp4, abrirMjpeg, snapshot, status, parar, derivarSubstream
};
