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
    
    // Dialog States
    const [openDialog, setOpenDialog] = useState(false);
    const [selectedUser, setSelectedUser] = useState(null);
    
    // Formulário
    const [formData, setFormData] = useState({
        email: '',
        nome_completo: '',
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
            checkout: false
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
            setUsuarios(response.data.users || []);
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
                    checkout: false
                }
            });
        } else {
            setSelectedUser(null);
            setFormData({
                email: '',
                nome_completo: '',
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
                    checkout: false
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
                enqueueSnackbar('Evento é obrigatório.', { variant: 'warning' });
                return;
            }

            if (selectedUser) {
                // Atualizar permissões
                await api.put(`/auth/users/${selectedUser.id}/permissions`, {
                    permissions: formData.permissions
                });
                // Sependente, atualizar evento
                if (formData.evento_id !== selectedUser.evento_id) {
                    await api.put(`/auth/users/${selectedUser.id}`, {
                        evento_id: formData.evento_id,
                        nome_completo: formData.nome_completo
                    });
                }
                enqueueSnackbar('Permissões atualizadas!', { variant: 'success' });
            } else {
                // Criar convite
                await api.post('/auth/invite', {
                    email: formData.email,
                    nome_completo: formData.nome_completo,
                    nivel_acesso: 'operador',
                    evento_id: formData.evento_id
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

    return {
        usuarios, eventos, loading, search, setSearch,
        openDialog, setOpenDialog,
        selectedUser, setSelectedUser, formData, setFormData,
        handleOpenDialog, handleSave, handleApprove, handleToggleStatus,
        MODULOS
    };
};