import React, { useState, useEffect } from 'react';
import {
    Box, Typography, Switch, List, ListItem, ListItemIcon,
    ListItemText, ListItemSecondaryAction, Divider, CircularProgress
} from '@mui/material';
import { useSnackbar } from 'notistack';
import {
    Palette as PaletteIcon,
    Fingerprint as BiometricIcon,
    CloudDone as CloudIcon,
    NotificationsActive as NotificationIcon
} from '@mui/icons-material';
import PageHeader from '../../components/common/PageHeader';
import GlassCard from '../../components/common/GlassCard';
import api from '../../services/api';

const ConfigGeral = () => {
    const { enqueueSnackbar } = useSnackbar();
    const [settings, setSettings] = useState(null);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        const fetchSettings = async () => {
            try {
                const response = await api.get('/settings');
                setSettings(response.data.data);
            } catch (error) {
                console.error('Erro ao buscar configurações:', error);
                enqueueSnackbar('Falha ao carregar configurações.', { variant: 'error' });
            } finally {
                setLoading(false);
            }
        };
        fetchSettings();
    }, [enqueueSnackbar]);

    const handleToggle = async (key) => {
        if (!settings) return;
        const newValue = !settings[key];
        const oldSettings = { ...settings };
        setSettings(prev => ({ ...prev, [key]: newValue }));

        try {
            setSaving(true);
            await api.put('/settings', { [key]: newValue });
            enqueueSnackbar('Configuração atualizada com sucesso.', { variant: 'success' });
        } catch (error) {
            console.error('Erro ao salvar:', error);
            setSettings(oldSettings); // Rollback
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
                title="Configurações Gerais"
                subtitle="Ajuste parâmetros visuais e identidade da aplicação NZT."
                breadcrumbs={[{ text: 'Sistema' }, { text: 'Configurações Globais' }, { text: 'Geral' }]}
            />

            <GlassCard sx={{ p: { xs: 2, md: 4 }, mt: 4, minHeight: '500px' }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 4, pb: 2, borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                    <PaletteIcon sx={{ color: '#00D4FF', fontSize: 32 }} />
                    <Typography variant="h5" sx={{ fontWeight: 800, color: '#fff' }}>
                        Geral & Interface
                    </Typography>
                </Box>

                <Typography variant="body2" color="text.secondary" sx={{ mb: 4 }}>
                    Ajuste os parâmetros visuais globais e a identidade da aplicação NZT (A2 Eventos).
                </Typography>

                <List disablePadding>
                    <ListItem sx={{ px: 0, py: 2, '&:hover': { background: 'rgba(0, 212, 255, 0.03)' }, borderRadius: 2 }}>
                        <ListItemIcon sx={{ color: 'primary.main', minWidth: 48 }}>
                            <PaletteIcon />
                        </ListItemIcon>
                        <ListItemText
                            primary="Modo Neon Dinâmico"
                            secondary="Aplica um tema escuro profundo (Dark Solid) combinado com luzes neon nos cartões principais."
                            primaryTypographyProps={{ fontWeight: 600, color: '#fff' }}
                            secondaryTypographyProps={{ fontSize: '0.75rem', color: 'text.secondary' }}
                        />
                        <ListItemSecondaryAction>
                            <Switch
                                checked={!!settings?.theme_neon_enabled}
                                onChange={() => handleToggle('theme_neon_enabled')}
                                disabled={saving}
                                color="primary"
                            />
                        </ListItemSecondaryAction>
                    </ListItem>
                    <Divider sx={{ borderColor: 'rgba(255,255,255,0.05)' }} />

                    <ListItem sx={{ px: 0, py: 2, '&:hover': { background: 'rgba(0, 212, 255, 0.03)' }, borderRadius: 2 }}>
                        <ListItemIcon sx={{ color: '#00D4FF', minWidth: 48 }}>
                            <BiometricIcon />
                        </ListItemIcon>
                        <ListItemText
                            primary="Login Biométrico"
                            secondary="Permite que usuários façam login usando biometria do dispositivo (apenas mobile/apenas HTTPS)."
                            primaryTypographyProps={{ fontWeight: 600, color: '#fff' }}
                            secondaryTypographyProps={{ fontSize: '0.75rem', color: 'text.secondary' }}
                        />
                        <ListItemSecondaryAction>
                            <Switch
                                checked={!!settings?.biometric_login_enabled}
                                onChange={() => handleToggle('biometric_login_enabled')}
                                disabled={saving}
                                color="primary"
                            />
                        </ListItemSecondaryAction>
                    </ListItem>
                    <Divider sx={{ borderColor: 'rgba(255,255,255,0.05)' }} />

                    <ListItem sx={{ px: 0, py: 2, '&:hover': { background: 'rgba(0, 212, 255, 0.03)' }, borderRadius: 2 }}>
                        <ListItemIcon sx={{ color: '#00FF88', minWidth: 48 }}>
                            <CloudIcon />
                        </ListItemIcon>
                        <ListItemText
                            primary="Sincronização em Nuvem em Tempo Real"
                            secondary="Envia eventos de acesso instantaneamente para o servidor central enquanto houver internet."
                            primaryTypographyProps={{ fontWeight: 600, color: '#fff' }}
                            secondaryTypographyProps={{ fontSize: '0.75rem', color: 'text.secondary' }}
                        />
                        <ListItemSecondaryAction>
                            <Switch
                                checked={!!settings?.cloud_sync_enabled}
                                onChange={() => handleToggle('cloud_sync_enabled')}
                                disabled={saving}
                                color="primary"
                            />
                        </ListItemSecondaryAction>
                    </ListItem>
                    <Divider sx={{ borderColor: 'rgba(255,255,255,0.05)' }} />

                    <ListItem sx={{ px: 0, py: 2, '&:hover': { background: 'rgba(0, 212, 255, 0.03)' }, borderRadius: 2 }}>
                        <ListItemIcon sx={{ color: '#FFAC33', minWidth: 48 }}>
                            <NotificationIcon />
                        </ListItemIcon>
                        <ListItemText
                            primary="Alertas de Pico de Lotação"
                            secondary="Notifica administradores quando o evento atinge 90% da capacidade configurada."
                            primaryTypographyProps={{ fontWeight: 600, color: '#fff' }}
                            secondaryTypographyProps={{ fontSize: '0.75rem', color: 'text.secondary' }}
                        />
                        <ListItemSecondaryAction>
                            <Switch
                                checked={!!settings?.alert_event_peak}
                                onChange={() => handleToggle('alert_event_peak')}
                                disabled={saving}
                                color="primary"
                            />
                        </ListItemSecondaryAction>
                    </ListItem>
                </List>
            </GlassCard>
        </Box>
    );
};

export default ConfigGeral;
