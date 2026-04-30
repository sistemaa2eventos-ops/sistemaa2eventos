import React from 'react';
import { Box, Typography, Switch, List, ListItem, ListItemIcon, ListItemText, ListItemSecondaryAction, Divider, TextField } from '@mui/material';
import { CloudQueue as CloudIcon, SettingsInputComponent as ApiIcon } from '@mui/icons-material';

const TabIntegracoes = ({ settings, onToggle, saving }) => {
    return (
        <Box>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 4 }}>
                Gerencie como o A2 Eventos se conecta com a nuvem e outros ecossistemas.
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
                            checked={settings?.cloud_sync_enabled || false}
                            onChange={() => onToggle('cloud_sync_enabled')}
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

                <ListItem sx={{ px: 0, py: 2, alignItems: 'flex-start' }}>
                    <ListItemIcon sx={{ color: 'text.secondary', minWidth: 48, mt: 1 }}>
                        <ApiIcon />
                    </ListItemIcon>
                    <Box sx={{ flexGrow: 1, pr: 2 }}>
                        <ListItemText
                            primary="Endereço da API Backend (Nó Controlador)"
                            secondary="A URL raiz (HOST) lida pelo frontend via Vite ENV. Não é possível alterar aqui por questões de CORS compilado."
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
        </Box>
    );
};

export default TabIntegracoes;
