import React from 'react';
import { Box, Typography, Switch, List, ListItem, ListItemIcon, ListItemText, ListItemSecondaryAction, Divider } from '@mui/material';
import { NotificationsActive as NotifyIcon, Warning as WarningIcon, Email as EmailIcon } from '@mui/icons-material';

const TabNotificacoes = ({ settings, onToggle, saving }) => {
    return (
        <Box>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 4 }}>
                Configure os alertas globais do sistema. O NZT disparará Webhooks e e-mails para os administradores mediante a ocorrência destes cenários.
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
                            onChange={() => onToggle('alert_event_peak')}
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
                            onChange={() => onToggle('alert_operator_login')}
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
        </Box>
    );
};

export default TabNotificacoes;
