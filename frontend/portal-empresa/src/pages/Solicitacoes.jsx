import React, { useCallback, useEffect, useState } from 'react';
import { Box, Button, Chip, CircularProgress, Stack, Typography } from '@mui/material';
import { Add as AddIcon } from '@mui/icons-material';
import { useSnackbar } from 'notistack';
import api, { dadosDe, erroDe } from '../services/api';
import PageHeader from '../components/common/PageHeader';
import GlassCard from '../components/common/GlassCard';
import NeonButton from '../components/common/NeonButton';
import PedidoDialog from '../components/PedidoDialog';
import { ROTULO_CAMPO, STATUS_SOLICITACAO, TIPO_SOLICITACAO, chipSx, dataHora } from '../util';
import { cores } from '../styles/tokens';

/** Pedidos feitos à organização (exclusões, alterações e outros) e a resposta de cada um. */
const Solicitacoes = () => {
    const { enqueueSnackbar } = useSnackbar();
    const [lista, setLista] = useState(null);
    const [pedido, setPedido] = useState(null);

    const carregar = useCallback(async () => {
        try { setLista(dadosDe(await api.get('/solicitacoes')) || []); }
        catch (err) { enqueueSnackbar(erroDe(err, 'Erro ao carregar as solicitações.'), { variant: 'error' }); setLista([]); }
    }, [enqueueSnackbar]);

    useEffect(() => { carregar(); }, [carregar]);

    const cancelar = async (s) => {
        if (!window.confirm('Cancelar este pedido?')) return;
        try {
            await api.post(`/solicitacoes/${s.id}/cancelar`);
            enqueueSnackbar('Pedido cancelado.', { variant: 'info' });
            carregar();
        } catch (err) {
            enqueueSnackbar(erroDe(err, 'Erro ao cancelar.'), { variant: 'error' });
        }
    };

    return (
        <>
            <PageHeader
                title="Solicitações"
                subtitle="Exclusões e alterações passam pela organização do evento. Aqui você acompanha cada pedido."
                action={
                    <NeonButton startIcon={<AddIcon />} onClick={() => setPedido({
                        tipo: 'outro', titulo: 'Novo pedido', descricao: 'Descreva o que você precisa (inclusão especial, correção, dúvida sobre documento etc.).'
                    })}>
                        Novo pedido
                    </NeonButton>
                }
            />
            {lista === null && <Box sx={{ display: 'flex', justifyContent: 'center', p: 6 }}><CircularProgress /></Box>}
            {lista !== null && lista.length === 0 && (
                <GlassCard sx={{ p: 4, textAlign: 'center' }}>
                    <Typography variant="body2" sx={{ color: cores.textoSecundario }}>
                        Nenhum pedido ainda. Para excluir ou alterar um participante, abra a ficha dele em Participantes.
                    </Typography>
                </GlassCard>
            )}
            <Stack spacing={1.5}>
                {(lista || []).map(s => {
                    const st = STATUS_SOLICITACAO[s.status] || STATUS_SOLICITACAO.pendente;
                    return (
                        <GlassCard key={s.id} sx={{ p: 2.5 }}>
                            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} justifyContent="space-between">
                                <Box sx={{ minWidth: 0 }}>
                                    <Stack direction="row" spacing={1} alignItems="center" sx={{ flexWrap: 'wrap', rowGap: 1 }}>
                                        <Typography variant="body2" sx={{ fontWeight: 700, color: cores.textoForte }}>{TIPO_SOLICITACAO[s.tipo] || s.tipo}</Typography>
                                        <Chip size="small" label={st.rotulo} sx={chipSx(st.cor)} />
                                    </Stack>
                                    {s.alvo_resumo && <Typography variant="body2" sx={{ color: cores.texto }}>{s.alvo_resumo}</Typography>}
                                    {Object.entries(s.dados || {}).map(([c, v]) => (
                                        <Typography key={c} variant="caption" sx={{ display: 'block', color: cores.textoSecundario }}>
                                            {ROTULO_CAMPO[c] || c}: {v || '(vazio)'}
                                        </Typography>
                                    ))}
                                    {s.motivo && <Typography variant="caption" sx={{ display: 'block', color: cores.textoSecundario }}>Motivo: {s.motivo}</Typography>}
                                    {s.resposta && (
                                        <Typography variant="body2" sx={{ color: s.status === 'recusada' ? cores.erro : cores.texto, mt: 1 }}>
                                            Resposta da organização: {s.resposta}
                                        </Typography>
                                    )}
                                    <Typography variant="caption" sx={{ display: 'block', color: cores.textoSecundario, mt: 0.5 }}>
                                        Pedido em {dataHora(s.created_at)}{s.decidida_em ? ` · decidido em ${dataHora(s.decidida_em)}` : ''}
                                    </Typography>
                                </Box>
                                {s.status === 'pendente' && (
                                    <Box sx={{ flexShrink: 0 }}>
                                        <Button size="small" onClick={() => cancelar(s)} sx={{ textTransform: 'none', color: cores.textoSecundario }}>Cancelar pedido</Button>
                                    </Box>
                                )}
                            </Stack>
                        </GlassCard>
                    );
                })}
            </Stack>
            <PedidoDialog pedido={pedido} onClose={() => setPedido(null)} onEnviado={carregar} />
        </>
    );
};

export default Solicitacoes;
