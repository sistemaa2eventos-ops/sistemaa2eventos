import React, { useEffect, useMemo, useState } from 'react';
import {
    Alert, Box, Button, Checkbox, CircularProgress, Grid, IconButton, Stack, Switch,
    Table, TableBody, TableCell, TableContainer, TableHead, TableRow, TextField, Tooltip, Typography
} from '@mui/material';
import { Add as AddIcon, Delete as DeleteIcon, Save as SaveIcon } from '@mui/icons-material';
import { useSnackbar } from 'notistack';
import api from '../../services/api';
import GlassCard from '../../components/common/GlassCard';

const PADRAO = '*';
const normalizar = (f) => String(f || '').trim().replace(/\s+/g, ' ').toUpperCase();
const inputSx = { '& .MuiOutlinedInput-root': { color: '#FFFFFF', '& fieldset': { borderColor: 'rgba(255,255,255,0.15)' } } };

/**
 * Documentos obrigatórios do evento:
 * catálogo de tipos, matriz função × documento e antecedência do aviso de vencimento.
 */
const ConfigDocumentos = () => {
    const { enqueueSnackbar } = useSnackbar();
    const [carregando, setCarregando] = useState(true);
    const [salvando, setSalvando] = useState(false);
    const [tipos, setTipos] = useState([]);
    const [regras, setRegras] = useState({});
    const [funcoes, setFuncoes] = useState([]);
    const [aviso, setAviso] = useState(15);
    const [novaFuncao, setNovaFuncao] = useState('');

    const aplicar = (cfg) => {
        setTipos(cfg.tipos || []);
        setRegras(cfg.regras || {});
        setFuncoes(cfg.funcoes || []);
        setAviso(cfg.aviso_vencimento_dias || 15);
    };

    useEffect(() => {
        api.get('/documentos/config')
            .then(resp => aplicar(resp.data?.data || {}))
            .catch(() => enqueueSnackbar('Erro ao carregar a configuração de documentos.', { variant: 'error' }))
            .finally(() => setCarregando(false));
    }, [enqueueSnackbar]);

    const tiposAtivos = useMemo(() => tipos.filter(t => t.ativo !== false && t.nome?.trim()), [tipos]);
    const chaveTipo = (t) => t.id || t.tempId;
    const linhasFuncao = [PADRAO, ...funcoes];

    const marcado = (funcao, tipo) => (regras[funcao] || []).includes(chaveTipo(tipo));
    const alternar = (funcao, tipo) => {
        const id = chaveTipo(tipo);
        setRegras(prev => {
            const atual = new Set(prev[funcao] || []);
            if (atual.has(id)) atual.delete(id); else atual.add(id);
            return { ...prev, [funcao]: [...atual] };
        });
    };

    const atualizarTipo = (idx, campo, valor) => setTipos(prev => prev.map((t, i) => (i === idx ? { ...t, [campo]: valor } : t)));
    const adicionarTipo = () => setTipos(prev => [...prev, { tempId: `novo_${Date.now()}`, nome: '', exige_validade: false, ativo: true, ordem: prev.length }]);
    const removerTipoNovo = (idx) => setTipos(prev => prev.filter((_, i) => i !== idx));

    const adicionarFuncao = () => {
        const f = normalizar(novaFuncao);
        if (!f || f === PADRAO || funcoes.includes(f)) return;
        setFuncoes(prev => [...prev, f].sort());
        setNovaFuncao('');
    };

    const salvar = async () => {
        setSalvando(true);
        try {
            // Tipos novos são referenciados pelo nome; o backend devolve os IDs definitivos
            const tiposPayload = tipos.filter(t => t.nome?.trim()).map((t, i) => ({ ...t, ordem: i }));
            const refPorTemp = Object.fromEntries(tipos.filter(t => t.tempId).map(t => [t.tempId, t.nome.trim()]));
            const regrasPayload = Object.fromEntries(Object.entries(regras).map(([f, ids]) => [f, ids.map(id => refPorTemp[id] || id)]));

            const resp = await api.put('/documentos/config', { tipos: tiposPayload, regras: regrasPayload, aviso_vencimento_dias: aviso });
            aplicar(resp.data?.data || {});
            enqueueSnackbar('Configuração salva. A situação documental dos colaboradores está sendo recalculada.', { variant: 'success' });
        } catch (err) {
            enqueueSnackbar(err.response?.data?.error || 'Erro ao salvar a configuração.', { variant: 'error' });
        } finally {
            setSalvando(false);
        }
    };

    if (carregando) return <Box sx={{ textAlign: 'center', py: 6 }}><CircularProgress /></Box>;

    const semRegras = !Object.values(regras).some(l => l.length > 0);

    return (
        <Stack spacing={3}>
            <Box>
                <Typography variant="h6" sx={{ fontWeight: 700 }}>Documentos obrigatórios</Typography>
                <Typography variant="body2" sx={{ color: 'text.secondary' }}>
                    Quem não tiver todos os documentos exigidos para a sua função aprovados (e dentro da validade) fica <b>pendente</b>.
                    O operador pode liberar no turno; a liberação vale até o checkout ou o <b>horário de reset</b> do evento.
                </Typography>
            </Box>

            {semRegras && (
                <Alert severity="info">
                    Nenhum documento obrigatório definido: vale a regra antiga (todos os documentos enviados aprovados).
                    Marque abaixo o que cada função precisa entregar.
                </Alert>
            )}

            <Grid container spacing={3}>
                <Grid item xs={12} md={5}>
                    <GlassCard sx={{ p: 2.5 }}>
                        <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 1.5 }}>
                            <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>Tipos de documento</Typography>
                            <Button size="small" startIcon={<AddIcon />} onClick={adicionarTipo}>Novo tipo</Button>
                        </Stack>
                        <Stack spacing={1}>
                            {tipos.map((t, idx) => (
                                <Stack key={chaveTipo(t)} direction="row" spacing={1} alignItems="center">
                                    <TextField size="small" fullWidth value={t.nome} placeholder="Nome do documento"
                                        onChange={(e) => atualizarTipo(idx, 'nome', e.target.value)} sx={inputSx} />
                                    <Tooltip title="Exige data de validade">
                                        <Stack alignItems="center">
                                            <Switch size="small" checked={!!t.exige_validade} onChange={(e) => atualizarTipo(idx, 'exige_validade', e.target.checked)} />
                                            <Typography variant="caption" sx={{ fontSize: '0.75rem', color: 'text.secondary' }}>validade</Typography>
                                        </Stack>
                                    </Tooltip>
                                    <Tooltip title={t.ativo !== false ? 'Ativo' : 'Inativo'}>
                                        <Stack alignItems="center">
                                            <Switch size="small" checked={t.ativo !== false} onChange={(e) => atualizarTipo(idx, 'ativo', e.target.checked)} />
                                            <Typography variant="caption" sx={{ fontSize: '0.75rem', color: 'text.secondary' }}>ativo</Typography>
                                        </Stack>
                                    </Tooltip>
                                    {t.tempId && (
                                        <IconButton size="small" onClick={() => removerTipoNovo(idx)}><DeleteIcon fontSize="small" /></IconButton>
                                    )}
                                </Stack>
                            ))}
                        </Stack>
                    </GlassCard>

                    <GlassCard sx={{ p: 2.5, mt: 3 }}>
                        <Typography variant="subtitle1" sx={{ fontWeight: 700, mb: 1 }}>Aviso de vencimento</Typography>
                        <TextField type="number" size="small" label="Avisar com antecedência de (dias)" value={aviso}
                            onChange={(e) => setAviso(Math.max(1, parseInt(e.target.value, 10) || 1))} sx={inputSx} inputProps={{ min: 1, max: 365 }} />
                        <Typography variant="caption" sx={{ display: 'block', color: 'text.secondary', mt: 1 }}>
                            O sino do painel avisa os documentos que vencem nesse prazo e os já vencidos (verificação diária às 07:00).
                        </Typography>
                    </GlassCard>
                </Grid>

                <Grid item xs={12} md={7}>
                    <GlassCard sx={{ p: 2.5 }}>
                        <Typography variant="subtitle1" sx={{ fontWeight: 700, mb: 1 }}>Obrigatórios por função</Typography>
                        <TableContainer sx={{ maxHeight: 520 }}>
                            <Table size="small" stickyHeader>
                                <TableHead>
                                    <TableRow>
                                        <TableCell sx={{ fontWeight: 700 }}>Função</TableCell>
                                        {tiposAtivos.map(t => (
                                            <TableCell key={chaveTipo(t)} align="center" sx={{ fontWeight: 700, fontSize: '0.75rem', whiteSpace: 'nowrap' }}>{t.nome}</TableCell>
                                        ))}
                                    </TableRow>
                                </TableHead>
                                <TableBody>
                                    {linhasFuncao.map(f => (
                                        <TableRow key={f} hover>
                                            <TableCell sx={{ fontWeight: f === PADRAO ? 800 : 600, color: f === PADRAO ? 'primary.main' : 'inherit', whiteSpace: 'nowrap' }}>
                                                {f === PADRAO ? 'Todos (padrão)' : f}
                                            </TableCell>
                                            {tiposAtivos.map(t => (
                                                <TableCell key={chaveTipo(t)} align="center" padding="checkbox">
                                                    <Checkbox size="small" checked={marcado(f, t)} onChange={() => alternar(f, t)} />
                                                </TableCell>
                                            ))}
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        </TableContainer>
                        <Stack direction="row" spacing={1} sx={{ mt: 2 }}>
                            <TextField size="small" placeholder="Adicionar função (ex.: ELETRICISTA)" value={novaFuncao}
                                onChange={(e) => setNovaFuncao(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && adicionarFuncao()} sx={inputSx} />
                            <Button onClick={adicionarFuncao} startIcon={<AddIcon />}>Função</Button>
                        </Stack>
                        <Typography variant="caption" sx={{ display: 'block', color: 'text.secondary', mt: 1 }}>
                            A linha Todos (padrão) vale para todo colaborador; a linha da função soma documentos extras.
                            A função é comparada sem diferenciar maiúsculas/minúsculas.
                        </Typography>
                    </GlassCard>
                </Grid>
            </Grid>

            <Box sx={{ textAlign: 'right' }}>
                <Button variant="contained" startIcon={salvando ? <CircularProgress size={16} /> : <SaveIcon />} onClick={salvar} disabled={salvando}>
                    Salvar configuração
                </Button>
            </Box>
        </Stack>
    );
};

export default ConfigDocumentos;
