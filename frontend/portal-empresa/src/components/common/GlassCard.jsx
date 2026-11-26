import React from 'react';
import { Card, CardContent } from '@mui/material';
import { styled } from '@mui/material/styles';
import { cores, raios, sombras } from '../../styles/tokens';

/**
 * Cartão padrão do painel.
 * Borda sempre discreta: cor de moldura sem significado (roxa, laranja...) deixava cada tela
 * com um visual diferente. Só cartões clicáveis reagem ao mouse.
 * `glowColor` continua aceito por compatibilidade, mas só tinge a borda no hover de cartões clicáveis.
 */
const StyledCard = styled(Card, {
    shouldForwardProp: (prop) => !['glowcolor', 'clicavel', 'active', 'result', 'monitorado'].includes(prop)
})(({ glowcolor, clicavel }) => ({
    backgroundColor: cores.superficie,
    backgroundImage: 'none',
    border: `1px solid ${cores.borda}`,
    borderRadius: raios.cartao,
    boxShadow: sombras.cartao,
    overflow: 'hidden',
    position: 'relative',
    transition: 'border-color 0.15s ease, background-color 0.15s ease',
    ...(clicavel && {
        cursor: 'pointer',
        '&:hover': {
            borderColor: glowcolor || cores.bordaDestaque,
            backgroundColor: cores.superficieElevada,
        },
    }),
    '&:focus-visible': {
        outline: `2px solid ${cores.primaria}`,
        outlineOffset: 2,
    },
}));

const GlassCard = ({ children, glowColor, sx, onClick, ...props }) => {
    return (
        <StyledCard
            glowcolor={glowColor}
            clicavel={onClick ? 1 : 0}
            sx={sx}
            onClick={onClick}
            {...props}
        >
            {/* display: contents — os filhos participam direto do layout do cartão; assim
                flex/grid/gap passados em `sx` funcionam (antes ficavam presos nesta camada) */}
            <CardContent sx={{ p: 0, display: 'contents', '&:last-child': { pb: 0 } }}>
                {children}
            </CardContent>
        </StyledCard>
    );
};

export default GlassCard;
