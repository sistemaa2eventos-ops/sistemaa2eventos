import React, { useState, useEffect, useCallback } from 'react';
import {
    Box, Typography, Button, Grid, 
    CircularProgress, Chip, Stack, 
    Divider, TextField
} from '@mui/material';
import { 
    CloudDone as CloudIcon,
    Storage as StorageIcon,
    Mail as MailIcon,
    Telegram as TelegramIcon,
    CheckCircle as SuccessIcon,
    Error as ErrorIcon
} from '@mui/icons-material';
import { useSystemSettings } from '../../hooks/useSystemSettings';
import GlassCard from '../../components/common/GlassCard';
import PageHeader from '../../components/common/PageHeader';
import api from '../../services/api';

import { botaoSecundario } from '../../styles/tokens';
const ConfigIntegracoes = () => {
    const { settings, setSettings, loading, saving, handleSave, testEmail } = useSystemSettings();
    
    const [status, setStatus] = useState({
        database: 'loading',
        storage: 'loading',
        smtp: 'loading',
        whatsapp: 'loading'
    });

    const checkStatus = useCallback(async () => {
        try {
            // Nomes que o validador de /verify-smtp exige (com smtp_* ele recusava com
            // "Erro de validação" toda vez que a tela abria)
            const smtpParams = {
                host: settings.smtp_host,
                port: settings.smtp_port,
                user: settings.smtp_user,
                pass: settings.smtp_pass
            };
            const smtpConfigured = Boolean(
                smtpParams.host && smtpParams.port && smtpParams.user && smtpParams.pass
            );

            const [db, smtp] = await Promise.all([
                api.get('/settings/test-connection', { timeout: 5000, hideDefaultError: true }).catch(error => {
                    console.error('Falha teste Supabase:', error);
                    return { data: { success: false, message: error.message } };
                }),
                smtpConfigured
                    // Verificação de fundo: a falha vira o selo "Falha na conexão", sem aviso na tela
                    ? api.post('/settings/verify-smtp', smtpParams, { hideDefaultError: true }).catch(() => ({ data: { success: false } }))
                    : Promise.resolve({ data: { success: false } })
            ]);

            setStatus({
                database: db.data.success ? 'online' : 'error',
                storage: db.data.success ? 'online' : 'error', // Geralmente atrelado ao DB no nexus
                smtp: !smtpConfigured ? 'offline' : (smtp.data.success ? 'online' : 'error'),
                whatsapp: settings.whatsapp_api_url ? 'configured' : 'offline'
            });
        } catch (error) {
            console.error(error);
        }
    }, [settings]);

    useEffect(() => {
        if (!loading) checkStatus();
    }, [loading, checkStatus]);

    const StatusChip = ({ type }) => {
        const config = {
            loading: { label: 'Verificando...', color: 'default', icon: <CircularProgress size={12} color="inherit" /> },
            online: { label: 'Conectado', color: 'success', icon: <SuccessIcon sx={{ fontSize: 14 }} /> },
            error: { label: 'Falha na conexão', color: 'error', icon: <ErrorIcon sx={{ fontSize: 14 }} /> },
            configured: { label: 'Configurado', color: 'info', icon: <SuccessIcon sx={{ fontSize: 14 }} /> },
            offline: { label: 'Não configurado', color: 'default', icon: <ErrorIcon sx={{ fontSize: 14 }} /> },
        };
        const current = config[type] || config.loading;
        return <Chip icon={current.icon} label={current.label} color={current.color} size="small" variant="outlined" sx={{ fontWeight: 700, fontSize: '0.75rem' }} />;
    };

    return (
        <Box sx={{ p: { xs: 2, md: 4 } }}>
            <PageHeader
                title="Integrações"
                subtitle="Serviços conectados e integrações com outras plataformas."
                breadcrumbs={[{ text: 'Configurações' }, { text: 'Integrações' }]}
            />

            <Grid container spacing={3}>
                {/* STATUS DOS SERVIÇOS CORE */}
                <Grid item xs={12}>
                    <GlassCard sx={{ p: 3 }}>
                        <Typography variant="subtitle2" sx={{ color: '#FFFFFF', fontWeight: 700, mb: 3 }}>Status do ecossistema</Typography>
                        <Stack direction={{ xs: 'column', md: 'row' }} spacing={4} divider={<Divider orientation="vertical" flexItem sx={{ borderColor: 'rgba(255,255,255,0.05)' }} />}>
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                                <StorageIcon color="primary" />
                                <Box>
                                    <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>Supabase DB</Typography>
                                    <StatusChip type={status.database} />
                                </Box>
                            </Box>
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                                <CloudIcon sx={{ color: '#00D4FF' }} />
                                <Box>
                                    <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>Storage bucket</Typography>
                                    <StatusChip type={status.storage} />
                                </Box>
                            </Box>
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                                <MailIcon sx={{ color: '#00FF88' }} />
                                <Box>
                                    <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>SMTP server</Typography>
                                    <StatusChip type={status.smtp} />
                                </Box>
                            </Box>
                        </Stack>

                        <TextField
                            fullWidth
                            disabled
                            size="small"
                            label="Endereço da API Backend (nó controlador)"
                            value={import.meta.env.VITE_API_URL || 'URL Não Encontrada'}
                            sx={{ mt: 3 }}
                            InputProps={{
                                sx: {
                                    color: '#00D4FF',
                                    '-webkit-text-fill-color': '#00D4FF !important',
                                    fontFamily: '"Inter", sans-serif'
                                }
                            }}
                            helperText="URL raiz (HOST) lida pelo frontend via Vite ENV. Não é possível alterar aqui por questões de CORS compilado na build."
                        />
                    </GlassCard>
                </Grid>

                {/* CONFIGURAÇÃO: EMAIL (SMTP) */}
                <Grid item xs={12} md={6}>
                    <GlassCard sx={{ p: 3, height: '100%' }}>
                        <Typography variant="subtitle1" sx={{ color: '#FFFFFF', fontWeight: 700, mb: 3, display: 'flex', alignItems: 'center', gap: 1 }}>
                            <MailIcon fontSize="small" color="primary" /> Remetente de E-mail
                        </Typography>
                        
                        <Stack spacing={2}>
                            <TextField 
                                label="E-mail do remetente" 
                                fullWidth 
                                size="small"
                                value={settings.email_from || ''}
                                onChange={(e) => setSettings(prev => ({ ...prev, email_from: e.target.value }))}
                            />
                            <TextField 
                                label="Nome de exibição" 
                                fullWidth 
                                size="small"
                                value={settings.email_from_name || ''}
                                onChange={(e) => setSettings(prev => ({ ...prev, email_from_name: e.target.value }))}
                            />
                            <Button variant="outlined" 
                                
                                
                                fullWidth
                                onClick={testEmail} sx={botaoSecundario}>
                                Enviar e-mail de teste
                            </Button>
                        </Stack>
                    </GlassCard>
                </Grid>

                {/* CONFIGURAÇÃO: MENSAGERIA */}
                <Grid item xs={12} md={6}>
                    <GlassCard sx={{ p: 3, height: '100%' }}>
                        <Typography variant="subtitle1" sx={{ color: '#FFFFFF', fontWeight: 700, mb: 3, display: 'flex', alignItems: 'center', gap: 1 }}>
                            <TelegramIcon fontSize="small" sx={{ color: '#00D4FF' }} /> Telegram & WhatsApp
                        </Typography>
                        
                        <Stack spacing={2}>
                            <TextField 
                                label="Bot token (Telegram)" 
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
                            sx={{ fontWeight: 700, px: 4, borderRadius: 1.5 }}
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
