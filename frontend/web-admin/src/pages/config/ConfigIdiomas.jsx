import React, { useState, useEffect } from 'react';
import {
    Box, Typography, List, ListItem, ListItemIcon, ListItemText,
    ListItemSecondaryAction, MenuItem, Select, CircularProgress
} from '@mui/material';
import { useSnackbar } from 'notistack';
import { Language as LangIcon } from '@mui/icons-material';
import { useTranslation } from 'react-i18next';
import PageHeader from '../../components/common/PageHeader';
import GlassCard from '../../components/common/GlassCard';
import api from '../../services/api';
import i18n from '../../config/i18n';

const normalizeLanguageCode = (code) => {
    if (!code) return 'pt-BR';
    if (code.startsWith('en')) return 'en';
    if (code.startsWith('es')) return 'es';
    if (code.startsWith('de')) return 'de';
    if (code.startsWith('pt')) return 'pt-BR';
    return code;
};

const ConfigIdiomas = () => {
    const { t } = useTranslation();
    const [settings, setSettings] = useState(null);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const { enqueueSnackbar } = useSnackbar();

    useEffect(() => {
        const fetchSettings = async () => {
            try {
                const response = await api.get('/settings');
                const data = response.data?.data || {};
                setSettings(data);
                
                // Se o navegador ainda não tem idioma salvo, mas o banco tem, sincroniza
                const currentLocal = localStorage.getItem('i18nextLng');
                if (!currentLocal && data.language) {
                    const normalized = normalizeLanguageCode(data.language);
                    i18n.changeLanguage(normalized);
                }
            } catch (error) {
                console.error('Erro ao buscar configurações:', error);
                enqueueSnackbar(t('idiomas.update_error', { defaultValue: 'Falha ao carregar configurações.' }), { variant: 'error' });
            } finally {
                setLoading(false);
            }
        };
        fetchSettings();
    }, [enqueueSnackbar, t]);

    const handleSelectChange = async (key, rawValue) => {
        if (!settings) return;
        const normalizedValue = normalizeLanguageCode(rawValue);
        const oldSettings = { ...settings };
        setSettings(prev => ({ ...prev, [key]: normalizedValue }));

        try {
            setSaving(true);

            // 1. Altera idioma imediatamente no motor i18next do frontend
            await i18n.changeLanguage(normalizedValue);

            // 2. Persiste no localStorage para sobreviver a reloads
            localStorage.setItem('i18nextLng', normalizedValue);

            // 3. Salva a preferência padrão no backend
            await api.put('/settings', { [key]: normalizedValue });

            enqueueSnackbar(t('idiomas.updated_success', { defaultValue: 'Idioma atualizado com sucesso!' }), { variant: 'success' });
        } catch (error) {
            console.error('Erro ao salvar idioma:', error);
            setSettings(oldSettings);
            enqueueSnackbar(t('idiomas.update_error', { defaultValue: 'Falha ao salvar configuração.' }), { variant: 'error' });
        } finally {
            setSaving(false);
        }
    };

    if (loading) return (
        <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '50dvh' }}>
            <CircularProgress color="secondary" />
        </Box>
    );

    const currentLang = normalizeLanguageCode(settings?.language || i18n.language || 'pt-BR');

    return (
        <Box sx={{ p: { xs: 2, md: 4 } }}>
            <PageHeader
                title={t('idiomas.title', { defaultValue: 'Idiomas' })}
                subtitle={t('idiomas.subtitle', { defaultValue: 'Idioma das telas do painel e do portal de cadastro.' })}
                breadcrumbs={[
                    { text: t('sidebar.grupo_sistema', { defaultValue: 'Sistema' }) },
                    { text: t('sidebar.settings', { defaultValue: 'Configurações' }) },
                    { text: t('idiomas.title', { defaultValue: 'Idiomas' }) }
                ]}
            />

            <GlassCard sx={{ p: { xs: 2, md: 4 }, mt: 4, minHeight: '500px' }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 4, pb: 2, borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                    <LangIcon sx={{ color: '#00D4FF', fontSize: 32 }} />
                    <Typography variant="h5" sx={{ fontWeight: 700, color: '#FFFFFF' }}>
                        {t('idiomas.default_language', { defaultValue: 'Idioma padrão' })}
                    </Typography>
                </Box>

                <Typography variant="body2" color="text.secondary" sx={{ mb: 4 }}>
                    {t('idiomas.description', { defaultValue: 'Configure o idioma principal das interfaces administrativas e públicas. O idioma é aplicado instantaneamente neste navegador e salvo no sistema.' })}
                </Typography>

                <List disablePadding>
                    <ListItem sx={{ px: 0, py: 2 }}>
                        <ListItemIcon sx={{ color: 'primary.main', minWidth: 48 }}>
                            <LangIcon />
                        </ListItemIcon>
                        <ListItemText
                            primary={t('idiomas.system_default', { defaultValue: 'Idioma padrão do sistema' })}
                            secondary={t('idiomas.system_default_hint', { defaultValue: 'O idioma principal usado na interface do painel.' })}
                            primaryTypographyProps={{ fontWeight: 600, color: '#FFFFFF' }}
                            secondaryTypographyProps={{ fontSize: '0.75rem', color: 'text.secondary' }}
                        />
                        <ListItemSecondaryAction>
                            <Select
                                size="small"
                                value={currentLang}
                                onChange={(e) => handleSelectChange('language', e.target.value)}
                                disabled={saving}
                                sx={{ minWidth: 200, color: '#00D4FF', '& .MuiOutlinedInput-notchedOutline': { borderColor: 'rgba(0, 212, 255, 0.4)' } }}
                            >
                                <MenuItem value="pt-BR">Português (Brasil)</MenuItem>
                                <MenuItem value="en">English (US / UK)</MenuItem>
                                <MenuItem value="es">Español</MenuItem>
                                <MenuItem value="de">Deutsch</MenuItem>
                            </Select>
                        </ListItemSecondaryAction>
                    </ListItem>
                </List>
            </GlassCard>
        </Box>
    );
};

export default ConfigIdiomas;
