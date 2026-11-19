import React, { useCallback, useEffect, useState } from 'react';
import {
    Box, Button, Chip, Dialog, DialogActions, DialogContent, DialogTitle, Grid, IconButton, Stack,
    Switch, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, TextField, Tooltip, Typography, Alert
} from '@mui/material';
import { Add as AddIcon, Edit as EditIcon, Delete as DeleteIcon } from '@mui/icons-material';
import { useSnackbar } from 'notistack';
import PageHeader from '../../components/common/PageHeader';
import GlassCard from '../../components/common/GlassCard';
import NeonButton from '../../components/common/NeonButton';
import api from '../../services/api';
import { montarEnderecoRtsp, esconderSenha } from '../../utils/modelosCamera';

const VAZIO = { nome: '', porta_padrao: 554, rtsp_principal: '', rtsp_sub: '', observacoes: '', ativo: true, ordem: 100 };
const EXEMPLO = { usuario: 'admin', senha: 'senha', ip: '192.168.1.100', porta: 554, canal: 1 };

/**
 * Configurações > Modelos de câmera: o padrão de endereço RTSP de cada fabricante. Em cada evento pode
 * aparecer câmera diferente; a equipe cadastra o modelo aqui e ele aparece no cadastro de câmeras.
 */
export default function ConfigModelosCamera() {
    const { enqueueSnackbar } = useSnackbar();
    const [modelos, setModelos] = useState([]);
    const [editavel, setEditavel] = useState(true);
    const [carregando, setCarregando] = useState(true);
    const [form, setForm] = useState(null); // modelo sendo editado (id null = novo)
    const [salvando, setSalvando] = useState(false);

    const carregar = useCallback(async () => {
        setCarregando(true);
        try {
            const { data } = await api.get('/modelos-camera', { params: { todos: '1' } });
            setModelos(data?.modelos || []);
            setEditavel(data?.editavel !== false);
        } catch (err) {
            enqueueSnackbar(`Não foi possível carregar os modelos: ${err.response?.data?.error || err.message}`, { variant: 'error' });
        } finally {
            setCarregando(false);
        }
    }, [enqueueSnackbar]);

    useEffect(() => { carregar(); }, [carregar]);

    const salvar = async () => {
        setSalvando(true);
        try {
            const corpo = {
                nome: form.nome, porta_padrao: form.porta_padrao, rtsp_principal: form.rtsp_principal || null,
                rtsp_sub: form.rtsp_sub || null, observacoes: form.observacoes || null, ativo: form.ativo, ordem: form.ordem
            };
            if (form.id) await api.put(`/modelos-camera/${form.id}`, corpo);
            else await api.post('/modelos-camera', corpo);
            enqueueSnackbar('Modelo salvo. Já aparece no cadastro de câmeras.', { variant: 'success' });
            setForm(null);
            carregar();
        } catch (err) {
            enqueueSnackbar(err.response?.data?.error || err.message, { variant: 'error' });
        } finally {
            setSalvando(false);
        }
    };

    const alternarAtivo = async (m) => {
        try {
            await api.put(`/modelos-camera/${m.id}`, { ativo: !m.ativo });
            carregar();
        } catch (err) {
            enqueueSnackbar(err.response?.data?.error || err.message, { variant: 'error' });
        }
    };

    const apagar = async (m) => {
        if (!window.confirm(`Apagar o modelo "${m.nome}"? Câmeras já cadastradas com ele continuam funcionando.`)) return;
        try {
            await api.delete(`/modelos-camera/${m.id}`);
            enqueueSnackbar('Modelo apagado.', { variant: 'success' });
            carregar();
        } catch (err) {
            enqueueSnackbar(err.response?.data?.error || err.message, { variant: 'error' });
        }
    };

    const exemplo = (padrao) => esconderSenha(montarEnderecoRtsp(padrao, { ...EXEMPLO, porta: form?.porta_padrao || 554 }));

    return (
        <Box sx={{ p: { xs: 2, md: 3 } }}>
            <PageHeader
                title="Modelos de câmera"
                subtitle="Endereço RTSP de cada fabricante. O modelo aparece no cadastro de câmeras e o sistema monta o endereço sozinho."
                breadcrumbs={[{ text: 'Configurações' }, { text: 'Modelos de câmera' }]}
                action={editavel && <NeonButton startIcon={<AddIcon />} onClick={() => setForm({ ...VAZIO })}>Novo modelo</NeonButton>}
            />

            {!editavel && (
                <Alert severity="warning" sx={{ mb: 2 }}>
                    Mostrando os modelos de fábrica. Para cadastrar e editar modelos, aplique a migration
                    20261119b_modelos_camera.sql no banco.
                </Alert>
            )}

            <GlassCard sx={{ p: 2 }}>
                <TableContainer>
                    <Table size="small">
                        <TableHead>
                            <TableRow>
                                <TableCell>Modelo</TableCell>
                                <TableCell>Endereço principal</TableCell>
                                <TableCell>Sub-stream</TableCell>
                                <TableCell align="center">Ativo</TableCell>
                                <TableCell align="right" />
                            </TableRow>
                        </TableHead>
                        <TableBody>
                            {carregando && <TableRow><TableCell colSpan={5}>Carregando...</TableCell></TableRow>}
                            {!carregando && modelos.map((m) => (
                                <TableRow key={m.id || m.nome}>
                                    <TableCell>
                                        <Stack direction="row" spacing={1} alignItems="center">
                                            <Typography variant="body2" fontWeight={600}>{m.nome}</Typography>
                                            {m.de_fabrica && <Chip label="de fábrica" size="small" variant="outlined" />}
                                        </Stack>
                                        {m.observacoes && <Typography variant="caption" color="text.secondary">{m.observacoes}</Typography>}
                                    </TableCell>
                                    <TableCell sx={{ fontFamily: 'monospace', fontSize: '0.75rem', wordBreak: 'break-all' }}>
                                        {m.rtsp_principal || <em>informado em cada câmera</em>}
                                    </TableCell>
                                    <TableCell sx={{ fontFamily: 'monospace', fontSize: '0.75rem', wordBreak: 'break-all' }}>{m.rtsp_sub || '—'}</TableCell>
                                    <TableCell align="center">
                                        <Switch size="small" checked={m.ativo !== false} disabled={!editavel || !m.id}
                                            onChange={() => alternarAtivo(m)} inputProps={{ 'aria-label': `Ativar ${m.nome}` }} />
                                    </TableCell>
                                    <TableCell align="right">
                                        {editavel && m.id && (
                                            <>
                                                <Tooltip title="Editar"><IconButton size="small" onClick={() => setForm({ ...VAZIO, ...m, rtsp_principal: m.rtsp_principal || '', rtsp_sub: m.rtsp_sub || '', observacoes: m.observacoes || '' })}><EditIcon fontSize="small" /></IconButton></Tooltip>
                                                {!m.de_fabrica && <Tooltip title="Apagar"><IconButton size="small" onClick={() => apagar(m)}><DeleteIcon fontSize="small" /></IconButton></Tooltip>}
                                            </>
                                        )}
                                    </TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                </TableContainer>
            </GlassCard>

            <Dialog open={!!form} onClose={() => setForm(null)} maxWidth="md" fullWidth>
                <DialogTitle>{form?.id ? `Editar: ${form?.nome}` : 'Novo modelo de câmera'}</DialogTitle>
                {form && (
                    <DialogContent dividers>
                        <Alert severity="info" variant="outlined" sx={{ mb: 2 }}>
                            Use os marcadores <b>{'{auth}'}</b> (usuário e senha da câmera), <b>{'{ip}'}</b>, <b>{'{porta}'}</b> e
                            <b> {'{canal}'}</b>. Não coloque usuário e senha no modelo: eles vêm de cada câmera.
                            O endereço está no manual do fabricante ou no programa ONVIF Device Manager.
                        </Alert>
                        <Grid container spacing={2}>
                            <Grid item xs={12} sm={8}>
                                <TextField label="Nome do modelo" fullWidth required value={form.nome}
                                    placeholder="Ex.: Axis M30, Câmera do salão B"
                                    onChange={(e) => setForm({ ...form, nome: e.target.value })} />
                            </Grid>
                            <Grid item xs={12} sm={4}>
                                <TextField label="Porta RTSP padrão" type="number" fullWidth value={form.porta_padrao}
                                    onChange={(e) => setForm({ ...form, porta_padrao: e.target.value })} />
                            </Grid>
                            <Grid item xs={12}>
                                <TextField label="Endereço principal" fullWidth value={form.rtsp_principal}
                                    placeholder="rtsp://{auth}{ip}:{porta}/stream1"
                                    onChange={(e) => setForm({ ...form, rtsp_principal: e.target.value })}
                                    helperText={form.rtsp_principal ? `Exemplo: ${exemplo(form.rtsp_principal) || 'falta o {ip}'}` : 'Vazio: o endereço completo é informado em cada câmera (como a Genérica).'} />
                            </Grid>
                            <Grid item xs={12}>
                                <TextField label="Endereço do sub-stream (leve, para a IA e as miniaturas)" fullWidth value={form.rtsp_sub}
                                    placeholder="rtsp://{auth}{ip}:{porta}/stream2"
                                    onChange={(e) => setForm({ ...form, rtsp_sub: e.target.value })}
                                    helperText={form.rtsp_sub ? `Exemplo: ${exemplo(form.rtsp_sub) || 'falta o {ip}'}` : 'Recomendado: sem ele a IA analisa o vídeo principal, mais pesado.'} />
                            </Grid>
                            <Grid item xs={12}>
                                <TextField label="Observações para a equipe" fullWidth multiline minRows={2} value={form.observacoes}
                                    placeholder="Ex.: usuário e senha ficam no app X; configure o sub-stream em 720p"
                                    onChange={(e) => setForm({ ...form, observacoes: e.target.value })}
                                    helperText="Aparecem no cadastro da câmera quando este modelo é escolhido." />
                            </Grid>
                        </Grid>
                    </DialogContent>
                )}
                <DialogActions>
                    <Button onClick={() => setForm(null)}>Cancelar</Button>
                    <Button variant="contained" onClick={salvar} disabled={salvando || !form?.nome?.trim()}>Salvar</Button>
                </DialogActions>
            </Dialog>
        </Box>
    );
}
