import React, { useCallback, useEffect, useState } from 'react';
import {
    Accordion, AccordionDetails, AccordionSummary, Box, Button, Chip, CircularProgress,
    FormControlLabel, Stack, Switch, TextField, Typography, Dialog, DialogTitle, DialogContent, DialogActions
} from '@mui/material';
import { ExpandMore as ExpandMoreIcon, Search as SearchIcon, LockOpen as LiberadoIcon } from '@mui/icons-material';
import { useSnackbar } from 'notistack';
import api from '../../services/api';
import ListaDocumentos from './ListaDocumentos';
import { SITUACAO_DOCUMENTAL, MOTIVO_PENDENCIA, chipSx } from './documentosUtils';
import NeonButton from '../common/NeonButton';

const POR_PAGINA = 30;

/**
 * Colaboradores do evento: documentos entregues, pendências e validade.
 * Busca por nome, CPF, e-mail, telefone, função, empresa ou CNPJ.
 * @param {{ onAuditar: (doc, acao) => void, recarregarToken: number }} props
 */
const AbaColaboradores = ({ onAuditar, recarregarToken }) => {
    const { enqueueSnackbar } = useSnackbar();
    const [busca, setBusca] = useState('');
    const [buscaAplicada, setBuscaAplicada] = useState('');
    const [somentePendentes, setSomentePendentes] = useState(false);
    const [itens, setItens] = useState([]);
    const [total, setTotal] = useState(0);
    const [pagina, setPagina] = useState(1);
    const [carregando, setCarregando] = useState(false);

    // Modal de Liberar por um dia
    const [openLiberarModal, setOpenLiberarModal] = useState(false);
    const [pessoaLiberacao, setPessoaLiberacao] = useState(null);
    const [motivoLiberacao, setMotivoLiberacao] = useState('');
    const [liberandoHoje, setLiberandoHoje] = useState(false);

    useEffect(() => {
        const t = setTimeout(() => setBuscaAplicada(busca), 350);
        return () => clearTimeout(t);
    }, [busca]);

    const carregar = useCallback(async (pag = 1) => {
        setCarregando(true);
        try {
            const resp = await api.get('/documentos/colaboradores', {
                params: { search: buscaAplicada, page: pag, limit: POR_PAGINA, pendentes: somentePendentes ? 1 : undefined }
            });
            const dados = resp.data?.data || [];
            setItens(prev => (pag === 1 ? dados : [...prev, ...dados]));
            setTotal(resp.data?.metadata?.total || 0);
            setPagina(pag);
        } catch {
            enqueueSnackbar('Erro ao buscar colaboradores.', { variant: 'error' });
        } finally {
            setCarregando(false);
        }
    }, [buscaAplicada, somentePendentes, enqueueSnackbar]);

    useEffect(() => { carregar(1); }, [carregar, recarregarToken]);

    const handleLiberarUmDia = async () => {
        if (!pessoaLiberacao) return;
        setLiberandoHoje(true);
        try {
            await api.post(`/audit/pessoas/${pessoaLiberacao.id}/liberar-um-dia`, { motivo: motivoLiberacao.trim() });
            enqueueSnackbar(`${pessoaLiberacao.nome_completo} liberado(a) por um dia com sucesso!`, { variant: 'success' });
            setOpenLiberarModal(false);
            setPessoaLiberacao(null);
            setMotivoLiberacao('');
            carregar(1); // Recarregar lista
        } catch (err) {
            enqueueSnackbar(err.response?.data?.error || 'Não foi possível liberar a entrada de hoje.', { variant: 'error' });
        } finally {
            setLiberandoHoje(false);
        }
    };

    return (
        <Box>
            <Stack direction={{ xs: 'column', md: 'row' }} spacing={2} alignItems={{ md: 'center' }} sx={{ mb: 2 }}>
                <TextField
                    fullWidth
                    placeholder="Buscar por nome, CPF, e-mail, telefone, função, empresa ou CNPJ..."
                    value={busca}
                    onChange={(e) => setBusca(e.target.value)}
                    InputProps={{ startAdornment: <SearchIcon sx={{ color: 'rgba(255,255,255,0.4)', mr: 1.5 }} /> }}
                    sx={{ '& .MuiOutlinedInput-root': { color: '#FFFFFF', '& fieldset': { borderColor: 'rgba(255,255,255,0.1)' } } }}
                />
                <FormControlLabel
                    control={<Switch checked={somentePendentes} onChange={(e) => setSomentePendentes(e.target.checked)} />}
                    label={<Typography variant="body2" sx={{ color: '#FFFFFF', whiteSpace: 'nowrap' }}>Só com pendência</Typography>}
                />
            </Stack>

            <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.5)', display: 'block', mb: 1 }}>
                {total} colaborador(es)
            </Typography>

            {itens.map((p) => {
                const sit = SITUACAO_DOCUMENTAL[p.situacao_documental] || SITUACAO_DOCUMENTAL.pendente;
                const docs = p.documentos.map(d => ({ ...d, tipo_entidade: 'pessoa', entidade_nome: p.nome_completo, entidade_doc: p.cpf }));
                return (
                    <Accordion key={p.id} disableGutters sx={{
                        mb: 1, bgcolor: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)',
                        borderRadius: '8px !important', '&:before': { display: 'none' }
                    }}>
                        <AccordionSummary expandIcon={<ExpandMoreIcon sx={{ color: '#00D4FF' }} />}>
                            <Stack direction={{ xs: 'column', md: 'row' }} spacing={1.5} alignItems={{ md: 'center' }} sx={{ width: '100%', pr: 1 }}>
                                <Box sx={{ flex: 1, minWidth: 0 }}>
                                    <Typography sx={{ color: '#FFFFFF', fontWeight: 700 }} noWrap>{p.nome_completo}</Typography>
                                    <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.55)' }}>
                                        CPF {p.cpf || '—'} · {p.funcao || 'sem função'}{p.empresa_nome ? ` · ${p.empresa_nome}` : ''}
                                        {p.email ? ` · ${p.email}` : ''}
                                    </Typography>
                                </Box>
                                <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
                                    <Chip size="small" label={sit.label} sx={chipSx(sit.color)} />
                                    <Chip size="small" label={`${p.documentos.length} doc(s)`} sx={chipSx('#00D4FF')} />
                                    {p.pendencias.length > 0 && (
                                        <Chip size="small" label={`${p.pendencias.length} pendência(s)`} sx={chipSx('#FFB800')} />
                                    )}
                                    {p.vencendo.length > 0 && (
                                        <Chip size="small" label={`${p.vencendo.length} a vencer`} sx={chipSx('#FFB800')} />
                                    )}
                                    {p.liberacao_ativa && (
                                        <Chip size="small" icon={<LiberadoIcon sx={{ fontSize: 14 }} />} label="Liberado no turno" sx={chipSx('#A855F7')} />
                                    )}
                                    {p.liberado_hoje && (
                                        <Chip size="small" icon={<LiberadoIcon sx={{ fontSize: 14 }} />} label="Liberado hoje" sx={chipSx('#00D4FF')} />
                                    )}
                                </Stack>
                            </Stack>
                        </AccordionSummary>
                        <AccordionDetails>
                            {p.exigidos.length > 0 && (
                                <Box sx={{ mb: 2 }}>
                                    <Typography variant="overline" sx={{ color: '#00D4FF', fontWeight: 700 }}>Exigidos para a função</Typography>
                                    <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
                                        {p.exigidos.map((t) => {
                                            const pend = p.pendencias.find(x => x.tipo_documento_id === t.id);
                                            return (
                                                <Chip key={t.id} size="small"
                                                    label={pend ? `${t.nome} — ${MOTIVO_PENDENCIA[pend.motivo] || pend.motivo}` : `${t.nome} ✓`}
                                                    sx={chipSx(pend ? '#FFB800' : '#00FF88')} />
                                            );
                                        })}
                                    </Stack>
                                </Box>
                            )}
                            {p.liberacao_ativa && (
                                <Typography variant="caption" sx={{ color: '#A855F7', display: 'block', mb: 1 }}>
                                    Liberado manualmente até {new Date(p.liberacao_manual_ate).toLocaleString('pt-BR')} — {p.liberacao_manual_motivo || 'sem motivo'}
                                </Typography>
                            )}
                            {p.regras_ativas && p.situacao_documental !== 'aprovado' && (
                                <Box sx={{ mb: 2, p: 1.5, bgcolor: 'rgba(255, 184, 0, 0.1)', border: '1px solid #FFB800', borderRadius: 1 }}>
                                    <Stack direction="row" spacing={1} alignItems="center">
                                        <Box sx={{ flex: 1 }}>
                                            <Typography variant="caption" sx={{ color: '#FFB800', fontWeight: 700 }}>
                                                {p.liberado_hoje ? 'Entrada liberada hoje' : 'Documentação pendente: entrada barrada no check-in'}
                                            </Typography>
                                            <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.7)', display: 'block' }}>
                                                {p.liberado_hoje
                                                    ? `Motivo: ${p.liberado_hoje_motivo || '—'}. Amanhã volta a ser barrada se a pendência continuar.`
                                                    : 'Libere por um dia para permitir a entrada só hoje.'}
                                            </Typography>
                                        </Box>
                                        {!p.liberado_hoje && (
                                            <Button
                                                size="small"
                                                onClick={() => { setPessoaLiberacao(p); setMotivoLiberacao(''); setOpenLiberarModal(true); }}
                                                sx={{ color: '#FFB800', '&:hover': { bgcolor: 'rgba(255, 184, 0, 0.1)' } }}
                                            >
                                                Liberar por um dia
                                            </Button>
                                        )}
                                    </Stack>
                                </Box>
                            )}
                            <Typography variant="overline" sx={{ color: '#00D4FF', fontWeight: 700 }}>Documentos entregues</Typography>
                            <ListaDocumentos documentos={docs} onAuditar={onAuditar} />
                        </AccordionDetails>
                    </Accordion>
                );
            })}

            {carregando && <Box sx={{ textAlign: 'center', py: 3 }}><CircularProgress sx={{ color: '#00D4FF' }} /></Box>}
            {!carregando && itens.length === 0 && (
                <Typography sx={{ color: 'rgba(255,255,255,0.5)', textAlign: 'center', py: 6 }}>Nenhum colaborador encontrado.</Typography>
            )}
            {!carregando && itens.length < total && (
                <Box sx={{ textAlign: 'center', mt: 2 }}>
                    <Button onClick={() => carregar(pagina + 1)} sx={{ color: '#00D4FF' }}>Carregar mais</Button>
                </Box>
            )}

            {/* Modal: Liberar por um dia */}
            <Dialog open={openLiberarModal} onClose={() => !liberandoHoje && setOpenLiberarModal(false)} maxWidth="sm" fullWidth>
                <DialogTitle sx={{ bgcolor: 'rgba(255, 184, 0, 0.1)', borderBottom: '1px solid #FFB800', color: '#FFFFFF' }}>
                    Liberar por um dia
                </DialogTitle>
                <DialogContent sx={{ bgcolor: 'rgba(0,0,0,0.3)', pt: 2 }}>
                    {pessoaLiberacao && (
                        <Typography variant="body2" sx={{ color: 'rgba(255,255,255,0.8)', mb: 2 }}>
                            Permitir entrada de <strong>{pessoaLiberacao.nome_completo}</strong> hoje, mesmo com documentação pendente.
                            Amanhã volta a estar pendente automaticamente.
                        </Typography>
                    )}
                    <TextField
                        fullWidth
                        multiline
                        rows={3}
                        label="Motivo da liberação"
                        required
                        value={motivoLiberacao}
                        onChange={(e) => setMotivoLiberacao(e.target.value)}
                        placeholder="Ex: Aguardando entrega do documento"
                        disabled={liberandoHoje}
                        sx={{ '& .MuiOutlinedInput-root': { color: '#FFFFFF', '& fieldset': { borderColor: 'rgba(255,255,255,0.2)' } } }}
                    />
                </DialogContent>
                <DialogActions sx={{ p: 2, bgcolor: 'rgba(0,0,0,0.3)' }}>
                    <Button onClick={() => setOpenLiberarModal(false)} disabled={liberandoHoje} sx={{ color: 'rgba(255,255,255,0.6)' }}>
                        Cancelar
                    </Button>
                    <NeonButton onClick={handleLiberarUmDia} loading={liberandoHoje} disabled={motivoLiberacao.trim().length < 3}>
                        Liberar por um dia
                    </NeonButton>
                </DialogActions>
            </Dialog>
        </Box>
    );
};

export default AbaColaboradores;
