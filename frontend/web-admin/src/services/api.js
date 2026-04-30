import axios from 'axios';

let snackbarRef = null;

export const setGlobalSnackbar = (enqueueSnackbar) => {
  snackbarRef = enqueueSnackbar;
};

const API_URL = import.meta.env.VITE_API_URL || '/api';

const api = axios.create({
  baseURL: API_URL,
  headers: {
    'Content-Type': 'application/json',
  },
  withCredentials: true // Importante para CORS com cookies
});

// Interceptor para adicionar token E evento ativo
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');

  if (token && token !== 'undefined' && token !== 'null') {
    config.headers.Authorization = `Bearer ${token}`;
  }

  // Injetar evento ativo em TODAS as requisições que precisam de contexto de evento
  const activeEventoId = localStorage.getItem('active_evento_id');
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
    console.error('Erro na requisição:', error);

    if (error.response) {
      // Erro com resposta do servidor
      console.error('Status:', error.response.status);
      console.error('Data:', error.response.data);

      // Se for 401 (não autorizado), limpar token e redirecionar
      if (error.response.status === 401) {
        console.log('Token inválido ou expirado, limpando...');
        localStorage.removeItem('token');
        localStorage.removeItem('user');

        // Só redireciona se não estiver na página de login
        if (!window.location.pathname.includes('/login')) {
          window.location.href = '/login';
        }
      }

      // Se for 503 (Serviço Indisponível)
      if (error.response.status === 503) {
        console.error('Serviço Indisponível detectado.');
        if (snackbarRef) snackbarRef('Sistema temporariamente offline ou sobrecarregado. Tente novamente.', { variant: 'error', autoHideDuration: 7000 });
        return Promise.reject(error);
      }

      // Notificação global de erro
      if (snackbarRef) {
        const msg = error.response.data?.error || error.response.data?.message || 'Erro inesperado no servidor';
        snackbarRef(msg, { variant: 'error' });
      }
    } else if (error.request) {
      // Requisição foi feita mas não houve resposta
      console.error('Sem resposta do servidor');
      if (snackbarRef) snackbarRef('Servidor indisponível ou erro de rede', { variant: 'warning' });
    } else {
      // Erro na configuração da requisição
      console.error('Erro na configuração:', error.message);
    }

    return Promise.reject(error);
  }
);

export default api;