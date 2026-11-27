import React from 'react';
import { Box, Typography } from '@mui/material';
import { WarningAmber as AtencaoIcon, ErrorOutline as LotadaIcon } from '@mui/icons-material';
import Secao from './Secao';
import { cores, tamanhos } from '../../../styles/tokens';

/**
 * Lotação por área agora: quem está dentro, pela área da última entrada.
 * Com capacidade cadastrada, a barra mede contra o limite; perto do limite ganha ícone e texto.
 */
const LotacaoEditorial = ({ operacao }) => {
    const areas = operacao?.lotacao || [];
    const maiorSemCapacidade = Math.max(1, ...areas.filter(a => !a.capacidade).map(a => a.presentes));

    return (
        <Secao
            id="secao-lotacao" cartao
            rotulo="Áreas"
            titulo="Lotação por área"
            subtitulo={operacao
                ? `${operacao.presentes} pessoa(s) dentro agora${operacao.capacidade ? ` de ${operacao.capacidade} no evento` : ''}`
                : 'Pessoas dentro agora'}
        >
            {areas.length === 0 ? (
                <Typography sx={{ color: cores.textoSecundario, fontSize: tamanhos.md, py: 3 }}>
                    Nenhuma área cadastrada no evento.
                </Typography>
            ) : (
                <Box component="ul" sx={{ listStyle: 'none', m: 0, p: 0, display: 'grid', gap: 2 }}>
                    {areas.map(a => {
                        const pct = a.capacidade ? a.presentes / a.capacidade : null;
                        const lotada = pct !== null && pct >= 1;
                        const atencao = pct !== null && pct >= 0.9 && !lotada;
                        const largura = pct !== null ? Math.min(1, pct) : a.presentes / maiorSemCapacidade;
                        const cor = lotada ? cores.erro : atencao ? cores.alerta : cores.primaria;
                        const situacao = lotada ? 'lotada' : atencao ? 'quase cheia' : null;
                        return (
                            <Box component="li" key={a.id} sx={{ display: 'grid', gap: 0.75 }}>
                                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 1 }}>
                                    <Typography noWrap sx={{ fontSize: tamanhos.md, fontWeight: 500, color: cores.texto, display: 'flex', alignItems: 'center', gap: 0.75, minWidth: 0 }}>
                                        {lotada && <LotadaIcon sx={{ fontSize: 16, color: cores.erro }} />}
                                        {atencao && <AtencaoIcon sx={{ fontSize: 16, color: cores.alerta }} />}
                                        {a.nome}
                                    </Typography>
                                    <Typography sx={{ flexShrink: 0, fontSize: tamanhos.sm, color: cores.textoSecundario, fontVariantNumeric: 'tabular-nums' }}>
                                        <Box component="span" sx={{ color: cores.textoForte, fontWeight: 600 }}>{a.presentes}</Box>
                                        {a.capacidade ? ` / ${a.capacidade}` : ' dentro'}
                                        {situacao && <Box component="span" sx={{ color: cor, fontWeight: 600 }}>{` · ${situacao}`}</Box>}
                                    </Typography>
                                </Box>
                                <Box
                                    role="meter"
                                    aria-label={`Lotação de ${a.nome}`}
                                    aria-valuemin={0}
                                    aria-valuemax={a.capacidade || maiorSemCapacidade}
                                    aria-valuenow={a.presentes}
                                    sx={{ height: 6, borderRadius: '999px', bgcolor: cores.superficieElevada, overflow: 'hidden' }}
                                >
                                    <Box sx={{ height: '100%', width: `${largura * 100}%`, borderRadius: '999px', bgcolor: cor }} />
                                </Box>
                            </Box>
                        );
                    })}
                </Box>
            )}
            <Typography sx={{ color: cores.textoFraco, fontSize: tamanhos.xs, mt: 2 }}>
                Área da última entrada de cada pessoa. A capacidade fica em Configurações → Áreas.
            </Typography>
        </Secao>
    );
};

export default LotacaoEditorial;
