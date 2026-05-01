import { useState, useEffect, useCallback } from 'react';
import { useSnackbar } from 'notistack';
import api from '../services/api';

// Módulos disponíveis
export const MODULOS = [
  { key: 'dashboard', label: 'Dashboard' },
  { key: 'empresas', label: 'Empresas' },
  { key: 'pessoas', label: 'Pessoas' },
  { key: 'auditoria_documentos', label: 'Auditoria Documentos' },
  { key: 'monitoramento', label: 'Monitoramento' },
  { key: 'relatorios', label: 'Relatórios' },
  { key: 'checkin', label: 'Check-in' },
  { key: 'checkout', label: 'Check-out' }
];

/**
 * useUsuarios: Hook para gestão de usuários
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
    
    // Formulário
    const [formData, setFormData] = useState({
        email: '',
        nome_completo: '',
        telefone: '',
        nivel_acesso: 'operador',
        evento_id: '',
        permissions: {
            dashboard: true,
            empresas: false,
            pessoas: false,
            auditoria_documentos: false,
            monitoramento: false,
            relatorios: false,
            checkin: false,
            checkout: false,
            dispositivos: false,
            usuarios: false
        }
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
            // Garantir formato correto dos dados
            const users = (response.data.users || []).map(user => ({
                ...user,
                email: user.email || '',
                eventos: user.eventos || { nome: 'Global' }
            }));
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
            setFormData({
                email: user.email || '',
                nome_completo: user.nome_completo || '',
                telefone: user.telefone || '',
                nivel_acesso: user.nivel_acesso || 'operador',
                evento_id: user.evento_id || '',
                permissions: user.permissions || {
                    dashboard: true,
                    empresas: false,
                    pessoas: false,
                    auditoria_documentos: false,
                    monitoramento: false,
                    relatorios: false,
                    checkin: false,
                    checkout: false,
                    dispositivos: false,
                    usuarios: false
                }
            });
        } else {
            setSelectedUser(null);
            setFormData({
                email: '',
                nome_completo: '',
                telefone: '',
                nivel_acesso: 'operador',
                evento_id: '',
                permissions: {
                    dashboard: true,
                    empresas: false,
                    pessoas: false,
                    auditoria_documentos: false,
                    monitoramento: false,
                    relatorios: false,
                    checkin: false,
                    checkout: false,
                    dispositivos: false,
                    usuarios: false
                }
            });
        }
        setOpenDialog(true);
    };

    const handleSave = async () => {
        try {
            if (!formData.email) {
                enqueueSnackbar('E-mail é obrigatório.', { variant: 'warning' });
                return;
            }
            if (!formData.evento_id) {
                enqueueSnackbar('O vínculo com um evento é obrigatório.', { variant: 'warning' });
                return;
            }

            if (selectedUser) {
                // Atualizar email se foi alterado
                if (formData.email && formData.email.trim() !== selectedUser.email) {
                    await api.put(`/auth/users/${selectedUser.id}/email`, {
                        email: formData.email.trim()
                    });
                }
                // Atualizar permissões
                await api.put(`/auth/users/${selectedUser.id}/permissions`, {
                    permissions: formData.permissions
                });
                // Atualizar nome e evento se necessário
                if (formData.evento_id !== selectedUser.evento_id || formData.nome_completo !== selectedUser.nome_completo) {
                    await api.put(`/auth/users/${selectedUser.id}`, {
                        evento_id: formData.evento_id || null,
                        nome_completo: formData.nome_completo
                    });
                }
                enqueueSnackbar('Usuário atualizado!', { variant: 'success' });
            } else {
                // Criar convite — sempre operador
                await api.post('/auth/invite', {
                    email: formData.email,
                    nome_completo: formData.nome_completo,
                    telefone: formData.telefone || null,
                    evento_id: formData.evento_id,
                    permissions: formData.permissions
                });
                enqueueSnackbar('Convite enviado!', { variant: 'success' });
            }
            setOpenDialog(false);
            loadUsuarios();
        } catch (error) {
            enqueueSnackbar(error.response?.data?.error || 'Erro ao salvar.', { variant: 'error' });
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
            enqueueSnackbar(error.response?.data?.error || 'Erro ao aprobar.', { variant: 'error' });
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
        handleOpenDialog, handleSave, handleApprove, handleToggleStatus, handleResetPassword, handleDeleteUser,
        MODULOS
    };
};