import React from 'react';
import { Box, Typography, Stack, Tooltip } from '@mui/material';
import { WarningAmber as AtencaoIcon, ErrorOutline as LotadaIcon } from '@mui/icons-material';
import GlassCard from '../common/GlassCard';
import { cores } from '../../styles/tokens';

const COR_BARRA = '#0FA3C7'; // mesmo tom da ocupação no fluxo

/**
 * Lotação por área agora: quem está dentro, pela área da última entrada.
 * Com capacidade cadastrada, mostra a barra contra o limite; perto do limite ganha ícone e texto.
 */
const LotacaoAreasCard = ({ operacao }) => {
    const areas = operacao?.lotacao || [];
    const maiorSemCapacidade = Math.max(1, ...areas.filter(a => !a.capacidade).map(a => a.presentes));

    return (
        <GlassCard sx={{ p: { xs: 2, sm: 3 }, height: '100%' }}>
            <Typography variant="h6" sx={{ fontWeight: 700, color: cores.textoForte, fontFamily: '"Space Grotesk", sans-serif' }}>
                Lotação por área
            </Typography>
            <Typography variant="caption" sx={{ color: cores.textoSecundario, display: 'block', mb: 2 }}>
                {operacao ? `${operacao.presentes} pessoa(s) dentro agora${operacao.capacidade ? ` de ${operacao.capacidade} no evento` : ''}` : 'Pessoas dentro agora'}
            </Typography>

            {areas.length === 0 ? (
                <Typography variant="body2" sx={{ color: cores.textoSecundario, py: 4, textAlign: 'center' }}>
                    Nenhuma área cadastrada no evento.
                </Typography>
            ) : (
                <Stack spacing={1.75}>
                    {areas.map(a => {
                        const pct = a.capacidade ? a.presentes / a.capacidade : null;
                        const lotada = pct !== null && pct >= 1;
                        const atencao = pct !== null && pct >= 0.9 && !lotada;
                        const largura = pct !== null ? Math.min(1, pct) : a.presentes / maiorSemCapacidade;
                        return (
                            <Tooltip key={a.id} arrow placement="top"
                                title={a.capacidade ? `${a.presentes} de ${a.capacidade} (${Math.round(pct * 100)}%)` : `${a.presentes} dentro • sem capacidade cadastrada`}>
                                <Box>
                                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 1, mb: 0.5 }}>
                                        <Typography variant="body2" sx={{ fontWeight: 600, color: cores.textoForte, display: 'flex', alignItems: 'center', gap: 0.5, minWidth: 0 }} noWrap>
                                            {lotada && <LotadaIcon sx={{ fontSize: 16, color: cores.erro }} />}
                                            {atencao && <AtencaoIcon sx={{ fontSize: 16, color: cores.alerta }} />}
                                            {a.nome}
                                        </Typography>
                                        <Typography variant="body2" sx={{ fontWeight: 700, color: cores.textoForte, flexShrink: 0 }}>
                                            {a.presentes}
                                            <Typography component="span" variant="caption" sx={{ color: cores.textoSecundario, fontWeight: 400 }}>
                                                {a.capacidade ? ` / ${a.capacidade}${lotada ? ' • lotada' : atencao ? ' • quase cheia' : ''}` : ''}
                                            </Typography>
                                        </Typography>
                                    </Box>
                                    <Box sx={{ height: 8, borderRadius: 4, bgcolor: 'rgba(148,163,184,0.14)', overflow: 'hidden' }}>
                                        <Box sx={{
                                            height: '100%', width: `${largura * 100}%`, borderRadius: 4,
                                            bgcolor: lotada ? cores.erro : atencao ? cores.alerta : COR_BARRA,
                                            transition: 'width 0.4s ease'
                                        }} />
                                    </Box>
                                </Box>
                            </Tooltip>
                        );
                    })}
                </Stack>
            )}
            <Typography variant="caption" sx={{ color: cores.textoFraco, display: 'block', mt: 2 }}>
                Área da última entrada de cada pessoa. A capacidade fica em Configurações → Áreas.
            </Typography>
        </GlassCard>
    );
};

export default LotacaoAreasCard;
