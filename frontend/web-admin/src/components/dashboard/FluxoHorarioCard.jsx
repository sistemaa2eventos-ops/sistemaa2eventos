import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Box, Typography, Stack, Button, Table, TableHead, TableBody, TableRow, TableCell } from '@mui/material';
import GlassCard from '../common/GlassCard';
import { cores } from '../../styles/tokens';

// Tons validados contra a superfície escura (faixa de luminosidade, daltonismo, contraste):
// os neon da marca são claros demais para preencher barras
const COR = { ocupacao: '#0FA3C7', entradas: '#16A86A', saidas: '#D9700A' };
const GRADE = 'rgba(148,163,184,0.14)';
const MARGEM = { esq: 36, dir: 12 };
const ALT_OCUP = 120;
const ALT_BARRAS = 110;
const TOPO = 24; // espaço do título de cada gráfico

const hh = (h) => `${String(h).padStart(2, '0')}h`;

/** Escala "redonda" para o eixo: 0 até um teto legível com 3 marcas */
const escala = (max) => {
    if (max <= 0) return { teto: 4, marcas: [0, 2, 4] };
    const passo = [1, 2, 5, 10, 20, 25, 50, 100, 200, 250, 500, 1000, 2000, 5000].find(p => p * 2 >= max) || Math.ceil(max / 2);
    return { teto: passo * 2, marcas: [0, passo, passo * 2] };
};

/** Barra com o topo arredondado (4px) e a base reta no zero */
const barra = (x, y, w, h) => {
    if (h <= 0) return '';
    const r = Math.min(4, w / 2, h);
    return `M${x},${y + h} V${y + r} Q${x},${y} ${x + r},${y} H${x + w - r} Q${x + w},${y} ${x + w},${y + r} V${y + h} Z`;
};

const useLargura = () => {
    const ref = useRef(null);
    const [largura, setLargura] = useState(320); // começa estreito: largo demais empurrava a grade no celular
    useEffect(() => {
        if (!ref.current) return undefined;
        const obs = new ResizeObserver(([e]) => setLargura(Math.max(280, Math.floor(e.contentRect.width))));
        obs.observe(ref.current);
        return () => obs.disconnect();
    }, []);
    return [ref, largura];
};

const Eixo = ({ y0, altura, marcas, teto, largura }) => marcas.map(m => {
    const y = y0 + altura - (m / teto) * altura;
    return (
        <g key={m}>
            <line x1={MARGEM.esq} x2={largura - MARGEM.dir} y1={y} y2={y} stroke={GRADE} strokeWidth={1} />
            <text x={MARGEM.esq - 6} y={y + 4} textAnchor="end" fontSize={11} fill={cores.textoFraco}>{m}</text>
        </g>
    );
});

const Legenda = ({ cor, rotulo, linha }) => (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
        <Box sx={linha ? { width: 14, height: 2, bgcolor: cor, borderRadius: 1 } : { width: 10, height: 10, bgcolor: cor, borderRadius: '2px' }} />
        <Typography variant="caption" sx={{ color: cores.textoSecundario }}>{rotulo}</Typography>
    </Box>
);

/**
 * Fluxo de hoje por hora: ocupação (quem está dentro ao fim de cada hora) e, embaixo,
 * entradas × saídas. Dois gráficos com o mesmo eixo de horas, cada um com a sua escala.
 */
const FluxoHorarioCard = ({ operacao }) => {
    const [ref, largura] = useLargura();
    const [hover, setHover] = useState(null);
    const [tabela, setTabela] = useState(false);
    const fluxo = useMemo(() => operacao?.fluxo || [], [operacao]);

    // mostra a partir da primeira hora com movimento (madrugada vazia não ocupa espaço)
    const primeira = Math.max(0, Math.min(fluxo.findIndex(f => f.entradas || f.saidas || f.ocupacao), Math.max(0, fluxo.length - 6)));
    const horas = fluxo.slice(primeira === -1 ? 0 : primeira);
    const n = Math.max(horas.length, 1);
    const util = largura - MARGEM.esq - MARGEM.dir;
    const col = util / n;
    const xCentro = (i) => MARGEM.esq + col * i + col / 2;

    const eOcup = escala(Math.max(0, ...horas.map(f => f.ocupacao)));
    const eBar = escala(Math.max(0, ...horas.map(f => Math.max(f.entradas, f.saidas))));
    const yOcup = (v) => TOPO + ALT_OCUP - (v / eOcup.teto) * ALT_OCUP;
    const topoBarras = TOPO + ALT_OCUP + 30 + TOPO;
    const yBar = (v) => topoBarras + ALT_BARRAS - (v / eBar.teto) * ALT_BARRAS;
    const altTotal = topoBarras + ALT_BARRAS + 22;

    const linha = horas.map((f, i) => `${i ? 'L' : 'M'}${xCentro(i)},${yOcup(f.ocupacao)}`).join(' ');
    const area = horas.length ? `${linha} L${xCentro(horas.length - 1)},${yOcup(0)} L${xCentro(0)},${yOcup(0)} Z` : '';
    const larguraBarra = Math.max(2, Math.min(18, (col - 6) / 2));
    const passoRotulo = Math.ceil(n / Math.max(1, Math.floor(util / 38)));

    const semMovimento = !fluxo.some(f => f.entradas || f.saidas || f.ocupacao);
    const atual = hover !== null ? horas[hover] : null;

    const aoMover = (e) => {
        const r = e.currentTarget.getBoundingClientRect();
        const x = ((e.clientX - r.left) / r.width) * largura;
        const i = Math.floor((x - MARGEM.esq) / col);
        setHover(i >= 0 && i < horas.length ? i : null);
    };

    return (
        <GlassCard sx={{ p: { xs: 2, sm: 3 }, height: '100%', minWidth: 0 }}>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 1, mb: 1.5, flexWrap: 'wrap' }}>
                <Box>
                    <Typography variant="h6" sx={{ fontWeight: 700, color: cores.textoForte, fontFamily: '"Space Grotesk", sans-serif' }}>
                        Fluxo de hoje
                    </Typography>
                    <Typography variant="caption" sx={{ color: cores.textoSecundario }}>
                        {operacao?.pico ? `Pico de ${operacao.pico.ocupacao} pessoas dentro às ${hh(operacao.pico.hora)}` : 'Ocupação e movimento por hora'}
                        {` • ${operacao?.entradas_hoje || 0} entradas, ${operacao?.saidas_hoje || 0} saídas`}
                    </Typography>
                </Box>
                <Button size="small" onClick={() => setTabela(t => !t)} sx={{ color: cores.primaria, fontWeight: 700 }}>
                    {tabela ? 'Ver gráfico' : 'Ver tabela'}
                </Button>
            </Box>

            {/* largura medida num bloco sempre montado (o gráfico só aparece quando há movimento) */}
            <Box ref={ref} sx={{ width: '100%', minWidth: 0, overflow: 'hidden' }}>
            {semMovimento ? (
                <Typography variant="body2" sx={{ color: cores.textoSecundario, py: 6, textAlign: 'center' }}>
                    Nenhuma entrada ou saída registrada hoje.
                </Typography>
            ) : tabela ? (
                <Box sx={{ maxHeight: 300, overflowY: 'auto' }}>
                    <Table size="small" stickyHeader>
                        <TableHead>
                            <TableRow>
                                {['Hora', 'Dentro (fim da hora)', 'Entradas', 'Saídas', 'Negados'].map(t => (
                                    <TableCell key={t} align={t === 'Hora' ? 'left' : 'right'} sx={{ bgcolor: cores.superficie, color: cores.textoSecundario, fontWeight: 700 }}>{t}</TableCell>
                                ))}
                            </TableRow>
                        </TableHead>
                        <TableBody>
                            {horas.map(f => (
                                <TableRow key={f.hora}>
                                    <TableCell>{hh(f.hora)}</TableCell>
                                    <TableCell align="right">{f.ocupacao}</TableCell>
                                    <TableCell align="right">{f.entradas}</TableCell>
                                    <TableCell align="right">{f.saidas}</TableCell>
                                    <TableCell align="right">{f.negados}</TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                </Box>
            ) : (
                <Box sx={{ position: 'relative' }}>
                    <svg width={largura} height={altTotal} role="img" aria-label="Ocupação, entradas e saídas por hora hoje"
                        onPointerMove={aoMover} onPointerLeave={() => setHover(null)} style={{ display: 'block', touchAction: 'pan-y' }}>
                        {/* ocupação */}
                        <text x={MARGEM.esq} y={13} fontSize={12} fontWeight={600} fill={cores.textoSecundario}>Pessoas dentro</text>
                        <Eixo y0={TOPO} altura={ALT_OCUP} marcas={eOcup.marcas} teto={eOcup.teto} largura={largura} />
                        <path d={area} fill={COR.ocupacao} opacity={0.14} />
                        <path d={linha} fill="none" stroke={COR.ocupacao} strokeWidth={2} strokeLinejoin="round" />
                        {horas.length === 1 && <circle cx={xCentro(0)} cy={yOcup(horas[0].ocupacao)} r={4} fill={COR.ocupacao} />}

                        {/* entradas × saídas */}
                        <text x={MARGEM.esq} y={topoBarras - TOPO + 5} fontSize={12} fontWeight={600} fill={cores.textoSecundario}>Entradas e saídas por hora</text>
                        <Eixo y0={topoBarras} altura={ALT_BARRAS} marcas={eBar.marcas} teto={eBar.teto} largura={largura} />
                        {horas.map((f, i) => {
                            const x = xCentro(i) - larguraBarra - 1; // 2px entre as barras do par
                            const ativo = hover === i;
                            return (
                                <g key={f.hora} opacity={hover === null || ativo ? 1 : 0.55}>
                                    <path d={barra(x, yBar(f.entradas), larguraBarra, (f.entradas / eBar.teto) * ALT_BARRAS)} fill={COR.entradas} />
                                    <path d={barra(x + larguraBarra + 2, yBar(f.saidas), larguraBarra, (f.saidas / eBar.teto) * ALT_BARRAS)} fill={COR.saidas} />
                                </g>
                            );
                        })}

                        {/* horas */}
                        {horas.map((f, i) => (i % passoRotulo === 0 || i === horas.length - 1) && (
                            <text key={f.hora} x={xCentro(i)} y={altTotal - 6} textAnchor="middle" fontSize={11} fill={cores.textoFraco}>{hh(f.hora)}</text>
                        ))}

                        {/* linha vertical que segue o mouse */}
                        {atual && (
                            <g pointerEvents="none">
                                <line x1={xCentro(hover)} x2={xCentro(hover)} y1={TOPO} y2={topoBarras + ALT_BARRAS} stroke={cores.textoSecundario} strokeWidth={1} strokeDasharray="3 3" />
                                <circle cx={xCentro(hover)} cy={yOcup(atual.ocupacao)} r={4} fill={COR.ocupacao} stroke={cores.superficie} strokeWidth={2} />
                            </g>
                        )}
                    </svg>

                    {atual && (
                        <Box sx={{
                            position: 'absolute', top: 4, pointerEvents: 'none', zIndex: 2,
                            left: Math.min(Math.max(xCentro(hover) + 12, 0), largura - 170),
                            bgcolor: cores.superficieElevada, border: `1px solid ${cores.borda}`, borderRadius: 1.5, px: 1.5, py: 1, minWidth: 150,
                            boxShadow: '0 8px 24px rgba(0,0,0,0.4)'
                        }}>
                            <Typography variant="caption" sx={{ color: cores.textoSecundario, fontWeight: 700 }}>{hh(atual.hora)} – {hh(atual.hora + 1)}</Typography>
                            {[['Dentro', atual.ocupacao, COR.ocupacao], ['Entradas', atual.entradas, COR.entradas], ['Saídas', atual.saidas, COR.saidas]].map(([r, v, c]) => (
                                <Box key={r} sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                    <Box sx={{ width: 12, height: 2, bgcolor: c, borderRadius: 1 }} />
                                    <Typography variant="body2" sx={{ fontWeight: 700, color: cores.textoForte, minWidth: 28 }}>{v}</Typography>
                                    <Typography variant="caption" sx={{ color: cores.textoSecundario }}>{r}</Typography>
                                </Box>
                            ))}
                            {atual.negados > 0 && (
                                <Typography variant="caption" sx={{ color: cores.textoSecundario, display: 'block', mt: 0.25 }}>{atual.negados} negado(s)</Typography>
                            )}
                        </Box>
                    )}

                    <Stack direction="row" spacing={2} sx={{ mt: 1 }} useFlexGap flexWrap="wrap">
                        <Legenda cor={COR.ocupacao} rotulo="Pessoas dentro (fim da hora)" linha />
                        <Legenda cor={COR.entradas} rotulo="Entradas" />
                        <Legenda cor={COR.saidas} rotulo="Saídas" />
                    </Stack>
                </Box>
            )}
            </Box>
        </GlassCard>
    );
};

export default FluxoHorarioCard;
