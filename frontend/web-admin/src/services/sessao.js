import axios from 'axios';

/**
 * Renovação da sessão (refresh_token do Supabase via POST /auth/refresh).
 * O token de acesso vence (~1 h); sem renovar, o operador caía no login no meio do turno.
 * Fica guardado no mesmo storage do token ("Lembrar de mim" decide qual).
 */

const API_URL = import.meta.env.VITE_API_URL || '/api';
const RENOVAR_ANTES_MS = 5 * 60 * 1000; // renova 5 min antes de vencer

const storageDoToken = () => (sessionStorage.getItem('token') ? sessionStorage : localStorage);

export const guardarSessao = (session, storage = storageDoToken()) => {
  if (!session?.access_token) return;
  storage.setItem('token', session.access_token);
  if (session.refresh_token) storage.setItem('refresh_token', session.refresh_token);
  if (session.expires_at) storage.setItem('token_expires_at', String(session.expires_at * 1000));
};

export const limparSessao = () => {
  ['refresh_token', 'token_expires_at'].forEach((key) => {
    localStorage.removeItem(key);
    sessionStorage.removeItem(key);
  });
};

const refreshTokenAtual = () => sessionStorage.getItem('refresh_token') || localStorage.getItem('refresh_token');

export const podeRenovar = () => !!refreshTokenAtual();

export const precisaRenovar = () => {
  if (!podeRenovar()) return false;
  const vence = Number(sessionStorage.getItem('token_expires_at') || localStorage.getItem('token_expires_at'));
  return !!vence && vence - Date.now() < RENOVAR_ANTES_MS;
};

let renovando = null;

/** Uma única renovação por vez: as requisições que chegam juntas esperam a mesma. */
export const renovarSessao = () => {
  if (renovando) return renovando;
  const refresh_token = refreshTokenAtual();
  if (!refresh_token) return Promise.resolve(false);

  renovando = axios.post(`${API_URL}/auth/refresh`, { refresh_token }, { timeout: 10000, withCredentials: true })
    .then((res) => {
      if (!res.data?.session?.access_token) return false;
      guardarSessao(res.data.session);
      return true;
    })
    // Sem rede não é sessão inválida: mantém a sessão e tenta de novo depois
    .catch((err) => (err.response && [400, 401, 403].includes(err.response.status) ? false : null))
    .finally(() => { renovando = null; });
  return renovando;
};
