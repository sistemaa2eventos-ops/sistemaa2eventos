import React, { createContext, useState, useContext, useEffect } from 'react';
import { authService } from '../services/auth';

const AuthContext = createContext({});

export const useAuth = () => useContext(AuthContext);

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    // Carregar usuário do localStorage
    try {
      const storedUser = localStorage.getItem('user');
      const storedToken = localStorage.getItem('token');

      console.log('AuthProvider - Carregando usuário:', {
        hasUser: !!storedUser,
        hasToken: !!storedToken
      });

      if (storedUser && storedToken && storedToken !== 'undefined') {
        const parsedUser = JSON.parse(storedUser);
        
        // --- HARD-RESET DE SOBERANIA MASTER ---
        // Se o usuário for Master, limpamos o contexto de evento para garantir visão global
        if (parsedUser.nivel_acesso === 'master') {
          console.log('🦅 SOBERANIA MASTER DETECTADA! Limpando contexto de evento para visão global...');
          localStorage.removeItem('active_evento_id');
          localStorage.removeItem('active_evento_nome');
          setUser(parsedUser);
        } else {
          setUser(parsedUser);
          // Garante que o evento atribuído seja o ativo no reload para outros cargos
          if (parsedUser.evento_id && parsedUser.eventos) {
            localStorage.setItem('active_evento_id', parsedUser.evento_id);
            localStorage.setItem('active_evento_nome', parsedUser.eventos.nome);
          }
        }
      } else {
        // Limpar dados inválidos
        localStorage.removeItem('user');
        localStorage.removeItem('token');
        setUser(null);
      }
    } catch (err) {
      console.error('Erro ao carregar usuário:', err);
      localStorage.removeItem('user');
      localStorage.removeItem('token');
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, []);

  const login = async (email, password) => {
    setError(null);
    try {
      console.log('AuthProvider - Tentando login...');
      const response = await authService.login(email, password);

      console.log('AuthProvider - Resposta do login:', response);

      if (response.success) {
        setUser(response.user);

        // Se o usuário tem um evento atribuído, define como ativo automaticamente
        if (response.user.evento_id && response.user.eventos) {
          localStorage.setItem('active_evento_id', response.user.evento_id);
          localStorage.setItem('active_evento_nome', response.user.eventos.nome);
          window.dispatchEvent(new Event('storage'));
        }

        return { success: true, user: response.user };
      } else {
        setError('Credenciais inválidas');
        return { success: false, error: 'Credenciais inválidas' };
      }
    } catch (err) {
      console.error('AuthProvider - Erro no login:', err);
      const errorMsg = err.response?.data?.error || 'Erro ao fazer login';
      setError(errorMsg);
      return { success: false, error: errorMsg };
    }
  };

  const logout = async () => {
    try {
      console.log('AuthProvider - Fazendo logout...');
      await authService.logout();
    } catch (err) {
      console.error('Erro no logout:', err);
    } finally {
      setUser(null);
      localStorage.removeItem('user');
      localStorage.removeItem('token');
    }
  };

  /**
   * Avalia dinamicamente do lado do cliente se o operador possui permissão (Role-Based Access)
   */
  const hasPermission = (recurso, acao) => {
    if (!user) return false;
    if (user.nivel_acesso === 'master' || user.nivel_acesso === 'admin') return true;

    if (!user.permissions || !Array.isArray(user.permissions)) return false;

    return user.permissions.some(p =>
      (p.recurso === recurso || p.recurso === '*') &&
      (p.acao === acao || p.acao === '*')
    );
  };

  /**
   * Verifica se o usuário tem acesso a um item de menu específico.
   * Se não houver permissões configuradas para o role, assume acesso total (open by default).
   */
  const hasMenuAccess = (menuKey, platform = 'web_admin') => {
    if (!user) return false;
    if (user.nivel_acesso === 'master' || user.nivel_acesso === 'admin') return true;

    const menuPerms = user.menu_permissions;
    if (!menuPerms || !menuPerms[platform] || menuPerms[platform].length === 0) {
      return true; // Open by default se não configurado
    }

    return menuPerms[platform].includes(menuKey);
  };

  const value = {
    user,
    login,
    logout,
    hasPermission,
    hasMenuAccess,
    loading,
    error
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
};