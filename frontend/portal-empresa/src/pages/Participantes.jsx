import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
    Box, Button, Chip, CircularProgress, InputAdornment, Menu, MenuItem, Stack, Table, TableBody, TableCell,
    TableContainer, TableHead, TableRow, TextField, Tooltip, Typography, useMediaQuery
} from '@mui/material';
import { useTheme } from '@mui/material/styles';
import { Add as AddIcon, ChevronRight as AbrirIcon, Search as BuscaIcon, TableChart as PlanilhaIcon } from '@mui/icons-material';
import { useSearchParams } from 'react-router-dom';
import { useSnackbar } from 'notistack';
import api, { baixarArquivo, dadosDe, erroDe } from '../services/api';
import PageHeader from '../components/common/PageHeader';
import GlassCard from '../components/common/GlassCard';
import NeonButton from '../components/common/NeonButton';
import ParticipanteDialog from '../components/ParticipanteDialog';
import IncluirParticipanteDialog from '../components/IncluirParticipanteDialog';
import ImportarPlanilhaDialog from '../components/ImportarPlanilhaDialog';
import { METRICAS, PRONTIDAO, chipSx, hora, motivosAcao, prontidao, situacaoMovimento } from '../util';
import { botaoSecundario, cores, raios, tom } from '../styles/tokens';

const semAcento = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

const iniciais = (nome) => {
    const partes = String(nome || '').trim().split(/\s+/).filter(Boolean);
    if (!partes.length) return '?';
    return (partes[0][0] + (partes.length > 1 ? partes[partes.length - 1][0] : '')).toUpperCase();
};

/** Rótulo da liberação no singular (o PRONTIDAO usa o plural da visão geral). */
const ROTULO_LIBERACAO = { liberado: 'Liberado', analise: 'Em análise', acao: 'Precisa de ação' };

/**
 * Avatar do participante: foto real se existir (com link assinado temporário)
 * ou iniciais, com anel na cor da liberação e ponto verde quando a foto foi enviada.
 */
const AvatarParticipante = ({ p }) => {
    const cor = PRONTIDAO[prontidao(p)].cor;
    const [erroFoto, setErroFoto] = useState(false);
    const temFoto = Boolean(p.foto_url && !erroFoto);
    const textoFoto = p.tem_foto ? 'Foto biométrica cadastrada' : 'Sem foto: o participante envia pelo link de cadastro';
    return (
        <Tooltip title={textoFoto}>
            <Box aria-label={textoFoto} role="img" sx={{ position: 'relative', flexShrink: 0, width: 40, height: 40 }}>
                <Box sx={{
                    width: 40, height: 40, borderRadius: '50%', overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center',
                    bgcolor: tom(cor, 0.12), border: `2px solid ${tom(cor, 0.7)}`, color: cores.textoForte,
                    fontWeight: 700, fontSize: '0.8125rem'
                }}>
                    {temFoto ? (
                        <Box component="img" src={p.foto_url} alt={p.nome_completo} onError={() => setErroFoto(true)}
                            sx={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                    ) : (
                        iniciais(p.nome_completo)
                    )}
                </Box>
                <Box sx={{
                    position: 'absolute', right: -1, bottom: -1, width: 12, height: 12, borderRadius: '50%',
                    bgcolor: p.tem_foto ? cores.sucesso : cores.textoFraco, border: `2px solid ${cores.superficie}`
                }} />
            </Box>
        </Tooltip>
    );
};

const ChipLiberacao = ({ p }) => {
    const k = prontidao(p);
    return <Chip size="small" label={ROTULO_LIBERACAO[k]} sx={chipSx(PRONTIDAO[k].cor)} />;
};

/** O que falta, em uma linha curta (só para quem não está liberado). */
const Pendencias = ({ p }) => {
    const k = prontidao(p);
    if (k === 'liberado') return <Typography variant="caption" sx={{ color: cores.textoSecundario }}>Tudo certo</Typography>;
    if (k === 'analise') return <Typography variant="caption" sx={{ color: cores.textoSecundario }}>Aguardando a organização conferir</Typography>;
    return <Typography variant="caption" sx={{ color: cores.alerta }}>{motivosAcao(p).join(' · ')}</Typography>;
};

/** Cartão do participante no celular: o mesmo conteúdo da tabela, empilhado. */
const CartaoParticipante = ({ p, onAbrir }) => {
    const mov = situacaoMovimento(p);
    return (
        <Box component="button" type="button" onClick={onAbrir}
            sx={{
                width: '100%', textAlign: 'left', font: 'inherit', color: 'inherit', cursor: 'pointer', p: 1.5,
                bgcolor: cores.superficie, border: `1px solid ${cores.borda}`, borderRadius: raios.cartao,
                '&:hover': { borderColor: cores.bordaDestaque }, '&:focus-visible': { outline: `2px solid ${cores.primaria}`, outlineOffset: 2 }
            }}>
            <Stack direction="row" spacing={1.5} alignItems="center">
                <AvatarParticipante p={p} />
                <Box sx={{ flex: 1, minWidth: 0 }}>
                    <Typography variant="body2" noWrap sx={{ fontWeight: 700, color: cores.textoForte }}>{p.nome_completo}</Typography>
                    <Typography variant="caption" noWrap component="p" sx={{ color: cores.textoSecundario }}>{p.funcao || 'Sem função'}</Typography>
                </Box>
                <AbrirIcon fontSize="small" sx={{ color: cores.textoSecundario }} />
            </Stack>
            <Stack direction="row" spacing={0.75} useFlexGap sx={{ flexWrap: 'wrap', mt: 1.25 }}>
                <ChipLiberacao p={p} />
                <Chip size="small" label={mov.rotulo} sx={chipSx(mov.cor)} />
            </Stack>
            <Box sx={{ mt: 1 }}><Pendencias p={p} /></Box>
            <Typography variant="caption" component="p" sx={{ color: cores.textoSecundario, mt: 0.5 }}>
                Pulseira {p.numero_pulseira || '—'} · Entrada {hora(p.checkin_em)} · Saída {hora(p.checkout_em)}
            </Typography>
        </Box>
    );
};

/** Equipe da empresa: liberação, situação de hoje, documentos e ficha de cada participante. */
const Participantes = () => {
    const { enqueueSnackbar } = useSnackbar();
    const theme = useTheme();
    const celular = useMediaQuery(theme.breakpoints.down('md'));
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

    // Link da visão geral (?pessoa=<id>): abre direto a ficha da pessoa
    const pessoaDoLink = params.get('pessoa');
    useEffect(() => { if (pessoaDoLink) setAbertoId(pessoaDoLink); }, [pessoaDoLink]);
    const fecharFicha = () => {
        setAbertoId(null);
        if (pessoaDoLink) { const p = new URLSearchParams(params); p.delete('pessoa'); setParams(p, { replace: true }); }
    };

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
                subtitle="Sua equipe no evento: liberação, documentos e entrada e saída de hoje. Clique em uma pessoa para ver a ficha."
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

            {/* No celular os filtros rolam de lado em vez de ocupar várias linhas */}
            <Stack direction="row" spacing={1} useFlexGap
                sx={{ flexWrap: { xs: 'nowrap', md: 'wrap' }, overflowX: { xs: 'auto', md: 'visible' }, pb: { xs: 1, md: 0 }, mb: 2, mx: { xs: -2, md: 0 }, px: { xs: 2, md: 0 } }}>
                {METRICAS.map(m => {
                    const n = (lista || []).filter(m.filtro).length;
                    const ativo = filtro === m.key;
                    return (
                        <Chip key={m.key} label={`${m.rotulo} (${n})`} onClick={() => escolherFiltro(m.key)} clickable
                            sx={{ flexShrink: 0, fontWeight: 700, border: `1px solid ${ativo ? cores.primaria : cores.borda}`,
                                bgcolor: ativo ? tom(cores.primaria, 0.12) : cores.superficie, color: ativo ? cores.primaria : cores.texto }} />
                    );
                })}
            </Stack>

            <GlassCard sx={{ p: { xs: 1.5, md: 2.5 } }}>
                <TextField size="small" fullWidth placeholder="Buscar por nome, função ou pulseira" value={busca} onChange={(e) => setBusca(e.target.value)}
                    InputProps={{ startAdornment: <InputAdornment position="start"><BuscaIcon fontSize="small" /></InputAdornment> }} sx={{ mb: 2 }} />

                {lista === null && <Box sx={{ display: 'flex', justifyContent: 'center', p: 4 }}><CircularProgress /></Box>}

                {lista !== null && visiveis.length > 0 && celular && (
                    <Stack spacing={1}>
                        {visiveis.map(p => <CartaoParticipante key={p.id} p={p} onAbrir={() => setAbertoId(p.id)} />)}
                    </Stack>
                )}

                {lista !== null && visiveis.length > 0 && !celular && (
                    <TableContainer>
                        <Table size="small">
                            <TableHead>
                                <TableRow>
                                    <TableCell sx={{ fontWeight: 700 }}>Participante</TableCell>
                                    <TableCell sx={{ fontWeight: 700 }}>Liberação</TableCell>
                                    <TableCell sx={{ fontWeight: 700 }}>Situação hoje</TableCell>
                                    <TableCell sx={{ fontWeight: 700 }}>Pulseira</TableCell>
                                    <TableCell sx={{ fontWeight: 700 }}>Check-in</TableCell>
                                    <TableCell sx={{ fontWeight: 700 }}>Check-out</TableCell>
                                </TableRow>
                            </TableHead>
                            <TableBody>
                                {visiveis.map(p => {
                                    const mov = situacaoMovimento(p);
                                    return (
                                        <TableRow key={p.id} hover onClick={() => setAbertoId(p.id)} sx={{ cursor: 'pointer' }}>
                                            <TableCell>
                                                <Stack direction="row" spacing={1.5} alignItems="center">
                                                    <AvatarParticipante p={p} />
                                                    <Box sx={{ minWidth: 0 }}>
                                                        <Typography variant="body2" sx={{ fontWeight: 700, color: cores.textoForte }}>{p.nome_completo}</Typography>
                                                        <Typography variant="caption" sx={{ color: cores.textoSecundario }}>{p.funcao || 'Sem função'}</Typography>
                                                    </Box>
                                                </Stack>
                                            </TableCell>
                                            <TableCell sx={{ maxWidth: 320 }}>
                                                <ChipLiberacao p={p} />
                                                <Box sx={{ mt: 0.5 }}><Pendencias p={p} /></Box>
                                            </TableCell>
                                            <TableCell><Chip size="small" label={mov.rotulo} sx={chipSx(mov.cor)} /></TableCell>
                                            <TableCell>{p.numero_pulseira || '—'}</TableCell>
                                            <TableCell>{hora(p.checkin_em)}</TableCell>
                                            <TableCell>{hora(p.checkout_em)}</TableCell>
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

                {lista !== null && lista.length > 0 && (
                    <Stack direction="row" spacing={2} useFlexGap sx={{ flexWrap: 'wrap', mt: 2, pt: 1.5, borderTop: `1px solid ${cores.borda}` }}>
                        <Typography variant="caption" sx={{ color: cores.textoSecundario }}>
                            Cor do círculo: <span style={{ color: cores.sucesso }}>liberado</span> · <span style={{ color: cores.alerta }}>em análise</span> · <span style={{ color: cores.erro }}>precisa de ação</span>
                        </Typography>
                        <Typography variant="caption" sx={{ color: cores.textoSecundario }}>Ponto verde: foto enviada</Typography>
                    </Stack>
                )}
            </GlassCard>

            <ParticipanteDialog pessoaId={abertoId} onClose={fecharFicha} onAlterado={carregar} />
            <IncluirParticipanteDialog open={incluir} onClose={() => setIncluir(false)} onIncluido={carregar} />
            <ImportarPlanilhaDialog open={importar} onClose={() => setImportar(false)} onImportado={carregar} />
        </>
    );
};

export default Participantes;
