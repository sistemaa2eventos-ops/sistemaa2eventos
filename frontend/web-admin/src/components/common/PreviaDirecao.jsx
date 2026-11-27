import React from 'react';
import { Box, Button, Stack, Typography } from '@mui/material';
import { cores, direcao } from '../../styles/tokens';

/**
 * Barra de prévia de direção visual (canto inferior esquerdo).
 * Aparece em desenvolvimento ou quando a direção foi escolhida pela URL (?direcao=…).
 * Trocar a direção recarrega a página com ?direcao=<id>, que fica guardado no navegador.
 */
const PreviaDirecao = () => {
    const mostrar = import.meta.env.DEV
        || direcao.id !== 'atual'
        || (typeof window !== 'undefined' && new URLSearchParams(window.location.search).has('direcao'));

    if (!mostrar) return null;

    const trocar = (id) => {
        const url = new URL(window.location.href);
        url.searchParams.set('direcao', id);
        window.location.href = url.toString();
    };

    return (
        <Box
            role="region"
            aria-label="Prévia de direção visual"
            sx={{
                position: 'fixed',
                left: 'max(12px, env(safe-area-inset-left, 0px))',
                bottom: 'max(12px, env(safe-area-inset-bottom, 0px))',
                zIndex: 2000,
                bgcolor: cores.superficieElevada,
                border: `1px solid ${cores.borda}`,
                borderRadius: '8px',
                boxShadow: '0 8px 24px rgba(0, 0, 0, 0.25)',
                px: 1.25,
                py: 1,
                maxWidth: 'calc(100vw - 24px)'
            }}
        >
            <Typography sx={{ color: cores.textoSecundario, fontSize: '0.6875rem', fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', mb: 0.75 }}>
                Prévia de layout · {direcao.nome}
            </Typography>
            <Stack direction="row" spacing={0.75} flexWrap="wrap" useFlexGap>
                {direcao.todas.map(({ id }) => (
                    <Button
                        key={id}
                        size="small"
                        variant={id === direcao.id ? 'contained' : 'outlined'}
                        onClick={() => trocar(id)}
                        aria-pressed={id === direcao.id}
                        sx={{
                            minWidth: 0,
                            fontSize: '0.75rem',
                            py: 0.25,
                            px: 1,
                            textTransform: 'none',
                            whiteSpace: 'nowrap'
                        }}
                    >
                        {id === 'atual' ? 'Atual' : id.toUpperCase()}
                    </Button>
                ))}
            </Stack>
        </Box>
    );
};

export default PreviaDirecao;
