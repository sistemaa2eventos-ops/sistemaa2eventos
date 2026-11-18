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
    try {
        await fetch(`${BASE}/health`, { mode: 'no-cors', cache: 'no-store' });
        estado.disponivel = true;
    } catch {
        estado.disponivel = false;
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
