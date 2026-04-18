import React from 'react';
import {
    Box, Typography, Switch, List, ListItem,
    ListItemIcon, ListItemText, ListItemSecondaryAction,
    Divider, Grid, CircularProgress, Slider, Button
} from '@mui/material';
import { 
    NotificationsActive as NotifyIcon, 
    Warning as WarningIcon, 
    Email as EmailIcon,
    Telegram as TelegramIcon,
    WhatsApp as WhatsAppIcon
} from '@mui/icons-material';
import { useSystemSettings } from '../../hooks/useSystemSettings';
import GlassCard from '../../components/common/GlassCard';

const ConfigNotificacoes = () => {
    const { settings, setSettings, loading, saving, handleSave } = useSystemSettings();

    if (loading) return <Box sx={{ display: 'flex', justifyContent: 'center', p: 4 }}><CircularProgress /></Box>;

    return (
        <Box>
            <Typography variant="h6" sx={{ color: 'primary.main', mb: 3, fontWeight: 700 }}>
                🔔 Alertas & Notificações Globais
            </Typography>

            <Grid container spacing={3}>
                <Grid item xs={12}>
                    <GlassCard sx={{ p: 3 }}>
                        <Typography variant="subtitle1" sx={{ color: '#fff', fontWeight: 700, mb: 3, display: 'flex', alignItems: 'center', gap: 1 }}>
                            <NotifyIcon fontSize="small" color="primary" /> Canais de Notificação
                        </Typography>
                        
                        <List disablePadding>
                            <ListItem sx={{ py: 2 }}>
                                <ListItemIcon sx={{ color: 'warning.main', minWidth: 48 }}>
                                    <WarningIcon />
                                </ListItemIcon>
                                <ListItemText
                                    primary="Alerta: Pico de Evento (Lotação Crítica)"
                                    secondary="Notifica quando a ocupação atinge o limite configurado."
                                    primaryTypographyProps={{ fontWeight: 600, color: '#fff' }}
                                    secondaryTypographyProps={{ fontSize: '0.75rem', color: 'text.secondary' }}
                                />
                                <ListItemSecondaryAction>
                                    <Switch
                                        checked={!!settings.alert_event_peak}
                                        onChange={(e) => setSettings(prev => ({ ...prev, alert_event_peak: e.target.checked }))}
                                    />
                                </ListItemSecondaryAction>
                            </ListItem>
                            <Divider sx={{ borderColor: 'rgba(255,255,255,0.05)' }} />

                            <ListItem sx={{ py: 2 }}>
                                <ListItemIcon sx={{ color: 'primary.main', minWidth: 48 }}>
                                    <EmailIcon />
                                </ListItemIcon>
                                <ListItemText
                                    primary="Relatório Diário por E-mail"
                                    secondary="Envia o resumo após o reset noturno."
                                    primaryTypographyProps={{ fontWeight: 600, color: '#fff' }}
                                    secondaryTypographyProps={{ fontSize: '0.75rem', color: 'text.secondary' }}
                                />
                                <ListItemSecondaryAction>
                                    <Switch
                                        checked={!!settings.email_relatorio_ativo}
                                        onChange={(e) => setSettings(prev => ({ ...prev, email_relatorio_ativo: e.target.checked }))}
                                    />
                                </ListItemSecondaryAction>
                            </ListItem>
                            <Divider sx={{ borderColor: 'rgba(255,255,255,0.05)' }} />

                            <ListItem sx={{ py: 2 }}>
                                <ListItemIcon sx={{ color: '#00D4FF', minWidth: 48 }}>
                                    <TelegramIcon />
                                </ListItemIcon>
                                <ListItemText
                                    primary="Alertas via Telegram"
                                    secondary="Notificações críticas em tempo real pelo Bot."
                                    primaryTypographyProps={{ fontWeight: 600, color: '#fff' }}
                                    secondaryTypographyProps={{ fontSize: '0.75rem', color: 'text.secondary' }}
                                />
                                <ListItemSecondaryAction>
                                    <Switch
                                        checked={!!settings.telegram_alerts_enabled}
                                        onChange={(e) => setSettings(prev => ({ ...prev, telegram_alerts_enabled: e.target.checked }))}
                                    />
                                </ListItemSecondaryAction>
                            </ListItem>
                        </List>
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

export default ConfigNotificacoes;
