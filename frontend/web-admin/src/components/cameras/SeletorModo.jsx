import React from 'react';
import { Box, ToggleButton, ToggleButtonGroup, Tooltip, Typography } from '@mui/material';

/**
 * Seletor de 3 opções (modo de IA ou de gravação) — o mesmo no cartão da câmera e no formulário.
 */
const SeletorModo = ({ rotulo, opcoes, valor, onChange, disabled = false, compacto = false, id }) => (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
        <Typography id={id ? `${id}-rotulo` : undefined} variant="caption"
            sx={{ fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'text.secondary', fontSize: '0.66rem' }}>
            {rotulo}
        </Typography>
        <ToggleButtonGroup
            exclusive
            fullWidth
            size="small"
            value={valor}
            disabled={disabled}
            aria-labelledby={id ? `${id}-rotulo` : undefined}
            onChange={(_, novo) => { if (novo && novo !== valor) onChange(novo); }}
            sx={{
                '& .MuiToggleButton-root': {
                    fontSize: compacto ? '0.7rem' : '0.78rem', fontWeight: 700, textTransform: 'none',
                    py: compacto ? 0.45 : 0.7, px: 0.5, lineHeight: 1.2, color: 'text.secondary',
                    borderColor: 'rgba(255,255,255,0.12)'
                },
                '& .MuiToggleButton-root.Mui-selected': {
                    bgcolor: 'rgba(0,212,255,0.18)', color: '#00D4FF', borderColor: 'rgba(0,212,255,0.45)'
                },
                '& .MuiToggleButton-root.Mui-selected:hover': { bgcolor: 'rgba(0,212,255,0.26)' }
            }}
        >
            {opcoes.map(o => (
                <ToggleButton key={o.valor} value={o.valor} aria-label={o.rotulo}>
                    <Tooltip title={o.ajuda} placement="top" arrow disableInteractive>
                        <span>{o.rotulo}</span>
                    </Tooltip>
                </ToggleButton>
            ))}
        </ToggleButtonGroup>
    </Box>
);

export default SeletorModo;
