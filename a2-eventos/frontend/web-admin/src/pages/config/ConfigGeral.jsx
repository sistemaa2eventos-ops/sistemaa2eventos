import React, { useState, useEffect } from 'react';
import {
    Box, Typography, Switch, TextField, Button, Avatar, 
    Slider, Divider, CircularProgress, Grid, IconButton, Tooltip
} from '@mui/material';
import { 
    CloudUpload as UploadIcon,
    Palette as PaletteIcon,
    Fingerprint as BiometricIcon,
    CloudDone as CloudIcon,
    NotificationsActive as NotificationIcon,
    Business as BusinessIcon
} from '@mui/icons-material';
import { useSnackbar } from 'notistack';
import { useSystemSettings } from '../../hooks/useSystemSettings';
import GlassCard from '../../components/common/GlassCard';
import { supabase } from '../../config/supabase';

const ConfigGeral = () => {
    const { settings, setSettings, loading, saving, handleSave } = useSystemSettings();
    const { enqueueSnackbar } = useSnackbar();
    const [uploading, setUploading] = useState(false);

    const handleLogoUpload = async (event) => {
        try {
            const file = event.target.files[0];
            if (!file) return;

            setUploading(true);
            const fileExt = file.name.split('.').pop();
            const fileName = `logo-${Math.random()}.${fileExt}`;
            const filePath = `logo/${fileName}`;

            // Upload para bucket 'system-assets'
            const { error: uploadError } = await supabase.storage
                .from('system-assets')
                .upload(filePath, file, { upsert: true });

            if (uploadError) throw uploadError;

            // Pegar URL pública
            const { data: { publicUrl } } = supabase.storage
                .from('system-assets')
                .getPublicUrl(filePath);

            setSettings(prev => ({ ...prev, logo_url: publicUrl }));
            enqueueSnackbar('Logo carregada com sucesso!', { variant: 'success' });
        } catch (error) {
            enqueueSnackbar('Erro ao carregar logo: ' + error.message, { variant: 'error' });
        } finally {
            setUploading(false);
        }
    };

    if (loading) return (
        <Box sx={{ display: 'flex', justifyContent: 'center', p: 4 }}>
            <CircularProgress />
        </Box>
    );

    return (
        <Box>
            <Typography variant="h6" sx={{ color: 'primary.main', mb: 3, fontWeight: 700 }}>
                🔧 Configurações Gerais
            </Typography>

            <Grid container spacing={3}>
                {/* SEÇÃO: Identidade do Sistema */}
                <Grid item xs={12}>
                    <GlassCard sx={{ p: 3 }}>
                        <Typography variant="subtitle1" sx={{ color: '#fff', fontWeight: 700, mb: 3, display: 'flex', alignItems: 'center', gap: 1 }}>
                            <BusinessIcon fontSize="small" color="primary" /> Identidade do Sistema
                        </Typography>
                        
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 4, mb: 4 }}>
                            <Box sx={{ position: 'relative' }}>
                                <Avatar 
                                    src={settings.logo_url} 
                                    sx={{ 
                                        width: 100, 
                                        height: 100, 
                                        border: '2px solid', 
                                        borderColor: 'primary.main',
                                        boxShadow: '0 0 15px rgba(0, 212, 255, 0.3)' 
                                    }} 
                                >
                                    NZT
                                </Avatar>
                                <input
                                    accept="image/*"
                                    style={{ display: 'none' }}
                                    id="logo-upload"
                                    type="file"
                                    onChange={handleLogoUpload}
                                    disabled={uploading}
                                />
                                <label htmlFor="logo-upload">
                                    <IconButton 
                                        component="span" 
                                        sx={{ 
                                            position: 'absolute', 
                                            bottom: -5, 
                                            right: -5, 
                                            bgcolor: 'primary.main',
                                            '&:hover': { bgcolor: 'primary.dark' }
                                        }}
                                        size="small"
                                    >
                                        <UploadIcon sx={{ color: '#000', fontSize: 18 }} />
                                    </IconButton>
                                </label>
                            </Box>
                            
                            <TextField
                                label="Nome do Sistema"
                                variant="outlined"
                                fullWidth
                                value={settings.system_name}
                                onChange={(e) => setSettings(prev => ({ ...prev, system_name: e.target.value }))}
                                sx={{ maxWidth: 400 }}
                            />
                        </Box>
                    </GlassCard>
                </Grid>

                {/* SEÇÃO: Comportamento */}
                <Grid item xs={12} md={6}>
                    <GlassCard sx={{ p: 3, height: '100%' }}>
                        <Typography variant="subtitle1" sx={{ color: '#fff', fontWeight: 700, mb: 3, display: 'flex', alignItems: 'center', gap: 1 }}>
                            <PaletteIcon fontSize="small" color="primary" /> Comportamento & Interface
                        </Typography>
                        
                        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <Box>
                                    <Typography variant="body2" sx={{ color: '#fff', fontWeight: 600 }}>Login Biométrico</Typography>
                                    <Typography variant="caption" color="text.secondary">Habilita uso de digital/facial no login</Typography>
                                </Box>
                                <Switch 
                                    checked={settings.biometric_login_enabled}
                                    onChange={(e) => setSettings(prev => ({ ...prev, biometric_login_enabled: e.target.checked }))}
                                />
                            </Box>
                            <Divider sx={{ borderColor: 'rgba(255,255,255,0.05)' }} />
                            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <Box>
                                    <Typography variant="body2" sx={{ color: '#fff', fontWeight: 600 }}>Cloud Sync Real-time</Typography>
                                    <Typography variant="caption" color="text.secondary">Sincronização instantânea com a nuvem</Typography>
                                </Box>
                                <Switch 
                                    checked={settings.cloud_sync_enabled}
                                    onChange={(e) => setSettings(prev => ({ ...prev, cloud_sync_enabled: e.target.checked }))}
                                />
                            </Box>
                        </Box>
                    </GlassCard>
                </Grid>

                {/* SEÇÃO: Alertas de Lotação */}
                <Grid item xs={12} md={6}>
                    <GlassCard sx={{ p: 3, height: '100%' }}>
                        <Typography variant="subtitle1" sx={{ color: '#fff', fontWeight: 700, mb: 3, display: 'flex', alignItems: 'center', gap: 1 }}>
                            <NotificationIcon fontSize="small" color="primary" /> Limites de Lotação
                        </Typography>
                        
                        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
                            <Box>
                                <Typography variant="body2" sx={{ color: '#fff', fontWeight: 600 }}>Alertas de Lotação</Typography>
                                <Typography variant="caption" color="text.secondary">Notificar quando atingir o limite</Typography>
                            </Box>
                            <Switch 
                                checked={settings.alert_event_peak}
                                onChange={(e) => setSettings(prev => ({ ...prev, alert_event_peak: e.target.checked }))}
                            />
                        </Box>
                        
                        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1 }}>
                            Threshold de Alerta: {settings.alert_peak_threshold}%
                        </Typography>
                        <Slider
                            value={settings.alert_peak_threshold || 90}
                            min={50}
                            max={100}
                            step={5}
                            marks
                            onChange={(e, val) => setSettings(prev => ({ ...prev, alert_peak_threshold: val }))}
                            valueLabelDisplay="auto"
                            sx={{ color: 'primary.main' }}
                        />
                    </GlassCard>
                </Grid>

                <Grid item xs={12}>
                    <Box sx={{ display: 'flex', justifyContent: 'flex-end', mt: 2 }}>
                        <Button
                            variant="contained"
                            color="primary"
                            onClick={() => handleSave()}
                            disabled={saving}
                            startIcon={saving ? <CircularProgress size={20} color="inherit" /> : null}
                            sx={{ fontWeight: 700, px: 4, borderRadius: 2 }}
                        >
                            {saving ? 'Salvando...' : 'Salvar Alterações'}
                        </Button>
                    </Box>
                </Grid>
            </Grid>
        </Box>
    );
};

export default ConfigGeral;
