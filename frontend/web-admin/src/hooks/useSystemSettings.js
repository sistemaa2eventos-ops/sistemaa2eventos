import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useSnackbar } from 'notistack';
import api from '../services/api';
import i18n from '../config/i18n';
import { notificarBrandingAtualizado } from './useSystemBranding';

const CONFIG_INICIAL = {
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
        telegram_chat_id_sistema: '',
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
};

export const useSystemSettings = () => {
    const { enqueueSnackbar } = useSnackbar();
    const [settings, setSettings] = useState(CONFIG_INICIAL);
    // Última versão que o servidor confirmou: só o que difere dela é enviado ao salvar
    const ultimoSalvo = useRef(CONFIG_INICIAL);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [uploadingLogo, setUploadingLogo] = useState(false);
    const [versaoSalva, setVersaoSalva] = useState(0);

    const fetchSettings = useCallback(async () => {
        try {
            setLoading(true);
            const response = await api.get('/settings');
            if (response.data.success) {
                const data = response.data.data || {};
                const mesclado = { ...CONFIG_INICIAL, ...data };
                ultimoSalvo.current = mesclado;
                setSettings(mesclado);
                setVersaoSalva(v => v + 1);
                notificarBrandingAtualizado({
                    system_name: mesclado.system_name,
                    logo_url: mesclado.logo_url
                });

                // Se o navegador ainda não tem preferência local salva, adota o idioma do servidor
                const serverLang = data.language;
                if (serverLang && !localStorage.getItem('i18nextLng')) {
                    const norm = serverLang.startsWith('en') ? 'en' :
                                 serverLang.startsWith('es') ? 'es' :
                                 serverLang.startsWith('de') ? 'de' : 'pt-BR';
                    i18n.changeLanguage(norm);
                }
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

    const hasChanges = useMemo(() => {
        void versaoSalva;
        for (const chave of Object.keys(settings)) {
            if (JSON.stringify(settings[chave]) !== JSON.stringify(ultimoSalvo.current[chave])) {
                return true;
            }
        }
        return false;
    }, [settings, versaoSalva]);

    const discardChanges = useCallback(() => {
        setSettings({ ...ultimoSalvo.current });
    }, []);

    const handleSave = async (newSettings = null) => {
        try {
            setSaving(true);
            let payload = newSettings;
            if (!payload) {
                // Só o que esta tela alterou: salvar o objeto inteiro desfazia mudanças feitas em outras telas
                payload = {};
                for (const chave of Object.keys(settings)) {
                    if (JSON.stringify(settings[chave]) !== JSON.stringify(ultimoSalvo.current[chave])) {
                        payload[chave] = settings[chave];
                    }
                }
                if (Object.keys(payload).length === 0) {
                    enqueueSnackbar('Nenhuma alteração pendente para salvar.', { variant: 'info' });
                    return true;
                }
            }
            const response = await api.put('/settings', payload);
            if (response.data.success) {
                enqueueSnackbar('Configurações atualizadas com sucesso!', { variant: 'success' });
                const atualizado = { ...CONFIG_INICIAL, ...ultimoSalvo.current, ...(response.data.data || {}) };
                ultimoSalvo.current = atualizado;
                setSettings(atualizado);
                setVersaoSalva(v => v + 1);
                notificarBrandingAtualizado({
                    system_name: atualizado.system_name,
                    logo_url: atualizado.logo_url,
                    emblem_url: atualizado.emblem_url,
                    pwa_icon_general_url: atualizado.pwa_icon_general_url,
                    pwa_icon_producao_url: atualizado.pwa_icon_producao_url,
                    pwa_icon_monitoramento_url: atualizado.pwa_icon_monitoramento_url,
                    audio_feedback_enabled: atualizado.audio_feedback_enabled,
                    performance_mode_enabled: atualizado.performance_mode_enabled,
                    offline_cache_enabled: atualizado.offline_cache_enabled
                });
                return true;
            }
        } catch (error) {
            enqueueSnackbar(error.response?.data?.error || 'Erro ao salvar configurações.', { variant: 'error' });
            return false;
        } finally {
            setSaving(false);
        }
    };

    const uploadSystemAsset = async (imagemBase64, tipo = 'logo') => {
        try {
            setUploadingLogo(true);
            const { data } = await api.post('/settings/logo', { imagem_base64: imagemBase64, tipo });
            if (data?.success) {
                const campo = data.campo || (tipo === 'logo' ? 'logo_url' : `${tipo}_url`);
                const novaUrl = data.url || data.logo_url || '';
                ultimoSalvo.current = { ...ultimoSalvo.current, [campo]: novaUrl };
                setSettings(prev => ({ ...prev, [campo]: novaUrl }));
                setVersaoSalva(v => v + 1);
                notificarBrandingAtualizado({ [campo]: novaUrl });
                enqueueSnackbar(data.message || 'Ativo visual atualizado com sucesso!', { variant: 'success' });
                return true;
            }
            return false;
        } catch (error) {
            enqueueSnackbar(error.response?.data?.error || 'Erro ao enviar imagem.', { variant: 'error' });
            return false;
        } finally {
            setUploadingLogo(false);
        }
    };

    const removeSystemAsset = async (tipo = 'logo') => {
        try {
            setUploadingLogo(true);
            const { data } = await api.post('/settings/logo', { remover: true, tipo });
            if (data?.success) {
                const campo = data.campo || (tipo === 'logo' ? 'logo_url' : `${tipo}_url`);
                ultimoSalvo.current = { ...ultimoSalvo.current, [campo]: '' };
                setSettings(prev => ({ ...prev, [campo]: '' }));
                setVersaoSalva(v => v + 1);
                notificarBrandingAtualizado({ [campo]: '' });
                enqueueSnackbar(data.message || 'Padrão restaurado com sucesso.', { variant: 'info' });
                return true;
            }
            return false;
        } catch (error) {
            enqueueSnackbar(error.response?.data?.error || 'Erro ao restaurar padrão.', { variant: 'error' });
            return false;
        } finally {
            setUploadingLogo(false);
        }
    };

    const uploadSystemLogo = (imagemBase64) => uploadSystemAsset(imagemBase64, 'logo');
    const removeSystemLogo = () => removeSystemAsset('logo');

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
            // Mesmo relatório diário consolidado da tela Relatórios (a rota /excel/relatorio-diario não existia: 404)
            const response = await api.get('/reports/diario-consolidado/xlsx', {
                params: { evento_id: eventoId },
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
        uploadingLogo,
        hasChanges,
        discardChanges,
        handleSave,
        uploadSystemLogo,
        removeSystemLogo,
        uploadSystemAsset,
        removeSystemAsset,
        generateApiKey,
        testEmail,
        testTelegram,
        forceLogoutAll,
        downloadDailyReport,
        refresh: fetchSettings
    };
};
