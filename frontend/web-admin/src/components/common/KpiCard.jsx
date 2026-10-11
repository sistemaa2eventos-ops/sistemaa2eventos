import React from 'react';
import { Box, LinearProgress, Typography } from '@mui/material';
import GlassCard from './GlassCard';
import { cores, fontes, tamanhos, tom } from '../../styles/tokens';

/**
 * Cartão de indicador padrão (número + rótulo).
 * A cor indica o significado (sucesso, alerta, erro...) e aparece só no ícone e na barra —
 * rótulo e número ficam neutros, para os cartões lado a lado não virarem um arco-íris.
 *
 * @param {string}  titulo   rótulo curto (ex.: "Presentes agora")
 * @param {node}    valor    número/valor principal
 * @param {node}    icone    ícone do MUI
 * @param {string}  cor      cor de estado (tokens.cores.*)
 * @param {node}    rodape   texto auxiliar abaixo do número
 * @param {number}  progresso 0–100 para exibir barra (opcional)
 * @param {func}    onClick  torna o cartão clicável
 * @param {bool}    ativo    destaca o cartão (ex.: filtro selecionado)
 * @param {bool}    valorCompacto número menor, para valores longos (ex.: "23h 30m")
 */
const KpiCard = ({ titulo, valor, icone, cor = cores.primaria, rodape, progresso, onClick, ativo = false, valorCompacto = false, sx }) => (
    <GlassCard
        onClick={onClick}
        sx={{
            p: 2,
            height: '100%',
            borderColor: ativo ? cor : undefined,
            ...sx
        }}
    >
        <Box sx={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 1.5 }}>
            <Box sx={{ minWidth: 0 }}>
                <Typography
                    component="div"
                    sx={{ color: cores.textoSecundario, fontSize: tamanhos.xs, fontWeight: 600, lineHeight: 1.35 }}
                >
                    {titulo}
                </Typography>
                <Typography
                    component="div"
                    sx={{ color: cores.textoForte, fontFamily: fontes.titulo, fontSize: valorCompacto ? tamanhos.xl : tamanhos.display, fontWeight: 700, lineHeight: valorCompacto ? 1.6 : 1.15, mt: 0.5, fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}
                >
                    {valor}
                </Typography>
            </Box>
            {icone && (
                <Box sx={{
                    flexShrink: 0, width: 36, height: 36, borderRadius: '8px',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    bgcolor: tom(cor, 0.12), color: cor,
                    '& svg': { fontSize: 20 }
                }}>
                    {icone}
                </Box>
            )}
        </Box>
        {typeof progresso === 'number' && (
            <LinearProgress
                variant="determinate"
                value={Math.max(0, Math.min(100, progresso))}
                sx={{ mt: 1.25, height: 4, borderRadius: 2, bgcolor: 'rgba(148,163,184,0.12)', '& .MuiLinearProgress-bar': { bgcolor: cor } }}
            />
        )}
        {rodape && (
            <Typography component="div" sx={{ color: cores.textoSecundario, fontSize: tamanhos.xs, mt: 0.75 }}>
                {rodape}
            </Typography>
        )}
    </GlassCard>
);

export default KpiCard;
