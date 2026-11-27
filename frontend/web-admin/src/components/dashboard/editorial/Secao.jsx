import React from 'react';
import { Box, Typography } from '@mui/material';
import { cores, direcao, fontes, raios, tamanhos } from '../../../styles/tokens';

/**
 * Peças comuns do Dashboard editorial (direção A).
 * Toda seção tem a mesma anatomia: linha de 1px no topo, rótulo pequeno, título e ação à direita.
 * Sem caixa: a divisória separa as seções, e a cor fica só nos estados.
 */

/** Rótulo pequeno de seção: maiúsculas com espaçamento, 12px, fonte mono */
export const RotuloSecao = ({ children, sx }) => (
    <Typography
        component="p"
        sx={{
            m: 0,
            fontFamily: fontes.mono,
            fontSize: tamanhos.xs,
            letterSpacing: '0.06em',
            textTransform: 'uppercase',
            color: cores.textoSecundario,
            ...sx
        }}
    >
        {children}
    </Typography>
);

/** Ponto de estado com texto: a cor nunca aparece sozinha */
export const PontoEstado = ({ cor, children, sx }) => (
    <Box
        component="span"
        sx={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 0.75,
            color: cor,
            fontSize: tamanhos.sm,
            fontWeight: 600,
            whiteSpace: 'nowrap',
            ...sx
        }}
    >
        <Box component="span" aria-hidden sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: cor, flexShrink: 0 }} />
        {children}
    </Box>
);

/**
 * @param {string} rotulo     rótulo curto acima do título (opcional)
 * @param {string} titulo     título da seção (h2)
 * @param {node}   subtitulo  uma linha de contexto (opcional)
 * @param {node}   acao       controle ou informação à direita do título (opcional)
 */
const Secao = ({ id, rotulo, titulo, subtitulo, acao, cartao = false, children, sx }) => (
    <Box
        component="section"
        aria-labelledby={id}
        sx={{
            // cartão (layout Cartões): fundo de superfície, borda 1px e raio 12
            ...(cartao
                ? { bgcolor: cores.superficie, border: `1px solid ${cores.borda}`, borderRadius: raios.cartao, px: '20px', py: '18px' }
                : { borderTop: `1px solid ${cores.borda}`, pt: { xs: 2, md: 3 } }),
            minWidth: 0,
            display: 'flex',
            flexDirection: 'column',
            ...sx
        }}
    >
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', gap: 2, flexWrap: 'wrap', mb: 2 }}>
            <Box sx={{ minWidth: 0 }}>
                {rotulo && <RotuloSecao sx={{ mb: 0.5 }}>{rotulo}</RotuloSecao>}
                <Typography
                    id={id}
                    component="h2"
                    sx={{
                        fontFamily: fontes.titulo,
                        fontWeight: direcao.pesoTitulo,
                        fontSize: tamanhos.xl,
                        letterSpacing: '-0.02em',
                        lineHeight: 1.3,
                        color: cores.textoForte
                    }}
                >
                    {titulo}
                </Typography>
                {subtitulo && (
                    <Typography sx={{ mt: 0.5, color: cores.textoSecundario, fontSize: tamanhos.sm, maxWidth: '65ch' }}>
                        {subtitulo}
                    </Typography>
                )}
            </Box>
            {acao && <Box sx={{ flexShrink: 0, maxWidth: '100%' }}>{acao}</Box>}
        </Box>
        {children}
    </Box>
);

export default Secao;
