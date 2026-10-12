import { useState, useEffect, useCallback } from 'react';
import { useSnackbar } from 'notistack';
import api from '../services/api';

// Módulos disponíveis no sistema
export const MODULOS = [
  { key: 'dashboard', label: 'Dashboard' },
  { key: 'checkin', label: 'Check-in' },
  { key: 'checkout', label: 'Check-out' },
  { key: 'fiscalizacao', label: 'Fiscalização de Áreas' },
  { key: 'monitoramento', label: 'Monitoramento' },
  { key: 'pessoas', label: 'Participantes / Pessoas' },
  { key: 'empresas', label: 'Empresas' },
  { key: 'relatorios', label: 'Relatórios' },
  { key: 'veiculos', label: 'Veículos LPR' },
  { key: 'auditoria_documentos', label: 'Auditoria Documental' },
  { key: 'dispositivos', label: 'Terminais / Dispositivos' }
];

export const DEFAULT_PERMISSIONS = {
  dashboard: true,
  checkin: false,
  checkout: false,
  fiscalizacao: false,
  monitoramento: false,
  pessoas: false,
  empresas: false,
  relatorios: false,
  veiculos: false,
  auditoria_documentos: false,
  dispositivos: false,
  usuarios: false
};

/**
 * useUsuarios: Hook para gestão de operadores com suporte a multi-eventos
 */
export const useUsuarios = () => {
    const { enqueueSnackbar } = useSnackbar();
    const [usuarios, setUsuarios] = useState([]);
    const [eventos, setEventos] = useState([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState('');
    const [page, setPage] = useState(1);

    // Dialog States
    const [openDialog, setOpenDialog] = useState(false);
    const [openDeleteConfirm, setOpenDeleteConfirm] = useState(false);
    const [openPasswordDialog, setOpenPasswordDialog] = useState(false);
    const [resetingPassword, setResetingPassword] = useState(false);
    const [selectedUser, setSelectedUser] = useState(null);
    const [_userToDelete, setUserToDelete] = useState(null);
    
    // Formulário do Operador
    const [formData, setFormData] = useState({
        email: '',
        nome_completo: '',
        telefone: '',
        nivel_acesso: 'operador',
        vinculo_tipo: 'global', // 'global' | 'especifico'
        eventos_permitidos: [], // array de IDs de eventos permitidos
        eventos_permissoes: {}, // { [eventoId]: { checkin: true, ... } }
        evento_id: '',
        permissions: { ...DEFAULT_PERMISSIONS }
    });

    const loadEventos = useCallback(async () => {
        try {
            const response = await api.get('/eventos');
            setEventos(response.data.data || []);
        } catch (error) {
            console.error('Erro ao buscar eventos:', error);
        }
    }, []);

    const loadUsuarios = useCallback(async () => {
        try {
            setLoading(true);
            const response = await api.get('/auth/users', {
                params: { search }
            });
            const users = (response.data.users || response.data.data || []).map(user => {
                const vinculoTipo = user.vinculo_tipo || user.permissions?.vinculo_tipo || (user.evento_id ? 'especifico' : 'global');
                const permitidos = user.eventos_permitidos || user.permissions?.eventos_permitidos || (user.evento_id ? [user.evento_id] : []);
                const permsMap = user.eventos_permissoes || user.permissions?.eventos_permissoes || {};

                return {
                    ...user,
                    email: user.email || '',
                    vinculo_tipo: vinculoTipo,
                    eventos_permitidos: permitidos,
                    eventos_permissoes: permsMap,
                    eventos: user.eventos || { nome: vinculoTipo === 'global' ? 'Todos os Eventos' : 'Específico' }
                };
            });
            setUsuarios(users);
        } catch (error) {
            console.error('Erro ao buscar usuários:', error);
        } finally {
            setLoading(false);
        }
    }, [search]);

    useEffect(() => {
        loadUsuarios();
        loadEventos();
    }, [loadUsuarios, loadEventos]);

    const handleOpenDialog = (user = null) => {
        if (user) {
            setSelectedUser(user);
            const vinculoTipo = user.vinculo_tipo || user.permissions?.vinculo_tipo || (user.evento_id ? 'especifico' : 'global');
            const permitidos = user.eventos_permitidos || user.permissions?.eventos_permitidos || (user.evento_id ? [user.evento_id] : []);
            const permsPorEvento = user.eventos_permissoes || user.permissions?.eventos_permissoes || {};
            const basePerms = { ...DEFAULT_PERMISSIONS, ...(user.permissions || {}), dashboard: true };

            const initializedPerms = { ...permsPorEvento };
            permitidos.forEach(eid => {
                if (!initializedPerms[eid]) {
                    initializedPerms[eid] = { ...basePerms };
                }
            });

            setFormData({
                email: user.email || '',
                nome_completo: user.nome_completo || '',
                telefone: user.telefone || '',
                nivel_acesso: user.nivel_acesso || 'operador',
                vinculo_tipo: vinculoTipo,
                eventos_permitidos: permitidos,
                eventos_permissoes: initializedPerms,
                evento_id: user.evento_id || (permitidos.length > 0 ? permitidos[0] : ''),
                permissions: basePerms
            });
        } else {
            setSelectedUser(null);
            setFormData({
                email: '',
                nome_completo: '',
                telefone: '',
                nivel_acesso: 'operador',
                vinculo_tipo: 'global',
                eventos_permitidos: [],
                eventos_permissoes: {},
                evento_id: '',
                permissions: { ...DEFAULT_PERMISSIONS }
            });
            // Operador novo parte do modelo do perfil (Configurações → Perfis de Acesso)
            api.get('/auth/permissions/operador', { hideDefaultError: true })
                .then(({ data }) => {
                    const modelo = data?.data?.modulos;
                    if (!modelo) return;
                    // Só se as permissões ainda forem as padrão (o admin não começou a ajustar)
                    setFormData(prev => JSON.stringify(prev.permissions) === JSON.stringify(DEFAULT_PERMISSIONS)
                        ? { ...prev, permissions: { ...DEFAULT_PERMISSIONS, ...modelo, dashboard: true } }
                        : prev);
                })
                .catch(() => { /* sem modelo: fica o padrão */ });
        }
        setOpenDialog(true);
    };

    const toggleEventPermitido = (eventoId) => {
        setFormData(prev => {
            const current = [...(prev.eventos_permitidos || [])];
            const idx = current.indexOf(eventoId);
            let nextPermitidos;
            let nextPermissoes = { ...(prev.eventos_permissoes || {}) };

            if (idx >= 0) {
                nextPermitidos = current.filter(id => id !== eventoId);
                delete nextPermissoes[eventoId];
            } else {
                nextPermitidos = [...current, eventoId];
                if (!nextPermissoes[eventoId]) {
                    nextPermissoes[eventoId] = { ...(prev.permissions || DEFAULT_PERMISSIONS) };
                }
            }

            return {
                ...prev,
                eventos_permitidos: nextPermitidos,
                eventos_permissoes: nextPermissoes,
                evento_id: nextPermitidos.length > 0 ? nextPermitidos[0] : ''
            };
        });
    };

    const updateEventPermission = (eventoId, permKey, value) => {
        setFormData(prev => {
            const currentEventPerms = prev.eventos_permissoes?.[eventoId] || { ...(prev.permissions || DEFAULT_PERMISSIONS) };
            return {
                ...prev,
                eventos_permissoes: {
                    ...(prev.eventos_permissoes || {}),
                    [eventoId]: {
                        ...currentEventPerms,
                        [permKey]: value,
                        dashboard: true
                    }
                }
            };
        });
    };

    const copyPermissionsToAllEvents = (sourceEventoId) => {
        setFormData(prev => {
            const sourcePerms = sourceEventoId && prev.eventos_permissoes?.[sourceEventoId]
                ? prev.eventos_permissoes[sourceEventoId]
                : prev.permissions;

            const newPermissoes = {};
            (prev.eventos_permitidos || []).forEach(eid => {
                newPermissoes[eid] = { ...sourcePerms, dashboard: true };
            });

            return {
                ...prev,
                eventos_permissoes: newPermissoes
            };
        });
        enqueueSnackbar('Permissões replicadas para todos os eventos selecionados!', { variant: 'info' });
    };

    const handleSave = async () => {
        try {
            if (!formData.email) {
                enqueueSnackbar('E-mail é obrigatório.', { variant: 'warning' });
                return;
            }
            if (!formData.nome_completo) {
                enqueueSnackbar('Nome completo é obrigatório.', { variant: 'warning' });
                return;
            }
            if (formData.vinculo_tipo === 'especifico' && (!formData.eventos_permitidos || formData.eventos_permitidos.length === 0)) {
                enqueueSnackbar('Para vínculo específico, selecione ao menos um evento disponível.', { variant: 'warning' });
                return;
            }

            const payload = {
                nome_completo: formData.nome_completo.trim(),
                telefone: formData.telefone || null,
                vinculo_tipo: formData.vinculo_tipo,
                eventos_permitidos: formData.vinculo_tipo === 'especifico' ? formData.eventos_permitidos : [],
                eventos_permissoes: formData.vinculo_tipo === 'especifico' ? formData.eventos_permissoes : {},
                evento_id: formData.vinculo_tipo === 'especifico' && formData.eventos_permitidos.length > 0 ? formData.eventos_permitidos[0] : (formData.evento_id || null),
                permissions: { ...formData.permissions, dashboard: true }
            };

            if (selectedUser) {
                if (formData.email && formData.email.trim() !== selectedUser.email) {
                    await api.put(`/auth/users/${selectedUser.id}/email`, {
                        email: formData.email.trim()
                    });
                }
                await api.put(`/auth/users/${selectedUser.id}`, payload);
                enqueueSnackbar('Operador atualizado com sucesso!', { variant: 'success' });
            } else {
                await api.post('/auth/invite', {
                    ...payload,
                    email: formData.email.trim()
                });
                enqueueSnackbar('Convite enviado com sucesso!', { variant: 'success' });
            }
            setOpenDialog(false);
            loadUsuarios();
        } catch (error) {
            enqueueSnackbar(error.response?.data?.error || 'Erro ao salvar operador.', { variant: 'error' });
        }
    };

    const handleApprove = async (userId) => {
        try {
            await api.post(`/auth/users/${userId}/approve`, {
                evento_id: formData.evento_id,
                permissions: formData.permissions
            });
            enqueueSnackbar('Usuário aprovado!', { variant: 'success' });
            loadUsuarios();
        } catch (error) {
            enqueueSnackbar(error.response?.data?.error || 'Erro ao aprovar.', { variant: 'error' });
        }
    };

    const handleToggleStatus = async (userId, currentStatus) => {
        try {
            const newStatus = currentStatus === 'ativo' ? 'inativo' : 'ativo';
            await api.patch(`/auth/users/${userId}/status`, { status: newStatus });
            enqueueSnackbar(`Usuário ${newStatus === 'ativo' ? 'ativado' : 'inativado'}.`, { variant: 'success' });
            loadUsuarios();
        } catch (error) {
            enqueueSnackbar('Erro ao alterar status.', { variant: 'error' });
        }
    };

    const handleResetPassword = async (userId, newPassword) => {
        try {
            if (!newPassword || newPassword.length < 6) {
                enqueueSnackbar('Senha deve ter pelo menos 6 caracteres.', { variant: 'warning' });
                return;
            }

            setResetingPassword(true);
            await api.post(`/auth/users/${userId}/reset-password`, {
                nova_senha: newPassword,
                confirmar_senha: newPassword
            });
            enqueueSnackbar('Senha resetada com sucesso!', { variant: 'success' });
            setOpenPasswordDialog(false);
            loadUsuarios(); // tira a marca "Pediu nova senha"
        } catch (error) {
            enqueueSnackbar(error.response?.data?.error || 'Erro ao resetar senha.', { variant: 'error' });
        } finally {
            setResetingPassword(false);
        }
    };

    const handleDeleteUser = async (userId) => {
        try {
            await api.delete(`/auth/users/${userId}`);
            enqueueSnackbar('Operador deletado com sucesso!', { variant: 'success' });
            loadUsuarios();
        } catch (error) {
            enqueueSnackbar(error.response?.data?.error || 'Erro ao deletar operador.', { variant: 'error' });
        }
    };

    return {
        usuarios, eventos, loading, search, setSearch,
        page, setPage, totalCount: usuarios.length,
        openDialog, setOpenDialog,
        openDeleteConfirm, setOpenDeleteConfirm,
        openPasswordDialog, setOpenPasswordDialog,
        resetingPassword,
        selectedUser, setSelectedUser, formData, setFormData,
        userToDelete: selectedUser, setUserToDelete,
        toggleEventPermitido,
        updateEventPermission,
        copyPermissionsToAllEvents,
        handleOpenDialog, handleSave, handleApprove, handleToggleStatus, handleResetPassword, handleDeleteUser,
        MODULOS, DEFAULT_PERMISSIONS
    };
};