import React, { useState, useEffect } from 'react';
import {
    Box, Typography, Switch, List, ListItem, ListItemIcon,
    ListItemText, ListItemSecondaryAction, Divider, TextField,
    Button, Grid, Stack, FormControlLabel, CircularProgress,
    Snackbar, Alert
} from '@mui/material';
import { useSnackbar } from 'notistack';
import {
    CloudQueue as CloudIcon,
    SettingsInputComponent as ApiIcon,
    DirectionsCar as CarIcon,
    WhatsApp as WppIcon,
    Save as SaveIcon
} from '@mui/icons-material';
import PageHeader from '../../components/common/PageHeader';
import GlassCard from '../../components/common/GlassCard';
import api from '../../services/api';

const ConfigIntegracoes = () => {
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
            setSettings(oldSettings);
            enqueueSnackbar('Falha ao salvar configuração.', { variant: 'error' });
        } finally {
            setSaving(false);
        }
    };

    const handleSaveIntegrations = async (e) => {
        if (e && e.preventDefault) e.preventDefault();
        try {
            setSaving(true);
            await api.put('/settings', {
                anpr_enabled: settings.anpr_enabled,
                anpr_endpoint: settings.anpr_endpoint,
                anpr_confidence_min: parseInt(settings.anpr_confidence_min, 10),
                wpp_enabled: settings.wpp_enabled,
                wpp_provider: settings.wpp_provider,
                wpp_token: settings.wpp_token,
                wpp_phone_id: settings.wpp_phone_id
            });
            enqueueSnackbar('Parâmetros de integração salvos com sucesso!', { variant: 'success' });
        } catch (error) {
            console.error('Erro ao salvar integrações:', error);
            enqueueSnackbar('Erro ao salvar integrações externas.', { variant: 'error' });
        } finally {
            setSaving(false);
        }
    };

    const handleInputChange = (key, value) => {
        setSettings(prev => ({ ...prev, [key]: value }));
    };

    if (loading) return (
        <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '50vh' }}>
            <CircularProgress color="secondary" />
        </Box>
    );

    return (
        <Box sx={{ p: { xs: 2, md: 4 } }}>
            <PageHeader
                title="Integrações & Edge"
                subtitle="Gerencie como o A2 Eventos se conecta com a nuvem e outros ecossistemas."
                breadcrumbs={[{ text: 'Sistema' }, { text: 'Configurações' }, { text: 'Integrações' }]}
            />

            <GlassCard sx={{ p: { xs: 2, md: 4 }, mt: 4, minHeight: '500px' }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 4, pb: 2, borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                    <CloudIcon sx={{ color: '#00D4FF', fontSize: 32 }} />
                    <Typography variant="h5" sx={{ fontWeight: 800, color: '#fff' }}>
                        Nuvem & Apis
                    </Typography>
                </Box>

                <Typography variant="body2" color="text.secondary" sx={{ mb: 4 }}>
                    Estas chaves governam a persistência e direcionamento global dos pacotes da aplicação. Apenas administradores devem manusear.
                </Typography>

                <List disablePadding>
                    <ListItem sx={{ px: 0, py: 2, '&:hover': { background: 'rgba(0, 212, 255, 0.03)' }, borderRadius: 2 }}>
                        <ListItemIcon sx={{ color: '#00D4FF', minWidth: 48 }}>
                            <CloudIcon />
                        </ListItemIcon>
                        <ListItemText
                            primary="Sincronização Cloud (Backup Local)"
                            secondary="Se este nó for Offline (Edge), ative para espelhar dados continuamente para o servidor mestre quando houver internet."
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
                </List>

                <Box sx={{ mt: 6, pt: 4, borderTop: '1px solid rgba(255,255,255,0.05)' }}>
                    <form onSubmit={handleSaveIntegrations}>
                        <Grid container spacing={4}>
                            <Grid item xs={12} md={6}>
                                <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 3 }}>
                                    <CarIcon sx={{ color: '#FFAC33', fontSize: 24 }} />
                                    <Typography variant="h6" sx={{ fontWeight: 700, color: '#fff' }}>
                                        LPR / ANPR (Placas)
                                    </Typography>
                                </Box>
                                <Stack spacing={3}>
                                    <FormControlLabel
                                        control={<Switch checked={!!settings?.anpr_enabled} onChange={(e) => handleInputChange('anpr_enabled', e.target.checked)} color="warning" />}
                                        label={<Typography sx={{ color: '#fff' }}>Habilitar Reconhecimento de Placas</Typography>}
                                    />
                                    <TextField fullWidth label="Endpoint da Câmera LPR" value={settings?.anpr_endpoint || ''} onChange={(e) => handleInputChange('anpr_endpoint', e.target.value)} size="small" placeholder="http://192.168.1.50/lpr" />
                                    <TextField fullWidth label="Confiança Mínima (%)" value={settings?.anpr_confidence_min || ''} onChange={(e) => handleInputChange('anpr_confidence_min', e.target.value)} size="small" type="number" />
                                </Stack>
                            </Grid>

                            <Grid item xs={12} md={6}>
                                <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 3 }}>
                                    <WppIcon sx={{ color: '#25D366', fontSize: 24 }} />
                                    <Typography variant="h6" sx={{ fontWeight: 700, color: '#fff' }}>
                                        WhatsApp Business API
                                    </Typography>
                                </Box>
                                <Stack spacing={3}>
                                    <FormControlLabel
                                        control={<Switch checked={!!settings?.wpp_enabled} onChange={(e) => handleInputChange('wpp_enabled', e.target.checked)} color="success" />}
                                        label={<Typography sx={{ color: '#fff' }}>Ativar Envio de Ingressos/QR</Typography>}
                                    />
                                    <TextField fullWidth label="WPP Token (Bearer)" type="password" value={settings?.wpp_token || ''} onChange={(e) => handleInputChange('wpp_token', e.target.value)} size="small" autoComplete="off" />
                                    <TextField fullWidth label="Phone ID (Facebook)" value={settings?.wpp_phone_id || ''} onChange={(e) => handleInputChange('wpp_phone_id', e.target.value)} size="small" />
                                </Stack>
                            </Grid>

                            <Grid item xs={12} sx={{ display: 'flex', justifyContent: 'flex-end', mt: 2 }}>
                                <Button
                                    type="submit"
                                    variant="contained"
                                    startIcon={saving ? <CircularProgress size={20} color="inherit" /> : <SaveIcon />}
                                    disabled={saving}
                                    sx={{ background: 'linear-gradient(45deg, #FFAC33 30%, #FF8800 90%)', color: '#fff', fontWeight: 700 }}
                                >
                                    {saving ? 'SALVANDO...' : 'SALVAR INTEGRAÇÕES EDGE'}
                                </Button>
                            </Grid>
                        </Grid>
                    </form>
                </Box>
                <List disablePadding>
                    <ListItem sx={{ px: 0, py: 2, alignItems: 'flex-start' }}>
                        <ListItemIcon sx={{ color: 'text.secondary', minWidth: 48, mt: 1 }}>
                            <ApiIcon />
                        </ListItemIcon>
                        <Box sx={{ flexGrow: 1, pr: 2 }}>
                            <ListItemText
                                primary="Endereço da API Backend (Nó Controlador)"
                                secondary="A URL raiz (HOST) lida pelo frontend via Vite ENV. Não é possível alterar aqui por questões de CORS compilado na build."
                                primaryTypographyProps={{ fontWeight: 600, color: '#fff' }}
                                secondaryTypographyProps={{ fontSize: '0.75rem', color: 'text.secondary', mb: 1 }}
                            />
                            <TextField
                                fullWidth
                                disabled
                                size="small"
                                value={import.meta.env.VITE_API_URL || 'URL Não Encontrada'}
                                InputProps={{
                                    sx: {
                                        color: '#00D4FF',
                                        '-webkit-text-fill-color': '#00D4FF !important',
                                        fontFamily: 'monospace'
                                    }
                                }}
                            />
                        </Box>
                    </ListItem>
                </List>
            </GlassCard>
        </Box>
    );
};

export default ConfigIntegracoes;
