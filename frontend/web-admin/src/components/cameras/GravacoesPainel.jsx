import React, { useCallback, useEffect, useState } from 'react';
import {
    Box, Stack, Typography, Table, TableHead, TableRow, TableCell, TableBody, TableContainer, Chip, IconButton,
    Tooltip, FormControl, InputLabel, Select, MenuItem, TextField, Dialog, DialogTitle, DialogContent, CircularProgress, Button
} from '@mui/material';
import { PlayArrow as PlayIcon, Download as BaixarIcon, Refresh as RefreshIcon, CloudDone as DriveIcon, Close as FecharIcon } from '@mui/icons-material';
import { useSnackbar } from 'notistack';
import api from '../../services/api';
import GlassCard from '../common/GlassCard';
import { urlGravacao } from '../../utils/cameraMedia';

const hora = (iso) => (iso ? new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' }) : '—');
const duracao = (a, b) => {
    if (!a || !b) return '—';
    const s = Math.max(0, Math.round((new Date(b) - new Date(a)) / 1000));
    return s >= 60 ? `${Math.floor(s / 60)} min ${String(s % 60).padStart(2, '0')} s` : `${s} s`;
};
const tamanho = (b) => (b == null ? '—' : b > 1024 ** 3 ? `${(b / 1024 ** 3).toFixed(1)} GB` : `${Math.max(1, Math.round(b / 1024 ** 2))} MB`);

/**
 * Gravações guardadas no PC do evento. Assistir e baixar ficam registrados (quem, quando).
 */
const GravacoesPainel = ({ cameras = [] }) => {
    const { enqueueSnackbar } = useSnackbar();
    const [lista, setLista] = useState([]);
    const [carregando, setCarregando] = useState(true);
    const [filtro, setFiltro] = useState({ camera_id: '', motivo: '', dia: '' });
    const [assistindo, setAssistindo] = useState(null); // { gravacao, url }

    const carregar = useCallback(async () => {
        setCarregando(true);
        try {
            const params = { limite: 300 };
            if (filtro.camera_id) params.camera_id = filtro.camera_id;
            if (filtro.motivo) params.motivo = filtro.motivo;
            if (filtro.dia) {
                const ini = new Date(`${filtro.dia}T00:00:00`);
                params.de = ini.toISOString();
                params.ate = new Date(ini.getTime() + 86400000).toISOString();
            }
            const { data } = await api.get('/gravacoes', { params, hideDefaultError: true });
            setLista(data.data || []);
        } catch (err) {
            enqueueSnackbar(err.response?.data?.error || 'Não foi possível carregar as gravações.', { variant: 'error' });
        } finally {
            setCarregando(false);
        }
    }, [filtro, enqueueSnackbar]);

    useEffect(() => { carregar(); }, [carregar]);

    const assistir = async (g) => {
        try {
            setAssistindo({ gravacao: g, url: await urlGravacao(g.id, 'assistir') });
        } catch (err) {
            enqueueSnackbar(err.response?.data?.error || 'Não foi possível abrir a gravação.', { variant: 'error' });
        }
    };
    const baixar = async (g) => {
        try {
            const url = await urlGravacao(g.id, 'baixar');
            const a = document.createElement('a');
            a.href = url;
            a.rel = 'noopener';
            document.body.appendChild(a);
            a.click();
            a.remove();
        } catch (err) {
            enqueueSnackbar(err.response?.data?.error || 'Não foi possível baixar a gravação.', { variant: 'error' });
        }
    };

    return (
        <GlassCard sx={{ p: { xs: 2, md: 3 } }}>
            <Stack direction={{ xs: 'column', md: 'row' }} spacing={1.5} alignItems={{ md: 'center' }} justifyContent="space-between" sx={{ mb: 2 }}>
                <Box>
                    <Typography variant="h6" fontWeight={700}>Gravações</Typography>
                    <Typography variant="body2" color="text.secondary">
                        Os vídeos ficam no PC do evento que gravou. Para assistir, ele precisa estar ligado e conectado.
                    </Typography>
                </Box>
                <Stack direction="row" useFlexGap flexWrap="wrap" spacing={1} alignItems="center">
                    <FormControl size="small" sx={{ minWidth: 170 }}>
                        <InputLabel id="grav-camera-rotulo">Câmera</InputLabel>
                        <Select labelId="grav-camera-rotulo" id="grav-camera" label="Câmera" value={filtro.camera_id}
                            onChange={(e) => setFiltro(f => ({ ...f, camera_id: e.target.value }))}>
                            <MenuItem value="">Todas</MenuItem>
                            {cameras.map(c => <MenuItem key={c.id} value={c.id}>{c.nome}</MenuItem>)}
                        </Select>
                    </FormControl>
                    <FormControl size="small" sx={{ minWidth: 140 }}>
                        <InputLabel id="grav-motivo-rotulo">Tipo</InputLabel>
                        <Select labelId="grav-motivo-rotulo" id="grav-motivo" label="Tipo" value={filtro.motivo}
                            onChange={(e) => setFiltro(f => ({ ...f, motivo: e.target.value }))}>
                            <MenuItem value="">Todas</MenuItem>
                            <MenuItem value="alerta">Alertas</MenuItem>
                            <MenuItem value="continua">Contínuas</MenuItem>
                        </Select>
                    </FormControl>
                    <TextField id="grav-dia" size="small" type="date" label="Dia" InputLabelProps={{ shrink: true }}
                        value={filtro.dia} onChange={(e) => setFiltro(f => ({ ...f, dia: e.target.value }))} />
                    <Tooltip title="Atualizar"><IconButton onClick={carregar}><RefreshIcon /></IconButton></Tooltip>
                </Stack>
            </Stack>

            {carregando ? (
                <Box sx={{ display: 'flex', justifyContent: 'center', py: 6 }}><CircularProgress /></Box>
            ) : lista.length === 0 ? (
                <Box sx={{ py: 5, textAlign: 'center' }}>
                    <Typography fontWeight={700}>Nenhuma gravação encontrada</Typography>
                    <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
                        Escolha &quot;Contínua&quot; ou &quot;Em alertas&quot; em Gravação, no cartão da câmera, para começar a gravar.
                    </Typography>
                </Box>
            ) : (
                <TableContainer sx={{ overflowX: 'auto' }}>
                    <Table size="small" sx={{ minWidth: 720, '& td, & th': { borderColor: 'rgba(255,255,255,0.08)' } }}>
                        <TableHead>
                            <TableRow>
                                <TableCell>Início</TableCell>
                                <TableCell>Câmera</TableCell>
                                <TableCell>Tipo</TableCell>
                                <TableCell>Duração</TableCell>
                                <TableCell>Tamanho</TableCell>
                                <TableCell align="right">Ações</TableCell>
                            </TableRow>
                        </TableHead>
                        <TableBody>
                            {lista.map(g => {
                                const apagada = g.status !== 'local';
                                const disponivel = !apagada && g.pc_conectado;
                                return (
                                    <TableRow key={g.id} hover sx={{ opacity: apagada ? 0.5 : 1 }}>
                                        <TableCell sx={{ fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>{hora(g.inicio)}</TableCell>
                                        <TableCell>{g.camera_nome || '—'}</TableCell>
                                        <TableCell>
                                            <Stack direction="row" spacing={0.75} alignItems="center">
                                                {g.motivo === 'alerta'
                                                    ? <Tooltip title={g.alerta_descricao || ''}><Chip size="small" color="error" variant="outlined" label="Alerta" /></Tooltip>
                                                    : <Chip size="small" variant="outlined" label="Contínua" />}
                                                {g.drive_file_id && <Tooltip title="Cópia no Google Drive"><DriveIcon fontSize="small" color="success" /></Tooltip>}
                                                {apagada && <Chip size="small" label="Apagada pelo prazo" />}
                                            </Stack>
                                        </TableCell>
                                        <TableCell sx={{ fontVariantNumeric: 'tabular-nums' }}>{duracao(g.inicio, g.fim)}</TableCell>
                                        <TableCell sx={{ fontVariantNumeric: 'tabular-nums' }}>{tamanho(g.tamanho_bytes)}</TableCell>
                                        <TableCell align="right" sx={{ whiteSpace: 'nowrap' }}>
                                            <Tooltip title={disponivel ? 'Assistir' : apagada ? 'Gravação já apagada' : 'PC do evento desconectado'}>
                                                <span><IconButton size="small" disabled={!disponivel} onClick={() => assistir(g)}><PlayIcon /></IconButton></span>
                                            </Tooltip>
                                            <Tooltip title={disponivel ? 'Baixar' : apagada ? 'Gravação já apagada' : 'PC do evento desconectado'}>
                                                <span><IconButton size="small" disabled={!disponivel} onClick={() => baixar(g)}><BaixarIcon /></IconButton></span>
                                            </Tooltip>
                                        </TableCell>
                                    </TableRow>
                                );
                            })}
                        </TableBody>
                    </Table>
                </TableContainer>
            )}

            <Dialog open={!!assistindo} onClose={() => setAssistindo(null)} maxWidth="md" fullWidth>
                <DialogTitle sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 1 }}>
                    <Box sx={{ minWidth: 0 }}>
                        <Typography fontWeight={700} noWrap>{assistindo?.gravacao?.camera_nome}</Typography>
                        <Typography variant="caption" color="text.secondary">
                            {hora(assistindo?.gravacao?.inicio)}{assistindo?.gravacao?.alerta_descricao ? ` · ${assistindo.gravacao.alerta_descricao}` : ''}
                        </Typography>
                    </Box>
                    <IconButton onClick={() => setAssistindo(null)} aria-label="Fechar"><FecharIcon /></IconButton>
                </DialogTitle>
                <DialogContent>
                    {assistindo && (
                        <video src={assistindo.url} controls autoPlay playsInline style={{ width: '100%', maxHeight: '70vh', background: '#000', borderRadius: 6 }} />
                    )}
                    <Stack direction="row" justifyContent="flex-end" sx={{ mt: 1.5 }}>
                        <Button size="small" startIcon={<BaixarIcon />} onClick={() => baixar(assistindo.gravacao)}>Baixar</Button>
                    </Stack>
                </DialogContent>
            </Dialog>
        </GlassCard>
    );
};

export default GravacoesPainel;
