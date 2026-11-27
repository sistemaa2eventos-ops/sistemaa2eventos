import React from 'react';
import { Box, Skeleton as SkeletonMui } from '@mui/material';
import { cores, raios } from '../../styles/tokens';

/**
 * Esqueleto de carregamento no formato do conteúdo (skill nzt-design-system, seção 5).
 * Use no lugar de spinner solto quando a tela já sabe o formato do que vai aparecer.
 *
 * @param {'linha'|'cartao'|'tabela'} variante  formato do conteúdo
 * @param {number} linhas                       quantidade de linhas (tabela)
 */
const Skeleton = ({ variante = 'linha', linhas = 5, sx }) => {
    const base = { bgcolor: cores.superficieElevada, borderRadius: raios.controle };

    if (variante === 'cartao') {
        return (
            <Box sx={{ p: 2, border: `1px solid ${cores.borda}`, borderRadius: raios.cartao, bgcolor: cores.superficie, ...sx }}>
                <SkeletonMui variant="rectangular" height={14} width="40%" sx={base} />
                <SkeletonMui variant="rectangular" height={32} width="60%" sx={{ ...base, mt: 1.5 }} />
                <SkeletonMui variant="rectangular" height={12} width="80%" sx={{ ...base, mt: 1.5 }} />
            </Box>
        );
    }

    if (variante === 'tabela') {
        return (
            <Box sx={{ display: 'grid', gap: 1.25, ...sx }}>
                {Array.from({ length: linhas }).map((_, i) => (
                    <SkeletonMui key={i} variant="rectangular" height={36} sx={base} />
                ))}
            </Box>
        );
    }

    return <SkeletonMui variant="rectangular" height={16} sx={{ ...base, ...sx }} />;
};

export default Skeleton;
