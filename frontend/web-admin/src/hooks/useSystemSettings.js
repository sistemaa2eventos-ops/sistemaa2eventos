import { useState, useEffect, useCallback } from 'react';
import { useSnackbar } from 'notistack';
import api from '../services/api';

export const useSystemSettings = () => {
    const { enqueueSnackbar } = useSnackbar();
    const [settings, setSettings] = useState({
        system_name: 'NZT Eventos',
        logo_url: '',
        theme_neon_enabled: true,
        language: 'pt-BR',
        biometric_login_enabled: true,
        cloud_sync_enabled: true,
        alert_event_peak: true,
        alert_peak_threshold: 90,
        biometric_sensitivity: 85,
        liveness_check_enabled: true,
        
        // Regras de Check-in
        checkin_cooldown_min: 15,
        biometric_confidence: 75,
        allow_offhour_checkin: false,
        block_unauthorized_days: true,
        
        // Credenciamento
        invite_expiry_days: 7,
        auto_aprovacao: false,
        lgpd_text: '',
        
        // Automação
        cron_reset_hora: '03:00',
        cron_relatorio_hora: '03:30',
        cron_sync_interval: '30min',
        log_retention_days: 90,
        reset_hora: '03:00',
        
        // Comunicação
        alert_email: '',
        relatorio_emails: [],
        telegram_bot_token: '',
        telegram_chat_id: '',
        telegram_alerts_enabled: false,
        email_relatorio_ativo: true,
        relatorio_telegram_ativo: false,
        smtp_enabled: true,
        smtp_host: '',
        smtp_port: 587,
        smtp_user: '',
        smtp_pass: '',
        smtp_email: '',
        wpp_enabled: false,
        wpp_provider: 'twilio',
        wpp_token: '',
        wpp_phone_id: '',
        whatsapp_api_url: '',
        whatsapp_api_key: '',
        email_from: '',
        email_from_name: '',
        
        // Segurança
        jwt_expiry: '8h',
        config: {
            api_keys: []
        }
    });
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);

    const fetchSettings = useCallback(async () => {
        try {
            setLoading(true);
            const response = await api.get('/settings');
            if (response.data.success) {
                setSettings(prev => ({
                    ...prev,
                    ...response.data.data
                }));
            }
        } catch (error) {
            enqueueSnackbar('Erro ao carregar configurações do sistema.', { variant: 'error' });
        } finally {
            setLoading(false);
        }
    }, [enqueueSnackbar]);

    useEffect(() => {
        fetchSettings();
    }, [fetchSettings]);

    const handleSave = async (newSettings = null) => {
        try {
            setSaving(true);
            const payload = newSettings || settings;
            const response = await api.put('/settings', payload);
            if (response.data.success) {
                enqueueSnackbar('Configurações atualizadas com sucesso!', { variant: 'success' });
                setSettings(response.data.data);
                return true;
            }
        } catch (error) {
            enqueueSnackbar('Erro ao salvar configurações.', { variant: 'error' });
            return false;
        } finally {
            setSaving(false);
        }
    };

    const generateApiKey = async () => {
        try {
            const response = await api.post('/settings/generate-api-key');
            if (response.data.success) {
                enqueueSnackbar('Nova API Key gerada!', { variant: 'success' });
                await fetchSettings(); // Recarrega para ver na lista
                return response.data.key;
            }
        } catch (error) {
            enqueueSnackbar('Erro ao gerar API Key.', { variant: 'error' });
        }
    };

    const testEmail = async () => {
        try {
            const response = await api.post('/settings/test-email');
            if (response.data.success) {
                enqueueSnackbar(response.data.message || 'Email de teste enviado!', { variant: 'success' });
            }
        } catch (error) {
            enqueueSnackbar('Falha ao enviar email de teste.', { variant: 'error' });
        }
    };

    const testTelegram = async (customParams = null) => {
        try {
            const payload = customParams || {
                token: settings.telegram_bot_token,
                chat_id: settings.telegram_chat_id
            };
            const response = await api.post('/settings/test-telegram', payload);
            if (response.data.success) {
                enqueueSnackbar(response.data.message || 'Mensagem de teste enviada no Telegram!', { variant: 'success' });
                return true;
            }
        } catch (error) {
            const msg = error.response?.data?.error || 'Falha ao enviar mensagem de teste no Telegram.';
            enqueueSnackbar(msg, { variant: 'error' });
            return false;
        }
    };

    const forceLogoutAll = async () => {
        try {
            const response = await api.post('/settings/force-logout-all');
            if (response.data.success) {
                enqueueSnackbar(response.data.message, { variant: 'info' });
            }
        } catch (error) {
            enqueueSnackbar('Erro ao desconectar usuários.', { variant: 'error' });
        }
    };

    const downloadDailyReport = async (eventoId) => {
        try {
            const response = await api.get(`/excel/relatorio-diario?evento_id=${eventoId}`, {
                responseType: 'blob'
            });
            const url = window.URL.createObjectURL(new Blob([response.data]));
            const link = document.createElement('a');
            link.href = url;
            link.setAttribute('download', `relatorio_diario_${new Date().toISOString().split('T')[0]}.xlsx`);
            document.body.appendChild(link);
            link.click();
            link.remove();
        } catch (error) {
            enqueueSnackbar('Erro ao baixar relatório.', { variant: 'error' });
        }
    };

    return {
        settings,
        setSettings,
        loading,
        saving,
        handleSave,
        generateApiKey,
        testEmail,
        testTelegram,
        forceLogoutAll,
        downloadDailyReport,
        refresh: fetchSettings
    };
};
