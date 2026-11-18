/**
 * Visor local da central de operação: o vídeo vem do PC do evento pela rede local, sem passar pela VPS.
 * Só funciona quando o navegador está no mesmo PC (ou com acesso ao 127.0.0.1 desse PC) e o agente
 * está rodando. Se não estiver disponível, o painel usa o caminho pela VPS, como antes.
 */
const BASE = 'http://127.0.0.1:8766';
const VERIFICA_MS = 15000;

let estado = { disponivel: null, verificadoEm: 0, token: null, ate: 0 };

/** Testa se o visor responde. Pedido "no-cors": só confirma que há um servidor ali, sem ler a resposta. */
export async function visorDisponivel() {
    if (estado.disponivel !== null && Date.now() - estado.verificadoEm < VERIFICA_MS) return estado.disponivel;
    // Limite curto: com a permissão de rede local pendente ou negada no navegador, não segura o vídeo
    const ctrl = new AbortController();
    const prazo = setTimeout(() => ctrl.abort(), 1500);
    try {
        await fetch(`${BASE}/health`, { mode: 'no-cors', cache: 'no-store', signal: ctrl.signal });
        estado.disponivel = true;
    } catch {
        estado.disponivel = false;
    } finally {
        clearTimeout(prazo);
    }
    estado.verificadoEm = Date.now();
    return estado.disponivel;
}

/** Token de sessão do visor (pede ao agente; só o painel do sistema consegue ler a resposta). */
export async function tokenVisor() {
    if (estado.token && Date.now() < estado.ate - 60000) return estado.token;
    const r = await fetch(`${BASE}/sessao`, { cache: 'no-store' });
    if (!r.ok) throw new Error(`visor local respondeu ${r.status}`);
    const j = await r.json();
    estado = { ...estado, token: j.token, ate: j.ate };
    return j.token;
}

/** Descarta o token: a próxima chamada pede uma sessão nova (usado quando o visor recusa o token) */
export function esquecerToken() {
    estado = { ...estado, token: null, ate: 0 };
}

export const urlVisorMp4 = (cameraId, token, qualidade = 'mini') =>
    `${BASE}/camera/${encodeURIComponent(cameraId)}/mp4?t=${encodeURIComponent(token)}&qualidade=${qualidade}`;

export const urlVisorDeteccoes = (cameraId, token, qualidade = 'foco') =>
    `${BASE}/camera/${encodeURIComponent(cameraId)}/deteccoes?t=${encodeURIComponent(token)}&qualidade=${qualidade}`;

/**
 * Ao vivo sem atraso: WebRTC com o retransmissor do PC do evento (go2rtc). Sem buffer de reprodução:
 * medido ~30 ms de espera no navegador contra ~2,2 s do MP4 progressivo.
 * Devolve a conexão; `aoReceber(stream)` é chamado quando o vídeo chega. Quem chama fecha com pc.close().
 */
export async function abrirWebrtcVisor(cameraId, token, qualidade, aoReceber) {
    const pc = new RTCPeerConnection({ bundlePolicy: 'max-bundle' });
    try {
        pc.addTransceiver('video', { direction: 'recvonly' });
        pc.ontrack = (e) => {
            // Pede ao navegador para não segurar quadros (vigilância: cada quadro conta mais que a suavidade)
            try { e.receiver.jitterBufferTarget = 0; } catch { /* navegador sem suporte */ }
            try { e.receiver.playoutDelayHint = 0; } catch { /* navegador sem suporte */ }
            aoReceber(e.streams[0] || new MediaStream([e.track]));
        };
        await pc.setLocalDescription(await pc.createOffer());
        // Sem trickle: espera os candidatos locais (no mesmo PC sai em poucos ms; teto de 800 ms)
        await new Promise((ok) => {
            if (pc.iceGatheringState === 'complete') return ok();
            const prazo = setTimeout(ok, 800);
            pc.addEventListener('icegatheringstatechange', () => {
                if (pc.iceGatheringState === 'complete') { clearTimeout(prazo); ok(); }
            });
        });
        const ctrl = new AbortController();
        const prazo = setTimeout(() => ctrl.abort(), 8000);
        let r;
        try {
            r = await fetch(`${BASE}/camera/${encodeURIComponent(cameraId)}/webrtc?t=${encodeURIComponent(token)}&qualidade=${qualidade}`, {
                method: 'POST', headers: { 'Content-Type': 'application/sdp' }, body: pc.localDescription.sdp,
                cache: 'no-store', signal: ctrl.signal
            });
        } finally {
            clearTimeout(prazo);
        }
        if (r.status === 401) esquecerToken();
        if (!r.ok) throw new Error(`visor local respondeu ${r.status}`);
        await pc.setRemoteDescription({ type: 'answer', sdp: await r.text() });
        return pc;
    } catch (err) {
        pc.close();
        throw err;
    }
}
