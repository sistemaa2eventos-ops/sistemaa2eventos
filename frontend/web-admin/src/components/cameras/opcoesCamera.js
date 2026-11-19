import { MODELOS_RESERVA, montarEnderecoRtsp } from '../../utils/modelosCamera';

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
/**
 * Endereços RTSP a partir do modelo escolhido (Configurações > Modelos de câmera). Só quando a câmera
 * ainda não tem endereço (cadastro novo ou endereço apagado no "Avançado").
 */
export const enderecosDoModelo = (cam, modelos = MODELOS_RESERVA) => {
    const porta = parseInt(cam.porta, 10) || 554;
    const dados = { usuario: cam.usuario, senha: cam.senha, ip: cam.ip_address, porta, canal: cam.canal };
    const modelo = modelos.find(m => m.nome === cam.fabricante);
    const principal = montarEnderecoRtsp(modelo?.rtsp_principal, dados);
    if (principal) return { stream_url: principal, url_substream: montarEnderecoRtsp(modelo.rtsp_sub, dados) };
    // Webcam/OBS, Genérica ou modelo sem padrão: endereço genérico (troque no "Avançado")
    return { stream_url: montarEnderecoRtsp('rtsp://{auth}{ip}:{porta}/live', dados), url_substream: null };
};

export const payloadCamera = (cam, eventoId, modelos = MODELOS_RESERVA) => {
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
        const e = enderecosDoModelo({ ...payload, porta }, modelos);
        payload.stream_url = e.stream_url;
        if (!payload.url_substream && e.url_substream) payload.url_substream = e.url_substream;
    }
    delete payload.canal;
    for (const campo of ['area', 'tem_senha', 'created_at', 'last_seen', 'id', 'evento']) delete payload[campo];
    return payload;
};

/** Estimativa de espaço por dia de gravação contínua (cópia direta do vídeo) */
export const gbPorDia = (stream) => (stream === 'principal' ? 21 : 4);
