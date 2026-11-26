import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
    Box, Button, Chip, CircularProgress, Dialog, DialogContent, Divider, Grid, Stack, TextField, Typography
} from '@mui/material';
import { useSnackbar } from 'notistack';
import api, { dadosDe, erroDe } from '../services/api';
import TituloModal from './common/TituloModal';
import NeonButton from './common/NeonButton';
import ChecklistObrigatorios from './ChecklistObrigatorios';
import ListaDocumentos from './ListaDocumentos';
import EnviarDocumento from './EnviarDocumento';
import PedidoDialog from './PedidoDialog';
import { ROTULO_CAMPO, chipSx, dataBr, dataHora, formatarCpf } from '../util';
import { botaoSecundario, cores, funcao } from '../styles/tokens';

const CAMPOS = ['nome_completo', 'cpf', 'funcao', 'email', 'telefone', 'data_nascimento', 'nome_mae', 'nome_credencial', 'passaporte'];
const TIPO_MOVIMENTO = { checkin: { rotulo: 'Entrada', cor: cores.primaria }, checkout: { rotulo: 'Saída', cor: cores.saida }, expulsao: { rotulo: 'Expulsão', cor: cores.erro } };

const valorExibido = (campo, v) => (campo === 'cpf' ? formatarCpf(v) : campo === 'data_nascimento' ? dataBr(v) : (v || '—'));

/**
 * Ficha do participante: dados, documentos (com envio), entradas e saídas.
 * Alterar dados e excluir viram pedidos para a organização.
 */
const ParticipanteDialog = ({ pessoaId, onClose, onAlterado }) => {
    const { enqueueSnackbar } = useSnackbar();
    const [ficha, setFicha] = useState(null);
    const [tipos, setTipos] = useState([]);
    const [editando, setEditando] = useState(false);
    const [rascunho, setRascunho] = useState({});
    const [pedido, setPedido] = useState(null);
    // onClose chega como função nova a cada render da página: guardado em ref para não recarregar em laço
    const fecharRef = useRef(onClose);
    fecharRef.current = onClose;

    const carregar = useCallback(async () => {
        if (!pessoaId) return;
        try {
            const [f, t] = await Promise.all([api.get(`/participantes/${pessoaId}`), api.get('/tipos-documento')]);
            setFicha(dadosDe(f));
            setTipos(dadosDe(t) || []);
        } catch (err) {
            enqueueSnackbar(erroDe(err, 'Erro ao abrir a ficha.'), { variant: 'error' });
            fecharRef.current();
        }
    }, [pessoaId, enqueueSnackbar]);

    useEffect(() => {
        setFicha(null);
        setEditando(false);
        carregar();
    }, [carregar]);

    const p = ficha?.pessoa;
    const comecarEdicao = () => {
        setRascunho(Object.fromEntries(CAMPOS.map(c => [c, p[c] || ''])));
        setEditando(true);
    };
    const mudancas = p ? Object.fromEntries(CAMPOS.filter(c => (rascunho[c] || '') !== (p[c] || '')).map(c => [c, rascunho[c]])) : {};

    return (
        <Dialog open={!!pessoaId} onClose={onClose} maxWidth="md" fullWidth disableRestoreFocus
            PaperProps={{ sx: { bgcolor: cores.superficie, border: `1px solid ${cores.borda}`, backgroundImage: 'none' } }}>
            <TituloModal titulo={p?.nome_completo || 'Participante'} subtitulo={p ? `${p.funcao || 'Sem função'} · CPF ${formatarCpf(p.cpf)}` : undefined} onFechar={onClose} />
            <DialogContent sx={{ p: { xs: 2, md: 3 } }}>
                {!ficha && <Box sx={{ display: 'flex', justifyContent: 'center', p: 4 }}><CircularProgress /></Box>}
                {ficha && (
                    <Stack spacing={3}>
                        {!p.cadastro_concluido && (
                            <Box sx={{ p: 1.5, borderRadius: 1.5, border: `1px solid ${cores.alerta}66`, bgcolor: `${cores.alerta}14` }}>
                                <Typography variant="body2" sx={{ color: cores.alerta }}>
                                    Pré-cadastro: o participante ainda precisa abrir o link de cadastro da equipe, informar o CPF e concluir (foto e aceite LGPD).
                                </Typography>
                            </Box>
                        )}

                        <Box>
                            <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 1.5 }}>
                                <Typography variant="subtitle1" sx={{ color: cores.textoForte, fontWeight: 700 }}>Dados</Typography>
                                {!editando && <Button onClick={comecarEdicao} sx={{ textTransform: 'none' }}>Pedir alteração</Button>}
                            </Stack>
                            <Grid container spacing={1.5}>
                                {CAMPOS.map(c => (
                                    <Grid item xs={12} sm={6} key={c}>
                                        {editando ? (
                                            <TextField size="small" fullWidth label={ROTULO_CAMPO[c]} value={rascunho[c] || ''}
                                                type={c === 'data_nascimento' ? 'date' : 'text'} InputLabelProps={c === 'data_nascimento' ? { shrink: true } : undefined}
                                                onChange={(e) => setRascunho(r => ({ ...r, [c]: e.target.value }))} />
                                        ) : (
                                            <>
                                                <Typography variant="caption" sx={{ color: cores.textoSecundario }}>{ROTULO_CAMPO[c]}</Typography>
                                                <Typography variant="body2" sx={{ color: cores.textoForte }}>{valorExibido(c, p[c])}</Typography>
                                            </>
                                        )}
                                    </Grid>
                                ))}
                            </Grid>
                            {editando && (
                                <Stack direction="row" spacing={1} justifyContent="flex-end" sx={{ mt: 2 }}>
                                    <NeonButton variant="outlined" onClick={() => setEditando(false)} sx={botaoSecundario}>Cancelar</NeonButton>
                                    <NeonButton disabled={!Object.keys(mudancas).length} onClick={() => setPedido({
                                        tipo: 'editar_participante', alvo_id: p.id, dados: mudancas, exigeMotivo: false,
                                        titulo: 'Pedir alteração de dados',
                                        descricao: `Alterar ${Object.keys(mudancas).map(c => ROTULO_CAMPO[c]).join(', ')} de ${p.nome_completo}.`
                                    })}>
                                        Enviar pedido de alteração
                                    </NeonButton>
                                </Stack>
                            )}
                        </Box>

                        <Divider sx={{ borderColor: cores.borda }} />

                        <Box>
                            <Typography variant="subtitle1" sx={{ color: cores.textoForte, fontWeight: 700, mb: 1.5 }}>Documentos</Typography>
                            <Stack spacing={2}>
                                <ChecklistObrigatorios obrigatorios={ficha.obrigatorios} />
                                <ListaDocumentos documentos={ficha.documentos} onPedirExclusao={(d) => setPedido({
                                    tipo: 'excluir_documento', alvo_tipo: 'documento_pessoa', alvo_id: d.id,
                                    titulo: 'Pedir exclusão de documento', descricao: `Excluir "${d.tipo_nome || d.titulo}" de ${p.nome_completo}.`
                                })} />
                                <EnviarDocumento url={`/participantes/${p.id}/documentos`} tipos={tipos} onEnviado={() => { carregar(); onAlterado?.(); }} />
                            </Stack>
                        </Box>

                        <Divider sx={{ borderColor: cores.borda }} />

                        <Box>
                            <Typography variant="subtitle1" sx={{ color: cores.textoForte, fontWeight: 700, mb: 1 }}>Entradas e saídas</Typography>
                            <Typography variant="body2" sx={{ color: cores.texto, mb: 1 }}>
                                Pulseira: <b>{p.numero_pulseira || 'sem pulseira'}</b>{p.bloqueado ? ' · ' : ''}
                                {p.bloqueado && <span style={{ color: cores.erro, fontWeight: 700 }}>bloqueado pela organização</span>}
                            </Typography>
                            {ficha.movimentos.length === 0
                                ? <Typography variant="body2" sx={{ color: cores.textoSecundario }}>Nenhuma entrada registrada.</Typography>
                                : (
                                    <Stack spacing={0.5}>
                                        {ficha.movimentos.map(m => {
                                            const t = TIPO_MOVIMENTO[m.tipo] || TIPO_MOVIMENTO.checkin;
                                            return (
                                                <Stack key={`${m.tipo}-${m.created_at}`} direction="row" spacing={1} alignItems="center">
                                                    <Chip size="small" label={t.rotulo} sx={{ ...chipSx(t.cor), minWidth: 80 }} />
                                                    <Typography variant="body2" sx={{ color: cores.texto }}>{dataHora(m.created_at)}</Typography>
                                                </Stack>
                                            );
                                        })}
                                    </Stack>
                                )}
                        </Box>

                        <Divider sx={{ borderColor: cores.borda }} />

                        <Box sx={{ textAlign: 'right' }}>
                            <NeonButton variant="outlined" neonColor={funcao.negado} onClick={() => setPedido({
                                tipo: 'excluir_participante', alvo_id: p.id,
                                titulo: 'Pedir exclusão do participante',
                                descricao: `Excluir ${p.nome_completo} do evento, com fotos e documentos. A organização precisa aprovar.`
                            })}>
                                Pedir exclusão do participante
                            </NeonButton>
                        </Box>
                    </Stack>
                )}
            </DialogContent>
            <PedidoDialog pedido={pedido} onClose={() => setPedido(null)} onEnviado={() => setEditando(false)} />
        </Dialog>
    );
};

export default ParticipanteDialog;
