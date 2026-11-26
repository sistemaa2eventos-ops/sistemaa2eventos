import axios from 'axios';

/**
 * Cliente da API do portal da empresa. Só fala com /api/portal-empresa (o nginx do portal não
 * repassa outras rotas). Sessão expirada ou chave trocada: limpa a sessão e volta para o login.
 */
const CHAVE_SESSAO = 'nzt_portal_empresa_sessao';

export const lerSessao = () => {
    try { return JSON.parse(localStorage.getItem(CHAVE_SESSAO)); } catch { return null; }
};
export const salvarSessao = (sessao) => localStorage.setItem(CHAVE_SESSAO, JSON.stringify(sessao));
export const limparSessao = () => localStorage.removeItem(CHAVE_SESSAO);

const api = axios.create({ baseURL: '/api/portal-empresa', timeout: 60000 });

api.interceptors.request.use((config) => {
    const sessao = lerSessao();
    if (sessao?.token) config.headers.Authorization = `Bearer ${sessao.token}`;
    return config;
});

api.interceptors.response.use(
    (resp) => resp,
    (err) => {
        if (err.response?.status === 401 && !String(err.config?.url || '').endsWith('/login')) {
            limparSessao();
            window.dispatchEvent(new CustomEvent('portal-sessao-expirada', { detail: err.response?.data?.error }));
        }
        return Promise.reject(err);
    }
);

/** Mensagem de erro da API (ou a padrão). */
export const erroDe = (err, padrao = 'Não foi possível concluir. Tente de novo.') => err?.response?.data?.error || padrao;

/** Conteúdo de uma resposta { success, data }. */
export const dadosDe = (resp) => resp?.data?.data;

/** Baixa um arquivo (planilha) da API e salva no computador. */
export async function baixarArquivo(url, nomePadrao) {
    try {
        const resp = await api.get(url, { responseType: 'blob' });
        const nome = /filename="?([^";]+)"?/i.exec(resp.headers?.['content-disposition'] || '')?.[1] || nomePadrao;
        const href = window.URL.createObjectURL(new Blob([resp.data]));
        const link = document.createElement('a');
        link.href = href;
        link.setAttribute('download', nome);
        document.body.appendChild(link);
        link.click();
        link.remove();
        window.URL.revokeObjectURL(href);
    } catch (err) {
        let mensagem = 'Não foi possível baixar o arquivo.';
        try { mensagem = JSON.parse(await err.response?.data?.text?.()).error || mensagem; } catch { /* mantém a padrão */ }
        throw new Error(mensagem);
    }
}

export default api;
