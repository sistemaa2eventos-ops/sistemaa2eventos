import axios from 'axios';

export const CHAVE_TOKEN_PORTAL = 'nzt_portal_produtor_token';
export const CHAVE_SESSAO_PORTAL = 'nzt_portal_produtor_sessao';

const API_URL = import.meta.env.VITE_API_URL || '/api';

export function obterTokenPortalProdutor() {
    try {
        const token = localStorage.getItem(CHAVE_TOKEN_PORTAL) || sessionStorage.getItem(CHAVE_TOKEN_PORTAL);
        return (token && token !== 'undefined' && token !== 'null') ? token : null;
    } catch {
        return null;
    }
}

export function obterSessaoPortalProdutor() {
    try {
        const bruto = localStorage.getItem(CHAVE_SESSAO_PORTAL) || sessionStorage.getItem(CHAVE_SESSAO_PORTAL);
        if (!bruto) return null;
        return JSON.parse(bruto);
    } catch {
        return null;
    }
}

export function salvarSessaoPortalProdutor({ token, produtor, evento, eventos_disponiveis }) {
    try {
        if (token) {
            localStorage.setItem(CHAVE_TOKEN_PORTAL, token);
        }
        const payload = { produtor, evento, eventos_disponiveis: eventos_disponiveis || [] };
        localStorage.setItem(CHAVE_SESSAO_PORTAL, JSON.stringify(payload));
    } catch {
        // Ignora erro de quota em modo privado
    }
}

export function limparSessaoPortalProdutor() {
    try {
        localStorage.removeItem(CHAVE_TOKEN_PORTAL);
        localStorage.removeItem(CHAVE_SESSAO_PORTAL);
        sessionStorage.removeItem(CHAVE_TOKEN_PORTAL);
        sessionStorage.removeItem(CHAVE_SESSAO_PORTAL);
    } catch {
        // Ignora falha de storage
    }
}

const portalProdutorApi = axios.create({
    baseURL: API_URL,
    timeout: 15000,
    headers: {
        'Content-Type': 'application/json',
        'X-App-Version': '2026-11-19-portal-produtor'
    }
});

portalProdutorApi.interceptors.request.use((config) => {
    const token = obterTokenPortalProdutor();
    if (token) {
        config.headers.Authorization = `Bearer ${token}`;
        config.headers['x-portal-produtor-token'] = token;
    }
    const sessao = obterSessaoPortalProdutor();
    const eventoId = sessao?.evento?.id;
    if (eventoId) {
        config.headers['x-evento-id'] = eventoId;
    }
    return config;
});

portalProdutorApi.interceptors.response.use(
    (response) => response,
    (error) => {
        const url = error?.config?.url || '';
        const ehLogin = url.includes('/producao/portal/login');
        if (error?.response?.status === 401 && !ehLogin) {
            limparSessaoPortalProdutor();
            window.dispatchEvent(new CustomEvent('portal-produtor-sessao-expirada'));
        }
        return Promise.reject(error);
    }
);

export default portalProdutorApi;
