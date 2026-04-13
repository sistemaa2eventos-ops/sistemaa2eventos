import React, { createContext, useState, useContext, useEffect } from 'react';
import { authService } from '../services/auth';

const log = import.meta.env.DEV ? console.log : () => {};

const AuthContext = createContext({});

export const useAuth = () => useContext(AuthContext);

export const getDefaultRoute = (nivel_acesso) => {
  const routes = {
    master: '/',
    operador: '/checkin'
  };
  return routes[nivel_acesso] || '/login';
};

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let isMounted = true;
    const initAuth = async () => {
      const storedToken = sessionStorage.getItem('token') || localStorage.getItem('token');
      
      if (!storedToken) {
        if (isMounted) setLoading(false);
        return;
      }
      
      try {
        const response = await authService.me();
        if (response.success && response.user) {
          // Garante que só os dados seguros fiquem no estado (regra 13)
          const { id, nome, email, nivel_acesso, avatar_url, evento_id } = response.user;
          const cleanUser = { id, nome, email, nivel_acesso, avatar_url, evento_id };
          
          if (isMounted) {
            setUser(cleanUser);
            setToken(storedToken);
            
            // Re-sync do evento_id para o axios (session prevalece ou local)
            if (evento_id && nivel_acesso !== 'master') {
                const storage = sessionStorage.getItem('token') ? sessionStorage : localStorage;
                storage.setItem('active_evento_id', evento_id);
            }
          }
        } else {
          throw new Error('Sessão inválida');
        }
      } catch (err) {
        log('Erro na validação do token, limpando storages...');
        sessionStorage.removeItem('token');
        sessionStorage.removeItem('user');
        sessionStorage.removeItem('active_evento_id');
        localStorage.removeItem('token');
        localStorage.removeItem('user');
        localStorage.removeItem('active_evento_id');
        localStorage.removeItem('active_evento_nome');
        if (isMounted) {
          setUser(null);
          setToken(null);
        }
      } finally {
        if (isMounted) setLoading(false);
      }
    };

    initAuth();
    return () => { isMounted = false; };
  }, []);

  const login = async (email, password, rememberMe) => {
    try {
      const response = await authService.login(email, password);

      if (response.success) {
        const payloadToken = response.session?.access_token || response.token;
        const payloadUser = response.user || response.data;
        
        // Limpeza dos dados: apenas nivel_acesso provindo exclusivamente do banco (regra 1 e 13)
        const { id, nome, userEmail, nivel_acesso, avatar_url, evento_id } = payloadUser;
        const cleanUser = { id, nome, email: userEmail || email, nivel_acesso, avatar_url, evento_id };

        // Regra 9: Lembrar de mim
        const storage = rememberMe ? localStorage : sessionStorage;
        storage.setItem('token', payloadToken);
        
        if (nivel_acesso !== 'master' && evento_id) {
          storage.setItem('active_evento_id', evento_id);
        }

        setUser(cleanUser);
        setToken(payloadToken);
        
        return { success: true, user: cleanUser };
      } else {
        return { success: false, error: response.error || 'Email ou senha incorretos' };
      }
    } catch (err) {
      log('Erro no login:', err);
      // Mensagens de erro amigáveis
      let errorMsg = "Erro no servidor. Tente novamente em instantes.";
      if (!err.response) {
        errorMsg = "Sem conexão com o servidor.";
      } else if (err.response.status === 401) {
        errorMsg = "Email ou senha incorretos";
      } else if (err.response.status === 403) {
        errorMsg = "Seu acesso está suspenso. Contate o administrador.";
      } else if (err.response.data && err.response.data.error) {
        errorMsg = err.response.data.error;
      }
      return { success: false, error: errorMsg };
    }
  };

  const logout = async () => {
    try {
      await authService.logout();
    } finally {
      setUser(null);
      setToken(null);
      sessionStorage.removeItem('token');
      sessionStorage.removeItem('user');
      sessionStorage.removeItem('active_evento_id');
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      localStorage.removeItem('active_evento_id');
      localStorage.removeItem('active_evento_nome');
      window.location.href = '/login';
    }
  };

  // Simples compatibilidade com os componentes legados
  const hasPermission = () => true; 
  const hasMenuAccess = () => true;

  const value = {
    user,
    token,
    loading,
    login,
    logout,
    hasPermission,
    hasMenuAccess
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
};