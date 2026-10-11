import React, { useState } from 'react';
import {
    Dialog, DialogTitle, DialogContent, DialogActions,
    Box, Typography, Button, IconButton, TextField,
    Grid, Stack, Chip, MenuItem, FormControl, InputLabel, Select,
    CircularProgress, Tooltip
} from '@mui/material';
import {
    Close as CloseIcon,
    Add as AddIcon,
    Videocam as CameraIcon,
    Edit as EditIcon,
    Delete as DeleteIcon,
    PlayArrow as TestIcon,
    CheckCircle as CheckCircleIcon,
    Error as ErrorIcon
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
                area_id: areas[0]?.id || ''
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
                    bgcolor: '#0A1628',
                    color: '#FFFFFF',
                    borderRadius: 1.5,
                    border: '1px solid rgba(0, 212, 255, 0.25)',
                    boxShadow: '0 20px 60px rgba(0,0,0,0.8)'
                }
            }}
        >
            <DialogTitle sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', pb: 1, borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                    <CameraIcon sx={{ color: '#00D4FF' }} />
                    <Typography variant="h6" sx={{ fontWeight: 700, fontFamily: '"Space Grotesk", sans-serif' }}>
                        {formMode ? (editingCamera?.id ? 'Editar Câmera IP' : 'Cadastrar Nova Câmera IP') : 'Gerenciamento de Câmeras IP'}
                    </Typography>
                </Box>
                <IconButton onClick={onClose} sx={{ color: '#94A3B8', '&:hover': { color: '#FFFFFF' } }}>
                    <CloseIcon />
                </IconButton>
            </DialogTitle>

            <DialogContent sx={{ py: 3 }}>
                {formMode ? (
                    <Box component="form" sx={{ mt: 1 }}>
                        <Grid container spacing={2.5}>
                            <Grid item xs={12} sm={8}>
                                <TextField
                                    fullWidth
                                    size="small"
                                    label="Nome / Identificação da Câmera"
                                    value={editingCamera?.nome || ''}
                                    onChange={(e) => setEditingCamera({ ...editingCamera, nome: e.target.value })}
                                    placeholder="Ex: Câmera Portão VIP 01"
                                    required
                                    sx={{ '& .MuiOutlinedInput-root': { bgcolor: 'rgba(0,0,0,0.3)', color: '#FFFFFF' } }}
                                />
                            </Grid>

                            <Grid item xs={12} sm={4}>
                                <FormControl fullWidth size="small">
                                    <InputLabel sx={{ color: '#94A3B8' }}>Fabricante / Protocolo</InputLabel>
                                    <Select
                                        value={editingCamera?.fabricante || 'RTSP / OBS / Webcam'}
                                        label="Fabricante / Protocolo"
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
                                    label="Endereço IP ou Host"
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
                                    label="Usuário (Autenticação)"
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
                                    label="Senha (Autenticação)"
                                    value={editingCamera?.senha || ''}
                                    onChange={(e) => setEditingCamera({ ...editingCamera, senha: e.target.value })}
                                    sx={{ '& .MuiOutlinedInput-root': { bgcolor: 'rgba(0,0,0,0.3)', color: '#FFFFFF' } }}
                                />
                            </Grid>

                            <Grid item xs={12}>
                                <TextField
                                    fullWidth
                                    size="small"
                                    label="URL Stream Completa (RTSP / HLS / MJPEG)"
                                    value={editingCamera?.stream_url || ''}
                                    onChange={(e) => setEditingCamera({ ...editingCamera, stream_url: e.target.value })}
                                    placeholder="rtsp://usuario:senha@192.168.1.100:554/cam/realmonitor?channel=1&subtype=0"
                                    helperText="Se deixado em branco, será gerado automaticamente com base no IP e Porta"
                                    sx={{ '& .MuiOutlinedInput-root': { bgcolor: 'rgba(0,0,0,0.3)', color: '#FFFFFF' } }}
                                />
                            </Grid>

                            <Grid item xs={12}>
                                <FormControl fullWidth size="small">
                                    <InputLabel sx={{ color: '#94A3B8' }}>Área do Evento Vinculada</InputLabel>
                                    <Select
                                        value={editingCamera?.area_id || ''}
                                        label="Área do Evento Vinculada"
                                        onChange={(e) => setEditingCamera({ ...editingCamera, area_id: e.target.value })}
                                        sx={{ bgcolor: 'rgba(0,0,0,0.3)', color: '#FFFFFF' }}
                                    >
                                        <MenuItem value=""><em>Nenhuma (Monitoramento Geral)</em></MenuItem>
                                        {areas.map(a => (
                                            <MenuItem key={a.id} value={a.id}>{a.nome_area}</MenuItem>
                                        ))}
                                    </Select>
                                </FormControl>
                            </Grid>
                        </Grid>
                    </Box>
                ) : (
                    <Box>
                        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
                            <Typography variant="body2" sx={{ color: 'rgba(255,255,255,0.7)' }}>
                                {cameras.length} câmera(s) cadastrada(s) para este evento.
                            </Typography>
                            <Button
                                variant="contained"
                                startIcon={<AddIcon />}
                                onClick={() => handleOpenForm()}
                                sx={{
                                    bgcolor: '#00D4FF',
                                    color: '#000000',
                                    fontWeight: 700,
                                    fontSize: '0.8125rem',
                                    '&:hover': { bgcolor: '#0099BB' }
                                }}
                            >
                                Adicionar Câmera
                            </Button>
                        </Box>

                        {cameras.length === 0 ? (
                            <Box sx={{ textAlign: 'center', py: 6, bgcolor: 'rgba(255,255,255,0.02)', borderRadius: 1.5 }}>
                                <CameraIcon sx={{ fontSize: 48, color: '#64748B', mb: 1 }} />
                                <Typography variant="body1" sx={{ color: '#94A3B8', fontWeight: 700 }}>
                                    Nenhuma câmera cadastrada ainda
                                </Typography>
                                <Typography variant="caption" sx={{ color: '#64748B', display: 'block', mt: 0.5 }}>
                                    Clique no botão acima para adicionar sua primeira câmera IP ou stream RTSP.
                                </Typography>
                            </Box>
                        ) : (
                            <Stack spacing={1.5} sx={{ maxHeight: 420, overflowY: 'auto', pr: 0.5 }}>
                                {cameras.map((c) => {
                                    const test = testResults[c.id];
                                    const isTesting = testingId === c.id;

                                    return (
                                        <Box
                                            key={c.id}
                                            sx={{
                                                p: 1.8,
                                                borderRadius: 1.5,
                                                bgcolor: 'rgba(255,255,255,0.03)',
                                                border: '1px solid rgba(255,255,255,0.08)',
                                                display: 'flex',
                                                alignItems: 'center',
                                                justifyContent: 'space-between',
                                                gap: 2,
                                                '&:hover': { bgcolor: 'rgba(255,255,255,0.05)' }
                                            }}
                                        >
                                            <Stack direction="row" spacing={1.5} alignItems="center">
                                                <Box sx={{
                                                    width: 40, height: 40, borderRadius: 1.5,
                                                    bgcolor: 'rgba(0, 212, 255, 0.1)',
                                                    border: '1px solid rgba(0, 212, 255, 0.3)',
                                                    display: 'flex', alignItems: 'center', justifyContent: 'center'
                                                }}>
                                                    <CameraIcon sx={{ color: '#00D4FF', fontSize: 22 }} />
                                                </Box>

                                                <Box>
                                                    <Typography variant="body2" sx={{ fontWeight: 700, color: '#FFFFFF' }}>
                                                        {c.nome}
                                                    </Typography>
                                                    <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.5)', fontFamily: '"Inter", sans-serif' }}>
                                                        {c.ip_address}:{c.porta || 554} • {c.fabricante || 'RTSP'}
                                                        {c.area?.nome_area ? ` • ${c.area.nome_area}` : ''}
                                                    </Typography>
                                                </Box>
                                            </Stack>

                                            <Stack direction="row" spacing={1} alignItems="center">
                                                {test && (
                                                    <Chip
                                                        icon={test.online ? <CheckCircleIcon sx={{ fontSize: 14 }} /> : <ErrorIcon sx={{ fontSize: 14 }} />}
                                                        label={test.online ? `Online (${test.latencia}ms)` : 'Offline'}
                                                        size="small"
                                                        sx={{
                                                            height: 22,
                                                            fontSize: '0.75rem',
                                                            fontWeight: 700,
                                                            bgcolor: test.online ? 'rgba(0,255,136,0.15)' : 'rgba(255,51,102,0.15)',
                                                            color: test.online ? '#00FF88' : '#FF3366'
                                                        }}
                                                    />
                                                )}

                                                <Tooltip title="Testar conexão">
                                                    <IconButton
                                                        size="small"
                                                        onClick={() => handleTest(c.id)}
                                                        disabled={isTesting}
                                                        sx={{ color: '#00D4FF' }}
                                                    >
                                                        {isTesting ? <CircularProgress size={16} color="inherit" /> : <TestIcon fontSize="small" />}
                                                    </IconButton>
                                                </Tooltip>

                                                <Tooltip title="Editar câmera">
                                                    <IconButton
                                                        size="small"
                                                        onClick={() => handleOpenForm(c)}
                                                        sx={{ color: '#94A3B8', '&:hover': { color: '#FFFFFF' } }}
                                                    >
                                                        <EditIcon fontSize="small" />
                                                    </IconButton>
                                                </Tooltip>

                                                <Tooltip title="Excluir câmera">
                                                    <IconButton
                                                        size="small"
                                                        onClick={() => handleDelete(c.id, c.nome)}
                                                        sx={{ color: '#94A3B8', '&:hover': { color: '#FF3366' } }}
                                                    >
                                                        <DeleteIcon fontSize="small" />
                                                    </IconButton>
                                                </Tooltip>
                                            </Stack>
                                        </Box>
                                    );
                                })}
                            </Stack>
                        )}
                    </Box>
                )}
            </DialogContent>

            <DialogActions sx={{ p: 2.5, borderTop: '1px solid rgba(255,255,255,0.08)' }}>
                {formMode ? (
                    <>
                        <Button variant="outlined" onClick={handleCloseForm} sx={botaoSecundario}>
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
                                '&:hover': { bgcolor: '#00D4FF' }
                            }}
                        >
                            {saving ? <CircularProgress size={20} color="inherit" /> : 'Salvar Câmera'}
                        </Button>
                    </>
                ) : (
                    <Button variant="outlined" onClick={onClose} sx={botaoSecundario}>
                        Fechar
                    </Button>
                )}
            </DialogActions>
        </Dialog>
    );
};

export default GerenciarCamerasModal;
