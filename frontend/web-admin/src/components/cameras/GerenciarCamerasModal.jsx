import React, { useState } from 'react';
import {
    Dialog, DialogTitle, DialogContent, DialogActions,
    Box, Typography, Button, IconButton,
    Stack, Chip, CircularProgress, Tooltip
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
import CameraFormDialog from './CameraFormDialog';

import { botaoSecundario } from '../../styles/tokens';

const GerenciarCamerasModal = ({ open, onClose, cameras = [], onCamerasUpdated, onCamerasChange, areas = [], eventoId }) => {
    const confirmar = useConfirmacao();
    const { enqueueSnackbar } = useSnackbar();

    const triggerUpdate = () => {
        if (typeof onCamerasUpdated === 'function') onCamerasUpdated();
        if (typeof onCamerasChange === 'function') onCamerasChange();
    };

    const [formMode, setFormMode] = useState(false); // false = listagem, true = form (criar/editar)
    const [editingCamera, setEditingCamera] = useState(null);
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
        setEditingCamera(cam);
        setFormMode(true);
    };

    const handleCloseForm = () => {
        setFormMode(false);
        setEditingCamera(null);
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
                        Gerenciar câmeras
                    </Typography>
                </Box>
                <IconButton onClick={onClose} size="small" sx={{ color: '#94A3B8', '&:hover': { color: '#FFFFFF' } }}>
                    <CloseIcon />
                </IconButton>
            </DialogTitle>

            <DialogContent sx={{ py: { xs: 2, sm: 3 }, px: { xs: 1.5, sm: 3 } }}>
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
                            <Stack spacing={1.5} sx={{ maxHeight: { xs: '60dvh', sm: 420 }, overflowY: 'auto', pr: 0.5 }}>
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
            </DialogContent>

            <DialogActions sx={{ p: { xs: 1.5, sm: 2.5 }, borderTop: '1px solid rgba(255,255,255,0.08)', gap: 1 }}>
                <Button variant="outlined" fullWidth onClick={onClose} sx={{ ...botaoSecundario, maxWidth: { sm: 140 } }}>
                    Fechar
                </Button>
            </DialogActions>

            {/* Mesmo formulário de Configurações › Câmeras */}
            <CameraFormDialog
                open={formMode}
                camera={editingCamera}
                areas={areas}
                eventoId={eventoId}
                onClose={handleCloseForm}
                onSalvo={triggerUpdate}
            />
        </Dialog>
    );
};

export default GerenciarCamerasModal;
