import axios from 'axios';

let snackbarRef = null;

export const setGlobalSnackbar = (enqueueSnackbar) => {
  snackbarRef = enqueueSnackbar;
};

const log = import.meta.env.DEV ? console.log : () => {};

const API_URL = import.meta.env.VITE_API_URL || '/api';

const api = axios.create({
  baseURL: API_URL,
  timeout: 15000,  // Aumentado de 10s para 15s (dispositivos WiFi podem ser lentos)
  headers: {
    'Content-Type': 'application/json',
  },
  withCredentials: true // Importante para CORS com cookies
});

// Interceptor para adicionar token E evento ativo verificando session e em seguida localStorage
api.interceptors.request.use((config) => {
  const token = sessionStorage.getItem('token') || localStorage.getItem('token');

  if (token && token !== 'undefined' && token !== 'null') {
    // Debug: verificar estrutura do token
    const segments = token.split('.');
    if (segments.length !== 3) {
      log('Token JWT malformado - segmentos:', segments.length);
    }
    config.headers.Authorization = `Bearer ${token}`;
  }

  // Injetar evento ativo em TODAS as requisições que precisam de contexto de evento
  let activeEventoId = sessionStorage.getItem('active_evento_id') || localStorage.getItem('active_evento_id');
  
  // Fallback: Tentar pegar da URL se não estiver no storage
  if (!activeEventoId || activeEventoId === 'undefined' || activeEventoId === 'null') {
    const params = new URLSearchParams(window.location.search);
    activeEventoId = params.get('evento_id');
    if (activeEventoId) {
      log('Contexto recuperado da URL:', activeEventoId);
      sessionStorage.setItem('active_evento_id', activeEventoId);
    }
  }

  if (activeEventoId && activeEventoId !== 'undefined' && activeEventoId !== 'null') {
    config.headers['x-evento-id'] = activeEventoId;
  }

  return config;
}, (error) => {
  return Promise.reject(error);
});

// Interceptor para tratar erros de resposta
api.interceptors.response.use(
  (response) => response,
  (error) => {
    // Tratamento explicito do Rule 19: Timeout
    if (error.code === 'ECONNABORTED' || error.message.includes('timeout')) {
      if (snackbarRef && !error.config?.hideDefaultError) {
        snackbarRef('O servidor demorou para responder. Tente novamente.', { variant: 'error' });
      }
      return Promise.reject(error);
    }

    if (error.response) {
      if (error.response.status === 401) {
        log('Token inválido ou expirado, limpando sessão...');
        sessionStorage.removeItem('token');
        sessionStorage.removeItem('user');
        sessionStorage.removeItem('active_evento_id');
        localStorage.removeItem('token');
        localStorage.removeItem('user');
        localStorage.removeItem('active_evento_id');
        localStorage.removeItem('active_evento_nome');

        if (!window.location.pathname.includes('/login')) {
          window.location.href = '/login?reason=auth_failed';
        }
      } else if (error.response.status === 403) {
        // Tratamento explícito regra 18
        if (snackbarRef) {
          snackbarRef('Acesso negado.', { variant: 'error' });
        }
      } else if (error.response.status === 503) {
        if (snackbarRef) {
          snackbarRef('Sistema temporariamente offline ou sobrecarregado. Tente novamente.', { variant: 'error', autoHideDuration: 7000 });
        }
      } else if (error.response.status === 500) {
         // Silencioso no console prod.
      }
    } else if (error.request) {
      if (snackbarRef) snackbarRef('Sem conexão com o servidor.', { variant: 'warning' });
    }

    return Promise.reject(error);
  }
);

export default api;