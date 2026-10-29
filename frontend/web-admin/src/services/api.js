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
    'X-App-Version': '2026-10-28-v2',
  },
  withCredentials: true // Importante para CORS com cookies
});

// Interceptor para adicionar token E evento ativo verificando session e em seguida localStorage
api.interceptors.request.use((config) => {
  const token = sessionStorage.getItem('token') || localStorage.getItem('token');

  if (token && token !== 'undefined' && token !== 'null') {
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
    // Silenciar erros de requisições canceladas (ex: navegação rápida)
    if (axios.isCancel(error)) {
      return Promise.reject(error);
    }

    // Tratamento explicito do Rule 19: Timeout
    if (error.code === 'ECONNABORTED' || error.message.includes('timeout')) {
      if (snackbarRef && !error.config?.hideDefaultError) {
        snackbarRef('O servidor demorou para responder. Tente novamente.', { variant: 'error' });
      }
      return Promise.reject(error);
    }

    if (error.response) {
      const status = error.response.status;

      if (status === 401) {
        console.error('Token inválido ou expirado, limpando sessão...');
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
      } else if (status === 403) {
        console.error('Acesso negado:', error.response.data);
        if (snackbarRef && !error.config?.hideDefaultError) {
          snackbarRef('Acesso negado.', { variant: 'error' });
        }
      } else if (status === 503) {
        console.error('Serviço Indisponível detectado.');
        if (snackbarRef && !error.config?.hideDefaultError) {
          snackbarRef('Sistema temporariamente offline ou sobrecarregado. Tente novamente.', { variant: 'error', autoHideDuration: 7000 });
        }
      } else {
        // Demais respostas (400/404/500...) → log + notificação global (produção)
        console.error('Erro na requisição:', status, error.response.data);
        if (snackbarRef && !error.config?.hideDefaultError) {
          const msg = error.response.data?.error || error.response.data?.message || 'Erro inesperado no servidor';
          snackbarRef(msg, { variant: 'error' });
        }
      }
    } else if (error.request) {
      // Requisição foi feita mas não houve resposta
      console.error('Sem resposta do servidor');
      if (snackbarRef) snackbarRef('Sem conexão com o servidor.', { variant: 'warning' });
    } else {
      // Erro na configuração da requisição
      console.error('Erro na configuração:', error.message);
    }

    return Promise.reject(error);
  }
);

export default api;
