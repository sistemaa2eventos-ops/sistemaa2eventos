import React from 'react';
import { Box, Typography, Switch, List, ListItem, ListItemIcon, ListItemText, ListItemSecondaryAction, Divider } from '@mui/material';
import { Palette as PaletteIcon, DarkMode as DarkModeIcon, Visibility as VisibilityIcon } from '@mui/icons-material';

const TabGeral = ({ settings, onToggle, saving }) => {
    return (
        <Box>
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
                            checked={settings?.theme_neon_enabled || false}
                            onChange={() => onToggle('theme_neon_enabled')}
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

                {/* Outras opções gerais podem vir aqui: Exibir Títulos, Layouts Responsivos, etc */}
            </List>
        </Box>
    );
};

export default TabGeral;
