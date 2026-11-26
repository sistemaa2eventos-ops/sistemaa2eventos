import React, { useCallback, useEffect, useState } from 'react';
import {
    Box, Chip, CircularProgress, Dialog, DialogContent, Stack, Tab, Tabs, TextField, Typography
} from '@mui/material';
import { useSnackbar } from 'notistack';
import api from '../../services/api';
import TituloModal from '../common/TituloModal';
import NeonButton from '../common/NeonButton';
import { botaoSecundario, cores, funcao } from '../../styles/tokens';

export const TIPO_SOLICITACAO = {
    excluir_participante: { rotulo: 'Excluir participante', cor: cores.erro },
    editar_participante: { rotulo: 'Alterar dados do participante', cor: cores.primaria },
    excluir_documento: { rotulo: 'Excluir documento', cor: cores.erro },
    editar_empresa: { rotulo: 'Alterar dados da empresa', cor: cores.primaria },
    outro: { rotulo: 'Outro pedido', cor: cores.textoSecundario }
};

const STATUS = {
    pendente: { rotulo: 'Aguardando', cor: cores.alerta },
    aprovada: { rotulo: 'Aprovada', cor: cores.sucesso },
    recusada: { rotulo: 'Recusada', cor: cores.erro },
    cancelada: { rotulo: 'Cancelada pela empresa', cor: cores.textoSecundario }
};

const ROTULO_CAMPO = {
    nome: 'Nome da empresa', cnpj: 'CNPJ', email: 'E-mail (login do portal)', responsavel: 'Responsável',
    responsavel_legal: 'Responsável legal', telefone: 'Telefone', servico: 'Serviço',
    nome_completo: 'Nome completo', cpf: 'CPF', funcao: 'Função', data_nascimento: 'Data de nascimento',
    nome_mae: 'Nome da mãe', nome_credencial: 'Nome no crachá', passaporte: 'Passaporte'
};

const chipSx = (cor) => ({ fontWeight: 700, color: cor, bgcolor: `${cor}1F`, border: `1px solid ${cor}66` });

/**
 * Pedidos que os responsáveis fazem pelo portal da empresa (exclusões e alterações).
 * Aprovar executa o pedido (ex.: exclui o participante com as fotos e documentos); recusar exige o motivo.
 */
const SolicitacoesEmpresasDialog = ({ open, onClose, onAlterado }) => {
    const { enqueueSnackbar } = useSnackbar();
    const [status, setStatus] = useState('pendente');
    const [lista, setLista] = useState([]);
    const [carregando, setCarregando] = useState(false);
    const [recusando, setRecusando] = useState(null); // id
    const [resposta, setResposta] = useState('');
    const [ocupado, setOcupado] = useState(null);

    const carregar = useCallback(async () => {
        setCarregando(true);
        try {
            const { data } = await api.get('/empresas/solicitacoes', { params: { status } });
            setLista(data?.data || []);
        } catch (err) {
            enqueueSnackbar(err.response?.data?.error || 'Erro ao carregar as solicitações.', { variant: 'error' });
        } finally {
            setCarregando(false);
        }
    }, [status, enqueueSnackbar]);

    useEffect(() => { if (open) carregar(); }, [open, carregar]);

    const aprovar = async (s) => {
        const aviso = s.tipo.startsWith('excluir')
            ? `Aprovar e EXCLUIR "${s.alvo_resumo}"? Não dá para desfazer.`
            : `Aprovar "${TIPO_SOLICITACAO[s.tipo]?.rotulo}" de ${s.empresa_nome}?`;
        if (!window.confirm(aviso)) return;
        setOcupado(s.id);
        try {
            await api.post(`/empresas/solicitacoes/${s.id}/aprovar`);
            enqueueSnackbar('Solicitação aprovada e aplicada.', { variant: 'success' });
            await carregar();
            onAlterado?.();
        } catch (err) {
            enqueueSnackbar(err.response?.data?.error || 'Erro ao aprovar.', { variant: 'error' });
        } finally {
            setOcupado(null);
        }
    };

    const recusar = async (s) => {
        setOcupado(s.id);
        try {
            await api.post(`/empresas/solicitacoes/${s.id}/recusar`, { resposta });
            enqueueSnackbar('Solicitação recusada. A empresa vê o motivo no portal.', { variant: 'info' });
            setRecusando(null);
            setResposta('');
            await carregar();
            onAlterado?.();
        } catch (err) {
            enqueueSnackbar(err.response?.data?.error || 'Erro ao recusar.', { variant: 'error' });
        } finally {
            setOcupado(null);
        }
    };

    return (
        <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth disableRestoreFocus
            PaperProps={{ sx: { bgcolor: cores.superficie, border: `1px solid ${cores.borda}`, backgroundImage: 'none' } }}>
            <TituloModal titulo="Solicitações das empresas" subtitulo="Pedidos feitos pelos responsáveis no portal da empresa. Nada muda sem a sua aprovação." onFechar={onClose} />
            <Tabs value={status} onChange={(e, v) => setStatus(v)} sx={{ px: 3, borderBottom: `1px solid ${cores.borda}` }}>
                <Tab value="pendente" label="Aguardando" />
                <Tab value="aprovada" label="Aprovadas" />
                <Tab value="recusada" label="Recusadas" />
                <Tab value="todas" label="Todas" />
            </Tabs>
            <DialogContent sx={{ p: 3 }}>
                {carregando && <Box sx={{ display: 'flex', justifyContent: 'center', p: 3 }}><CircularProgress size={28} /></Box>}
                {!carregando && lista.length === 0 && (
                    <Typography variant="body2" sx={{ color: cores.textoSecundario, textAlign: 'center', py: 4 }}>
                        Nenhuma solicitação {status === 'pendente' ? 'aguardando' : 'nesta lista'}.
                    </Typography>
                )}
                <Stack spacing={1.5}>
                    {!carregando && lista.map(s => {
                        const tipo = TIPO_SOLICITACAO[s.tipo] || TIPO_SOLICITACAO.outro;
                        const st = STATUS[s.status] || STATUS.pendente;
                        const campos = Object.entries(s.dados || {});
                        return (
                            <Box key={s.id} sx={{ p: 2, borderRadius: 1.5, border: `1px solid ${cores.borda}`, bgcolor: cores.superficieElevada }}>
                                <Stack direction="row" spacing={1} alignItems="center" sx={{ flexWrap: 'wrap', rowGap: 1, mb: 1 }}>
                                    <Chip size="small" label={tipo.rotulo} sx={chipSx(tipo.cor)} />
                                    <Chip size="small" label={st.rotulo} sx={chipSx(st.cor)} />
                                    <Typography variant="caption" sx={{ color: cores.textoSecundario }}>
                                        {s.empresa_nome} · {new Date(s.created_at).toLocaleString('pt-BR')}
                                    </Typography>
                                </Stack>
                                {s.alvo_resumo && (
                                    <Typography variant="body2" sx={{ color: cores.textoForte, fontWeight: 700 }}>{s.alvo_resumo}</Typography>
                                )}
                                {campos.length > 0 && (
                                    <Box sx={{ mt: 1 }}>
                                        {campos.map(([campo, valor]) => (
                                            <Typography key={campo} variant="body2" sx={{ color: cores.texto }}>
                                                {ROTULO_CAMPO[campo] || campo}: <b>{valor || '(vazio)'}</b>
                                            </Typography>
                                        ))}
                                    </Box>
                                )}
                                {s.motivo && (
                                    <Typography variant="body2" sx={{ color: cores.textoSecundario, mt: 1 }}>Motivo: {s.motivo}</Typography>
                                )}
                                {s.resposta && (
                                    <Typography variant="body2" sx={{ color: cores.textoSecundario, mt: 1 }}>Resposta da organização: {s.resposta}</Typography>
                                )}

                                {s.status === 'pendente' && recusando !== s.id && (
                                    <Stack direction="row" spacing={1} justifyContent="flex-end" sx={{ mt: 1.5 }}>
                                        <NeonButton variant="outlined" neonColor={funcao.negado} onClick={() => { setRecusando(s.id); setResposta(''); }} disabled={ocupado === s.id}>
                                            Recusar
                                        </NeonButton>
                                        <NeonButton loading={ocupado === s.id} onClick={() => aprovar(s)}>
                                            {s.tipo.startsWith('excluir') ? 'Aprovar e excluir' : 'Aprovar'}
                                        </NeonButton>
                                    </Stack>
                                )}
                                {recusando === s.id && (
                                    <Stack spacing={1} sx={{ mt: 1.5 }}>
                                        <TextField size="small" multiline minRows={2} label="Motivo da recusa (a empresa vê)" value={resposta}
                                            onChange={(e) => setResposta(e.target.value)} inputProps={{ maxLength: 1000 }} />
                                        <Stack direction="row" spacing={1} justifyContent="flex-end">
                                            <NeonButton variant="outlined" onClick={() => setRecusando(null)} sx={botaoSecundario}>Cancelar</NeonButton>
                                            <NeonButton neonColor={funcao.negado} loading={ocupado === s.id} disabled={resposta.trim().length < 3} onClick={() => recusar(s)}>
                                                Recusar solicitação
                                            </NeonButton>
                                        </Stack>
                                    </Stack>
                                )}
                            </Box>
                        );
                    })}
                </Stack>
            </DialogContent>
        </Dialog>
    );
};

export default SolicitacoesEmpresasDialog;
