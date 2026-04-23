import React from 'react';
import {
    Grid,
    TextField,
    Button,
    Typography,
    Divider,
    Box,
    Switch,
    FormControlLabel,
    InputAdornment,
    CircularProgress
} from '@mui/material';
import {
    Email as EmailIcon,
    WhatsApp as WhatsAppIcon,
    Telegram as TelegramIcon,
    Send as SendIcon,
    Lock as LockIcon
} from '@mui/icons-material';
import GlassCard from '../common/GlassCard';
import NeonButton from '../common/NeonButton';
import { useSystemSettings } from '../../hooks/useSystemSettings';

const MessagingManager = () => {
    const { settings, setSettings, saving, loading, handleSave, testSmtp, testWpp } = useSystemSettings();

    if (loading) return <Box sx={{ p: 4, textAlign: 'center' }}><CircularProgress /></Box>;

    return (
        <Box>
            <Grid container spacing={4}>
                {/* Email (SMTP) */}
                <Grid item xs={12} lg={6}>
                    <GlassCard sx={{ p: 3, height: '100%' }}>
                        <Box sx={{ display: 'flex', alignItems: 'center', mb: 2, gap: 1 }}>
                            <EmailIcon color="primary" />
                            <Typography variant="h6" sx={{ fontWeight: 800 }}>E-MAIL (SMTP)</Typography>
                        </Box>
                        <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block', mb: 3 }}>
                            Configure o servidor de saída para envio de convites e relatórios.
                        </Typography>

                        <Grid container spacing={2}>
                            <Grid item xs={12} md={9}>
                                <TextField 
                                    fullWidth label="Servidor SMTP" 
                                    value={settings.smtp_host || ''} 
                                    onChange={(e) => setSettings({ ...settings, smtp_host: e.target.value })}
                                />
                            </Grid>
                            <Grid item xs={12} md={3}>
                                <TextField 
                                    fullWidth label="Porta" 
                                    type="number"
                                    value={settings.smtp_port || 587} 
                                    onChange={(e) => setSettings({ ...settings, smtp_port: e.target.value })}
                                />
                            </Grid>
                            <Grid item xs={12} md={6}>
                                <TextField 
                                    fullWidth label="Usuário / E-mail" 
                                    value={settings.smtp_user || ''} 
                                    onChange={(e) => setSettings({ ...settings, smtp_user: e.target.value })}
                                />
                            </Grid>
                            <Grid item xs={12} md={6}>
                                <TextField 
                                    fullWidth label="Senha" 
                                    type="password"
                                    value={settings.smtp_pass || ''} 
                                    onChange={(e) => setSettings({ ...settings, smtp_pass: e.target.value })}
                                />
                            </Grid>
                            <Grid item xs={12}>
                                <FormControlLabel
                                    control={<Switch checked={!!settings.smtp_secure} onChange={(e) => setSettings({...settings, smtp_secure: e.target.checked})} />}
                                    label="Usar conexão segura (SSL/TLS)"
                                />
                            </Grid>
                            <Grid item xs={12}>
                                <Button 
                                    variant="outlined" 
                                    startIcon={<SendIcon />} 
                                    fullWidth 
                                    onClick={testSmtp}
                                    sx={{ mt: 1 }}
                                >
                                    TESTAR CONEXÃO SMTP
                                </Button>
                            </Grid>
                        </Grid>
                    </GlassCard>
                </Grid>

                {/* WhatsApp & Telegram */}
                <Grid item xs={12} lg={6}>
                    <Grid container spacing={4}>
                        {/* WhatsApp */}
                        <Grid item xs={12}>
                            <GlassCard sx={{ p: 3 }}>
                                <Box sx={{ display: 'flex', alignItems: 'center', mb: 2, gap: 1 }}>
                                    <WhatsAppIcon sx={{ color: '#25D366' }} />
                                    <Typography variant="h6" sx={{ fontWeight: 800 }}>WHATSAPP GATEWAY</Typography>
                                </Box>
                                <Grid container spacing={2}>
                                    <Grid item xs={12}>
                                        <TextField 
                                            fullWidth label="URL do Webhook / Gateway" 
                                            placeholder="https://api.gateway.com/v1"
                                            value={settings.whatsapp_gateway || ''} 
                                            onChange={(e) => setSettings({ ...settings, whatsapp_gateway: e.target.value })}
                                        />
                                    </Grid>
                                    <Grid item xs={12}>
                                        <TextField 
                                            fullWidth label="Token de Autenticação / API Key" 
                                            type="password"
                                            value={settings.whatsapp_token || ''}
                                            InputProps={{
                                                startAdornment: (
                                                    <InputAdornment position="start">
                                                        <LockIcon sx={{ fontSize: 18 }} />
                                                    </InputAdornment>
                                                ),
                                            }}
                                            onChange={(e) => setSettings({ ...settings, whatsapp_token: e.target.value })}
                                        />
                                    </Grid>
                                    <Grid item xs={12}>
                                        <Button 
                                            variant="outlined" 
                                            color="success"
                                            startIcon={<WhatsAppIcon />} 
                                            fullWidth 
                                            onClick={testWpp}
                                        >
                                            VERIFICAR INSTÂNCIA WHATSAPP
                                        </Button>
                                    </Grid>
                                </Grid>
                            </GlassCard>
                        </Grid>

                        {/* Telegram */}
                        <Grid item xs={12}>
                            <GlassCard sx={{ p: 3 }}>
                                <Box sx={{ display: 'flex', alignItems: 'center', mb: 2, gap: 1 }}>
                                    <TelegramIcon sx={{ color: '#0088CC' }} />
                                    <Typography variant="h6" sx={{ fontWeight: 800 }}>TELEGRAM ALERTS</Typography>
                                </Box>
                                <Grid container spacing={2}>
                                    <Grid item xs={12} md={8}>
                                        <TextField 
                                            fullWidth label="Bot Token" 
                                            placeholder="123456789:ABCDE..."
                                            value={settings.telegram_token || ''} 
                                            onChange={(e) => setSettings({ ...settings, telegram_token: e.target.value })}
                                        />
                                    </Grid>
                                    <Grid item xs={12} md={4}>
                                        <TextField 
                                            fullWidth label="Chat ID Padrão" 
                                            placeholder="-100..."
                                            value={settings.telegram_chat_id || ''} 
                                            onChange={(e) => setSettings({ ...settings, telegram_chat_id: e.target.value })}
                                        />
                                    </Grid>
                                </Grid>
                            </GlassCard>
                        </Grid>
                    </Grid>
                </Grid>

                {/* Footer Actions */}
                <Grid item xs={12}>
                    <Divider sx={{ my: 2 }} />
                    <Box sx={{ display: 'flex', justifyContent: 'flex-end', gap: 2 }}>
                        <Button variant="text" sx={{ color: 'text.secondary' }}>DESCARTAR</Button>
                        <NeonButton 
                            loading={saving} 
                            onClick={() => handleSave()}
                            sx={{ px: 4 }}
                        >
                            SALVAR CONFIGURAÇÕES DE COMUNICAÇÃO
                        </NeonButton>
                    </Box>
                </Grid>
            </Grid>
        </Box>
    );
};

export default MessagingManager;
