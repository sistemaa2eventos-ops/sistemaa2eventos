import React, { useState } from 'react';
import {
    Dialog, DialogTitle, DialogContent, DialogActions,
    Box, Typography, Button, IconButton, TextField,
    Grid, Stack, Chip, MenuItem, FormControl, InputLabel, Select,
    CircularProgress, Tooltip, Switch, FormControlLabel
} from '@mui/material';
import {
    Close as CloseIcon,
    Add as AddIcon,
    Videocam as CameraIcon,
    VideocamOff as VideocamOffIcon,
    Edit as EditIcon,
    Delete as DeleteIcon,
    PlayArrow as TestIcon,
    CheckCircle as CheckCircleIcon,
    Error as ErrorIcon,
    PowerSettingsNew as PowerIcon
} from '@mui/icons-material';
import api from '../../services/api';
import { useSnackbar } from 'notistack';
import { useConfirmacao } from '../../contexts/ConfirmacaoContext';

import { botaoSecundario } from '../../styles/tokens';
const FABRICANTES = ['RTSP / OBS / Webcam', 'Intelbras', 'Hikvision', 'Genérica'];

const GerenciarCamerasModal = ({ open, onClose, cameras = [], onCamerasUpdated, onCamerasChange, areas = [], eventoId }) => {
    const confirmar = useConfirmacao();
    const { enqueueSnackbar } = useSnackbar();

    const triggerUpdate = () => {
        if (typeof onCamerasUpdated === 'function') onCamerasUpdated();
        if (typeof onCamerasChange === 'function') onCamerasChange();
    };

    const [formMode, setFormMode] = useState(false); // false = listagem, true = form (criar/editar)
    const [editingCamera, setEditingCamera] = useState(null);
    const [saving, setSaving] = useState(false);
    const [testResults, setTestResults] = useState({});
    const [testingId, setTestingId] = useState(null);
    const [togglingId, setTogglingId] = useState(null);
    const [togglingAll, setTogglingAll] = useState(false);

    const temCameraAtiva = cameras.some(c => c.status !== 'desativada' && c.status !== 'inativa');

    const handleToggleStatus = async (cam) => {
        const isDesativada = cam.status === 'desativada' || cam.status === 'inativa';
        const novoStatus = isDesativada ? 'offline' : 'desativada';
        setTogglingId(cam.id);
        try {
            await api.put(`/cameras/${cam.id}`, { status: novoStatus });
            enqueueSnackbar(
                isDesativada ? `Câmera "${cam.nome}" ativada!` : `Câmera "${cam.nome}" desativada.`,
                { variant: isDesativada ? 'success' : 'warning' }
            );
            triggerUpdate();
        } catch (err) {
            enqueueSnackbar('Erro ao alterar status da câmera.', { variant: 'error' });
        } finally {
            setTogglingId(null);
        }
    };

    const handleToggleAll = async () => {
        if (cameras.length === 0) return;
        const desativar = temCameraAtiva;
        if (desativar) {
            const ok = await confirmar({
                titulo: 'Desativar todas as câmeras',
                mensagem: `Deseja desativar todas as ${cameras.length} câmera(s) do evento? O vídeo e a IA serão pausados imediatamente.`,
                textoConfirmar: 'Desativar todas'
            });
            if (!ok) return;
        }
        setTogglingAll(true);
        try {
            const novoStatus = desativar ? 'desativada' : 'offline';
            await Promise.all(cameras.map(c => api.put(`/cameras/${c.id}`, { status: novoStatus })));
            enqueueSnackbar(
                desativar ? 'Todas as câmeras foram desativadas.' : 'Todas as câmeras foram reativadas!',
                { variant: desativar ? 'warning' : 'success' }
            );
            triggerUpdate();
        } catch (err) {
            enqueueSnackbar('Erro ao atualizar câmeras.', { variant: 'error' });
        } finally {
            setTogglingAll(false);
        }
    };

    const handleOpenForm = (cam = null) => {
        if (cam) {
            setEditingCamera({ ...cam });
        } else {
            setEditingCamera({
                nome: '',
                fabricante: 'RTSP / OBS / Webcam',
                ip_address: '127.0.0.1',
                porta: 8554,
                usuario: 'a2eventos',
                senha: '',
                protocolo: 'rtsp',
                stream_url: 'rtsp://127.0.0.1:8554/live',
                snapshot_url: '',
                area_id: areas[0]?.id || '',
                ia_ativa: true,
                vigilancia_ativa: true,
                prioridade: 1,
                url_substream: ''
            });
        }
        setFormMode(true);
    };

    const handleCloseForm = () => {
        setFormMode(false);
        setEditingCamera(null);
    };

    const handleSave = async () => {
        if (!editingCamera?.nome || !editingCamera?.ip_address) {
            enqueueSnackbar('Nome e Endereço IP são obrigatórios.', { variant: 'warning' });
            return;
        }

        try {
            setSaving(true);
            const payload = {
                ...editingCamera,
                evento_id: eventoId,
                porta: parseInt(editingCamera.porta, 10) || 554
            };

            if (!payload.stream_url && payload.ip_address) {
                const auth = payload.usuario && payload.senha ? `${payload.usuario}:${payload.senha}@` : '';
                payload.stream_url = `rtsp://${auth}${payload.ip_address}:${payload.porta}/live`;
            }

            if (editingCamera.id) {
                await api.put(`/cameras/${editingCamera.id}`, payload);
                enqueueSnackbar('Câmera atualizada com sucesso!', { variant: 'success' });
            } else {
                await api.post('/cameras', payload);
                enqueueSnackbar('Nova câmera IP cadastrada no sistema!', { variant: 'success' });
            }

            handleCloseForm();
            triggerUpdate();
        } catch (err) {
            enqueueSnackbar('Erro ao salvar câmera: ' + (err.response?.data?.error || err.message), { variant: 'error' });
        } finally {
            setSaving(false);
        }
    };

    const handleDelete = async (id, nome) => {
        if (!(await confirmar({ titulo: 'Remover câmera', mensagem: `Remover a câmera "${nome}"?`, textoConfirmar: 'Remover' }))) return;
        try {
            await api.delete(`/cameras/${id}`);
            enqueueSnackbar('Câmera removida com sucesso.', { variant: 'info' });
            triggerUpdate();
        } catch (err) {
            enqueueSnackbar('Erro ao excluir câmera.', { variant: 'error' });
        }
    };

    const handleTest = async (id) => {
        setTestingId(id);
        try {
            const resp = await api.post(`/cameras/${id}/testar`);
            const online = Boolean(resp.data?.online);
            setTestResults(prev => ({
                ...prev,
                [id]: { online, latencia: resp.data?.latencia || 0 }
            }));
            enqueueSnackbar(online ? 'Câmera online e acessível!' : 'Câmera inacessível (offline).', {
                variant: online ? 'success' : 'warning'
            });
        } catch (err) {
            setTestResults(prev => ({
                ...prev,
                [id]: { online: false, latencia: 0 }
            }));
            enqueueSnackbar('Falha ao testar conectividade da câmera.', { variant: 'error' });
        } finally {
            setTestingId(null);
        }
    };

    return (
        <Dialog
            open={open}
            onClose={onClose}
            maxWidth="md"
            fullWidth
            PaperProps={{
                sx: {
                    color: '#FFFFFF'
                }
            }}
        >
            <DialogTitle sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', pb: 1, borderBottom: '1px solid rgba(255,255,255,0.08)', gap: 1 }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.2, minWidth: 0 }}>
                    <CameraIcon sx={{ color: '#00D4FF', flexShrink: 0 }} />
                    <Typography variant="h6" noWrap sx={{ fontWeight: 700, fontFamily: '"Space Grotesk", sans-serif', fontSize: { xs: '1rem', sm: '1.2rem' } }}>
                        {formMode ? (editingCamera?.id ? 'Editar câmera IP' : 'Nova câmera IP') : 'Gerenciar câmeras IP'}
                    </Typography>
                </Box>
                <IconButton onClick={onClose} size="small" sx={{ color: '#94A3B8', '&:hover': { color: '#FFFFFF' } }}>
                    <CloseIcon />
                </IconButton>
            </DialogTitle>

            <DialogContent sx={{ py: { xs: 2, sm: 3 }, px: { xs: 1.5, sm: 3 } }}>
                {formMode ? (
                    <Box component="form" sx={{ mt: 0.5 }}>
                        <Grid container spacing={2}>
                            <Grid item xs={12} sm={8}>
                                <TextField
                                    fullWidth
                                    size="small"
                                    label="Nome / identificação da câmera"
                                    value={editingCamera?.nome || ''}
                                    onChange={(e) => setEditingCamera({ ...editingCamera, nome: e.target.value })}
                                    placeholder="Ex: Câmera Portão VIP 01"
                                    required
                                    sx={{ '& .MuiOutlinedInput-root': { bgcolor: 'rgba(0,0,0,0.3)', color: '#FFFFFF' } }}
                                />
                            </Grid>

                            <Grid item xs={12} sm={4}>
                                <FormControl fullWidth size="small">
                                    <InputLabel sx={{ color: '#94A3B8' }}>Fabricante / protocolo</InputLabel>
                                    <Select
                                        value={editingCamera?.fabricante || 'RTSP / OBS / Webcam'}
                                        label="Fabricante / protocolo"
                                        onChange={(e) => setEditingCamera({ ...editingCamera, fabricante: e.target.value })}
                                        sx={{ bgcolor: 'rgba(0,0,0,0.3)', color: '#FFFFFF' }}
                                    >
                                        {FABRICANTES.map(f => (
                                            <MenuItem key={f} value={f}>{f}</MenuItem>
                                        ))}
                                    </Select>
                                </FormControl>
                            </Grid>

                            <Grid item xs={12} sm={8}>
                                <TextField
                                    fullWidth
                                    size="small"
                                    label="Endereço IP ou host"
                                    value={editingCamera?.ip_address || ''}
                                    onChange={(e) => setEditingCamera({ ...editingCamera, ip_address: e.target.value })}
                                    placeholder="192.168.1.100 ou cam.dominio.com"
                                    required
                                    sx={{ '& .MuiOutlinedInput-root': { bgcolor: 'rgba(0,0,0,0.3)', color: '#FFFFFF' } }}
                                />
                            </Grid>

                            <Grid item xs={12} sm={4}>
                                <TextField
                                    fullWidth
                                    size="small"
                                    label="Porta RTSP / HTTP"
                                    type="number"
                                    value={editingCamera?.porta || 554}
                                    onChange={(e) => setEditingCamera({ ...editingCamera, porta: e.target.value })}
                                    sx={{ '& .MuiOutlinedInput-root': { bgcolor: 'rgba(0,0,0,0.3)', color: '#FFFFFF' } }}
                                />
                            </Grid>

                            <Grid item xs={12} sm={6}>
                                <TextField
                                    fullWidth
                                    size="small"
                                    label="Usuário (autenticação)"
                                    value={editingCamera?.usuario || ''}
                                    onChange={(e) => setEditingCamera({ ...editingCamera, usuario: e.target.value })}
                                    sx={{ '& .MuiOutlinedInput-root': { bgcolor: 'rgba(0,0,0,0.3)', color: '#FFFFFF' } }}
                                />
                            </Grid>

                            <Grid item xs={12} sm={6}>
                                <TextField
                                    fullWidth
                                    size="small"
                                    type="password"
                                    label="Senha (autenticação)"
                                    value={editingCamera?.senha || ''}
                                    onChange={(e) => setEditingCamera({ ...editingCamera, senha: e.target.value })}
                                    sx={{ '& .MuiOutlinedInput-root': { bgcolor: 'rgba(0,0,0,0.3)', color: '#FFFFFF' } }}
                                />
                            </Grid>

                            <Grid item xs={12}>
                                <TextField
                                    fullWidth
                                    size="small"
                                    label="URL stream completa (RTSP / HLS / MJPEG)"
                                    value={editingCamera?.stream_url || ''}
                                    onChange={(e) => setEditingCamera({ ...editingCamera, stream_url: e.target.value })}
                                    placeholder="rtsp://usuario:senha@192.168.1.100:554/cam/realmonitor?channel=1&subtype=0"
                                    helperText="Se deixado em branco, será gerado automaticamente com base no IP e Porta"
                                    sx={{ '& .MuiOutlinedInput-root': { bgcolor: 'rgba(0,0,0,0.3)', color: '#FFFFFF' } }}
                                />
                            </Grid>

                            <Grid item xs={12}>
                                <FormControl fullWidth size="small">
                                    <InputLabel sx={{ color: '#94A3B8' }}>Área do evento vinculada</InputLabel>
                                    <Select
                                        value={editingCamera?.area_id || ''}
                                        label="Área do evento vinculada"
                                        onChange={(e) => setEditingCamera({ ...editingCamera, area_id: e.target.value })}
                                        sx={{ bgcolor: 'rgba(0,0,0,0.3)', color: '#FFFFFF' }}
                                    >
                                        <MenuItem value=""><em>Nenhuma (monitoramento geral)</em></MenuItem>
                                        {areas.map(a => (
                                            <MenuItem key={a.id} value={a.id}>{a.nome_area}</MenuItem>
                                        ))}
                                    </Select>
                                </FormControl>
                            </Grid>

                            {/* IA FACIAL NESTA CÂMERA (mesmas opções de Configurações > IA facial) */}
                            <Grid item xs={12}>
                                <Typography variant="subtitle2" sx={{ fontWeight: 700, mt: 0.5 }}>Reconhecimento facial</Typography>
                            </Grid>
                            <Grid item xs={6} sm={4}>
                                <FormControlLabel
                                    control={<Switch checked={editingCamera?.ia_ativa !== false}
                                        onChange={(e) => setEditingCamera({ ...editingCamera, ia_ativa: e.target.checked })} />}
                                    label="IA ligada"
                                />
                            </Grid>
                            <Grid item xs={6} sm={4}>
                                <Tooltip title="Reconhece e alerta mesmo com o painel fechado (usa o computador do evento o tempo todo)">
                                    <FormControlLabel
                                        control={<Switch checked={editingCamera?.vigilancia_ativa !== false && editingCamera?.ia_ativa !== false}
                                            disabled={editingCamera?.ia_ativa === false}
                                            onChange={(e) => setEditingCamera({ ...editingCamera, vigilancia_ativa: e.target.checked })} />}
                                        label="Vigilância 24 h"
                                    />
                                </Tooltip>
                            </Grid>
                            <Grid item xs={12} sm={4}>
                                <FormControl fullWidth size="small">
                                    <InputLabel sx={{ color: '#94A3B8' }}>Prioridade da IA</InputLabel>
                                    <Select
                                        value={editingCamera?.prioridade ?? 1}
                                        label="Prioridade da IA"
                                        onChange={(e) => setEditingCamera({ ...editingCamera, prioridade: e.target.value })}
                                        sx={{ bgcolor: 'rgba(0,0,0,0.3)', color: '#FFFFFF' }}
                                    >
                                        <MenuItem value={0}>Baixa</MenuItem>
                                        <MenuItem value={1}>Normal</MenuItem>
                                        <MenuItem value={2}>Alta</MenuItem>
                                        <MenuItem value={3}>Crítica (entrada principal)</MenuItem>
                                    </Select>
                                </FormControl>
                            </Grid>
                            <Grid item xs={12}>
                                <TextField
                                    fullWidth
                                    size="small"
                                    label="Sub-stream (opcional)"
                                    value={editingCamera?.url_substream || ''}
                                    onChange={(e) => setEditingCamera({ ...editingCamera, url_substream: e.target.value })}
                                    placeholder="rtsp://usuario:senha@192.168.1.100:554/cam/realmonitor?channel=1&subtype=1"
                                    helperText="Vídeo em baixa resolução usado nas miniaturas e na vigilância. Vazio: deduzido automaticamente."
                                    sx={{ '& .MuiOutlinedInput-root': { bgcolor: 'rgba(0,0,0,0.3)', color: '#FFFFFF' } }}
                                />
                            </Grid>
                        </Grid>
                    </Box>
                ) : (
                    <Box>
                        <Box sx={{
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: { xs: 'stretch', sm: 'center' },
                            flexDirection: { xs: 'column', sm: 'row' },
                            mb: 2,
                            gap: 1.25
                        }}>
                            <Typography variant="body2" sx={{ color: 'rgba(255,255,255,0.7)' }}>
                                {cameras.length} câmera(s) cadastrada(s) para este evento.
                            </Typography>
                            <Stack direction="row" spacing={1} sx={{ width: { xs: '100%', sm: 'auto' } }}>
                                {cameras.length > 0 && (
                                    <Button
                                        variant="outlined"
                                        size="small"
                                        color={temCameraAtiva ? 'warning' : 'success'}
                                        startIcon={togglingAll ? <CircularProgress size={14} color="inherit" /> : <PowerIcon />}
                                        onClick={handleToggleAll}
                                        disabled={togglingAll}
                                        sx={{ fontWeight: 700, fontSize: '0.78rem', flex: { xs: 1, sm: 'initial' }, whiteSpace: 'nowrap' }}
                                    >
                                        {temCameraAtiva ? 'Desativar todas' : 'Ativar todas'}
                                    </Button>
                                )}
                                <Button
                                    variant="contained"
                                    size="small"
                                    startIcon={<AddIcon />}
                                    onClick={() => handleOpenForm()}
                                    sx={{
                                        bgcolor: '#00D4FF',
                                        color: '#000000',
                                        fontWeight: 700,
                                        fontSize: '0.8125rem',
                                        flex: { xs: 1, sm: 'initial' },
                                        whiteSpace: 'nowrap',
                                        '&:hover': { bgcolor: '#0099BB' }
                                    }}
                                >
                                    Adicionar câmera
                                </Button>
                            </Stack>
                        </Box>

                        {cameras.length === 0 ? (
                            <Box sx={{ textAlign: 'center', py: 5, px: 2, bgcolor: 'rgba(255,255,255,0.02)', borderRadius: 1.5 }}>
                                <CameraIcon sx={{ fontSize: 48, color: '#64748B', mb: 1 }} />
                                <Typography variant="body1" sx={{ color: '#94A3B8', fontWeight: 700 }}>
                                    Nenhuma câmera cadastrada ainda
                                </Typography>
                                <Typography variant="caption" sx={{ color: '#64748B', display: 'block', mt: 0.5 }}>
                                    Toque no botão acima para adicionar sua primeira câmera IP ou stream RTSP.
                                </Typography>
                            </Box>
                        ) : (
                            <Stack spacing={1.5} sx={{ maxHeight: { xs: '60vh', sm: 420 }, overflowY: 'auto', pr: 0.5 }}>
                                {cameras.map((c) => {
                                    const test = testResults[c.id];
                                    const isTesting = testingId === c.id;
                                    const isDesativada = c.status === 'desativada' || c.status === 'inativa';
                                    const isToggling = togglingId === c.id;

                                    return (
                                        <Box
                                            key={c.id}
                                            sx={{
                                                p: { xs: 1.5, sm: 1.8 },
                                                borderRadius: 1.5,
                                                opacity: isDesativada ? 0.72 : 1,
                                                bgcolor: 'rgba(255,255,255,0.03)',
                                                border: isDesativada ? '1px dashed rgba(255, 184, 0, 0.35)' : '1px solid rgba(255,255,255,0.08)',
                                                display: 'flex',
                                                flexDirection: { xs: 'column', sm: 'row' },
                                                alignItems: { xs: 'stretch', sm: 'center' },
                                                justifyContent: 'space-between',
                                                gap: { xs: 1.25, sm: 2 },
                                                '&:hover': { bgcolor: 'rgba(255,255,255,0.05)' }
                                            }}
                                        >
                                            <Stack direction="row" spacing={1.5} alignItems="center" sx={{ minWidth: 0, flex: 1 }}>
                                                <Box sx={{
                                                    width: 38, height: 38, borderRadius: 1.5, flexShrink: 0,
                                                    bgcolor: isDesativada ? 'rgba(255, 184, 0, 0.1)' : 'rgba(0, 212, 255, 0.1)',
                                                    border: isDesativada ? '1px solid rgba(255, 184, 0, 0.3)' : '1px solid rgba(0, 212, 255, 0.3)',
                                                    display: 'flex', alignItems: 'center', justifyContent: 'center'
                                                }}>
                                                    {isDesativada
                                                        ? <VideocamOffIcon sx={{ color: '#FFB800', fontSize: 20 }} />
                                                        : <CameraIcon sx={{ color: '#00D4FF', fontSize: 20 }} />}
                                                </Box>

                                                <Box sx={{ minWidth: 0, flex: 1 }}>
                                                    <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap">
                                                        <Typography variant="body2" noWrap sx={{ fontWeight: 700, color: '#FFFFFF', maxWidth: '100%' }}>
                                                            {c.nome}
                                                        </Typography>
                                                        {isDesativada && (
                                                            <Chip label="Desativada" size="small" color="warning" sx={{ height: 18, fontSize: '0.68rem', fontWeight: 700 }} />
                                                        )}
                                                    </Stack>
                                                    <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.55)', fontFamily: '"Inter", sans-serif', display: 'block', wordBreak: 'break-word' }}>
                                                        {c.ip_address}:{c.porta || 554} • {c.fabricante || 'RTSP'}
                                                        {c.area?.nome_area ? ` • ${c.area.nome_area}` : ''}
                                                    </Typography>
                                                </Box>
                                            </Stack>

                                            <Stack
                                                direction="row"
                                                spacing={1}
                                                alignItems="center"
                                                justifyContent={{ xs: 'space-between', sm: 'flex-end' }}
                                                sx={{
                                                    pt: { xs: 1, sm: 0 },
                                                    borderTop: { xs: '1px solid rgba(255,255,255,0.06)', sm: 'none' },
                                                    flexShrink: 0
                                                }}
                                            >
                                                <Box>
                                                    {test && !isDesativada ? (
                                                        <Chip
                                                            icon={test.online ? <CheckCircleIcon sx={{ fontSize: 14 }} /> : <ErrorIcon sx={{ fontSize: 14 }} />}
                                                            label={test.online ? `Online (${test.latencia}ms)` : 'Offline'}
                                                            size="small"
                                                            sx={{
                                                                height: 22,
                                                                fontSize: '0.72rem',
                                                                fontWeight: 700,
                                                                bgcolor: test.online ? 'rgba(0,255,136,0.15)' : 'rgba(255,51,102,0.15)',
                                                                color: test.online ? '#00FF88' : '#FF3366'
                                                            }}
                                                        />
                                                    ) : (
                                                        <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.4)', display: { xs: 'inline', sm: 'none' } }}>
                                                            {isDesativada ? 'Pausada' : 'Pronta'}
                                                        </Typography>
                                                    )}
                                                </Box>

                                                <Stack direction="row" spacing={0.75} alignItems="center">
                                                    <Tooltip title={isDesativada ? 'Ativar câmera' : 'Desativar câmera (pausar vídeo e IA)'}>
                                                        <IconButton
                                                            size="small"
                                                            onClick={() => handleToggleStatus(c)}
                                                            disabled={isToggling}
                                                            sx={{
                                                                color: isDesativada ? '#00FF88' : '#FFB800',
                                                                bgcolor: isDesativada ? 'rgba(0, 255, 136, 0.12)' : 'rgba(255, 184, 0, 0.1)'
                                                            }}
                                                        >
                                                            {isToggling ? <CircularProgress size={16} color="inherit" /> : <PowerIcon fontSize="small" />}
                                                        </IconButton>
                                                    </Tooltip>

                                                    {!isDesativada && (
                                                        <Tooltip title="Testar conexão">
                                                            <IconButton
                                                                size="small"
                                                                onClick={() => handleTest(c.id)}
                                                                disabled={isTesting}
                                                                sx={{ color: '#00D4FF', bgcolor: 'rgba(0, 212, 255, 0.08)' }}
                                                            >
                                                                {isTesting ? <CircularProgress size={16} color="inherit" /> : <TestIcon fontSize="small" />}
                                                            </IconButton>
                                                        </Tooltip>
                                                    )}

                                                    <Tooltip title="Editar câmera">
                                                        <IconButton
                                                            size="small"
                                                            onClick={() => handleOpenForm(c)}
                                                            sx={{ color: '#94A3B8', bgcolor: 'rgba(255,255,255,0.04)', '&:hover': { color: '#FFFFFF' } }}
                                                        >
                                                            <EditIcon fontSize="small" />
                                                        </IconButton>
                                                    </Tooltip>

                                                    <Tooltip title="Excluir câmera">
                                                        <IconButton
                                                            size="small"
                                                            onClick={() => handleDelete(c.id, c.nome)}
                                                            sx={{ color: '#94A3B8', bgcolor: 'rgba(255,255,255,0.04)', '&:hover': { color: '#FF3366' } }}
                                                        >
                                                            <DeleteIcon fontSize="small" />
                                                        </IconButton>
                                                    </Tooltip>
                                                </Stack>
                                            </Stack>
                                        </Box>
                                    );
                                })}
                            </Stack>
                        )}
                    </Box>
                )}
            </DialogContent>

            <DialogActions sx={{ p: { xs: 1.5, sm: 2.5 }, borderTop: '1px solid rgba(255,255,255,0.08)', gap: 1 }}>
                {formMode ? (
                    <>
                        <Button variant="outlined" onClick={handleCloseForm} sx={{ ...botaoSecundario, flex: { xs: 1, sm: 'initial' } }}>
                            Cancelar
                        </Button>
                        <Button
                            variant="contained"
                            onClick={handleSave}
                            disabled={saving}
                            sx={{
                                bgcolor: '#00D4FF',
                                color: '#000000',
                                fontWeight: 700,
                                flex: { xs: 1, sm: 'initial' },
                                '&:hover': { bgcolor: '#00D4FF' }
                            }}
                        >
                            {saving ? <CircularProgress size={20} color="inherit" /> : 'Salvar câmera'}
                        </Button>
                    </>
                ) : (
                    <Button variant="outlined" fullWidth onClick={onClose} sx={{ ...botaoSecundario, maxWidth: { sm: 140 } }}>
                        Fechar
                    </Button>
                )}
            </DialogActions>
        </Dialog>
    );
};

export default GerenciarCamerasModal;
