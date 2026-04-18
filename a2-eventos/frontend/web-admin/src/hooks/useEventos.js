import { useState, useEffect } from 'react';
import { useSnackbar } from 'notistack';
import { useNavigate } from 'react-router-dom';
import { format, eachDayOfInterval, parseISO } from 'date-fns';
import api from '../services/api';

export const useEventos = () => {
    const { enqueueSnackbar } = useSnackbar();
    const navigate = useNavigate();
    const [eventos, setEventos] = useState([]);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [deleteLoading, setDeleteLoading] = useState(false);
    const [openDialog, setOpenDialog] = useState(false);
    const [openDeleteConfirm, setOpenDeleteConfirm] = useState(false);
    const [eventoToDelete, setEventoToDelete] = useState(null);
    const [selectedEvento, setSelectedEvento] = useState(null);
    const [tabValue, setTabValue] = useState(0);

    const [formData, setFormData] = useState({
        nome: '',
        descricao: '',
        local: '',
        data_inicio: '',
        data_fim: '',
        capacidade_total: '',
        datas_montagem: [],
        datas_evento: [],
        datas_desmontagem: [],
        horario_reset: '00:00',
        tipos_checkin: ['facial', 'pulseira'],
        tipos_checkout: ['facial', 'pulseira'],
        impressao_etiquetas: false,
        modules: []
    });

    useEffect(() => {
        loadEventos();
    }, []);

    const loadEventos = async () => {
        try {
            setLoading(true);
            const response = await api.get('/eventos');
            setEventos(response.data.data || []);
        } catch (error) {
            enqueueSnackbar('Erro ao carregar eventos.', { variant: 'error' });
        } finally {
            setLoading(false);
        }
    };

    const handleOpenDialog = (evento = null) => {
        setTabValue(0);
        if (evento) {
            setSelectedEvento(evento);
            setFormData({
                nome: evento.nome || '',
                descricao: evento.descricao || '',
                local: evento.local || '',
                data_inicio: (() => { try { const d = new Date(evento.data_inicio); return evento.data_inicio && !isNaN(d.getTime()) ? format(d, "yyyy-MM-dd") : ''; } catch { return ''; } })(),
                data_fim: (() => { try { const d = new Date(evento.data_fim); return evento.data_fim && !isNaN(d.getTime()) ? format(d, "yyyy-MM-dd") : ''; } catch { return ''; } })(),
                capacidade_total: evento.capacidade_total || '',
                datas_montagem: evento.datas_montagem || [],
                datas_evento: evento.datas_evento || [],
                datas_desmontagem: evento.datas_desmontagem || [],
                horario_reset: evento.horario_reset || '00:00',
                tipos_checkin: evento.tipos_checkin || ['facial', 'pulseira'],
                tipos_checkout: evento.tipos_checkout || ['facial', 'pulseira'],
                impressao_etiquetas: !!evento.impressao_etiquetas,
                modules: evento.event_modules || []
            });
        } else {
            setSelectedEvento(null);
            setFormData({
                nome: '',
                descricao: '',
                local: '',
                data_inicio: '',
                data_fim: '',
                capacidade_total: '',
                datas_montagem: [],
                datas_evento: [],
                datas_desmontagem: [],
                horario_reset: '00:00',
                tipos_checkin: ['qrcode', 'barcode', 'manual'],
                tipos_checkout: ['qrcode', 'barcode', 'manual'],
                impressao_etiquetas: false,
                modules: []
            });
        }
        setOpenDialog(true);
    };

    const handleCloseDialog = () => {
        setOpenDialog(false);
        setSelectedEvento(null);
    };

    const handleSave = async () => {
        try {
            setSaving(true);
            const { modules, ...payload } = formData;
            if (selectedEvento) {
                await api.put(`/eventos/${selectedEvento.id}`, payload);
            } else {
                await api.post('/eventos', payload);
            }
            handleCloseDialog();
            loadEventos();
        } catch (error) {
            enqueueSnackbar(error.response?.data?.error || 'Falha ao salvar evento.', { variant: 'error' });
        } finally {
            setSaving(false);
        }
    };

    const handleToggleModule = async (moduleKey, isEnabled) => {
        if (!selectedEvento) return;
        try {
            await api.patch(`/eventos/${selectedEvento.id}/toggle-module`, {
                module_key: moduleKey,
                is_enabled: isEnabled
            });

            setFormData(prev => ({
                ...prev,
                modules: prev.modules.map(m =>
                    m.module_key === moduleKey ? { ...m, is_enabled: isEnabled } : m
                )
            }));
        } catch (error) {
            enqueueSnackbar('Falha ao atualizar configuração do módulo.', { variant: 'error' });
        }
    };

    const toggleStatus = async (evento) => {
        try {
            const action = evento.status === 'ativo' ? 'deactivate' : 'activate';
            await api.patch(`/eventos/${evento.id}/${action}`);
            loadEventos();
        } catch (error) {
            enqueueSnackbar('Falha ao alterar status do evento.', { variant: 'error' });
        }
    };

    const handleDelete = (id) => {
        setEventoToDelete(id);
        setOpenDeleteConfirm(true);
    };

    const confirmDelete = async () => {
        try {
            setDeleteLoading(true);
            await api.delete(`/eventos/${eventoToDelete}`);
            setOpenDeleteConfirm(false);
            setEventoToDelete(null);
            loadEventos();
        } catch (error) {
            enqueueSnackbar('Erro ao excluir evento.', { variant: 'error' });
        } finally {
            setDeleteLoading(false);
        }
    };

    const handleGerenciar = async (evento) => {
        try {
            await api.post('/auth/active-event', { evento_id: evento.id });
            localStorage.setItem('active_evento_id', evento.id);
            localStorage.setItem('active_evento_nome', evento.nome);
            window.dispatchEvent(new Event('storage'));
            navigate(`/empresas?evento_id=${evento.id}`);
        } catch (error) {
            enqueueSnackbar('Falha ao vincular evento ao seu perfil de acesso.', { variant: 'error' });
        }
    };

    const handleDateToggle = (date, phase) => {
        const field = `datas_${phase}`;
        setFormData(prev => {
            const current = [...(prev[field] || [])];
            const index = current.indexOf(date);
            if (index === -1) {
                current.push(date);
            } else {
                current.splice(index, 1);
            }
            return { ...prev, [field]: current };
        });
    };

    const generateDateRange = () => {
        if (!formData.data_inicio || !formData.data_fim) return [];
        try {
            return eachDayOfInterval({
                start: parseISO(formData.data_inicio),
                end: parseISO(formData.data_fim)
            }).map(d => format(d, 'yyyy-MM-dd'));
        } catch (e) {
            return [];
        }
    };

    const handleSelectAll = (phase) => {
        const allDates = generateDateRange();
        setFormData(prev => ({ ...prev, [`datas_${phase}`]: allDates }));
    };

    const handleClearAll = (phase) => {
        setFormData(prev => ({ ...prev, [`datas_${phase}`]: [] }));
    };

    return {
        eventos,
        loading,
        saving,
        deleteLoading,
        openDialog,
        setOpenDialog,
        openDeleteConfirm,
        setOpenDeleteConfirm,
        selectedEvento,
        tabValue,
        setTabValue,
        formData,
        setFormData,
        handleOpenDialog,
        handleCloseDialog,
        handleSave,
        handleToggleModule,
        toggleStatus,
        handleDelete,
        confirmDelete,
        handleGerenciar,
        handleDateToggle,
        handleSelectAll,
        handleClearAll,
        generateDateRange
    };
};
