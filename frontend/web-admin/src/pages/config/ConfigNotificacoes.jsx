import React, { useState, useEffect } from 'react';
import { Box, Typography, Switch, List, ListItem, ListItemIcon, ListItemText, ListItemSecondaryAction, Divider, CircularProgress, Snackbar, Alert } from '@mui/material';
import { NotificationsActive as NotifyIcon, Warning as WarningIcon, Email as EmailIcon } from '@mui/icons-material';
import PageHeader from '../../components/common/PageHeader';
import GlassCard from '../../components/common/GlassCard';
import api from '../../services/api';

const ConfigNotificacoes = () => {
    const [settings, setSettings] = useState(null);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [feedback, setFeedback] = useState({ open: false, message: '', severity: 'success' });

    useEffect(() => {
        const fetchSettings = async () => {
            try {
                const response = await api.get('/settings');
                setSettings(response.data.data);
            } catch (error) {
                showFeedback('Falha ao carregar configurações.', 'error');
            } finally {
                setLoading(false);
            }
        };
        fetchSettings();
    }, []);

    const showFeedback = (message, severity = 'success') => {
        setFeedback({ open: false, message: '', severity });
        setTimeout(() => setFeedback({ open: true, message, severity }), 50);
    };

    const handleToggle = async (key) => {
        if (!settings) return;
        const newValue = !settings[key];
        const oldSettings = { ...settings };
        setSettings(prev => ({ ...prev, [key]: newValue }));

        try {
            setSaving(true);
            await api.put('/settings', { [key]: newValue });
            showFeedback('Configuração atualizada com sucesso.');
        } catch (error) {
            setSettings(oldSettings);
            showFeedback('Falha ao salvar configuração.', 'error');
        } finally {
            setSaving(false);
        }
    };

    if (loading) return <Box sx={{ display: 'flex', justifyContent: 'center', p: 4 }}><CircularProgress color="secondary" /></Box>;

    return (
        <Box sx={{ p: { xs: 2, md: 4 } }}>
            <PageHeader
                title="Centro de Notificações"
                subtitle="Configure os alertas globais do sistema. E-mails e webhooks são configurados no módulo de Comunicação."
                breadcrumbs={[{ text: 'Sistema' }, { text: 'Configurações' }, { text: 'Notificações' }]}
            />

            <GlassCard sx={{ p: { xs: 2, md: 4 }, mt: 4, minHeight: '500px' }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 4, pb: 2, borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                    <NotifyIcon sx={{ color: '#00D4FF', fontSize: 32 }} />
                    <Typography variant="h5" sx={{ fontWeight: 800, color: '#fff' }}>
                        Alertas & Webhooks
                    </Typography>
                </Box>

                <Typography variant="body2" color="text.secondary" sx={{ mb: 4 }}>
                    O NZT disparará Webhooks e e-mails para os administradores mediante a ocorrência destes cenários de perigo.
                </Typography>

                <List disablePadding>
                    <ListItem sx={{ px: 0, py: 2, '&:hover': { background: 'rgba(0, 212, 255, 0.03)' }, borderRadius: 2 }}>
                        <ListItemIcon sx={{ color: 'warning.main', minWidth: 48 }}>
                            <WarningIcon />
                        </ListItemIcon>
                        <ListItemText
                            primary="Alerta: Pico de Evento (Lotação Crítica)"
                            secondary="Emite um aviso no Dashboard sonoro caso a entrada simultânea ultrapasse a média de segurança."
                            primaryTypographyProps={{ fontWeight: 600, color: '#fff' }}
                            secondaryTypographyProps={{ fontSize: '0.75rem', color: 'text.secondary' }}
                        />
                        <ListItemSecondaryAction>
                            <Switch
                                checked={settings?.alert_event_peak || false}
                                onChange={() => handleToggle('alert_event_peak')}
                                disabled={saving}
                                color="warning"
                            />
                        </ListItemSecondaryAction>
                    </ListItem>
                    <Divider sx={{ borderColor: 'rgba(255,255,255,0.05)' }} />

                    <ListItem sx={{ px: 0, py: 2, '&:hover': { background: 'rgba(0, 212, 255, 0.03)' }, borderRadius: 2 }}>
                        <ListItemIcon sx={{ color: '#00D4FF', minWidth: 48 }}>
                            <EmailIcon />
                        </ListItemIcon>
                        <ListItemText
                            primary="Alerta: Shadow Login (Operador)"
                            secondary="Dispara E-mail para masters informando se um novo operador se autenticar em horários atípicos (22:00 às 06:00)."
                            primaryTypographyProps={{ fontWeight: 600, color: '#fff' }}
                            secondaryTypographyProps={{ fontSize: '0.75rem', color: 'text.secondary' }}
                        />
                        <ListItemSecondaryAction>
                            <Switch
                                checked={settings?.alert_operator_login || false}
                                onChange={() => handleToggle('alert_operator_login')}
                                disabled={saving}
                                color="primary"
                                sx={{
                                    '& .MuiSwitch-switchBase.Mui-checked': {
                                        color: '#00D4FF',
                                        '& + .MuiSwitch-track': { backgroundColor: '#00D4FF' }
                                    }
                                }}
                            />
                        </ListItemSecondaryAction>
                    </ListItem>
                    <Divider sx={{ borderColor: 'rgba(255,255,255,0.05)' }} />
                </List>
            </GlassCard>

            <Snackbar open={feedback.open} autoHideDuration={4000} onClose={() => setFeedback({ ...feedback, open: false })}>
                <Alert onClose={() => setFeedback({ ...feedback, open: false })} severity={feedback.severity} variant="filled">
                    {feedback.message}
                </Alert>
            </Snackbar>
        </Box>
    );
};

export default ConfigNotificacoes;
