import React from 'react';
import { Box, Typography } from '@mui/material';
import { cores, fontes, tamanhos } from '../../styles/tokens';

/**
 * Cabeçalho padrão de página: título curto + uma frase de subtítulo (+ ações à direita).
 * `breadcrumbs` continua aceito por compatibilidade, mas não é exibido: com um único nível
 * ("Dashboard › X") a trilha só ocupava espaço e aparecia em metade das telas.
 */
// eslint-disable-next-line no-unused-vars
const PageHeader = ({ title, subtitle, breadcrumbs, action, sx }) => (
    <Box sx={{ mb: { xs: 2, sm: 3 }, ...sx }}>
        <Box sx={{ display: 'flex', alignItems: { xs: 'stretch', sm: 'flex-start' }, justifyContent: 'space-between', flexDirection: { xs: 'column', sm: 'row' }, gap: { xs: 1.5, sm: 2 }, flexWrap: 'wrap' }}>
            <Box sx={{ minWidth: 0 }}>
                <Typography
                    component="h1"
                    sx={{ fontFamily: fontes.titulo, fontWeight: 700, fontSize: { xs: '1.25rem', sm: tamanhos.xxl, md: '1.75rem' }, color: cores.textoForte, lineHeight: 1.2 }}
                >
                    {title}
                </Typography>
                {subtitle && (
                    <Typography sx={{ color: cores.textoSecundario, fontSize: { xs: tamanhos.sm, sm: tamanhos.md }, lineHeight: 1.45, mt: 0.5 }}>
                        {subtitle}
                    </Typography>
                )}
            </Box>
            {action && (
                <Box sx={{ flexShrink: 0, width: { xs: '100%', sm: 'auto' }, display: 'flex', justifyContent: { xs: 'flex-start', sm: 'flex-end' }, '& > *': { width: { xs: '100%', sm: 'auto' } } }}>
                    {action}
                </Box>
            )}
        </Box>
    </Box>
);

export default PageHeader;
