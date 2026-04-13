import React from 'react';
import { Box, Typography, List, ListItem, ListItemIcon, ListItemText, ListItemSecondaryAction, MenuItem, Select } from '@mui/material';
import { Language as LangIcon } from '@mui/icons-material';

const TabIdiomas = ({ settings, onSelectChange, saving }) => {
    return (
        <Box>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 4 }}>
                Configure o idioma principal das interfaces administrativas e públicas. O i18n será engatilhado no próximo refresh da página.
            </Typography>

            <List disablePadding>
                <ListItem sx={{ px: 0, py: 2 }}>
                    <ListItemIcon sx={{ color: 'primary.main', minWidth: 48 }}>
                        <LangIcon />
                    </ListItemIcon>
                    <ListItemText
                        primary="Idioma Padrão do Sistema"
                        secondary="O idioma fallback se detectores automáticos falharem."
                        primaryTypographyProps={{ fontWeight: 600, color: '#fff' }}
                        secondaryTypographyProps={{ fontSize: '0.75rem', color: 'text.secondary' }}
                    />
                    <ListItemSecondaryAction>
                        <Select
                            size="small"
                            value={settings?.language || 'pt-BR'}
                            onChange={(e) => onSelectChange('language', e.target.value)}
                            disabled={saving}
                            sx={{ minWidth: 150, color: '#00D4FF', '& .MuiOutlinedInput-notchedOutline': { borderColor: 'rgba(0, 212, 255, 0.4)' } }}
                        >
                            <MenuItem value="pt-BR">Português (Brasil)</MenuItem>
                            <MenuItem value="en-US">English (US)</MenuItem>
                            <MenuItem value="es-ES">Español</MenuItem>
                            <MenuItem value="de-DE">Deutsch</MenuItem>
                        </Select>
                    </ListItemSecondaryAction>
                </ListItem>
            </List>
        </Box>
    );
};

export default TabIdiomas;
