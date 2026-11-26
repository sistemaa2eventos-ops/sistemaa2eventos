import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
    Box, Button, Chip, CircularProgress, InputAdornment, Menu, MenuItem, Stack, Table, TableBody, TableCell,
    TableContainer, TableHead, TableRow, TextField, Typography
} from '@mui/material';
import { Add as AddIcon, Search as BuscaIcon, TableChart as PlanilhaIcon } from '@mui/icons-material';
import { useSearchParams } from 'react-router-dom';
import { useSnackbar } from 'notistack';
import api, { baixarArquivo, dadosDe, erroDe } from '../services/api';
import PageHeader from '../components/common/PageHeader';
import GlassCard from '../components/common/GlassCard';
import NeonButton from '../components/common/NeonButton';
import ParticipanteDialog from '../components/ParticipanteDialog';
import IncluirParticipanteDialog from '../components/IncluirParticipanteDialog';
import ImportarPlanilhaDialog from '../components/ImportarPlanilhaDialog';
import { METRICAS, SITUACAO_OBRIGATORIO, chipSx, hora, situacaoMovimento } from '../util';
import { botaoSecundario, cores } from '../styles/tokens';

const semAcento = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

/** Equipe da empresa: situação de hoje, documentos e ficha de cada participante. */
const Participantes = () => {
    const { enqueueSnackbar } = useSnackbar();
    const [params, setParams] = useSearchParams();
    const filtro = METRICAS.some(m => m.key === params.get('filtro')) ? params.get('filtro') : 'todos';
    const [lista, setLista] = useState(null);
    const [busca, setBusca] = useState('');
    const [abertoId, setAbertoId] = useState(null);
    const [incluir, setIncluir] = useState(false);
    const [importar, setImportar] = useState(false);
    const [menuPlanilha, setMenuPlanilha] = useState(null);

    const carregar = useCallback(async () => {
        try {
            setLista(dadosDe(await api.get('/resumo'))?.participantes || []);
        } catch (err) {
            enqueueSnackbar(erroDe(err, 'Erro ao carregar a equipe.'), { variant: 'error' });
            setLista([]);
        }
    }, [enqueueSnackbar]);

    useEffect(() => { carregar(); }, [carregar]);

    const metrica = METRICAS.find(m => m.key === filtro);
    const visiveis = useMemo(() => {
        const termo = semAcento(busca.trim());
        return (lista || []).filter(metrica.filtro)
            .filter(p => !termo || semAcento(`${p.nome_completo} ${p.funcao || ''} ${p.numero_pulseira || ''}`).includes(termo));
    }, [lista, metrica, busca]);

    const escolherFiltro = (key) => setParams(key === 'todos' ? {} : { filtro: key });
    const baixar = async (url, nome) => {
        setMenuPlanilha(null);
        try { await baixarArquivo(url, nome); } catch (err) { enqueueSnackbar(err.message, { variant: 'error' }); }
    };

    return (
        <>
            <PageHeader
                title="Participantes"
                subtitle="Sua equipe no evento: cadastro, documentos e entrada e saída de hoje. Clique em uma pessoa para ver a ficha."
                action={
                    <Stack direction="row" spacing={1.5}>
                        <Button variant="outlined" startIcon={<PlanilhaIcon />} onClick={(e) => setMenuPlanilha(e.currentTarget)} sx={botaoSecundario}>Planilha</Button>
                        <NeonButton startIcon={<AddIcon />} onClick={() => setIncluir(true)}>Incluir participante</NeonButton>
                    </Stack>
                }
            />
            <Menu anchorEl={menuPlanilha} open={!!menuPlanilha} onClose={() => setMenuPlanilha(null)}>
                <MenuItem onClick={() => baixar('/planilha/modelo', 'Modelo_participantes.xlsx')}>Baixar modelo em branco</MenuItem>
                <MenuItem onClick={() => { setMenuPlanilha(null); setImportar(true); }}>Importar planilha preenchida</MenuItem>
                <MenuItem onClick={() => baixar('/planilha/exportar', 'Participantes.xlsx')}>Exportar a equipe</MenuItem>
            </Menu>

            <Stack direction="row" spacing={1} useFlexGap sx={{ flexWrap: 'wrap', mb: 2 }}>
                {METRICAS.map(m => {
                    const n = (lista || []).filter(m.filtro).length;
                    const ativo = filtro === m.key;
                    return (
                        <Chip key={m.key} label={`${m.rotulo} (${n})`} onClick={() => escolherFiltro(m.key)} clickable
                            sx={{ fontWeight: 700, border: `1px solid ${ativo ? cores.primaria : cores.borda}`,
                                bgcolor: ativo ? 'rgba(0,212,255,0.12)' : cores.superficie, color: ativo ? cores.primaria : cores.texto }} />
                    );
                })}
            </Stack>

            <GlassCard sx={{ p: { xs: 1.5, md: 2.5 } }}>
                <TextField size="small" fullWidth placeholder="Buscar por nome, função ou pulseira" value={busca} onChange={(e) => setBusca(e.target.value)}
                    InputProps={{ startAdornment: <InputAdornment position="start"><BuscaIcon fontSize="small" /></InputAdornment> }} sx={{ mb: 2 }} />

                {lista === null && <Box sx={{ display: 'flex', justifyContent: 'center', p: 4 }}><CircularProgress /></Box>}
                {lista !== null && (
                    <TableContainer>
                        <Table size="small">
                            <TableHead>
                                <TableRow>
                                    <TableCell sx={{ fontWeight: 700 }}>Participante</TableCell>
                                    <TableCell sx={{ fontWeight: 700 }}>Situação hoje</TableCell>
                                    <TableCell sx={{ fontWeight: 700 }}>Pulseira</TableCell>
                                    <TableCell sx={{ fontWeight: 700 }}>Check-in</TableCell>
                                    <TableCell sx={{ fontWeight: 700 }}>Check-out</TableCell>
                                    <TableCell sx={{ fontWeight: 700 }}>Documentos</TableCell>
                                </TableRow>
                            </TableHead>
                            <TableBody>
                                {visiveis.map(p => {
                                    const mov = situacaoMovimento(p);
                                    const faltam = (p.obrigatorios || []).filter(o => o.situacao !== 'ok');
                                    return (
                                        <TableRow key={p.id} hover onClick={() => setAbertoId(p.id)} sx={{ cursor: 'pointer' }}>
                                            <TableCell>
                                                <Typography variant="body2" sx={{ fontWeight: 700, color: cores.textoForte }}>{p.nome_completo}</Typography>
                                                <Typography variant="caption" sx={{ color: cores.textoSecundario }}>{p.funcao || 'Sem função'}</Typography>
                                            </TableCell>
                                            <TableCell><Chip size="small" label={mov.rotulo} sx={chipSx(mov.cor)} /></TableCell>
                                            <TableCell>{p.numero_pulseira || '—'}</TableCell>
                                            <TableCell>{hora(p.checkin_em)}</TableCell>
                                            <TableCell>{hora(p.checkout_em)}</TableCell>
                                            <TableCell>
                                                {!p.pendente
                                                    ? <Chip size="small" label="Em dia" sx={chipSx(cores.sucesso)} />
                                                    : faltam.length
                                                        ? (
                                                            <Stack direction="row" spacing={0.5} useFlexGap sx={{ flexWrap: 'wrap' }}>
                                                                {faltam.slice(0, 3).map(o => {
                                                                    const s = SITUACAO_OBRIGATORIO[o.situacao] || SITUACAO_OBRIGATORIO.falta_anexar;
                                                                    return <Chip key={o.id} size="small" label={`${o.nome}: ${s.rotulo}`} sx={{ ...chipSx(s.cor), fontSize: '0.7rem' }} />;
                                                                })}
                                                                {faltam.length > 3 && <Chip size="small" label={`+${faltam.length - 3}`} />}
                                                            </Stack>
                                                        )
                                                        : <Chip size="small" label="Pendente" sx={chipSx(cores.alerta)} />}
                                            </TableCell>
                                        </TableRow>
                                    );
                                })}
                            </TableBody>
                        </Table>
                    </TableContainer>
                )}
                {lista !== null && visiveis.length === 0 && (
                    <Typography variant="body2" sx={{ color: cores.textoSecundario, textAlign: 'center', py: 4 }}>
                        {lista.length === 0 ? 'Nenhum participante ainda. Inclua pelo botão acima, pela planilha ou envie o link de cadastro.' : 'Ninguém nesta situação.'}
                    </Typography>
                )}
            </GlassCard>

            <ParticipanteDialog pessoaId={abertoId} onClose={() => setAbertoId(null)} onAlterado={carregar} />
            <IncluirParticipanteDialog open={incluir} onClose={() => setIncluir(false)} onIncluido={carregar} />
            <ImportarPlanilhaDialog open={importar} onClose={() => setImportar(false)} onImportado={carregar} />
        </>
    );
};

export default Participantes;
