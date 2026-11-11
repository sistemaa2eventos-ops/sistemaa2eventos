/**
 * Modos de cada câmera (gravados em cameras_ip: ia_ativa, vigilancia_ativa, gravacao_modo).
 */
export const MODOS_IA = [
    { valor: 'monitorar', rotulo: 'Só monitorar', ajuda: 'Vídeo ao vivo, sem reconhecimento facial. Não usa o motor de IA.' },
    { valor: 'ao_assistir', rotulo: 'IA ao assistir', ajuda: 'Reconhece rostos enquanto alguém está com a câmera aberta.' },
    { valor: '24h', rotulo: 'IA 24 h', ajuda: 'Reconhece e alerta mesmo com o painel fechado (usa o PC do evento o tempo todo).' }
];

export const MODOS_GRAVACAO = [
    { valor: 'desligada', rotulo: 'Não gravar', ajuda: 'Nada é gravado.' },
    { valor: 'continua', rotulo: 'Contínua', ajuda: 'Grava sem parar, em blocos de 5 min, no PC do evento.' },
    { valor: 'alertas', rotulo: 'Em alertas', ajuda: 'Guarda de 10 s antes a 30 s depois de cada alerta da IA ou acesso negado no leitor da mesma área.' }
];

export const modoIaDe = (cam) => (cam?.ia_ativa !== true ? 'monitorar' : cam.vigilancia_ativa === true ? '24h' : 'ao_assistir');

export const camposDoModoIa = (modo) => ({
    ia_ativa: modo !== 'monitorar',
    vigilancia_ativa: modo === '24h'
});

export const NOVA_CAMERA = (areaId = '') => ({
    nome: '',
    fabricante: 'RTSP / OBS / Webcam',
    ip_address: '127.0.0.1',
    porta: 8554,
    usuario: 'a2eventos',
    senha: '',
    protocolo: 'rtsp',
    stream_url: 'rtsp://127.0.0.1:8554/live',
    snapshot_url: '',
    area_id: areaId,
    ia_ativa: false,
    vigilancia_ativa: false,
    prioridade: 1,
    url_substream: '',
    gravacao_modo: 'desligada',
    gravacao_stream: 'sub',
    gravacao_drive: false
});

/** Corpo para salvar a câmera (POST/PUT /cameras) */
export const payloadCamera = (cam, eventoId) => {
    const porta = parseInt(cam.porta, 10) || (cam.protocolo === 'rtsp' ? 554 : 80);
    const payload = {
        ...cam,
        evento_id: eventoId,
        area_id: cam.area_id || null,
        snapshot_url: cam.snapshot_url || null,
        url_substream: cam.url_substream || null,
        porta
    };
    if (!payload.stream_url && payload.ip_address) {
        const auth = payload.usuario && payload.senha ? `${encodeURIComponent(payload.usuario)}:${encodeURIComponent(payload.senha)}@` : '';
        payload.stream_url = `rtsp://${auth}${payload.ip_address}:${porta}/live`;
    }
    for (const campo of ['area', 'tem_senha', 'created_at', 'last_seen', 'id', 'evento']) delete payload[campo];
    return payload;
};

/** Estimativa de espaço por dia de gravação contínua (cópia direta do vídeo) */
export const gbPorDia = (stream) => (stream === 'principal' ? 21 : 4);
