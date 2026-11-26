import { useState, useEffect, useCallback } from 'react';
import { useSnackbar } from 'notistack';
import api from '../services/api';

// Módulos operacionais disponíveis para operadores (espelha Sidebar, ProtectedRoute e perfilAcesso.service.js)
export const MODULOS = [
  // Operação de campo
  { key: 'checkin', label: 'Check-in', grupo: 'operacao', descricao: 'Credenciamento, pulseiras e entrada por leitor ou busca' },
  { key: 'checkout', label: 'Check-out', grupo: 'operacao', descricao: 'Registro de saída por pulseira ou leitor facial' },
  { key: 'fiscalizacao', label: 'Fiscalização de áreas', grupo: 'operacao', descricao: 'Conferência de acesso nos postos internos sem registrar passagem' },
  { key: 'monitoramento', label: 'Monitor em tempo real', grupo: 'operacao', descricao: 'Passagens ao vivo, status dos leitores e mural CFTV' },
  { key: 'producao', label: 'Produção', grupo: 'operacao', descricao: 'Cronograma, checklists, plantas e controle operacional de montagem' },
  // Gestão e consulta
  { key: 'dashboard', label: 'Dashboard', grupo: 'gestao', descricao: 'Visão executiva de ocupação, alertas e fluxo por hora do evento' },
  { key: 'pessoas', label: 'Participantes', grupo: 'gestao', descricao: 'Cadastro, consulta, QR Code, bloqueio e planilha de participantes' },
  { key: 'empresas', label: 'Empresas', grupo: 'gestao', descricao: 'Empresas contratadas, cotas diárias e links de pré-cadastro' },
  { key: 'auditoria_documentos', label: 'Auditoria documental', grupo: 'gestao', descricao: 'Análise, aprovação e controle de validade de documentos' },
  { key: 'relatorios', label: 'Relatórios', grupo: 'gestao', descricao: 'Presença, ponto, diárias, pulseiras e exportação em Excel/PDF' },
  { key: 'veiculos', label: 'Veículos', grupo: 'gestao', descricao: 'Cadastro de veículos autorizados e passagens de portaria' }
];

export const DEFAULT_PERMISSIONS = {
  dashboard: false,
  checkin: false,
  checkout: false,
  fiscalizacao: false,
  monitoramento: false,
  pessoas: false,
  empresas: false,
  relatorios: false,
  veiculos: false,
  auditoria_documentos: false,
  producao: false,
  usuarios: false,
  pagina_inicial: null,
  modo_tela: 'normal'
};

/**
 * useUsuarios: Hook para gestão de operadores com suporte a multi-eventos
 */
export const useUsuarios = () => {
    const { enqueueSnackbar } = useSnackbar();
    const [usuarios, setUsuarios] = useState([]);
    const [orfaos, setOrfaos] = useState([]);
    const [eventos, setEventos] = useState([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState('');
    const [page, setPage] = useState(1);

    // Dialog States
    const [openDialog, setOpenDialog] = useState(false);
    const [openDeleteConfirm, setOpenDeleteConfirm] = useState(false);
    const [openPasswordDialog, setOpenPasswordDialog] = useState(false);
    const [resetingPassword, setResetingPassword] = useState(false);
    const [resendingId, setResendingId] = useState(null);
    const [inviteLinkInfo, setInviteLinkInfo] = useState(null); // { email, nome, link, emailEnviado }
    const [selectedUser, setSelectedUser] = useState(null);
    const [_userToDelete, setUserToDelete] = useState(null);
    const [modelosPerfis, setModelosPerfis] = useState([]);

    const loadModelos = useCallback(async () => {
        try {
            const { data } = await api.get('/auth/permissions/modelos', { hideDefaultError: true });
            setModelosPerfis(data?.data || []);
        } catch {
            // Silencioso se der erro
        }
    }, []);
    
    // Formulário do Operador
    const [formData, setFormData] = useState({
        email: '',
        nome_completo: '',
        telefone: '',
        modo_ativacao: 'convite', // 'convite' | 'senha'
        senha_inicial: '',
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
            setOrfaos(response.data.orfaos || []);
        } catch (error) {
            console.error('Erro ao buscar usuários:', error);
        } finally {
            setLoading(false);
        }
    }, [search]);

    useEffect(() => {
        loadUsuarios();
        loadEventos();
        loadModelos();
    }, [loadUsuarios, loadEventos, loadModelos]);

    const aplicarModeloAoFormulario = (modeloId) => {
        const modelo = modelosPerfis.find(m => m.id === modeloId);
        if (!modelo) return;
        setFormData(prev => {
            const novasPerms = {
                ...DEFAULT_PERMISSIONS,
                ...(modelo.modulos || {}),
                pagina_inicial: modelo.pagina_inicial || null,
                modo_tela: modelo.modo_tela || 'normal',
                modelo_perfil_id: modelo.id,
                modelo_perfil_nome: modelo.nome,
                regras: { ...(modelo.regras || {}) },
                restricoes_horario: { ...(modelo.restricoes_horario || {}) }
            };
            const novasPorEvento = {};
            (prev.eventos_permitidos || []).forEach(eid => {
                novasPorEvento[eid] = { ...novasPerms };
            });
            return {
                ...prev,
                permissions: novasPerms,
                eventos_permissoes: novasPorEvento
            };
        });
    };

    const handleOpenDialog = (user = null, prefillOrfao = null) => {
        if (user) {
            setSelectedUser(user);
            const vinculoTipo = user.vinculo_tipo || user.permissions?.vinculo_tipo || (user.evento_id ? 'especifico' : 'global');
            const permitidos = user.eventos_permitidos || user.permissions?.eventos_permitidos || (user.evento_id ? [user.evento_id] : []);
            const permsPorEvento = user.eventos_permissoes || user.permissions?.eventos_permissoes || {};
            const basePerms = { ...DEFAULT_PERMISSIONS, ...(user.permissions || {}) };

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
                modo_ativacao: 'convite',
                senha_inicial: '',
                nivel_acesso: user.nivel_acesso || 'operador',
                vinculo_tipo: vinculoTipo,
                eventos_permitidos: permitidos,
                eventos_permissoes: initializedPerms,
                evento_id: user.evento_id || (permitidos.length > 0 ? permitidos[0] : ''),
                permissions: basePerms
            });
        } else {
            setSelectedUser(null);
            const activeEventoId = localStorage.getItem('active_evento_id') || '';
            const eventosIniciais = activeEventoId && eventos.some(e => e.id === activeEventoId) ? [activeEventoId] : [];
            const permsIniciais = { ...DEFAULT_PERMISSIONS };

            setFormData({
                email: prefillOrfao?.email || '',
                nome_completo: prefillOrfao?.nome_completo || '',
                telefone: prefillOrfao?.telefone || '',
                modo_ativacao: 'convite',
                senha_inicial: '',
                nivel_acesso: 'operador',
                vinculo_tipo: eventosIniciais.length > 0 ? 'especifico' : 'global',
                eventos_permitidos: eventosIniciais,
                eventos_permissoes: eventosIniciais.length > 0 ? { [eventosIniciais[0]]: { ...permsIniciais } } : {},
                evento_id: eventosIniciais[0] || '',
                permissions: permsIniciais
            });
            // Operador novo parte do modelo do perfil (Configurações → Perfis de acesso)
            api.get('/auth/permissions/operador', { hideDefaultError: true })
                .then(({ data }) => {
                    const perfilDados = data?.data;
                    const modelo = perfilDados?.modulos;
                    if (!modelo) return;
                    setFormData(prev => {
                        if (JSON.stringify(prev.permissions) !== JSON.stringify(DEFAULT_PERMISSIONS)) return prev;
                        const novasPerms = {
                            ...DEFAULT_PERMISSIONS,
                            ...modelo,
                            pagina_inicial: perfilDados.pagina_inicial || null,
                            modo_tela: perfilDados.modo_tela || 'normal'
                        };
                        const novasPorEvento = {};
                        (prev.eventos_permitidos || []).forEach(eid => {
                            novasPorEvento[eid] = { ...novasPerms };
                        });
                        return {
                            ...prev,
                            permissions: novasPerms,
                            eventos_permissoes: novasPorEvento
                        };
                    });
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
                        [permKey]: value
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
                newPermissoes[eid] = { ...sourcePerms };
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

            if (!selectedUser && formData.modo_ativacao === 'senha') {
                if (!formData.senha_inicial || formData.senha_inicial.trim().length < 6) {
                    enqueueSnackbar('A senha inicial deve ter pelo menos 6 caracteres.', { variant: 'warning' });
                    return;
                }
            }

            const payload = {
                nome_completo: formData.nome_completo.trim(),
                telefone: formData.telefone || null,
                vinculo_tipo: formData.vinculo_tipo,
                eventos_permitidos: formData.vinculo_tipo === 'especifico' ? formData.eventos_permitidos : [],
                eventos_permissoes: formData.vinculo_tipo === 'especifico' ? formData.eventos_permissoes : {},
                evento_id: formData.vinculo_tipo === 'especifico' && formData.eventos_permitidos.length > 0 ? formData.eventos_permitidos[0] : (formData.evento_id || null),
                permissions: { ...formData.permissions }
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
                const { data } = await api.post('/auth/invite', {
                    ...payload,
                    email: formData.email.trim(),
                    ...(formData.modo_ativacao === 'senha' ? { senha_inicial: formData.senha_inicial.trim() } : {})
                });
                enqueueSnackbar(data?.message || 'Operador criado com sucesso!', { variant: 'success' });
                if (data?.activation_link) {
                    setInviteLinkInfo({
                        email: formData.email.trim(),
                        nome: formData.nome_completo.trim(),
                        link: data.activation_link,
                        emailEnviado: Boolean(data.email_enviado)
                    });
                }
            }
            setOpenDialog(false);
            loadUsuarios();
        } catch (error) {
            enqueueSnackbar(error.response?.data?.error || 'Erro ao salvar operador.', { variant: 'error' });
        }
    };

    const handleResendInvite = async (user) => {
        try {
            setResendingId(user.id);
            const { data } = await api.post(`/auth/users/${user.id}/resend-invite`);
            enqueueSnackbar(data?.message || 'Convite reenviado!', { variant: data?.email_enviado ? 'success' : 'info' });
            if (data?.activation_link) {
                setInviteLinkInfo({
                    email: user.email,
                    nome: user.nome_completo || user.email,
                    link: data.activation_link,
                    emailEnviado: Boolean(data.email_enviado)
                });
            }
        } catch (error) {
            enqueueSnackbar(error.response?.data?.error || 'Erro ao reenviar convite.', { variant: 'error' });
        } finally {
            setResendingId(null);
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
            const { data } = await api.delete(`/auth/users/${userId}`);
            enqueueSnackbar(data?.message || 'Operador deletado com sucesso!', { variant: 'success' });
            loadUsuarios();
        } catch (error) {
            enqueueSnackbar(error.response?.data?.error || 'Erro ao deletar operador.', { variant: 'error' });
        }
    };

    return {
        usuarios, orfaos, eventos, loading, search, setSearch,
        page, setPage, totalCount: usuarios.length,
        openDialog, setOpenDialog,
        openDeleteConfirm, setOpenDeleteConfirm,
        openPasswordDialog, setOpenPasswordDialog,
        resetingPassword, resendingId,
        inviteLinkInfo, setInviteLinkInfo,
        selectedUser, setSelectedUser, formData, setFormData,
        userToDelete: selectedUser, setUserToDelete,
        toggleEventPermitido,
        updateEventPermission,
        copyPermissionsToAllEvents,
        handleOpenDialog, handleSave, handleResendInvite, handleApprove, handleToggleStatus, handleResetPassword, handleDeleteUser,
        modelosPerfis, loadModelos, aplicarModeloAoFormulario,
        MODULOS, DEFAULT_PERMISSIONS
    };
};