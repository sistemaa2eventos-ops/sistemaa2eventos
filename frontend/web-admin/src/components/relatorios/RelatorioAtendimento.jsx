import React, { useEffect, useMemo, useState } from 'react';
import {
    Box, Grid, Typography, Table, TableHead, TableRow, TableCell, TableBody, Chip, TextField, Button, Alert,
    LinearProgress, Dialog, DialogTitle, DialogContent, DialogActions, Tabs, Tab, InputAdornment
} from '@mui/material';
import { Calculate as CalcIcon, TableChart as PlanilhaIcon } from '@mui/icons-material';
import { useSnackbar } from 'notistack';
import api from '../../services/api';
import GlassCard from '../common/GlassCard';
import { cores } from '../../styles/tokens';

const OCUPACAO = 0.85;
const seg = (s) => (s === null || s === undefined ? '—' : s >= 60 ? `${Math.floor(s / 60)} min ${String(s % 60).padStart(2, '0')} s` : `${s} s`);
const diaBR = (d) => d.split('-').reverse().join('/');
const FONTE = { medido: ['Medido', 'success'], estimado: ['Estimado', 'default'], misto: ['Misto', 'info'] };

const Kpi = ({ rotulo, valor, nota }) => (
    <GlassCard sx={{ p: 2, height: '100%' }}>
        <Typography variant="caption" sx={{ color: cores.textoSecundario }}>{rotulo}</Typography>
        <Typography variant="h5" sx={{ fontWeight: 700, color: cores.textoForte }}>{valor}</Typography>
        {nota && <Typography variant="caption" sx={{ color: cores.textoFraco }}>{nota}</Typography>}
    </GlassCard>
);

const Tabela = ({ linhas, colunas }) => (
    <Box sx={{ overflowX: 'auto' }}>
        <Table size="small">
            <TableHead><TableRow>{colunas.map(c => <TableCell key={c.r} align={c.num ? 'right' : 'left'} sx={{ fontWeight: 700 }}>{c.r}</TableCell>)}</TableRow></TableHead>
            <TableBody>
                {linhas.length === 0 && <TableRow><TableCell colSpan={colunas.length} sx={{ color: cores.textoSecundario }}>Sem atendimentos no período.</TableCell></TableRow>}
                {linhas.map((l, i) => (
                    <TableRow key={i} hover>{colunas.map(c => <TableCell key={c.r} align={c.num ? 'right' : 'left'}>{c.v(l)}</TableCell>)}</TableRow>
                ))}
            </TableBody>
        </Table>
    </Box>
);

/**
 * Aba "Atendimento": tempo de atendimento por operador, por dia e no evento, com o diagnóstico de
 * quantos operadores são necessários e a planilha orçamentária para negociar o próximo evento.
 */
const RelatorioAtendimento = ({ eventoId, dateStart, dateEnd }) => {
    const { enqueueSnackbar } = useSnackbar();
    const [dados, setDados] = useState(null);
    const [carregando, setCarregando] = useState(false);
    const [visao, setVisao] = useState('operador');
    const [calc, setCalc] = useState({ pessoas: 3000, dias: 2, horas: 10, pico: 30 });
    const [orc, setOrc] = useState(null); // diálogo da planilha

    useEffect(() => {
        if (!eventoId) return;
        setCarregando(true);
        api.get('/reports/atendimento', { params: { evento_id: eventoId, data_inicio: dateStart, data_fim: dateEnd } })
            .then(({ data }) => setDados(data.data))
            .catch(() => enqueueSnackbar('Falha ao carregar as métricas de atendimento.', { variant: 'error' }))
            .finally(() => setCarregando(false));
    }, [eventoId, dateStart, dateEnd, enqueueSnackbar]);

    const tempo = dados?.resumo?.tempo_medio_seg || 60;
    const sugestao = useMemo(() => {
        const porDia = calc.pessoas / Math.max(1, calc.dias);
        const pico = porDia * (calc.pico / 100);
        const noPico = Math.ceil((pico * tempo) / 3600 / OCUPACAO);
        const noVolume = Math.ceil((porDia * tempo) / (Math.max(1, calc.horas) * 3600 * OCUPACAO));
        return { porDia: Math.round(porDia), pico: Math.round(pico), operadores: Math.max(1, noPico, noVolume) };
    }, [calc, tempo]);

    const baixarPlanilha = async () => {
        try {
            const resp = await api.get('/reports/orcamento/xlsx', {
                params: { evento_id: eventoId, ...orc, pico_pct: orc.pico_pct / 100, tempo_atendimento_seg: tempo },
                responseType: 'blob'
            });
            const url = URL.createObjectURL(resp.data);
            const a = document.createElement('a');
            a.href = url; a.download = 'orcamento-credenciamento.xlsx'; a.click();
            URL.revokeObjectURL(url);
            setOrc(null);
        } catch {
            enqueueSnackbar('Falha ao gerar a planilha.', { variant: 'error' });
        }
    };

    const r = dados?.resumo;
    const colunasBase = [
        { r: 'Atendimentos', num: true, v: l => l.atendimentos },
        { r: 'Tempo médio', num: true, v: l => seg(l.tempo_medio_seg) },
        { r: 'Mediana', num: true, v: l => seg(l.mediana_seg) },
        { r: 'Por hora', num: true, v: l => l.por_hora },
        { r: 'Fonte', v: l => <Chip size="small" variant="outlined" label={FONTE[l.fonte]?.[0]} color={FONTE[l.fonte]?.[1]} /> }
    ];

    return (
        <Box>
            {carregando && <LinearProgress sx={{ mb: 2 }} />}
            {dados && (
                <>
                    <Grid container spacing={2} sx={{ mb: 2 }}>
                        <Grid item xs={6} md={3}><Kpi rotulo="Atendimentos" valor={r.atendimentos} nota={r.medidos ? `${r.medidos} medidos` : 'estimados pelo intervalo'} /></Grid>
                        <Grid item xs={6} md={3}><Kpi rotulo="Tempo médio por atendimento" valor={seg(r.tempo_medio_seg)} nota={`mediana ${seg(r.mediana_seg)}`} /></Grid>
                        <Grid item xs={6} md={3}><Kpi rotulo="Operadores" valor={r.operadores} nota={`${r.dias} dia(s)`} /></Grid>
                        <Grid item xs={6} md={3}><Kpi rotulo="Pico de chegadas" valor={`${dados.pico.chegadas}/h`} nota={dados.pico.hora || '—'} /></Grid>
                    </Grid>

                    <Alert severity="info" sx={{ mb: 2 }}>{dados.diagnostico.texto}</Alert>
                    {r.medidos === 0 && r.atendimentos > 0 && (
                        <Alert severity="warning" variant="outlined" sx={{ mb: 2 }}>
                            Estes tempos são estimados pelo intervalo entre um atendimento e o próximo do mesmo operador. A partir de agora o painel mede o tempo real de cada cadastro e credenciamento.
                        </Alert>
                    )}

                    <GlassCard sx={{ p: { xs: 2, sm: 2.5 }, mb: 2 }}>
                        <Typography variant="subtitle1" sx={{ fontWeight: 700, color: cores.textoForte, display: 'flex', alignItems: 'center', gap: 1 }}>
                            <CalcIcon sx={{ color: cores.primaria }} /> Quantos operadores para o próximo evento?
                        </Typography>
                        <Typography variant="body2" sx={{ color: cores.textoSecundario, mb: 2 }}>
                            Com o tempo médio deste evento ({seg(tempo)}) e {Math.round(OCUPACAO * 100)}% de ocupação do operador.
                        </Typography>
                        <Grid container spacing={2} alignItems="center">
                            {[
                                ['pessoas', 'Pessoas a credenciar'], ['dias', 'Dias de credenciamento'],
                                ['horas', 'Horas de atendimento por dia'], ['pico', 'Chegam na hora de pico (%)']
                            ].map(([k, rot]) => (
                                <Grid item xs={6} md={2.25} key={k}>
                                    <TextField size="small" type="number" label={rot} fullWidth value={calc[k]}
                                        onChange={(e) => setCalc(p => ({ ...p, [k]: Math.max(0, Number(e.target.value) || 0) }))} />
                                </Grid>
                            ))}
                            <Grid item xs={12} md={3}>
                                <Typography variant="h5" sx={{ fontWeight: 700, color: cores.primaria }}>{sugestao.operadores} operador(es)</Typography>
                                <Typography variant="caption" sx={{ color: cores.textoSecundario }}>
                                    {sugestao.porDia} pessoas/dia • pico de {sugestao.pico}/h (sem contar reserva)
                                </Typography>
                            </Grid>
                        </Grid>
                        <Box sx={{ mt: 2 }}>
                            <Button variant="contained" startIcon={<PlanilhaIcon />}
                                onClick={() => setOrc({ pessoas: calc.pessoas, dias_credenciamento: calc.dias, horas_dia: calc.horas, pico_pct: calc.pico, dias_operacao: 5, diaria_operador: 250 })}>
                                Planilha orçamentária
                            </Button>
                        </Box>
                    </GlassCard>

                    <GlassCard sx={{ p: { xs: 1.5, sm: 2 } }}>
                        <Tabs value={visao} onChange={(_, v) => setVisao(v)} variant="scrollable" sx={{ mb: 1 }}>
                            <Tab value="operador" label="Por operador" />
                            <Tab value="dia" label="Por dia" />
                            <Tab value="operador_dia" label="Operador por dia" />
                        </Tabs>
                        {visao === 'operador' && <Tabela linhas={dados.por_operador} colunas={[{ r: 'Operador', v: l => l.operador }, ...colunasBase]} />}
                        {visao === 'dia' && <Tabela linhas={dados.por_dia} colunas={[{ r: 'Dia', v: l => diaBR(l.dia) }, { r: 'Operadores', num: true, v: l => l.operadores }, ...colunasBase]} />}
                        {visao === 'operador_dia' && <Tabela linhas={dados.por_operador_dia} colunas={[{ r: 'Dia', v: l => diaBR(l.dia) }, { r: 'Operador', v: l => l.operador }, ...colunasBase]} />}
                    </GlassCard>
                </>
            )}

            <Dialog open={!!orc} onClose={() => setOrc(null)} maxWidth="xs" fullWidth>
                <DialogTitle>Planilha orçamentária</DialogTitle>
                <DialogContent>
                    <Typography variant="body2" sx={{ color: cores.textoSecundario, mb: 2 }}>
                        Gera um Excel com fórmulas: tudo que estiver em amarelo pode ser ajustado depois (equipamentos, encargos, impostos, margem).
                    </Typography>
                    <Grid container spacing={2}>
                        {orc && [
                            ['pessoas', 'Pessoas a credenciar'], ['dias_credenciamento', 'Dias de credenciamento'],
                            ['dias_operacao', 'Dias de operação (equipe)'], ['horas_dia', 'Horas por dia'],
                            ['pico_pct', 'Chegam no pico (%)'], ['diaria_operador', 'Diária do operador (R$)']
                        ].map(([k, rot]) => (
                            <Grid item xs={6} key={k}>
                                <TextField size="small" type="number" label={rot} fullWidth value={orc[k]}
                                    InputProps={k === 'diaria_operador' ? { startAdornment: <InputAdornment position="start">R$</InputAdornment> } : undefined}
                                    onChange={(e) => setOrc(p => ({ ...p, [k]: Number(e.target.value) || 0 }))} />
                            </Grid>
                        ))}
                    </Grid>
                </DialogContent>
                <DialogActions sx={{ px: 3, pb: 2 }}>
                    <Button color="inherit" onClick={() => setOrc(null)}>Cancelar</Button>
                    <Button variant="contained" startIcon={<PlanilhaIcon />} onClick={baixarPlanilha}>Baixar planilha</Button>
                </DialogActions>
            </Dialog>
        </Box>
    );
};

export default RelatorioAtendimento;
