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
const PORTA_WEBRTC = Number(process.env.GO2RTC_PORTA_WEBRTC || 8557);
const ARQ_CONFIG = path.join(DIR_BIN, 'go2rtc.yaml');
// Senha da conta da nuvem (a do app Mercusys/Tapo) por IP da câmera: o canal de voz (protocolo Tapo) só
// aceita essa senha, e não a da conta RTSP. Fica só neste PC, fora do Git, com permissão restrita.
const ARQ_CONTAS_TAPO = process.env.TAPO_CONTAS_ARQ || path.join(__dirname, '..', '.tapo-contas.json');

let log = (nivel, msg) => console.log(`[${new Date().toISOString()}] ${nivel.toUpperCase()} ${msg}`);

const estado = {
    bin: null,
    ffmpeg: null,
    proc: null,
    usuario: 'nzt',
    senha: crypto.randomBytes(18).toString('base64url'),
    streams: new Map(),      // nome → url de origem (com credencial da câmera)
    cameras: new Map(),      // camera_id → { principal, sub }
    ultimaLista: [],         // última lista de câmeras recebida (para reaplicar quando a senha Tapo muda)
    assinatura: '',
    reiniciando: null,
    falhas: 0,
    pronto: false,
    // Outro go2rtc (de outra execução, com outra senha) responde na porta: nosso retransmissor não sobe
    ocupada: false
};
const MSG_PORTA_OCUPADA = 'A porta do vídeo (1984) está em uso por outro programa (um retransmissor antigo). Feche-o ou reinicie o PC e rode ligar-ia-facial.bat.';

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

/** Maior resolução <= 1920 que a webcam oferece; se a câmera for 2K/4K (ex.: 2560x1440@59.9999), abre no modo nativo e redimensiona na saída */
function melhorModo(nome) {
    if (webcams.modos.has(nome)) return webcams.modos.get(nome);
    let melhor = null;
    try {
        const r = require('child_process').spawnSync(estado.ffmpeg, ['-hide_banner', '-list_options', 'true', '-f', 'dshow', '-i', `video=${nome}`],
            { encoding: 'utf8', windowsHide: true, timeout: 10000 });
        let area = 0;
        for (const m of String(r.stderr || '').matchAll(/max s=(\d+)x(\d+)\s+fps=([\d.]+)/g)) {
            const w = Number(m[1]), h = Number(m[2]), fps = Number(m[3]);
            const a = w * h;
            if (a > area && w <= 1920) {
                area = a;
                melhor = { video_size: `${w}x${h}`, ...(Math.round(fps) === 30 ? { framerate: '30' } : {}) };
            }
        }
    } catch { /* usa o padrão do dispositivo */ }
    if (melhor) {
        webcams.modos.set(nome, melhor);
        salvarModosWebcam();
        return melhor;
    }
    // Dispositivo ocupado (o próprio go2rtc está usando a webcam): vale o último modo conhecido. Sem isto a
    // URL da webcam mudava, a assinatura da configuração mudava e o go2rtc reiniciava, derrubando as câmeras.
    return modosSalvos()[nome] || null;
}

const ARQ_MODOS_WEBCAM = path.join(DIR_BIN, 'webcam-modos.json');
function modosSalvos() {
    try { return JSON.parse(fs.readFileSync(ARQ_MODOS_WEBCAM, 'utf8')) || {}; } catch { return {}; }
}
function salvarModosWebcam() {
    try {
        fs.mkdirSync(DIR_BIN, { recursive: true });
        fs.writeFileSync(ARQ_MODOS_WEBCAM, JSON.stringify({ ...modosSalvos(), ...Object.fromEntries(webcams.modos) }));
    } catch { /* só cache */ }
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
 * Origem da câmera no go2rtc. "webcam", "webcam:1", "usb:0" ou o RTSP local do OBS (127.0.0.1:8554 / localhost:8554,
 * com ou sem usuário:senha@) viram a webcam USB quando o OBS está fechado ou falha no SETUP.
 */
async function origemDaCamera(url) {
    const u = String(url || '').trim();
    const ehWebcam = /^(webcam|usb)\b/i.test(u) || /^\d+$/.test(u);
    const obsLocal = /^rtsps?:\/\/(?:[^@\/]+@)?(127\.0\.0\.1|localhost):8554\b/i.test(u);
    if (!ehWebcam && !obsLocal) return /^rtsps?:\/\//i.test(u) ? u : null;
    if (!estado.ffmpeg) return obsLocal ? u : null;
    const lista = listarWebcams();
    const indice = ehWebcam ? Number((u.match(/(\d+)\s*$/) || [])[1] || 0) : 0;
    const nome = lista[indice] || lista[0];
    if (!nome) return obsLocal ? u : null;
    const modo = melhorModo(nome);
    const params = new URLSearchParams({
        video: String(Math.max(0, lista.indexOf(nome))),
        rtbufsize: '256M',
        pixel_format: 'nv12',
        ...(modo || {})
    });
    // Teto de resolução (1280px) e taxa: câmeras 2K/60fps abrem no formato nativo do DirectShow sem erro de opção
    // Usa aceleração NVENC (GPU) com buffer 256M para zerar latência e não afogar a CPU nem perder frames
    const webcamDshow = `ffmpeg:device?${params}#video=h264#raw=-vf scale=1280:-2,fps=30`;
    if (obsLocal && await portaAberta(8554)) return [u, webcamDshow];
    return webcamDshow;
}

let encoderH264Detectado = null;
function obterEncoderH264() {
    if (encoderH264Detectado) return encoderH264Detectado;
    if (!estado.ffmpeg) return 'libx264';
    try {
        const r = require('child_process').execFileSync(estado.ffmpeg, ['-hide_banner', '-encoders'],
            { encoding: 'utf8', windowsHide: true, timeout: 5000 });
        if (/h264_nvenc\b/.test(r)) {
            encoderH264Detectado = 'h264_nvenc';
            return 'h264_nvenc';
        }
        if (/h264_amf\b/.test(r)) {
            encoderH264Detectado = 'h264_amf';
            return 'h264_amf';
        }
    } catch { }
    encoderH264Detectado = 'libx264';
    return 'libx264';
}

const nomeStream = (cameraId, sub) => `c_${String(cameraId).replace(/[^a-zA-Z0-9]/g, '')}${sub ? '_sub' : ''}`;
const aspas = (t) => `"${String(t).replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;

function escreverConfig() {
    const encoder = obterEncoderH264();
    // Quadro-chave a cada 1 s (-g 30) e sem quadros B (-bf 0): o player do navegador só avança entre
    // quadros-chave. Com o padrão (~250 quadros = 8 s) a imagem fica parada e depois salta.
    const h264Args = encoder === 'h264_nvenc'
        ? '-c:v h264_nvenc -preset p1 -tune ull -pix_fmt yuv420p -b:v 1800k -maxrate 2500k -bufsize 3600k -g 30 -bf 0'
        : (encoder === 'h264_amf'
            ? '-c:v h264_amf -pix_fmt yuv420p -b:v 1800k -g 30 -bf 0'
            : '-c:v libx264 -preset ultrafast -tune zerolatency -pix_fmt yuv420p -crf 26 -maxrate 1200k -bufsize 2400k -g 30 -keyint_min 30 -bf 0');

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
        // WebRTC: vídeo ao vivo com ~30 ms de buffer no navegador (o MP4 progressivo segurava ~2,2 s).
        // Esta porta só leva mídia: a negociação passa pela API (127.0.0.1, com senha) via visor local.
        'webrtc:',
        `  listen: ":${PORTA_WEBRTC}"`,
        `  candidates: ["127.0.0.1:${PORTA_WEBRTC}"]`,
        'rtmp:',
        '  listen: ""',
        'srtp:',
        '  listen: ""',
        'log:',
        '  level: warn',
        // Só o nome: o go2rtc corta o comando nos espaços ("C:\Users\Natália Alves\..." quebrava);
        // a pasta do ffmpeg vai na frente do PATH do processo (ver iniciarProcesso)
        ...(estado.ffmpeg ? [
            'ffmpeg:',
            '  bin: "ffmpeg"',
            `  h264: "${h264Args}"`
        ] : []),
        'streams:',
        ...[...estado.streams].flatMap(([nome, url]) => (
            Array.isArray(url)
                ? [`  ${nome}:`, ...url.map(u => `    - ${aspas(u)}`)]
                : [`  ${nome}: ${aspas(url)}`]
        ))
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
            if (r.ok) { estado.pronto = true; estado.ocupada = false; estado.falhas = 0; return; }
            // 401: alguém responde na porta, mas não com a nossa senha (outro go2rtc antigo)
            if (r.status === 401) estado.ocupada = true;
        } catch { /* ainda subindo */ }
        if (Date.now() - inicio < 15000) setTimeout(checar, 500);
    };
    setTimeout(checar, 300);
}

/**
 * Processos que sobraram de um agente anterior que caiu (no Windows o filho não morre com o pai):
 * go2rtc segurando a porta, ffmpeg gravando na mesma pasta. Só os que batem com o filtro.
 */
function encerrarOrfaos(nomeExe, trechoLinhaDeComando = '') {
    if (process.platform !== 'win32') return;
    const filtro = String(trechoLinhaDeComando || '').replace(/'/g, "''");
    const script = `Get-CimInstance Win32_Process -Filter "Name='${nomeExe}'" | Where-Object { -not '${filtro}' -or ($_.CommandLine -and $_.CommandLine.Contains('${filtro}')) } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }`;
    try {
        execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script], { stdio: 'ignore', windowsHide: true, timeout: 15000 });
    } catch { /* nada a encerrar */ }
}

function iniciar(logger) {
    if (logger) log = logger;
    encerrarOrfaos('go2rtc.exe');
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
        method: extras.method || 'GET',
        body: extras.body,
        headers: { Authorization: autorizacao(), ...(extras.headers || {}) },
        signal: extras.signal || (timeoutMs ? AbortSignal.timeout(timeoutMs) : undefined)
    });
}

/**
 * Câmeras do evento (RTSP). Reinicia o go2rtc só se o conjunto de câmeras/URLs mudou
 * (cadastro ou edição): quem estava assistindo reconecta sozinho em segundos.
 */
async function configurarCameras(cameras = []) {
    estado.ultimaLista = cameras;
    if (!estado.bin) return;
    const streams = new Map();
    const camMap = new Map();
    const contasTapo = lerContasTapo();
    for (const c of cameras) {
        if (!c.id) continue;
        const url = await origemDaCamera(c.stream_url);
        if (!url) continue;
        const principal = nomeStream(c.id, false);
        // Áudio da câmera (escuta pelo botão "Ouvir" da Central): o navegador só toca Opus; o go2rtc converte
        // só o áudio, o vídeo segue copiado. O áudio ligado não muda nada para quem só usa o vídeo.
        streams.set(principal, typeof url === 'string' && /^rtsps?:\/\//i.test(url) ? `${url}#audio=opus` : url);
        // Falar (voz de volta): em câmeras Mercusys/Tapo o canal fica no protocolo Tapo, não no RTSP. Fonte
        // separada, só para quem fala (a conexão de vídeo e de ouvir não muda). Não consome nada sem uso.
        const falaUrl = urlFalaTapo(c.stream_url, c.fabricante, contasTapo[hostDaUrl(c.stream_url)]);
        if (falaUrl) streams.set(`${principal}_fala`, falaUrl);
        const primeiroUrl = Array.isArray(url) ? url[0] : url;
        // Webcam não tem sub-stream: a miniatura usa o mesmo vídeo (já é leve)
        const subUrl = Array.isArray(url) || String(primeiroUrl).startsWith('ffmpeg:') ? null
            : (c.url_substream && /^rtsps?:\/\//i.test(c.url_substream)) ? c.url_substream : derivarSubstream(primeiroUrl);
        let sub = null;
        if (subUrl && subUrl !== primeiroUrl) {
            sub = nomeStream(c.id, true);
            streams.set(sub, subUrl);
        }
        // Modo snapshot (MJPEG) / reserva precisa de JPEG, mas as câmeras IP e a webcam enviam H.264.
        // O go2rtc precisa de um stream com ffmpeg:#video=mjpeg para gerar JPEG sob demanda quando solicitado.
        let jpeg = `${principal}_jpeg`;
        const fonteJpeg = sub || principal;
        streams.set(jpeg, `ffmpeg:${fonteJpeg}#video=mjpeg`);
        camMap.set(String(c.id), { principal, sub, jpeg });
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
    if (!estado.pronto) throw new Error(estado.ocupada ? MSG_PORTA_OCUPADA : 'Retransmissor de vídeo local ainda não está pronto');
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

/**
 * Ao vivo sem atraso: recebe a oferta WebRTC (SDP) do navegador e devolve a resposta do go2rtc.
 * O vídeo vai do go2rtc direto ao navegador (sem reempacotar em MP4 e sem buffer de reprodução).
 */
async function abrirWebrtc(cameraId, qualidade, ofertaSdp, opcoes = {}) {
    const base = streamDa(cameraId, qualidade);
    // Quem fala usa a fonte Tapo (com o canal de voz de volta), se a câmera tiver
    const nome = base && opcoes.fala && estado.streams.has(`${base}_fala`) ? `${base}_fala` : base;
    if (!nome) throw new Error('Câmera não está no retransmissor local');
    await esperarPronto();
    const res = await chamarApi('/api/webrtc', { src: nome }, 10000, {
        method: 'POST',
        body: ofertaSdp,
        headers: { 'Content-Type': 'application/sdp' }
    });
    if (!res.ok) {
        // O motivo do go2rtc (ex.: "streams: 401 Unauthorized" quando a câmera recusa o login) vai junto,
        // para a tela dizer o que houve em vez de repetir a mesma mensagem
        const motivo = (await res.text().catch(() => '')).slice(0, 200).replace(/\w+:\/\/[^@\s]*@/g, '***@');
        throw new Error(`Retransmissor respondeu HTTP ${res.status}${motivo ? `: ${motivo}` : ''}`);
    }
    return res.text();
}

/** MJPEG (reserva para navegador sem MP4 ou câmera em H.265): exige ffmpeg */
async function abrirMjpeg(cameraId, qualidade, signal) {
    // Câmera com fonte H.264 (webcam) tem um stream JPEG próprio; as demais usam o de sempre
    const nome = (estado.cameras.get(String(cameraId)) || {}).jpeg || streamDa(cameraId, qualidade);
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
        porta_ocupada: estado.ocupada,
        ffmpeg: !!estado.ffmpeg,
        cameras: estado.cameras.size
    };
}

function parar() {
    const p = estado.proc;
    estado.proc = null;
    encerrarProcesso(p);
}

/** IP (ou nome) da câmera a partir da URL RTSP; null se a URL não for válida */
function hostDaUrl(streamUrl) {
    try { return new URL(String(streamUrl)).hostname || null; } catch { return null; }
}

/** Senhas da conta da nuvem por IP da câmera ({ "192.168.1.88": "senha" }); vazio se não houver arquivo */
function lerContasTapo() {
    try {
        const j = JSON.parse(fs.readFileSync(ARQ_CONTAS_TAPO, 'utf8'));
        return j && typeof j === 'object' && !Array.isArray(j) ? j : {};
    } catch { return {}; }
}

/**
 * Grava a senha da conta da nuvem (a do app) para a câmera e reaplica a configuração: a fonte de voz passa
 * a usá-la. O go2rtc reinicia (alguns segundos sem vídeo). Senha vazia apaga a gravada.
 */
async function definirSenhaTapo(cameraId, senha) {
    const cam = (estado.ultimaLista || []).find(c => String(c.id) === String(cameraId));
    if (!cam) { const e = new Error('Câmera não está no retransmissor local'); e.status = 404; throw e; }
    if (!/mercusys|tapo/i.test(String(cam.fabricante || ''))) { const e = new Error('Só câmeras Mercusys/Tapo usam a conta do app para falar'); e.status = 409; throw e; }
    const host = hostDaUrl(cam.stream_url);
    if (!host) { const e = new Error('Endereço da câmera inválido'); e.status = 409; throw e; }
    const contas = lerContasTapo();
    if (senha) contas[host] = String(senha); else delete contas[host];
    fs.writeFileSync(ARQ_CONTAS_TAPO, JSON.stringify(contas), { mode: 0o600 });
    await configurarCameras(estado.ultimaLista);
    return { ok: true };
}

/**
 * Endereço da fonte Tapo do go2rtc (canal de voz de volta) a partir da URL RTSP da câmera. Só para
 * Mercusys/Tapo. O protocolo Tapo só aceita a senha da conta da nuvem (a do app): com ela, vai no formato
 * tapo://senha@ip. Sem ela, tenta usuário e senha da URL RTSP (a câmera costuma recusar).
 */
function urlFalaTapo(streamUrl, fabricante = '', senhaNuvem = null) {
    if (!/mercusys|tapo/i.test(String(fabricante || ''))) return null;
    let u;
    try { u = new URL(String(streamUrl)); } catch { return null; }
    if (!/^rtsps?:$/i.test(u.protocol) || !u.hostname) return null;
    if (senhaNuvem) return `tapo://${encodeURIComponent(String(senhaNuvem))}@${u.hostname}?backchannel=1&audio=pcma`;
    if (!u.password) return null;
    const user = encodeURIComponent(decodeURIComponent(u.username || 'admin'));
    const senha = encodeURIComponent(decodeURIComponent(u.password));
    return `tapo://${user}:${senha}@${u.hostname}?backchannel=1&audio=pcma`;
}

/**
 * Faixas que o retransmissor tem para a câmera (diagnóstico do áudio). Para o som de volta (Falar)
 * chegar à câmera, precisa existir uma faixa de áudio com "sendonly" (canal de envio da câmera).
 */
async function midiasDaCamera(cameraId) {
    const nome = streamDa(cameraId, 'foco');
    if (!nome) return { ok: false, motivo: 'Câmera não está no retransmissor local' };
    if (!estado.proc) return { ok: false, motivo: 'Retransmissor parado' };
    let r;
    try { r = await chamarApi('/api/streams', { src: nome }, 3000); } catch { return { ok: false, motivo: 'Retransmissor não respondeu' }; }
    if (!r.ok) return { ok: false, motivo: `Retransmissor respondeu HTTP ${r.status}` };
    const j = await r.json().catch(() => null);
    const medias = (j?.producers || []).flatMap(p => p.medias || []);
    return {
        ok: true,
        medias,
        audio_entrada: medias.some(m => /audio/i.test(m) && /recvonly/i.test(m)),
        audio_envio: medias.some(m => /audio/i.test(m) && /sendonly/i.test(m))
    };
}

module.exports = {
    midiasDaCamera,
    iniciar, encerrarOrfaos, disponivel, temFfmpeg, caminhoFfmpeg, configurarCameras, conhece, streamDa, urlRtspLocal,
    abrirMp4, abrirWebrtc, abrirMjpeg, snapshot, status, parar, derivarSubstream,
    _estado: estado, MSG_PORTA_OCUPADA, urlFalaTapo, definirSenhaTapo, lerContasTapo
};
