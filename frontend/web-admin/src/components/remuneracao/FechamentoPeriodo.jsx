import React, { useMemo } from 'react';
import { Box, Typography, Grid, Alert, Tooltip, Stack } from '@mui/material';
import {
    EventAvailable as DiariasIcon, Schedule as HorasIcon, MoreTime as ExtrasIcon,
    Payments as ValorIcon, ReportProblem as ConferirIcon
} from '@mui/icons-material';
import KpiCard from '../common/KpiCard';
import DataTable from '../common/DataTable';
import { cores } from '../../styles/tokens';
import { formatarMoeda, formatarHoras } from '../../hooks/useRemuneracao';

// Código do dia → [fundo, texto, explicação]
const CODIGOS = {
    '1': ['rgba(0,255,136,0.15)', '#00FF88', 'Diária'],
    '½': ['rgba(255,184,0,0.15)', '#FFB800', 'Meia diária'],
    'D': ['rgba(0,212,255,0.18)', '#00D4FF', 'Dobra (2 diárias)'],
    '0': ['rgba(148,163,184,0.12)', '#94A3B8', 'Abaixo do mínimo de horas'],
    'F': ['rgba(255,51,102,0.15)', '#FF3366', 'Falta: escalado e sem registro'],
    '?': ['rgba(255,136,0,0.18)', '#FF8800', 'A conferir: sem horário de saída real'],
    'A': ['rgba(255,184,0,0.10)', '#FFB800', 'Turno em andamento'],
    'S': ['rgba(148,163,184,0.18)', '#CBD5E1', 'Sem regra de remuneração: horas sem valor']
};

const CelulaDia = ({ c }) => {
    if (!c) return <Typography variant="caption" sx={{ color: cores.textoFraco }}>·</Typography>;
    const [fundo, texto, explicacao] = CODIGOS[c.codigo] || CODIGOS['0'];
    const detalhes = [
        explicacao,
        c.minutos > 0 ? `${formatarHoras(c.minutos)} trabalhadas` : null,
        c.extras_minutos > 0 ? `${formatarHoras(c.extras_minutos)} extras` : null,
        c.valor_total > 0 ? formatarMoeda(c.valor_total) : null,
        c.observacao || null
    ].filter(Boolean).join(' • ');
    return (
        <Tooltip title={detalhes} arrow>
            <Box sx={{
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center', minWidth: 26, height: 22, px: 0.5,
                borderRadius: 1, bgcolor: fundo, color: texto, fontWeight: 700, fontSize: '0.75rem', cursor: 'help'
            }}>
                {c.codigo}
            </Box>
        </Tooltip>
    );
};

/**
 * Fechamento do período: diárias, horas e valores por pessoa, com um código por dia.
 * O cálculo é do servidor (regra da função na empresa ou a padrão da empresa).
 */
const FechamentoPeriodo = ({ fechamento, loading }) => {
    const dias = useMemo(() => fechamento?.dias || [], [fechamento]);
    const totais = fechamento?.totais || {};

    const colunas = useMemo(() => [
        { id: 'empresa', label: 'Empresa', width: 170 },
        {
            id: 'colaborador', label: 'Colaborador', width: 210,
            format: (val, row) => (
                <Box sx={{ minWidth: 0 }}>
                    <Typography variant="body2" sx={{ fontWeight: 700, color: cores.textoForte }} noWrap>{val}</Typography>
                    <Typography variant="caption" sx={{ color: cores.textoSecundario }} noWrap>{row.funcao}</Typography>
                </Box>
            )
        },
        {
            id: 'regra', label: 'Regra', width: 130,
            format: (val) => val
                ? <Typography variant="caption" sx={{ color: cores.textoSuave }}>{val}</Typography>
                : <Typography variant="caption" sx={{ color: cores.erro, fontWeight: 700 }}>Sem regra</Typography>
        },
        ...dias.map(d => ({
            id: `dia_${d}`,
            label: d.split('-').reverse().slice(0, 2).join('/'),
            width: 54,
            align: 'center',
            format: (_, row) => <CelulaDia c={row.dias?.[d]} />
        })),
        { id: 'diarias', label: 'Diárias', width: 80, align: 'center', format: (v) => <strong>{Number(v || 0).toLocaleString('pt-BR')}</strong> },
        { id: 'minutos', label: 'Horas', width: 90, align: 'center', format: (v) => formatarHoras(v) },
        { id: 'extras_minutos', label: 'Extras', width: 90, align: 'center', format: (v) => v > 0 ? formatarHoras(v) : '—' },
        {
            id: 'valor_total', label: 'Total', width: 120, align: 'right',
            format: (v, row) => (
                <Tooltip title={`Diárias ${formatarMoeda(row.valor_diarias)} + extras ${formatarMoeda(row.valor_extras)}`} arrow>
                    <Typography variant="body2" sx={{ fontWeight: 700, color: v > 0 ? cores.sucesso : cores.textoFraco }}>{formatarMoeda(v)}</Typography>
                </Tooltip>
            )
        }
    ], [dias]);

    return (
        <Box>
            {(fechamento?.avisos || []).map(a => (
                <Alert key={a} severity="warning" sx={{ mb: 1.5 }}>{a}</Alert>
            ))}

            <Grid container spacing={2} sx={{ mb: 2.5 }}>
                <Grid item xs={6} md={2.4}>
                    <KpiCard titulo="Diárias" valor={Number(totais.diarias || 0).toLocaleString('pt-BR')} icone={<DiariasIcon />}
                        rodape={`${totais.dias_trabalhados || 0} dias trabalhados • ${totais.faltas || 0} faltas`} />
                </Grid>
                <Grid item xs={6} md={2.4}>
                    <KpiCard titulo="Horas trabalhadas" valor={formatarHoras(totais.minutos)} icone={<HorasIcon />} cor={cores.secundariaClara} valorCompacto
                        rodape={`${totais.pessoas || 0} pessoas no período`} />
                </Grid>
                <Grid item xs={6} md={2.4}>
                    <KpiCard titulo="Horas extras" valor={formatarHoras(totais.extras_minutos)} icone={<ExtrasIcon />} cor={cores.alerta} valorCompacto
                        rodape={formatarMoeda(totais.valor_extras)} />
                </Grid>
                <Grid item xs={6} md={2.4}>
                    <KpiCard titulo="Total a pagar" valor={formatarMoeda(totais.valor_total)} icone={<ValorIcon />} cor={cores.sucesso} valorCompacto
                        rodape={`Diárias ${formatarMoeda(totais.valor_diarias)}`} />
                </Grid>
                <Grid item xs={12} md={2.4}>
                    <KpiCard titulo="A conferir" valor={(totais.a_conferir || 0) + (totais.sem_regra || 0)} icone={<ConferirIcon />} cor={cores.erro}
                        rodape={`${totais.a_conferir || 0} sem saída • ${totais.sem_regra || 0} sem regra`} />
                </Grid>
            </Grid>

            <Stack direction="row" spacing={1.5} useFlexGap flexWrap="wrap" sx={{ mb: 1.5 }}>
                {Object.entries(CODIGOS).map(([codigo, [fundo, texto, explicacao]]) => (
                    <Box key={codigo} sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
                        <Box sx={{ minWidth: 22, height: 20, borderRadius: 1, bgcolor: fundo, color: texto, fontWeight: 700, fontSize: '0.75rem',
                            display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{codigo}</Box>
                        <Typography variant="caption" sx={{ color: cores.textoSecundario }}>{explicacao}</Typography>
                    </Box>
                ))}
            </Stack>

            <DataTable data={fechamento?.linhas || []} columns={colunas} loading={loading} rowsPerPage={25} />

            <Typography variant="caption" sx={{ color: cores.textoFraco, display: 'block', mt: 1.5 }}>
                Horas do primeiro check-in ao último check-out de cada turno; o turno conta no dia da entrada.
                As regras ficam em Empresas → Regras de remuneração.
            </Typography>
        </Box>
    );
};

export default FechamentoPeriodo;
