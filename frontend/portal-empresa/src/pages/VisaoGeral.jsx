import React, { useCallback, useEffect, useState } from 'react';
import { Box, Button, CircularProgress, Grid, Stack, Typography } from '@mui/material';
import { ContentCopy as CopiarIcon } from '@mui/icons-material';
import { useNavigate } from 'react-router-dom';
import { useSnackbar } from 'notistack';
import api, { dadosDe, erroDe } from '../services/api';
import PageHeader from '../components/common/PageHeader';
import GlassCard from '../components/common/GlassCard';
import ChecklistObrigatorios from '../components/ChecklistObrigatorios';
import { METRICAS, dataHora } from '../util';
import { botaoSecundario, cores } from '../styles/tokens';

const Cartao = ({ valor, rotulo, cor, onClick }) => (
    <Box component="button" type="button" onClick={onClick}
        sx={{
            width: '100%', textAlign: 'left', cursor: 'pointer', p: 2, borderRadius: 1.5, font: 'inherit', color: 'inherit',
            border: `1px solid ${cores.borda}`, bgcolor: cores.superficie, '&:hover': { borderColor: cores.primaria },
            '&:focus-visible': { outline: `2px solid ${cores.primaria}`, outlineOffset: 2 }
        }}>
        <Typography sx={{ color: cor, fontWeight: 700, fontSize: '1.75rem', lineHeight: 1.1 }}>{valor}</Typography>
        <Typography variant="caption" sx={{ color: cores.textoSecundario }}>{rotulo}</Typography>
    </Box>
);

/** Visão geral: indicadores da equipe, cota, link de cadastro e pendências da empresa. */
const VisaoGeral = () => {
    const { enqueueSnackbar } = useSnackbar();
    const navigate = useNavigate();
    const [dados, setDados] = useState(null);

    const carregar = useCallback(async () => {
        try {
            const [perfil, resumo, docs, solicitacoes] = await Promise.all([
                api.get('/perfil'), api.get('/resumo'), api.get('/documentos'), api.get('/solicitacoes')
            ]);
            setDados({ perfil: dadosDe(perfil), resumo: dadosDe(resumo), docs: dadosDe(docs), solicitacoes: dadosDe(solicitacoes) || [] });
        } catch (err) {
            enqueueSnackbar(erroDe(err, 'Erro ao carregar o portal.'), { variant: 'error' });
        }
    }, [enqueueSnackbar]);

    useEffect(() => { carregar(); }, [carregar]);

    if (!dados) return <Box sx={{ display: 'flex', justifyContent: 'center', p: 6 }}><CircularProgress /></Box>;

    const participantes = dados.resumo?.participantes || [];
    const { cota, link_cadastro: link, link_cadastro_expira_em: expira } = dados.perfil;
    const pedidosAbertos = dados.solicitacoes.filter(s => s.status === 'pendente').length;
    const respondidos = dados.solicitacoes.filter(s => ['aprovada', 'recusada'].includes(s.status)).slice(0, 3);

    const copiarLink = async () => {
        try { await navigator.clipboard.writeText(link); enqueueSnackbar('Link de cadastro copiado.', { variant: 'success' }); }
        catch { enqueueSnackbar('Não foi possível copiar.', { variant: 'error' }); }
    };

    return (
        <>
            <PageHeader title="Visão geral" subtitle="Como está o credenciamento da sua equipe hoje. Toque em um número para ver quem está nele." />

            <Grid container spacing={1.5} sx={{ mb: 3 }}>
                {METRICAS.map(m => (
                    <Grid item xs={6} sm={4} md={3} key={m.key}>
                        <Cartao valor={participantes.filter(m.filtro).length} rotulo={m.rotulo} cor={m.cor}
                            onClick={() => navigate(`/participantes?filtro=${m.key}`)} />
                    </Grid>
                ))}
            </Grid>

            <Grid container spacing={3}>
                <Grid item xs={12} md={6}>
                    <GlassCard sx={{ p: 3, height: '100%' }}>
                        <Typography variant="subtitle1" sx={{ color: cores.textoForte, fontWeight: 700, mb: 1 }}>Cadastro da equipe</Typography>
                        <Typography variant="body2" sx={{ color: cores.texto }}>
                            Vagas usadas: <b>{cota.usados}</b>{cota.limite > 0 ? <> de <b>{cota.limite}</b></> : ' (sem limite)'}
                        </Typography>
                        <Typography variant="body2" sx={{ color: cores.textoSecundario, mt: 2, mb: 1 }}>
                            Envie este link aos colaboradores. Cada um informa o CPF e completa o próprio cadastro (foto e documentos).
                        </Typography>
                        {link ? (
                            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} alignItems={{ sm: 'center' }}>
                                <Typography variant="body2" sx={{ color: cores.textoForte, wordBreak: 'break-all', flex: 1 }}>{link}</Typography>
                                <Button variant="outlined" startIcon={<CopiarIcon />} onClick={copiarLink} sx={{ ...botaoSecundario, flexShrink: 0 }}>Copiar</Button>
                            </Stack>
                        ) : (
                            <Typography variant="body2" sx={{ color: cores.alerta }}>A organização ainda não gerou o link de cadastro da equipe.</Typography>
                        )}
                        {expira && <Typography variant="caption" sx={{ color: cores.textoSecundario }}>Vale até {dataHora(expira)}.</Typography>}
                    </GlassCard>
                </Grid>

                <Grid item xs={12} md={6}>
                    <GlassCard sx={{ p: 3, height: '100%' }}>
                        <Typography variant="subtitle1" sx={{ color: cores.textoForte, fontWeight: 700, mb: 1 }}>Documentos da empresa</Typography>
                        {(dados.docs?.obrigatorios || []).length > 0
                            ? <ChecklistObrigatorios obrigatorios={dados.docs.obrigatorios} titulo="Exigidos pela organização" />
                            : <Typography variant="body2" sx={{ color: cores.textoSecundario }}>A organização não exigiu documentos específicos da empresa.</Typography>}
                        <Button onClick={() => navigate('/documentos')} sx={{ mt: 2, textTransform: 'none' }}>Ver e enviar documentos</Button>

                        <Typography variant="subtitle1" sx={{ color: cores.textoForte, fontWeight: 700, mt: 3, mb: 1 }}>Solicitações</Typography>
                        <Typography variant="body2" sx={{ color: cores.texto }}>
                            {pedidosAbertos ? `${pedidosAbertos} aguardando a organização.` : 'Nenhum pedido aguardando.'}
                        </Typography>
                        {respondidos.map(s => (
                            <Typography key={s.id} variant="caption" sx={{ display: 'block', color: s.status === 'aprovada' ? cores.sucesso : cores.erro }}>
                                {s.status === 'aprovada' ? 'Aprovado' : 'Recusado'}: {s.alvo_resumo || 'pedido'} ({dataHora(s.decidida_em)})
                            </Typography>
                        ))}
                        <Button onClick={() => navigate('/solicitacoes')} sx={{ mt: 1, textTransform: 'none' }}>Ver solicitações</Button>
                    </GlassCard>
                </Grid>
            </Grid>
        </>
    );
};

export default VisaoGeral;
