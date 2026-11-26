import React from 'react';
import { Box, DialogTitle, IconButton, Tooltip, Typography } from '@mui/material';
import { Close as CloseIcon } from '@mui/icons-material';
import { cores, tamanhos } from '../../styles/tokens';

/**
 * Cabeçalho padrão de modal: título (+ subtítulo opcional) e botão de fechar.
 * Use no lugar de <DialogTitle> nos modais de cadastro/edição.
 */
const TituloModal = ({ titulo, subtitulo, onFechar, desabilitarFechar = false }) => (
    <DialogTitle
        component="div"
        sx={{
            display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 2,
            borderBottom: `1px solid ${cores.borda}`,
            py: 2, px: { xs: 2, sm: 3 }
        }}
    >
        <Box sx={{ minWidth: 0 }}>
            <Typography component="h2" sx={{ fontFamily: 'inherit', fontSize: tamanhos.xl, fontWeight: 700, color: cores.textoForte, lineHeight: 1.3 }}>
                {titulo}
            </Typography>
            {subtitulo && (
                <Typography sx={{ fontSize: tamanhos.sm, color: cores.textoSecundario, mt: 0.25 }}>
                    {subtitulo}
                </Typography>
            )}
        </Box>
        {onFechar && (
            <Tooltip title="Fechar">
                <span>
                    <IconButton onClick={onFechar} disabled={desabilitarFechar} aria-label="Fechar" size="small" sx={{ color: cores.textoSecundario, mt: -0.25 }}>
                        <CloseIcon fontSize="small" />
                    </IconButton>
                </span>
            </Tooltip>
        )}
    </DialogTitle>
);

export default TituloModal;
