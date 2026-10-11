import React, { createContext, useState, useContext, useEffect } from 'react';
import { authService } from '../services/auth';

const log = import.meta.env.DEV ? console.log : () => {};

const AuthContext = createContext({});

export const useAuth = () => useContext(AuthContext);

export const getDefaultRoute = (nivel_acesso) => {
  const routes = {
    admin_master: '/',
    operador: '/checkin',
    op_atendimento: '/checkin',
    op_monitoramento: '/monitor',
    op_analista: '/'
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
  { key: 'veiculos', label: 'Veículos', icon: 'Truck' },
  { key: 'checkin', label: 'Check-in', icon: 'LogIn' },
  { key: 'checkout', label: 'Check-out', icon: 'LogOut' }
];

// Chaves antigas do menu granular de produção usadas pelo Sidebar
const _LEGACY_MENU_KEYS = {
  pessoas: 'participantes',
  auditoria_documentos: 'auditoria',
  veiculos: 'frota_lpr',
  monitoramento: 'monitor'
};

export const CANONICAL_RECURSO_MAP = {
  participantes: 'pessoas',
  pessoas: 'pessoas',
  empresas: 'empresas',
  auditoria: 'auditoria_documentos',
  auditoria_documentos: 'auditoria_documentos',
  frota_lpr: 'veiculos',
  veiculos: 'veiculos',
  monitor: 'monitoramento',
  monitoramento: 'monitoramento',
  checkin: 'checkin',
  checkout: 'checkout',
  fiscalizacao: 'fiscalizacao',
  relatorios: 'relatorios',
  dispositivos: 'dispositivos',
  usuarios: 'usuarios',
  dashboard: 'dashboard'
};

const isSuperUser = (nivel) => nivel === 'admin_master';

const clearAuthStorage = () => {
  ['token', 'user'].forEach((key) => {
    localStorage.removeItem(key);
    sessionStorage.removeItem(key);
  });
};

const readStoredUser = () => {
  try {
    const raw = localStorage.getItem('user') || sessionStorage.getItem('user');
    if (raw && raw !== 'undefined') {
      return JSON.parse(raw);
    }
  } catch (err) {
    log('Erro ao ler usuário armazenado:', err);
  }
  return null;
};

// Soberania Master: contexto de evento sempre global.
// Demais cargos: evento atribuído volta a ser o ativo no reload (produção).
const syncEventoContext = (user) => {
  if (!user) return user;
  if (isSuperUser(user.nivel_acesso)) {
    localStorage.removeItem('active_evento_id');
    localStorage.removeItem('active_evento_nome');
    return user;
  }
  if (user.evento_id && user.eventos && user.eventos.nome) {
    localStorage.setItem('active_evento_id', user.evento_id);
    localStorage.setItem('active_evento_nome', user.eventos.nome);
  }
  return user;
};

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let isMounted = true;
    const initAuth = async () => {
      // FIX 2.5: sessionStorage é o storage padrão (token morre ao fechar o browser)
      // localStorage só é usado quando o usuário marcou "Lembrar de mim"
      const sessionToken = sessionStorage.getItem('token');
      const localToken = localStorage.getItem('token');
      const storedToken = sessionToken || localToken;

      if (!storedToken || storedToken === 'undefined' || storedToken === 'null') {
        clearAuthStorage();
        if (isMounted) {
          setUser(null);
          setToken(null);
          setLoading(false);
        }
        return;
      }

      // Produção: sessão imediata a partir do cache (sem flicker, funciona offline)
      const storedUser = readStoredUser();
      if (storedUser && isMounted) {
        const cachedUser = syncEventoContext(storedUser);
        setUser(cachedUser);
        setToken(storedToken);
        setLoading(false);
        try {
          localStorage.setItem('user', JSON.stringify(cachedUser));
        } catch (err) {
          log('Erro ao persistir usuário:', err);
        }
      }

      // Valida/atualiza a sessão no servidor
      try {
        const response = await authService.me();
        const fresh = response && response.success
          ? (response.user || response.profile)
          : null;
        if (!fresh) throw new Error('Sessão inválida');

        const merged = {
          ...(storedUser || {}),
          ...fresh,
          email: fresh.email || (storedUser && storedUser.email),
          nome: fresh.nome || fresh.nome_completo || (storedUser && storedUser.nome),
          menu_permissions: fresh.menu_permissions || (storedUser && storedUser.menu_permissions),
          eventos: fresh.eventos || (storedUser && storedUser.eventos)
        };

        const nextUser = syncEventoContext(merged);
        if (isMounted) {
          setUser(nextUser);
          setToken(storedToken);
        }

        const storage = localToken ? localStorage : sessionStorage;
        storage.setItem('user', JSON.stringify(nextUser));
        if (!storedUser) {
          storage.setItem('token', storedToken);
        }
      } catch (err) {
        const status = err && err.response && err.response.status;
        if (status === 401 || status === 403 || !storedUser) {
          log('Sessão inválida, limpando storages...');
          clearAuthStorage();
          if (isMounted) {
            setUser(null);
            setToken(null);
          }
        } else {
          log('Validação de sessão indisponível; mantendo usuário em cache.', err);
        }
      } finally {
        if (isMounted && !storedUser) setLoading(false);
      }
    };

    initAuth();
    return () => { isMounted = false; };
  }, []);

  const login = async (email, password, rememberMe) => {
    setError(null);
    try {
      log('AuthProvider - Tentando login...');
      const response = await authService.login(email, password);

      if (response.success) {
        const payloadToken = response.session?.access_token || response.token;
        const payloadUser = response.user || response.data || {};

        let finalUser = { ...payloadUser };
        if (!finalUser.email) finalUser.email = payloadUser.userEmail || email;

        finalUser = syncEventoContext(finalUser);

        // Regra 25: "Lembrar de mim" decide o storage.
        // Sem preferência explícita → localStorage (comportamento de produção).
        const primary = rememberMe === false ? sessionStorage : localStorage;
        const secondary = rememberMe === false ? localStorage : sessionStorage;

        secondary.removeItem('token');
        secondary.removeItem('user');
        if (payloadToken) primary.setItem('token', payloadToken);
        primary.setItem('user', JSON.stringify(finalUser));

        // Para outros cargos, vincula o evento ativo (produção)
        if (!isSuperUser(finalUser.nivel_acesso) && finalUser.evento_id && finalUser.eventos) {
          localStorage.setItem('active_evento_id', finalUser.evento_id);
          localStorage.setItem('active_evento_nome', finalUser.eventos.nome);
          window.dispatchEvent(new Event('storage'));
        }

        setUser(finalUser);
        setToken(payloadToken);

        return { success: true, user: finalUser };
      }

      const loginError = response.error || 'Credenciais inválidas';
      setError(loginError);
      return { success: false, error: loginError };
    } catch (err) {
      log('Erro no login:', err);
      let errorMsg = 'Erro ao fazer login';
      if (!err.response) {
        errorMsg = 'Sem conexão com o servidor.';
      } else if (err.response.status === 401) {
        errorMsg = 'Email ou senha incorretos';
      } else if (err.response.status === 403) {
        const errorData = err.response.data?.error || '';
        if (errorData.includes('pendente')) {
          errorMsg = 'Aguarde aprovação do administrador.';
        } else if (errorData.includes('inativo')) {
          errorMsg = 'Usuário inativo. Contate o administrador.';
        } else {
          errorMsg = 'Acesso negado.';
        }
      } else if (err.response.data && err.response.data.error) {
        errorMsg = err.response.data.error;
      }
      setError(errorMsg);
      return { success: false, error: errorMsg };
    }
  };

  const updateUserAvatar = async (avatarUrl) => {
    try {
      setUser(prev => prev ? { ...prev, avatar_url: avatarUrl } : prev);
      if (user?.id) {
        localStorage.setItem(`nzt_operator_avatar_${user.id}`, avatarUrl);
      }
      await authService.updateAvatar(avatarUrl);
    } catch (err) {
      log('Erro ao sincronizar avatar com backend:', err);
    }
  };

  const logout = async () => {
    try {
      log('AuthProvider - Fazendo logout...');
      const opId = user?.id;
      const loginKey = `nzt_session_login_${opId}`;
      const notesKey = `nzt_operator_notes_${opId}`;
      const loginTime = localStorage.getItem(loginKey) || new Date(Date.now() - 60000).toISOString();
      const logoutTime = new Date().toISOString();
      const durationSeconds = Math.max(1, Math.floor((new Date(logoutTime) - new Date(loginTime)) / 1000));
      const hours = Math.floor(durationSeconds / 3600);
      const minutes = Math.floor((durationSeconds % 3600) / 60);
      const seconds = durationSeconds % 60;
      const formattedDuration = `${String(hours).padStart(2, '0')}h ${String(minutes).padStart(2, '0')}m ${String(seconds).padStart(2, '0')}s`;
      const notes = localStorage.getItem(notesKey) || '';

      const sessaoReport = {
        operador_id: opId,
        operador_nome: user?.nome_completo || user?.nome || 'Operador',
        operador_email: user?.email,
        nivel_acesso: user?.nivel_acesso,
        evento_id: localStorage.getItem('active_evento_id') || user?.evento_id,
        login_at: loginTime,
        logout_at: logoutTime,
        tempo_online_segundos: durationSeconds,
        tempo_online_formatado: formattedDuration,
        notas: notes
      };

      await authService.logout(sessaoReport);

      if (opId) {
        localStorage.removeItem(loginKey);
      }
    } catch (err) {
      console.error('Erro no logout:', err);
    } finally {
      setUser(null);
      setToken(null);
      clearAuthStorage();
      sessionStorage.removeItem('active_evento_id');
      localStorage.removeItem('active_evento_id');
      localStorage.removeItem('active_evento_nome');
      if (!window.location.pathname.includes('/login')) {
        window.location.href = '/login';
      }
    }
  };

  const getActiveEventoId = () => {
    return localStorage.getItem('active_evento_id') || user?.evento_id || null;
  };

  /**
   * Calcula permissões dinâmicas baseadas no evento ativo e vínculos do operador
   */
  const getEffectivePermissions = (targetEventoId) => {
    if (!user) return {};
    if (isSuperUser(user.nivel_acesso)) {
      return {
        '*': true,
        dashboard: true,
        empresas: true,
        pessoas: true,
        auditoria_documentos: true,
        monitoramento: true,
        relatorios: true,
        veiculos: true,
        checkin: true,
        checkout: true,
        fiscalizacao: true,
        dispositivos: true,
        usuarios: true,
        configuracoes: true
      };
    }

    const eid = targetEventoId || getActiveEventoId();
    const vinculoTipo = user.vinculo_tipo || user.permissions?.vinculo_tipo || (user.evento_id ? 'especifico' : 'global');
    const permitidos = user.eventos_permitidos || user.permissions?.eventos_permitidos || (user.evento_id ? [user.evento_id] : []);

    // Se vínculo é específico e o evento ativo não está na lista de permitidos, bloqueia
    if (vinculoTipo === 'especifico' && Array.isArray(permitidos) && permitidos.length > 0) {
      if (eid && !permitidos.includes(eid)) {
        return {};
      }
    }

    // Permissões customizadas por evento específico
    const perEventMap = user.eventos_permissoes || user.permissions?.eventos_permissoes;
    if (eid && perEventMap && perEventMap[eid]) {
      return perEventMap[eid];
    }

    // Permissões calculadas enviadas pelo backend
    if (user.effectivePermissions && typeof user.effectivePermissions === 'object') {
      return user.effectivePermissions;
    }

    // Permissões base do usuário
    if (user.permissions && typeof user.permissions === 'object' && !Array.isArray(user.permissions)) {
      return user.permissions;
    }

    return {};
  };

  /**
   * Role-Based Access Control (RBAC) com suporte a multi-eventos
   */
  const hasPermission = (recurso, _acao) => {
    if (!user) return false;
    if (isSuperUser(user.nivel_acesso)) return true;

    const canonicalKey = CANONICAL_RECURSO_MAP[recurso] || recurso;

    // Módulos restritos exclusivamente para administração
    if (['usuarios', 'configuracoes', 'auditoria_sistema', 'eventos'].includes(canonicalKey)) {
      return false;
    }

    const activePerms = getEffectivePermissions();

    if (activePerms['*'] === true) return true;
    if (activePerms[canonicalKey] === true || activePerms[recurso] === true) {
      return true;
    }

    // Para operadores, fechado por padrão
    return false;
  };

  /**
   * Visibilidade de itens no menu do operador
   */
  const hasMenuAccess = (menuKey) => {
    return hasPermission(menuKey);
  };

  const changeActiveEvento = async (eventoId, eventoNome) => {
    if (!eventoId) return;
    try {
      localStorage.setItem('active_evento_id', eventoId);
      if (eventoNome) localStorage.setItem('active_evento_nome', eventoNome);
      
      const res = await authService.setActiveEvent(eventoId);
      if (res && res.effectivePermissions) {
        setUser(prev => prev ? {
          ...prev,
          evento_id: eventoId,
          effectivePermissions: res.effectivePermissions
        } : prev);
      }
      window.dispatchEvent(new Event('storage'));
    } catch (err) {
      log('Erro ao mudar evento ativo:', err);
    }
  };

  const value = {
    user,
    token,
    loading,
    error,
    login,
    logout,
    updateUserAvatar,
    hasPermission,
    hasMenuAccess,
    getEffectivePermissions,
    getActiveEventoId,
    changeActiveEvento
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
};
