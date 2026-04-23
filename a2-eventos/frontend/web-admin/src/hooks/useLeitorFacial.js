import { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useSnackbar } from 'notistack';
import api from '../services/api';

export const useLeitorFacial = () => {
    const { enqueueSnackbar } = useSnackbar();
    const [searchParams] = useSearchParams();
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
    const [areas, setAreas] = useState([]);
    const [presets, setPresets] = useState({});
    const [applyingPreset, setApplyingPreset] = useState(false);

    const [formData, setFormData] = useState({
        nome: '',
        marca: 'intelbras',
        tipo: 'terminal_facial',
        ip_address: '',
        porta: 80,
        user: 'admin',
        password: '',
        evento_id: eventoId,
        config: { 
            modo_identificacao: false,
            fluxo: 'checkin',
            controla_rele: true,
            relay_pulse: 500,
            relay_mode: 'NO'
        }
    });

    useEffect(() => {
        if (eventoId) {
            fetchReaders();
            fetchAreas();
            fetchPresets();
        } else {
            setLoading(false);
        }
        fetchGlobalSettings();
    }, [eventoId]);

    const fetchAreas = async () => {
        try {
            const response = await api.get('/config/areas', { params: { evento_id: eventoId } });
            setAreas(response.data.data || []);
        } catch (error) {
            console.error('Erro ao buscar áreas:', error);
        }
    };

    const fetchPresets = async () => {
        try {
            const response = await api.get('/eventos/presets/list');
            setPresets(response.data.data || {});
        } catch (error) {
            console.error('Erro ao buscar presets:', error);
        }
    };

    const fetchReaders = async () => {
        try {
            setLoading(true);
            setAuthError(false);
            const response = await api.get('/dispositivos', { params: { evento_id: eventoId } });
            const facialReaders = response.data.data.filter(d => d.tipo === 'terminal_facial');
            setReaders(facialReaders);
        } catch (error) {
            enqueueSnackbar('Erro ao buscar leitores.', { variant: 'error' });
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
                config: device.config || { 
                    modo_identificacao: false,
                    fluxo: 'checkin',
                    controla_rele: true,
                    relay_pulse: 500,
                    relay_mode: 'NO'
                }
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
                config: { 
                    modo_identificacao: false,
                    fluxo: 'checkin',
                    controla_rele: true,
                    relay_pulse: 500,
                    relay_mode: 'NO'
                }
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

    const fetchGlobalSettings = async () => {
        try {
            const response = await api.get('/settings');
            if (response.data.success) {
                setSensitivity(response.data.data?.biometric_sensitivity ?? 85);
                setLiveness(response.data.data?.liveness_check_enabled ?? true);
            }
        } catch (error) {
            console.error('Erro ao buscar configurações globais:', error);
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
            enqueueSnackbar('Falha ao salvar configurações globais.', { variant: 'error' });
        } finally {
            setLoading(false);
        }
    };

    const handleRemoteAction = async (deviceId, action) => {
        try {
            const response = await api.post(`/dispositivos/${deviceId}/remote-${action}`);
            if (response.data.success) {
                enqueueSnackbar(response.data.message || 'Comando enviado!', { variant: 'success' });
            }
        } catch (error) {
            enqueueSnackbar(`Erro ao executar comando: ${error.response?.data?.error || error.message}`, { variant: 'error' });
        }
    };

    const applyEventPreset = async (presetKey) => {
        if (!eventoId) return;
        try {
            setApplyingPreset(true);
            const response = await api.post(`/eventos/${eventoId}/apply-preset`, { preset_key: presetKey });
            if (response.data.success) {
                enqueueSnackbar(`🛠️ Perfil '${presets[presetKey]?.nome || presetKey}' aplicado com sucesso!`, { variant: 'success' });
                // Recarregar configurações globais se mudou algo
                fetchGlobalSettings();
            }
        } catch (error) {
            enqueueSnackbar('Falha ao aplicar perfil.', { variant: 'error' });
        } finally {
            setApplyingPreset(false);
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
        areas,
        presets,
        applyingPreset,
        formData,
        setFormData,
        fetchReaders,
        handleOpenDialog,
        handleSave,
        handleDelete,
        handleSync,
        handleTestDevice,
        handleSaveGlobal,
        handleRemoteAction,
        applyEventPreset
    };
};
