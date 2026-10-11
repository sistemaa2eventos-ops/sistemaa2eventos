import React, { useState, useEffect, useCallback } from 'react';
import {
    Box, Typography, Grid, TextField, Button, Chip, Stack, MenuItem,
    IconButton, CircularProgress, Dialog, DialogTitle, DialogContent,
    DialogActions, FormControl, InputLabel, Select,
    Tabs, Tab
} from '@mui/material';
import {
    Save as SaveIcon, Videocam as CameraIcon, MeetingRoom as DoorIcon,
    Add as AddIcon, Delete as DeleteIcon, Refresh as RefreshIcon,
    OpenInNew as OpenInNewIcon, Shield as ShieldIcon,
    Tune as TuneIcon
} from '@mui/icons-material';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { useSnackbar } from 'notistack';
import api from '../../services/api';
import { urlMidiaCamera } from '../../utils/cameraMedia';
import GlassCard from '../../components/common/GlassCard';
import NeonButton from '../../components/common/NeonButton';
import PageHeader from '../../components/common/PageHeader';
import { useConfirmacao } from '../../contexts/ConfirmacaoContext';

import { botaoSecundario } from '../../styles/tokens';
const FABRICANTES = ['RTSP / OBS / Webcam', 'Intelbras', 'Hikvision', 'Genérica'];

const ConfigCameras = () => {
    const confirmar = useConfirmacao();
    const { enqueueSnackbar } = useSnackbar();
    const [searchParams] = useSearchParams();
    const navigate = useNavigate();
    const eventoId = searchParams.get('evento_id') || localStorage.getItem('active_evento_id');

    const [activeTab, setActiveTab] = useState(0); // 0 = Câmeras IP CFTV, 1 = Catracas & Periféricos
    const [cameras, setCameras] = useState([]);
    const [areas, setAreas] = useState([]);
    const [loadingCameras, setLoadingCameras] = useState(true);

    // Dialog de Câmera (Criar / Editar)
    const [cameraModalOpen, setCameraModalOpen] = useState(false);
    const [editingCamera, setEditingCamera] = useState(null);
    const [savingCamera, setSavingCamera] = useState(false);
    const [testingId, setTestingId] = useState(null);
    const [testResults, setTestResults] = useState({});

    // Catracas e Edge Devices
    const [dispositivos, setDispositivos] = useState([]);
    const [loadingDevices, setLoadingDevices] = useState(false);
    const [savingDevices, setSavingDevices] = useState(false);

    // Carregar Câmeras do Evento
    const fetchCameras = useCallback(async () => {
        if (!eventoId) return;
        try {
            setLoadingCameras(true);
            const resp = await api.get('/cameras', { params: { evento_id: eventoId } });
            setCameras(resp.data.data || []);
        } catch (err) {
            enqueueSnackbar('Erro ao carregar câmeras IP.', { variant: 'error' });
        } finally {
            setLoadingCameras(false);
        }
    }, [eventoId, enqueueSnackbar]);

    // Carregar Áreas para Vinculação
    const fetchAreas = useCallback(async () => {
        if (!eventoId) return;
        try {
            const resp = await api.get('/config/areas', { params: { evento_id: eventoId } });
            setAreas(resp.data.data || []);
        } catch (err) {
            // silencioso
        }
    }, [eventoId]);

    // Carregar Catracas
    const fetchDevices = useCallback(async () => {
        if (!eventoId) return;
        try {
            setLoadingDevices(true);
            const resp = await api.get('/dispositivos', { params: { evento_id: eventoId } });
            const catracas = (resp.data.data || []).filter(d => d.tipo === 'catraca');
            setDispositivos(catracas.map(d => ({
                id: d.id,
                nome: d.nome,
                tipo: 'catraca',
                ip: d.ip_address,
                porta: d.porta || 80,
                user: d.user_device || 'admin',
                pass: '', // a API não devolve a senha; vazio mantém a atual
                marca: d.marca || 'intelbras'
            })));
        } catch (err) {
            enqueueSnackbar('Erro ao buscar catracas.', { variant: 'error' });
        } finally {
            setLoadingDevices(false);
        }
    }, [eventoId, enqueueSnackbar]);

    useEffect(() => {
        fetchCameras();
        fetchAreas();
        fetchDevices();
    }, [fetchCameras, fetchAreas, fetchDevices]);

    // Abrir Modal de Câmera
    const handleOpenModal = (camera = null) => {
        if (camera) {
            setEditingCamera({ ...camera });
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
        setCameraModalOpen(true);
    };

    // Salvar Câmera IP
    const handleSaveCamera = async () => {
        if (!editingCamera?.nome || !editingCamera?.ip_address) {
            enqueueSnackbar('Nome e Endereço IP são obrigatórios.', { variant: 'warning' });
            return;
        }

        try {
            setSavingCamera(true);
            const payload = {
                ...editingCamera,
                evento_id: eventoId,
                porta: parseInt(editingCamera.porta, 10) || (editingCamera.protocolo === 'rtsp' ? 554 : 80)
            };

            // Auto-gerar RTSP URL caso vazia
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

            setCameraModalOpen(false);
            fetchCameras();
        } catch (err) {
            enqueueSnackbar('Erro ao salvar câmera: ' + (err.response?.data?.error || err.message), { variant: 'error' });
        } finally {
            setSavingCamera(false);
        }
    };

    // Excluir Câmera IP
    const handleDeleteCamera = async (id) => {
        if (!(await confirmar({ titulo: 'Excluir câmera', mensagem: 'Excluir esta câmera do sistema?', textoConfirmar: 'Excluir' }))) return;
        try {
            await api.delete(`/cameras/${id}`);
            enqueueSnackbar('Câmera removida com sucesso.', { variant: 'success' });
            fetchCameras();
        } catch (err) {
            enqueueSnackbar('Erro ao excluir câmera.', { variant: 'error' });
        }
    };

    // Testar Conexão com Câmera
    const handleTestCamera = async (id) => {
        try {
            setTestingId(id);
            const resp = await api.post(`/cameras/${id}/testar`);
            const isOnline = resp.data?.online;
            setTestResults(prev => ({ ...prev, [id]: isOnline ? 'online' : 'offline' }));
            enqueueSnackbar(
                isOnline ? 'Câmera online e acessível na rede!' : 'Câmera offline ou inacessível no IP/porta informado.',
                { variant: isOnline ? 'success' : 'warning' }
            );
        } catch (err) {
            setTestResults(prev => ({ ...prev, [id]: 'offline' }));
            enqueueSnackbar('Falha ao comunicar com a câmera.', { variant: 'error' });
        } finally {
            setTestingId(null);
        }
    };

    // Salvar Catracas
    const handleSaveDevices = async () => {
        try {
            setSavingDevices(true);
            for (const d of dispositivos) {
                const payload = {
                    evento_id: eventoId,
                    nome: d.nome,
                    tipo: 'catraca',
                    marca: d.marca || 'intelbras',
                    ip_address: d.ip,
                    porta: parseInt(d.porta, 10),
                    user_device: d.user,
                    password_device: d.pass
                };
                if (d.isNew) {
                    await api.post('/dispositivos', payload);
                } else {
                    await api.put(`/dispositivos/${d.id}`, payload);
                }
            }
            enqueueSnackbar('Catracas e controladoras salvas com sucesso!', { variant: 'success' });
            fetchDevices();
        } catch (err) {
            enqueueSnackbar('Erro ao salvar catracas.', { variant: 'error' });
        } finally {
            setSavingDevices(false);
        }
    };

    return (
        <Box sx={{ p: { xs: 2, md: 4 } }}>
            <PageHeader
                title="Câmeras"
                subtitle="Câmeras IP usadas no monitor de CFTV e no reconhecimento por IA."
                breadcrumbs={[{ text: 'Sistema' }, { text: 'Configurações' }, { text: 'Câmeras IP' }]}
            />

            {/* BARRA SUPERIOR DE AÇÕES & ABAS */}
            <GlassCard sx={{ p: 2, mb: 3 }}>
                <Stack direction={{ xs: 'column', sm: 'row' }} justifyContent="space-between" alignItems="center" spacing={2}>
                    <Tabs
                        value={activeTab}
                        onChange={(e, v) => setActiveTab(v)}
                        textColor="inherit"
                        sx={{
                            '& .MuiTab-root': { fontWeight: 700, fontSize: '0.875rem' },
                            '& .Mui-selected': { color: '#00D4FF' },
                            '& .MuiTabs-indicator': { bgcolor: '#00D4FF', height: 3 }
                        }}
                    >
                        <Tab icon={<CameraIcon sx={{ mr: 1 }} />} iconPosition="start" label={`Câmeras IP (${cameras.length})`} />
                        <Tab icon={<DoorIcon sx={{ mr: 1 }} />} iconPosition="start" label={`Catracas e controladoras (${dispositivos.length})`} />
                    </Tabs>

                    <Stack direction="row" spacing={1.5}>
                        <Button
                            variant="outlined"
                            size="small"
                            startIcon={<OpenInNewIcon />}
                            onClick={() => navigate(`/monitor?evento_id=${eventoId}`)}
                            sx={{ borderColor: '#00FF88', color: '#00FF88', fontWeight: 700 }}
                        >
                            Abrir no monitor CFTV
                        </Button>
                        {activeTab === 0 && (
                            <NeonButton
                                size="small"
                                startIcon={<AddIcon />}
                                onClick={() => handleOpenModal()}
                            >
                                Cadastrar nova câmera
                            </NeonButton>
                        )}
                    </Stack>
                </Stack>
            </GlassCard>

            {/* ABA 0: CÂMERAS IP DO EVENTO */}
            {activeTab === 0 && (
                <Box>
                    {loadingCameras ? (
                        <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}>
                            <CircularProgress color="secondary" />
                        </Box>
                    ) : cameras.length === 0 ? (
                        <GlassCard sx={{ p: 6, textAlign: 'center' }}>
                            <CameraIcon sx={{ fontSize: 64, color: 'rgba(255,255,255,0.2)', mb: 2 }} />
                            <Typography variant="h6" fontWeight={700}>
                                Nenhuma câmera IP cadastrada para este evento
                            </Typography>
                            <Typography variant="body2" color="text.secondary" sx={{ maxWidth: 500, mx: 'auto', mt: 1, mb: 3 }}>
                                Cadastre aqui as câmeras de segurança, câmeras RTSP, webcams ou streams de vídeo.
                                Após cadastrá-las, elas ficarão disponíveis para você selecionar e visualizar na tela de <b>Monitoramento CFTV</b>.
                            </Typography>
                            <NeonButton startIcon={<AddIcon />} onClick={() => handleOpenModal()}>
                                Cadastrar primeira câmera
                            </NeonButton>
                        </GlassCard>
                    ) : (
                        <Grid container spacing={3}>
                            {cameras.map((cam) => {
                                const status = testResults[cam.id] || cam.status || 'unknown';
                                const isTesting = testingId === cam.id;
                                return (
                                    <Grid item xs={12} sm={6} lg={4} key={cam.id}>
                                        <GlassCard sx={{
                                            overflow: 'hidden',
                                            border: status === 'online' ? '1px solid rgba(0, 255, 136, 0.3)' : '1px solid rgba(255,255,255,0.08)',
                                            transition: 'all 0.3s ease',
                                            '&:hover': { transform: 'translateY(-3px)', boxShadow: '0 8px 30px rgba(0,0,0,0.5)' }
                                        }}>
                                            {/* Preview de Imagem / Snapshot */}
                                            <Box sx={{ position: 'relative', width: '100%', height: 180, bgcolor: '#000000', overflow: 'hidden' }}>
                                                <img
                                                    src={urlMidiaCamera(cam.id, 'snapshot', { t: Date.now() })}
                                                    alt={cam.nome}
                                                    style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                                                    onError={(e) => {
                                                        e.target.style.display = 'none';
                                                    }}
                                                />
                                                {/* Overlay de Status */}
                                                <Box sx={{
                                                    position: 'absolute', top: 10, left: 10, right: 10,
                                                    display: 'flex', justifyContent: 'space-between', alignItems: 'center'
                                                }}>
                                                    <Chip
                                                        label={status === 'online' ? 'Online' : status === 'offline' ? 'Offline' : 'CÂMERA IP'}
                                                        size="small"
                                                        color={status === 'online' ? 'success' : status === 'offline' ? 'error' : 'default'}
                                                        sx={{ fontWeight: 700, fontSize: '0.75rem' }}
                                                    />
                                                    <Chip
                                                        label={cam.fabricante || 'RTSP'}
                                                        size="small"
                                                        sx={{ bgcolor: 'rgba(0,0,0,0.7)', color: '#00D4FF', fontWeight: 700, fontSize: '0.75rem', border: '1px solid rgba(0,212,255,0.3)' }}
                                                    />
                                                </Box>

                                                {cam.area?.nome_area && (
                                                    <Box sx={{ position: 'absolute', bottom: 10, left: 10 }}>
                                                        <Chip
                                                            icon={<ShieldIcon sx={{ fontSize: 13, color: '#FFFFFF !important' }} />}
                                                            label={`Área: ${cam.area.nome_area}`}
                                                            size="small"
                                                            sx={{ bgcolor: 'rgba(0,0,0,0.75)', color: '#FFFFFF', fontWeight: 700, fontSize: '0.75rem' }}
                                                        />
                                                    </Box>
                                                )}
                                            </Box>

                                            {/* Informações da Câmera */}
                                            <Box sx={{ p: 2.5 }}>
                                                <Typography variant="h6" fontWeight={700} noWrap sx={{ color: '#FFFFFF' }}>
                                                    {cam.nome}
                                                </Typography>
                                                <Typography variant="body2" color="text.secondary" sx={{ fontFamily: '"Inter", sans-serif', fontSize: '0.8125rem', mt: 0.5 }}>
                                                    {cam.ip_address}:{cam.porta} • {cam.protocolo?.toUpperCase() || 'RTSP'}
                                                </Typography>

                                                <Typography variant="caption" sx={{ display: 'block', color: 'rgba(255,255,255,0.5)', mt: 1, noWrap: true, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                                    Stream: {cam.stream_url || 'Padrão / RTSP'}
                                                </Typography>

                                                {/* Ações */}
                                                <Stack direction="row" spacing={1} mt={2.5}>
                                                    <Button
                                                        variant="outlined"
                                                        size="small"
                                                        fullWidth
                                                        startIcon={isTesting ? <CircularProgress size={14} color="inherit" /> : <RefreshIcon />}
                                                        onClick={() => handleTestCamera(cam.id)}
                                                        disabled={isTesting}
                                                        sx={{ fontSize: '0.75rem', fontWeight: 700 }}
                                                    >
                                                        Testar
                                                    </Button>
                                                    <Button
                                                        variant="outlined"
                                                        size="small"
                                                        fullWidth
                                                        color="info"
                                                        startIcon={<TuneIcon />}
                                                        onClick={() => handleOpenModal(cam)}
                                                        sx={{ fontSize: '0.75rem', fontWeight: 700 }}
                                                    >
                                                        Editar
                                                    </Button>
                                                    <IconButton
                                                        color="error"
                                                        size="small"
                                                        onClick={() => handleDeleteCamera(cam.id)}
                                                        sx={{ bgcolor: 'rgba(255,0,80,0.1)', '&:hover': { bgcolor: 'rgba(255,0,80,0.3)' } }}
                                                    >
                                                        <DeleteIcon fontSize="small" />
                                                    </IconButton>
                                                </Stack>
                                            </Box>
                                        </GlassCard>
                                    </Grid>
                                );
                            })}
                        </Grid>
                    )}
                </Box>
            )}

            {/* ABA 1: CATRACAS & HARDWARE EDGE */}
            {activeTab === 1 && (
                <Grid container spacing={3}>
                    <Grid item xs={12} md={8}>
                        <GlassCard sx={{ p: 3 }}>
                            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
                                <Typography variant="h6" fontWeight={700}>
                                    Catracas e controladoras de acesso
                                </Typography>
                                <Button
                                    variant="outlined"
                                    size="small"
                                    startIcon={<AddIcon />}
                                    onClick={() => setDispositivos([...dispositivos, {
                                        id: Date.now().toString(),
                                        isNew: true,
                                        nome: 'Nova catraca',
                                        tipo: 'catraca',
                                        marca: 'intelbras',
                                        ip: '192.168.1.150',
                                        porta: 80,
                                        user: 'admin',
                                        pass: ''
                                    }])}
                                    sx={{ borderColor: '#FF3366', color: '#FF3366', fontWeight: 700 }}
                                >
                                    Nova catraca
                                </Button>
                            </Box>

                            {loadingDevices ? (
                                <CircularProgress />
                            ) : dispositivos.length === 0 ? (
                                <Typography variant="body2" color="text.secondary" sx={{ py: 4, textAlign: 'center' }}>
                                    Nenhuma catraca cadastrada.
                                </Typography>
                            ) : (
                                <Stack spacing={2}>
                                    {dispositivos.map((d, idx) => (
                                        <GlassCard key={d.id} sx={{ p: 2, borderLeft: '4px solid #FF3366' }}>
                                            <Grid container spacing={2} alignItems="center">
                                                <Grid item xs={12} sm={4}>
                                                    <TextField
                                                        label="Identificação" size="small" fullWidth
                                                        value={d.nome}
                                                        onChange={(e) => {
                                                            const val = e.target.value;
                                                            setDispositivos(prev => prev.map((item, i) => i === idx ? { ...item, nome: val } : item));
                                                        }}
                                                    />
                                                </Grid>
                                                <Grid item xs={6} sm={3}>
                                                    <TextField
                                                        label="IP da Catraca" size="small" fullWidth
                                                        value={d.ip}
                                                        onChange={(e) => {
                                                            const val = e.target.value;
                                                            setDispositivos(prev => prev.map((item, i) => i === idx ? { ...item, ip: val } : item));
                                                        }}
                                                    />
                                                </Grid>
                                                <Grid item xs={4} sm={2}>
                                                    <TextField
                                                        label="Porta" size="small" fullWidth
                                                        value={d.porta}
                                                        onChange={(e) => {
                                                            const val = e.target.value;
                                                            setDispositivos(prev => prev.map((item, i) => i === idx ? { ...item, porta: val } : item));
                                                        }}
                                                    />
                                                </Grid>
                                                <Grid item xs={2} sm={3} sx={{ textAlign: 'right' }}>
                                                    <IconButton
                                                        color="error" size="small"
                                                        onClick={() => setDispositivos(prev => prev.filter((_, i) => i !== idx))}
                                                    >
                                                        <DeleteIcon />
                                                    </IconButton>
                                                </Grid>
                                            </Grid>
                                        </GlassCard>
                                    ))}
                                </Stack>
                            )}

                            {dispositivos.length > 0 && (
                                <Box sx={{ mt: 3, display: 'flex', justifyContent: 'flex-end' }}>
                                    <NeonButton startIcon={<SaveIcon />} loading={savingDevices} onClick={handleSaveDevices}>
                                        Salvar catracas
                                    </NeonButton>
                                </Box>
                            )}
                        </GlassCard>
                    </Grid>

                    <Grid item xs={12} md={4}>
                        <GlassCard sx={{ p: 3, borderLeft: '3px solid #00D4FF' }}>
                            <Typography variant="subtitle1" fontWeight={700} color="#00D4FF" gutterBottom>
                                Sincronização em tempo real
                            </Typography>
                            <Typography variant="body2" color="text.secondary" paragraph>
                                As câmeras IP configuradas nesta tela tornam-se imediatamente elegíveis para serem ativadas no mosaico do Monitor e no Video Wall.
                            </Typography>
                            <Typography variant="body2" color="text.secondary">
                                O microserviço Python de Visão Computacional utiliza o stream RTSP dessas câmeras para rastrear rostos e comparar com a Watchlist a cada ciclo de vigilância.
                            </Typography>
                        </GlassCard>
                    </Grid>
                </Grid>
            )}

            {/* MODAL DE CADASTRO / EDIÇÃO DE CÂMERA */}
            <Dialog
                open={cameraModalOpen}
                onClose={() => setCameraModalOpen(false)}
                fullWidth
                maxWidth="sm"
            >
                <DialogTitle sx={{ fontWeight: 700, color: '#00D4FF', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
                    {editingCamera?.id ? 'EDITAR CÂMERA IP' : 'CADASTRAR NOVA CÂMERA IP'}
                </DialogTitle>
                <DialogContent sx={{ pt: 2.5 }}>
                    <Stack spacing={2.5}>
                        <TextField
                            label="Nome de identificação da câmera"
                            fullWidth
                            required
                            placeholder="Ex: Câmera Portão 1 - Entrada Principal, VIP Lounge"
                            value={editingCamera?.nome || ''}
                            onChange={(e) => setEditingCamera({ ...editingCamera, nome: e.target.value })}
                        />

                        <Grid container spacing={2}>
                            <Grid item xs={12} sm={6}>
                                <FormControl fullWidth required>
                                    <InputLabel>Fabricante / tipo</InputLabel>
                                    <Select
                                        label="Fabricante / tipo"
                                        value={editingCamera?.fabricante || 'RTSP / OBS / Webcam'}
                                        onChange={(e) => {
                                            const fab = e.target.value;
                                            const update = { ...editingCamera, fabricante: fab };
                                            if (fab === 'RTSP / OBS / Webcam') {
                                                update.porta = 8554;
                                                update.usuario = update.usuario || 'a2eventos';
                                                update.protocolo = 'rtsp';
                                            } else if (fab === 'Intelbras' || fab === 'Hikvision') {
                                                update.porta = 554;
                                                update.protocolo = 'rtsp';
                                            }
                                            setEditingCamera(update);
                                        }}
                                    >
                                        {FABRICANTES.map(f => <MenuItem key={f} value={f}>{f}</MenuItem>)}
                                    </Select>
                                </FormControl>
                            </Grid>

                            <Grid item xs={12} sm={6}>
                                <FormControl fullWidth>
                                    <InputLabel>Área / setor do evento</InputLabel>
                                    <Select
                                        label="Área / setor do evento"
                                        value={editingCamera?.area_id || ''}
                                        onChange={(e) => setEditingCamera({ ...editingCamera, area_id: e.target.value })}
                                    >
                                        <MenuItem value=""><em>Nenhuma / geral</em></MenuItem>
                                        {areas.map(a => (
                                            <MenuItem key={a.id} value={a.id}>
                                                {a.nome_area || a.nome}
                                            </MenuItem>
                                        ))}
                                    </Select>
                                </FormControl>
                            </Grid>
                        </Grid>

                        <Grid container spacing={2}>
                            <Grid item xs={12} sm={8}>
                                <TextField
                                    label="Endereço IP na rede"
                                    fullWidth
                                    required
                                    placeholder="Ex: 192.168.1.108 ou 127.0.0.1"
                                    value={editingCamera?.ip_address || ''}
                                    onChange={(e) => setEditingCamera({ ...editingCamera, ip_address: e.target.value })}
                                />
                            </Grid>
                            <Grid item xs={12} sm={4}>
                                <TextField
                                    label="Porta RTSP"
                                    type="number"
                                    fullWidth
                                    value={editingCamera?.porta || 554}
                                    onChange={(e) => setEditingCamera({ ...editingCamera, porta: e.target.value })}
                                />
                            </Grid>
                        </Grid>

                        <Grid container spacing={2}>
                            <Grid item xs={12} sm={6}>
                                <TextField
                                    label="Usuário da câmera"
                                    fullWidth
                                    placeholder="Ex: admin"
                                    value={editingCamera?.usuario || ''}
                                    onChange={(e) => setEditingCamera({ ...editingCamera, usuario: e.target.value })}
                                />
                            </Grid>
                            <Grid item xs={12} sm={6}>
                                <TextField
                                    label="Senha da câmera"
                                    type="password"
                                    fullWidth
                                    placeholder="Senha de acesso"
                                    value={editingCamera?.senha || ''}
                                    onChange={(e) => setEditingCamera({ ...editingCamera, senha: e.target.value })}
                                />
                            </Grid>
                        </Grid>

                        <TextField
                            label="URL de stream RTSP (opcional / gerada automaticamente)"
                            fullWidth
                            placeholder="rtsp://usuario:senha@ip:porta/live"
                            value={editingCamera?.stream_url || ''}
                            onChange={(e) => setEditingCamera({ ...editingCamera, stream_url: e.target.value })}
                            helperText="Deixe em branco para o sistema compor automaticamente a URL com base no IP e fabricante."
                        />
                    </Stack>
                </DialogContent>
                <DialogActions sx={{ p: 2.5, borderTop: '1px solid rgba(255,255,255,0.08)' }}>
                    <Button variant="outlined" onClick={() => setCameraModalOpen(false)} sx={botaoSecundario}>Cancelar</Button>
                    <NeonButton
                        loading={savingCamera}
                        startIcon={<SaveIcon />}
                        onClick={handleSaveCamera}
                    >
                        {editingCamera?.id ? 'Salvar alterações' : 'Cadastrar câmera'}
                    </NeonButton>
                </DialogActions>
            </Dialog>
        </Box>
    );
};

export default ConfigCameras;
