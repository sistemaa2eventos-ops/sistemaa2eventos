import api from './api';

const log = import.meta.env.DEV ? console.log : () => {};

export const authService = {
  async login(email, password) {
    const response = await api.post('/auth/login', { email, password });
    return response.data;
  },

  async logout(sessaoReport = null) {
    try {
      if (sessaoReport) {
        await api.post('/audit/sessao-logout', sessaoReport).catch(err => {
          log('Erro ao registrar log consolidado de sessão no backend:', err);
        });
      }
      await api.post('/auth/logout');
    } catch (e) {
      log('Erro no logout remoto', e);
    }
  },

  async updateAvatar(avatar_url) {
    const response = await api.post('/auth/avatar', { avatar_url });
    return response.data;
  },

  async me() {
    const response = await api.get('/auth/me');
    return response.data;
  },

  async forgotPassword(email) {
    const response = await api.post('/auth/forgot-password', { email });
    return response.data;
  },

  async setActiveEvent(evento_id) {
    try {
      const response = await api.post('/auth/active-event', { evento_id });
      return response.data;
    } catch (e) {
      log('Erro ao definir evento ativo no backend:', e);
      return { success: false, error: e.message };
    }
  }
};
