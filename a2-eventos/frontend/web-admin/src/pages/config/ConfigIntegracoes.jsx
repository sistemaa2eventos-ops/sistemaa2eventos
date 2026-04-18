import React, { useState, useEffect } from 'react';
import {
    Box, Typography, Button, Grid, 
    CircularProgress, Chip, Stack, Alert, 
    Divider, TextField
} from '@mui/material';
import { 
    CloudDone as CloudIcon,
    Storage as StorageIcon,
    Mail as MailIcon,
    Telegram as TelegramIcon,
    WhatsApp as WhatsAppIcon,
    CheckCircle as SuccessIcon,
    Error as ErrorIcon
} from '@mui/icons-material';
import { useSnackbar } from 'notistack';
import { useSystemSettings } from '../../hooks/useSystemSettings';
import GlassCard from '../../components/common/GlassCard';
import api from '../../services/api';

const ConfigIntegracoes = () => {
    const { settings, setSettings, saving, handleSave, testEmail } = useSystemSettings();
    const { enqueueSnackbar } = useSnackbar();
    
    const [status, setStatus] = useState({
        database: 'loading',
        storage: 'loading',
        smtp: 'loading',
        whatsapp: 'loading'
    });

    useEffect(() => {
        checkStatus();
    }, []);

    const checkStatus = async () => {
        try {
            const [db, smtp] = await Promise.all([
                api.get('/settings/test-supabase', { timeout: 5000 }).catch(error => {
                    console.error('Falha teste Supabase:', error);
                    return { data: { success: false, message: error.message } };
                }),
                api.post('/settings/verify-smtp').catch(() => ({ data: { success: false } }))
            ]);

            setStatus({
                database: db.data.success ? 'online' : 'error',
                storage: db.data.success ? 'online' : 'error', // Geralmente atrelado ao DB no nexus
                smtp: smtp.data.success ? 'online' : 'error',
                whatsapp: settings.whatsapp_api_url ? 'configured' : 'offline'
            });
        } catch (error) {
            console.error(error);
        }
    };

    const StatusChip = ({ type }) => {
        const config = {
            loading: { label: 'Verificando...', color: 'default', icon: <CircularProgress size={12} color="inherit" /> },
            online: { label: 'Conectado', color: 'success', icon: <SuccessIcon sx={{ fontSize: 14 }} /> },
            error: { label: 'Falha na Conexão', color: 'error', icon: <ErrorIcon sx={{ fontSize: 14 }} /> },
            configured: { label: 'Configurado', color: 'info', icon: <SuccessIcon sx={{ fontSize: 14 }} /> },
            offline: { label: 'Não Configurado', color: 'default', icon: <ErrorIcon sx={{ fontSize: 14 }} /> },
        };
        const current = config[type] || config.loading;
        return <Chip icon={current.icon} label={current.label} color={current.color} size="small" variant="outlined" sx={{ fontWeight: 800, fontSize: '0.65rem' }} />;
    };

    return (
        <Box>
            <Typography variant="h6" sx={{ color: 'primary.main', mb: 3, fontWeight: 700 }}>
                🔌 Integrações & Gateways Externos
            </Typography>

            <Grid container spacing={3}>
                {/* STATUS DOS SERVIÇOS CORE */}
                <Grid item xs={12}>
                    <GlassCard sx={{ p: 3 }}>
                        <Typography variant="subtitle2" sx={{ color: '#fff', fontWeight: 700, mb: 3 }}>Status do Ecossistema</Typography>
                        <Stack direction={{ xs: 'column', md: 'row' }} spacing={4} divider={<Divider orientation="vertical" flexItem sx={{ borderColor: 'rgba(255,255,255,0.05)' }} />}>
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                                <StorageIcon color="primary" />
                                <Box>
                                    <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>SUPABASE DB</Typography>
                                    <StatusChip type={status.database} />
                                </Box>
                            </Box>
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                                <CloudIcon sx={{ color: '#00D4FF' }} />
                                <Box>
                                    <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>STORAGE BUCKET</Typography>
                                    <StatusChip type={status.storage} />
                                </Box>
                            </Box>
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                                <MailIcon sx={{ color: '#00FF88' }} />
                                <Box>
                                    <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>SMTP SERVER</Typography>
                                    <StatusChip type={status.smtp} />
                                </Box>
                            </Box>
                        </Stack>
                    </GlassCard>
                </Grid>

                {/* CONFIGURAÇÃO: EMAIL (SMTP) */}
                <Grid item xs={12} md={6}>
                    <GlassCard sx={{ p: 3, height: '100%' }}>
                        <Typography variant="subtitle1" sx={{ color: '#fff', fontWeight: 700, mb: 3, display: 'flex', alignItems: 'center', gap: 1 }}>
                            <MailIcon fontSize="small" color="primary" /> Remetente de E-mail
                        </Typography>
                        
                        <Stack spacing={2}>
                            <TextField 
                                label="E-mail do Remetente" 
                                fullWidth 
                                size="small"
                                value={settings.email_from || ''}
                                onChange={(e) => setSettings(prev => ({ ...prev, email_from: e.target.value }))}
                            />
                            <TextField 
                                label="Nome de Exibição" 
                                fullWidth 
                                size="small"
                                value={settings.email_from_name || ''}
                                onChange={(e) => setSettings(prev => ({ ...prev, email_from_name: e.target.value }))}
                            />
                            <Button 
                                variant="outlined" 
                                color="primary" 
                                fullWidth
                                onClick={testEmail}
                                sx={{ textTransform: 'none', fontWeight: 700 }}
                            >
                                Enviar E-mail de Teste
                            </Button>
                        </Stack>
                    </GlassCard>
                </Grid>

                {/* CONFIGURAÇÃO: MENSAGERIA */}
                <Grid item xs={12} md={6}>
                    <GlassCard sx={{ p: 3, height: '100%' }}>
                        <Typography variant="subtitle1" sx={{ color: '#fff', fontWeight: 700, mb: 3, display: 'flex', alignItems: 'center', gap: 1 }}>
                            <TelegramIcon fontSize="small" sx={{ color: '#00D4FF' }} /> Telegram & WhatsApp
                        </Typography>
                        
                        <Stack spacing={2}>
                            <TextField 
                                label="Bot Token (Telegram)" 
                                type="password"
                                fullWidth 
                                size="small"
                                value={settings.telegram_bot_token || ''}
                                onChange={(e) => setSettings(prev => ({ ...prev, telegram_bot_token: e.target.value }))}
                            />
                            <TextField 
                                label="API URL (WhatsApp)" 
                                fullWidth 
                                size="small"
                                placeholder="Ex: https://api.wa.nzt.io/v1/..."
                                value={settings.whatsapp_api_url || ''}
                                onChange={(e) => setSettings(prev => ({ ...prev, whatsapp_api_url: e.target.value }))}
                            />
                            <TextField 
                                label="API Key (WhatsApp)" 
                                type="password"
                                fullWidth 
                                size="small"
                                value={settings.whatsapp_api_key || ''}
                                onChange={(e) => setSettings(prev => ({ ...prev, whatsapp_api_key: e.target.value }))}
                            />
                        </Stack>
                    </GlassCard>
                </Grid>

                <Grid item xs={12}>
                    <Box sx={{ display: 'flex', justifyContent: 'flex-end', mt: 2 }}>
                        <Button
                            variant="contained"
                            color="primary"
                            onClick={() => handleSave()}
                            disabled={saving}
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

export default ConfigIntegracoes;
