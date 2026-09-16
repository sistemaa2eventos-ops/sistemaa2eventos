import { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useSnackbar } from 'notistack';
import api from '../services/api';

export const useLeitorFacial = () => {
    const { enqueueSnackbar } = useSnackbar();
    const [searchParams] = useSearchParams();
    // Prioridade: URL param > localStorage (evento ativo selecionado)
    const eventoId = searchParams.get('evento_id') || localStorage.getItem('active_evento_id');

    const [readers, setReaders] = useState([]);
    const [loading, setLoading] = useState(true);
    const [syncingId, setSyncingId] = useState(null);
    const [testingId, setTestingId] = useState(null);
    const [openDialog, setOpenDialog] = useState(false);
    const [openDeleteConfirm, setOpenDeleteConfirm] = useState(false);
    const [deviceToDelete, setDeviceToDelete] = useState(null);
    const [sensitivity, setSensitivity] = useState(85);
    const [liveness, setLiveness] = useState(true);
    const [authError, setAuthError] = useState(false);

    const [formData, setFormData] = useState({
        nome: '',
        marca: 'intelbras',
        tipo: 'terminal_facial',
        ip_address: '',
        porta: 80,
        user: 'admin',
        password: '',
        evento_id: eventoId,
        config: { modo_identificacao: false }
    });

    useEffect(() => {
        if (eventoId) {
            fetchReaders();
        } else {
            setLoading(false);
        }
        fetchGlobalSettings();
    }, [eventoId]);

    const fetchGlobalSettings = async () => {
        try {
            const response = await api.get('/settings');
            if (response.data.success) {
                setSensitivity(response.data.data.biometric_sensitivity || 85);
                setLiveness(!!response.data.data.liveness_check_enabled);
            }
        } catch (error) {
            console.error('Erro ao buscar configurações globais:', error);
        }
    };

    const fetchReaders = async () => {
        try {
            setLoading(true);
            setAuthError(false);
            const response = await api.get('/dispositivos', { params: { evento_id: eventoId } });
            // Filtrar apenas terminais faciais
            const facialReaders = response.data.data.filter(d => d.tipo === 'terminal_facial');
            setReaders(facialReaders);
        } catch (error) {
            console.error('Erro ao buscar leitores:', error);
            if (error.response?.status === 401) {
                setAuthError(true);
            }
        } finally {
            setLoading(false);
        }
    };

    const handleOpenDialog = (device = null) => {
        if (device) {
            setFormData({
                id: device.id,
                nome: device.nome,
                marca: device.marca || 'intelbras',
                tipo: device.tipo,
                ip_address: device.ip_address,
                porta: device.porta || 80,
                user: device.user_device || 'admin',
                password: device.password_device || '',
                evento_id: device.evento_id || eventoId,
                config: device.config || { modo_identificacao: false }
            });
        } else {
            setFormData({
                nome: '',
                marca: 'intelbras',
                tipo: 'terminal_facial',
                ip_address: '',
                porta: 80,
                user: 'admin',
                password: '',
                evento_id: eventoId,
                config: { modo_identificacao: false }
            });
        }
        setOpenDialog(true);
    };

    const handleSave = async (e) => {
        if (e && e.preventDefault) e.preventDefault();
        try {
            if (!eventoId) {
                enqueueSnackbar('Erro: Evento não selecionado.', { variant: 'error' });
                return;
            }

            const payload = {
                nome: formData.nome,
                marca: formData.marca,
                tipo: formData.tipo,
                ip_address: formData.ip_address,
                porta: parseInt(formData.porta, 10),
                user_device: formData.user,
                password_device: formData.password,
                evento_id: eventoId,
                config: formData.config
            };

            if (formData.id) {
                await api.put(`/dispositivos/${formData.id}`, payload);
            } else {
                await api.post('/dispositivos', payload);
            }
            setOpenDialog(false);
            enqueueSnackbar('Terminal facial salvo com sucesso!', { variant: 'success' });
            fetchReaders();
        } catch (error) {
            console.error('Erro ao salvar dispositivo:', error);
            const msg = error.response?.data?.error || error.message;
            enqueueSnackbar(`Falha ao salvar terminal: ${msg}`, { variant: 'error' });
        }
    };

    const handleDelete = async () => {
        try {
            await api.delete(`/dispositivos/${deviceToDelete.id}`);
            setOpenDeleteConfirm(false);
            enqueueSnackbar('Dispositivo removido.', { variant: 'info' });
            fetchReaders();
        } catch (error) {
            console.error('Erro ao deletar dispositivo:', error);
            enqueueSnackbar('Falha ao remover dispositivo.', { variant: 'error' });
        }
    };

    const handleSync = async (id) => {
        try {
            setSyncingId(id);
            const response = await api.post(`/dispositivos/${id}/sync`);

            if (response.data.success) {
                enqueueSnackbar(`🚀 Sincronização Finalizada: ${response.data.count}/${response.data.total} faces atualizadas.`, { variant: 'success' });
            } else {
                enqueueSnackbar(`⚠️ Atenção: ${response.data.error || 'Erro desconhecido na comunicação com o hardware.'}`, { variant: 'warning' });
            }
        } catch (error) {
            console.error('Erro na sincronização:', error);
            const errorMsg = error.response?.data?.error || 'Verifique se o terminal está ligado e na mesma rede.';
            enqueueSnackbar(`Falha Crítica na Sincronização: ${errorMsg}`, { variant: 'error' });
        } finally {
            setSyncingId(null);
        }
    };

    const handleTestDevice = async (device) => {
        try {
            setTestingId(device.id);
            const response = await api.post('/dispositivos/test-connection', {
                ip_address: device.ip_address,
                porta: device.porta
            });
            if (response.data.success) {
                enqueueSnackbar(`Conexão OK: ${device.nome} está respondendo!`, { variant: 'success' });
            }
        } catch (error) {
            const msg = error.response?.data?.error || 'Terminal inalcançável na rede local';
            enqueueSnackbar(`Falha: ${device.nome} (${device.ip_address}) - ${msg}`, { variant: 'error' });
        } finally {
            setTestingId(null);
        }
    };

    const handleSaveGlobal = async () => {
        try {
            setLoading(true);
            const response = await api.put('/settings', {
                biometric_sensitivity: sensitivity,
                liveness_check_enabled: liveness
            });
            if (response.data.success) {
                enqueueSnackbar('Configurações biométricas globais salvas!', { variant: 'success' });
            }
        } catch (error) {
            console.error('Erro ao salvar settings globais:', error);
            enqueueSnackbar('Falha ao salvar configurações globais.', { variant: 'error' });
        } finally {
            setLoading(false);
        }
    };

    return {
        eventoId,
        readers,
        loading,
        syncingId,
        testingId,
        openDialog,
        setOpenDialog,
        openDeleteConfirm,
        setOpenDeleteConfirm,
        deviceToDelete,
        setDeviceToDelete,
        sensitivity,
        setSensitivity,
        liveness,
        setLiveness,
        authError,
        formData,
        setFormData,
        handleOpenDialog,
        handleSave,
        handleDelete,
        handleSync,
        handleTestDevice,
        handleSaveGlobal,
        fetchReaders
    };
};
