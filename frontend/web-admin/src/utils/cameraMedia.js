import api from '../services/api';

/**
 * Imagem e vídeo de câmera. Tags <img>/<video> não enviam o cabeçalho de login, então o painel pede
 * um ingresso de 2 min, válido só para aquela câmera (antes o token de login ia na URL e ficava
 * gravado nos logs e no histórico do navegador).
 *
 * @returns {Promise<{ ingresso: string, mp4: boolean, ia: boolean }>}
 *   mp4: o PC do evento entrega vídeo MP4 sem depender do motor de IA
 *   ia: a câmera tem reconhecimento facial ligado
 */
export const pedirIngressoCamera = async (cameraId) => {
    const { data } = await api.post(`/cameras/${cameraId}/ingresso`, {}, { hideDefaultError: true, timeout: 10000 });
    return { ingresso: data.ingresso, mp4: !!data.mp4, ia: !!data.ia };
};

/**
 * URL de mídia da câmera com um ingresso já obtido.
 * @param {'snapshot'|'stream'|'video.mp4'} tipo
 */
export const urlComIngresso = (cameraId, tipo, ingresso, params = {}) => {
    const qs = new URLSearchParams({ ...params, ingresso }).toString();
    return `${api.defaults.baseURL}/cameras/${cameraId}/${tipo}?${qs}`;
};

/** Pede o ingresso e devolve a URL (para abrir uma imagem numa aba, por exemplo) */
export const urlMidiaCamera = async (cameraId, tipo = 'snapshot', params = {}) => {
    const { ingresso } = await pedirIngressoCamera(cameraId);
    return urlComIngresso(cameraId, tipo, ingresso, params);
};

/** Gravação: ingresso de 30 min registrado no histórico de acessos (quem assistiu/baixou) */
export const urlGravacao = async (gravacaoId, acao = 'assistir') => {
    const { data } = await api.post(`/gravacoes/${gravacaoId}/ingresso`, { acao });
    return `${api.defaults.baseURL}/gravacoes/${gravacaoId}/video?ingresso=${encodeURIComponent(data.ingresso)}`;
};
