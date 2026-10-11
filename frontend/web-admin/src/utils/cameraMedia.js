import api from '../services/api';

/**
 * URL de snapshot/stream de câmera com o token de login.
 * Tags <img> não enviam o header Authorization; o backend aceita ?token= nessas rotas.
 * @param {string} cameraId
 * @param {'snapshot'|'stream'} tipo
 * @param {Object} [params] parâmetros extras (ex.: { annotate: true, t: Date.now() })
 */
export const urlMidiaCamera = (cameraId, tipo = 'snapshot', params = {}) => {
    const token = sessionStorage.getItem('token') || localStorage.getItem('token') || '';
    const qs = new URLSearchParams({ ...params, token }).toString();
    return `${api.defaults.baseURL}/cameras/${cameraId}/${tipo}?${qs}`;
};
