import { useState, useEffect, useCallback } from 'react';
import { useSnackbar } from 'notistack';
import { format } from 'date-fns';
import api from '../services/api';

/**
 * useUsuarios: Hook de controle para gestão de operadores e permissões.
 * Centraliza o CRUD de usuários do sistema, vinculação de eventos e captura de fotos.
 */
export const useUsuarios = () => {
    const { enqueueSnackbar } = useSnackbar();
    const [usuarios, setUsuarios] = useState([]);
    const [eventos, setEventos] = useState([]);
    const [loading, setLoading] = useState(true);
    const [deleteLoading, setDeleteLoading] = useState(false);
    const [search, setSearch] = useState('');
    
    // Dialog States
    const [openDialog, setOpenDialog] = useState(false);
    const [openDeleteConfirm, setOpenDeleteConfirm] = useState(false);
    const [userToDelete, setUserToDelete] = useState(null);
    const [selectedUser, setSelectedUser] = useState(null);
    const [openPasswordDialog, setOpenPasswordDialog] = useState(false);
    const [resetingPassword, setResetingPassword] = useState(false);

    const [page, setPage] = useState(1);
    const [totalPages, setTotalPages] = useState(1);
    const [totalCount, setTotalCount] = useState(0);

    const [formData, setFormData] = useState({
        email: '', nome_completo: '', cpf: '',
        data_nascimento: '', foto_url: '',
        nivel_acesso: 'operador', evento_id: ''
    });

    const loadEventos = useCallback(async () => {
        try {
            const response = await api.get('/eventos');
            setEventos(response.data.data || []);
        } catch (error) {
            console.error('Erro ao buscar eventos:', error);
        }
    }, []);

    const loadUsuarios = useCallback(async (currentPage = page, currentSearch = search) => {
        try {
            setLoading(true);
            const response = await api.get('/auth/users', {
                params: { page: currentPage, limit: 10, search: currentSearch }
            });
            setUsuarios(response.data.data || []);
            setTotalPages(response.data.pagination?.pages || 1);
            setTotalCount(response.data.pagination?.total || 0);
        } catch (error) {
            console.error('Erro ao buscar usuários:', error);
        } finally {
            setLoading(false);
        }
    }, [page, search]);

    useEffect(() => {
        loadUsuarios();
        loadEventos();
    }, [loadUsuarios, loadEventos, page]);

    const handleOpenDialog = (user = null) => {
        if (user) {
            setSelectedUser(user);
            setFormData({
                email: user.email,
                nome_completo: user.nome_completo || '',
                cpf: user.cpf || '',
                data_nascimento: user.data_nascimento ? format(new Date(user.data_nascimento), "yyyy-MM-dd") : '',
                foto_url: user.foto_url || '',
                nivel_acesso: user.nivel_acesso || 'operador',
                evento_id: user.evento_id || '',
            });
        } else {
            setSelectedUser(null);
            setFormData({
                email: '', nome_completo: '', cpf: '',
                data_nascimento: '', foto_url: '',
                nivel_acesso: 'operador', evento_id: '',
            });
        }
        setOpenDialog(true);
    };

    const handleSave = async () => {
        try {
            if (formData.nivel_acesso === 'operador' && !formData.evento_id) {
                enqueueSnackbar('Operadores precisam estar vinculados a um Evento.', { variant: 'warning' });
                return;
            }

            if (selectedUser) {
                await api.put(`/auth/users/${selectedUser.id}/role`, {
                    nivel_acesso: formData.nivel_acesso,
                    evento_id: formData.evento_id || null,
                    nome_completo: formData.nome_completo,
                    cpf: formData.cpf,
                    data_nascimento: formData.data_nascimento || null,
                    foto_url: formData.foto_url
                });
            } else {
                if (!formData.email) {
                    enqueueSnackbar('E-mail é obrigatório.', { variant: 'warning' });
                    return;
                }
                await api.post('/auth/invite', formData);
            }
            enqueueSnackbar(selectedUser ? 'Atualizado!' : 'Convite Enviado!', { variant: 'success' });
            setOpenDialog(false);
            loadUsuarios();
        } catch (error) {
            enqueueSnackbar(error.response?.data?.error || 'Erro ao salvar.', { variant: 'error' });
        }
    };

    const handleToggleStatus = async (userId, currentStatus) => {
        try {
            setDeleteLoading(true);
            await api.patch(`/auth/users/${userId}/status`, { ativo: !currentStatus });
            enqueueSnackbar(`Usuário ${!currentStatus ? 'ativado' : 'desativado'}.`, { variant: 'success' });
            loadUsuarios();
        } catch (error) {
            enqueueSnackbar('Erro ao alterar status.', { variant: 'error' });
        } finally {
            setDeleteLoading(false);
        }
    };

    const handleResetPassword = async (userId, newPassword) => {
        try {
            setResetingPassword(true);
            await api.post(`/auth/admin/reset-password/${userId}`, { newPassword });
            enqueueSnackbar('Senha resetada com sucesso!', { variant: 'success' });
            setOpenPasswordDialog(false);
        } catch (error) {
            enqueueSnackbar(error.response?.data?.error || 'Erro ao resetar senha.', { variant: 'error' });
        } finally {
            setResetingPassword(false);
        }
    };

    return {
        usuarios, eventos, loading, deleteLoading, search, setSearch, page, setPage, totalPages, totalCount,
        openDialog, setOpenDialog, openDeleteConfirm, setOpenDeleteConfirm,
        selectedUser, setSelectedUser, formData, setFormData,
        openPasswordDialog, setOpenPasswordDialog,
        resetingPassword, handleResetPassword,
        handleOpenDialog, handleSave, handleToggleStatus, setUserToDelete
    };
};
