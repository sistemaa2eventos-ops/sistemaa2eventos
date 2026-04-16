import React, { createContext, useState, useContext, useEffect } from 'react';
import { authService } from '../services/auth';

const log = import.meta.env.DEV ? console.log : () => {};

const AuthContext = createContext({});

export const useAuth = () => useContext(AuthContext);

export const getDefaultRoute = (nivel_acesso) => {
  const routes = {
    admin_master: '/',
    operador: '/checkin'
  };
  return routes[nivel_acesso] || '/login';
};

// Módulos disponíveis
export const MODULOS = [
  { key: 'dashboard', label: 'Dashboard', icon: 'Home' },
  { key: 'empresas', label: 'Empresas', icon: 'Building' },
  { key: 'pessoas', label: 'Pessoas', icon: 'Users' },
  { key: 'auditoria_documentos', label: 'Auditoria', icon: 'FileText' },
  { key: 'monitoramento', label: 'Monitoramento', icon: 'Monitor' },
  { key: 'relatorios', label: 'Relatórios', icon: 'BarChart' },
  { key: 'checkin', label: 'Check-in', icon: 'LogIn' },
  { key: 'checkout', label: 'Check-out', icon: 'LogOut' }
];

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
          const { id, nome, email, nivel_acesso, avatar_url, evento_id, permissions, status } = response.user;
          const cleanUser = { id, nome, email, nivel_acesso, avatar_url, evento_id, permissions, status };
          
          if (isMounted) {
            setUser(cleanUser);
            setToken(storedToken);
          }
        } else {
          throw new Error('Sessão inválida');
        }
      } catch (err) {
        log('Erro na validação do token, limpando storages...');
        sessionStorage.removeItem('token');
        sessionStorage.removeItem('user');
        localStorage.removeItem('token');
        localStorage.removeItem('user');
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
        
        const { id, nome, userEmail, nivel_acesso, avatar_url, evento_id, permissions, status } = payloadUser;
        const cleanUser = { id, nome, email: userEmail || email, nivel_acesso, avatar_url, evento_id, permissions, status };

        // Regra 9: Lembrar de mim
        const storage = rememberMe ? localStorage : sessionStorage;
        storage.setItem('token', payloadToken);
        
        setUser(cleanUser);
        setToken(payloadToken);
        
        return { success: true, user: cleanUser };
      } else {
        return { success: false, error: response.error || 'Email ou senha incorretos' };
      }
    } catch (err) {
      log('Erro no login:', err);
      let errorMsg = "Erro no servidor. Tente novamente em instantes.";
      if (!err.response) {
        errorMsg = "Sem conexão com o servidor.";
      } else if (err.response.status === 401) {
        errorMsg = "Email ou senha incorretos";
      } else if (err.response.status === 403) {
        const errorData = err.response.data?.error || '';
        if (errorData.includes('pendente')) {
          errorMsg = "Aguarde aprovação do administrador.";
        } else if (errorData.includes('inativo')) {
          errorMsg = "Usuário inativo. Contate o administrador.";
        } else {
          errorMsg = "Acesso negado.";
        }
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
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      window.location.href = '/login';
    }
  };

  // Verificar se tem permissão para módulo
  const hasPermission = (modulo) => {
    if (!user) return false;
    // admin_master tem todas as permissões
    if (user.nivel_acesso === 'admin_master') return true;
    // Operador consulta permissions
    return user.permissions?.[modulo] === true;
  };

  // Verificar se tem acesso ao menu
  const hasMenuAccess = (modulo) => {
    return hasPermission(modulo);
  };

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