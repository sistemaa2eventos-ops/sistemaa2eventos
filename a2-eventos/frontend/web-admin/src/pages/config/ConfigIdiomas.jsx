import React, { useState, useEffect } from 'react';
import {
    Box, Typography, List, ListItem, ListItemIcon, ListItemText,
    ListItemSecondaryAction, MenuItem, Select, CircularProgress,
    Snackbar, Alert
} from '@mui/material';
import { useSnackbar } from 'notistack';
import { Language as LangIcon } from '@mui/icons-material';
import PageHeader from '../../components/common/PageHeader';
import GlassCard from '../../components/common/GlassCard';
import api from '../../services/api';

const ConfigIdiomas = () => {
    const [settings, setSettings] = useState(null);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const { enqueueSnackbar } = useSnackbar();

    useEffect(() => {
        const fetchSettings = async () => {
            try {
                const response = await api.get('/settings');
                setSettings(response.data.data);
            } catch (error) {
                enqueueSnackbar('Falha ao carregar configurações.', { variant: 'error' });
            } finally {
                setLoading(false);
            }
        };
        fetchSettings();
    }, [enqueueSnackbar]);

    const handleSelectChange = async (key, value) => {
        if (!settings) return;
        const oldSettings = { ...settings };
        setSettings(prev => ({ ...prev, [key]: value }));

        try {
            setSaving(true);
            await api.put('/settings', { [key]: value });
            enqueueSnackbar('Configuração atualizada. A página recarregará no próximo clique.', { variant: 'success' });
        } catch (error) {
            setSettings(oldSettings);
            enqueueSnackbar('Falha ao salvar configuração.', { variant: 'error' });
        } finally {
            setSaving(false);
        }
    };

    if (loading) return (
        <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '50vh' }}>
            <CircularProgress color="secondary" />
        </Box>
    );

    return (
        <Box sx={{ p: { xs: 2, md: 4 } }}>
            <PageHeader
                title="Configurações de Idioma"
                subtitle="Central de Traduções do NZT."
                breadcrumbs={[{ text: 'Sistema' }, { text: 'Configurações' }, { text: 'Idiomas' }]}
            />

            <GlassCard sx={{ p: { xs: 2, md: 4 }, mt: 4, minHeight: '500px' }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 4, pb: 2, borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                    <LangIcon sx={{ color: '#00D4FF', fontSize: 32 }} />
                    <Typography variant="h5" sx={{ fontWeight: 800, color: '#fff' }}>
                        Idiomas & Regiões
                    </Typography>
                </Box>

                <Typography variant="body2" color="text.secondary" sx={{ mb: 4 }}>
                    Configure o idioma principal das interfaces administrativas e públicas. O i18n será engatilhado no próximo refresh da página.
                </Typography>

                <List disablePadding>
                    <ListItem sx={{ px: 0, py: 2 }}>
                        <ListItemIcon sx={{ color: 'primary.main', minWidth: 48 }}>
                            <LangIcon />
                        </ListItemIcon>
                        <ListItemText
                            primary="Idioma Padrão do Sistema"
                            secondary="O idioma fallback se detectores automáticos falharem."
                            primaryTypographyProps={{ fontWeight: 600, color: '#fff' }}
                            secondaryTypographyProps={{ fontSize: '0.75rem', color: 'text.secondary' }}
                        />
                        <ListItemSecondaryAction>
                            <Select
                                size="small"
                                value={settings?.language || 'pt-BR'}
                                onChange={(e) => handleSelectChange('language', e.target.value)}
                                disabled={saving}
                                sx={{ minWidth: 200, color: '#00D4FF', '& .MuiOutlinedInput-notchedOutline': { borderColor: 'rgba(0, 212, 255, 0.4)' } }}
                            >
                                <MenuItem value="pt-BR">Português (Brasil)</MenuItem>
                                <MenuItem value="en-US">English (US)</MenuItem>
                                <MenuItem value="es-ES">Español</MenuItem>
                                <MenuItem value="de-DE">Deutsch</MenuItem>
                            </Select>
                        </ListItemSecondaryAction>
                    </ListItem>
                </List>
            </GlassCard>
        </Box>
    );
};

export default ConfigIdiomas;
