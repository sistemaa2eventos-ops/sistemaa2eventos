import React, { useState, useEffect, useCallback } from 'react';
import {
    Box, Typography, Grid, TextField, Button, Chip, Stack, MenuItem,
    IconButton, CircularProgress, Dialog, DialogTitle, DialogContent,
    DialogActions, FormControl, InputLabel, Select,
    Tabs, Tab, Switch, FormControlLabel, Tooltip
} from '@mui/material';
import {
    Save as SaveIcon, Videocam as CameraIcon,
    Psychology as IaIcon, Add as AddIcon, Delete as DeleteIcon,
    Refresh as RefreshIcon, OpenInNew as OpenInNewIcon, Shield as ShieldIcon,
    Tune as TuneIcon, PowerSettingsNew as PowerIcon, Face as FaceIcon
} from '@mui/icons-material';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { useSnackbar } from 'notistack';
import api from '../../services/api';
import { useIaStatus, statusDaCamera } from '../../hooks/useIaConfig';
import GlassCard from '../../components/common/GlassCard';
import NeonButton from '../../components/common/NeonButton';
import PageHeader from '../../components/common/PageHeader';
import ConfigIAFacial from './ConfigIAFacial';
import { useConfirmacao } from '../../contexts/ConfirmacaoContext';

import { botaoSecundario } from '../../styles/tokens';
const FABRICANTES = ['RTSP / OBS / Webcam', 'Intelbras', 'Hikvision', 'Genérica'];

/**
 * Situação de uma câmera em linguagem simples. Quando o motor de IA está acompanhando a câmera,
 * vale o que ele vê agora (vídeo chegando ou não); senão, o último teste de rede.
 */
const situacaoCamera = (cam, status, isDesativada, st, iaErro) => {
    if (isDesativada) {
        return { cor: '#FFB800', titulo: 'Desativada', detalhe: 'Vídeo e reconhecimento facial pausados.', chips: [] };
    }
    if (st) {
        const chips = [];
        if (st.conectada) {
            if (st.video_fps) chips.push(`${Math.round(st.video_fps)} quadros/s`);
            const res = st.resolucao?.principal || st.resolucao?.sub;
            if (res) chips.push(Array.isArray(res) ? res.join('×') : String(res));
        }
        if (cam.ia_ativa === false || st.ia_ativa === false) chips.push('IA pausada');
        else if (st.ia_analisando) chips.push(st.rostos ? `IA analisando • ${st.rostos} rosto(s)` : 'IA analisando');
        else chips.push('IA em espera (sem movimento)');
        return st.conectada
            ? { cor: '#00FF88', titulo: 'Online', detalhe: 'Recebendo vídeo agora.', chips }
            : { cor: '#FF3366', titulo: 'Sem sinal', detalhe: 'O servidor do evento não está recebendo o vídeo desta câmera.', chips };
    }
    const semMotor = iaErro ? ['Servidor de IA do evento indisponível'] : [];
    if (status === 'online') return { cor: '#00FF88', titulo: 'Online', detalhe: 'Respondeu ao último teste de rede.', chips: semMotor };
    if (status === 'offline') return { cor: '#FF3366', titulo: 'Offline', detalhe: 'Não respondeu ao último teste de rede.', chips: semMotor };
    return { cor: '#94A3B8', titulo: 'Não verificada', detalhe: 'Toque em Testar para checar a conexão.', chips: semMotor };
};

const ConfigCameras = ({ abaInicial = null }) => {
    const confirmar = useConfirmacao();
    const { enqueueSnackbar } = useSnackbar();
    const [searchParams] = useSearchParams();
    const navigate = useNavigate();
    const eventoId = searchParams.get('evento_id') || localStorage.getItem('active_evento_id');

    // 0 = Câmeras IP, 1 = Motor de IA facial (/config/ia-facial abre direto nesta aba)
    const [activeTab, setActiveTab] = useState(abaInicial === 'ia' ? 1 : 0);
    const [cameras, setCameras] = useState([]);
    const [areas, setAreas] = useState([]);
    const [loadingCameras, setLoadingCameras] = useState(true);
    // Prévia renovada só ao recarregar a lista (antes cada tecla digitada no cadastro baixava todas de novo)
    // Situação ao vivo de cada câmera (vídeo chegando, fps, IA), atualizada a cada 15 s
    const { status: iaStatus, erro: iaErro } = useIaStatus(activeTab === 0, 15000);

    // Dialog de Câmera (Criar / Editar)
    const [cameraModalOpen, setCameraModalOpen] = useState(false);
    const [editingCamera, setEditingCamera] = useState(null);
    const [savingCamera, setSavingCamera] = useState(false);
    const [testingId, setTestingId] = useState(null);
    const [testResults, setTestResults] = useState({});
    const [togglingId, setTogglingId] = useState(null);
    const [togglingAll, setTogglingAll] = useState(false);

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

    useEffect(() => {
        fetchCameras();
        fetchAreas();
    }, [fetchCameras, fetchAreas]);

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
                area_id: areas[0]?.id || '',
                ia_ativa: true,
                vigilancia_ativa: true,
                prioridade: 1,
                url_substream: ''
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
            setCameras(prev => prev.map(c => c.id === id ? { ...c, status: isOnline ? 'online' : 'offline' } : c));
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

    // Ativar / Desativar Câmera Individualmente (Sem Excluir)
    const handleToggleCameraStatus = async (cam) => {
        const isDesativada = cam.status === 'desativada' || cam.status === 'inativa';
        const novoStatus = isDesativada ? 'offline' : 'desativada';
        try {
            setTogglingId(cam.id);
            await api.put(`/cameras/${cam.id}`, { status: novoStatus });
            setTestResults(prev => {
                const copy = { ...prev };
                delete copy[cam.id];
                return copy;
            });
            setCameras(prev => prev.map(c => c.id === cam.id ? { ...c, status: novoStatus } : c));
            if (isDesativada) {
                enqueueSnackbar(`Câmera "${cam.nome}" reativada! Testando sinal...`, { variant: 'info' });
                handleTestCamera(cam.id);
            } else {
                enqueueSnackbar(`Câmera "${cam.nome}" desativada. Vídeo e IA pausados.`, { variant: 'warning' });
            }
        } catch (err) {
            enqueueSnackbar('Erro ao alterar status da câmera.', { variant: 'error' });
        } finally {
            setTogglingId(null);
        }
    };

    // Ativar / Pausar apenas a IA Facial da câmera
    const handleToggleCameraIa = async (cam) => {
        const novaIa = cam.ia_ativa === false;
        try {
            setTogglingId(cam.id);
            setCameras(prev => prev.map(c => c.id === cam.id ? { ...c, ia_ativa: novaIa } : c));
            await api.put(`/cameras/${cam.id}`, { ia_ativa: novaIa });
            enqueueSnackbar(
                novaIa ? `Reconhecimento facial ativado em "${cam.nome}".` : `Reconhecimento facial pausado em "${cam.nome}".`,
                { variant: novaIa ? 'success' : 'info' }
            );
        } catch (err) {
            setCameras(prev => prev.map(c => c.id === cam.id ? { ...c, ia_ativa: !novaIa } : c));
            enqueueSnackbar('Erro ao atualizar IA da câmera.', { variant: 'error' });
        } finally {
            setTogglingId(null);
        }
    };

    // Desativar / Ativar Todas as Câmeras do Evento
    const temCameraAtiva = cameras.some(c => c.status !== 'desativada' && c.status !== 'inativa');
    const handleToggleAllCameras = async () => {
        if (cameras.length === 0) return;
        const desativar = temCameraAtiva;
        if (desativar) {
            const ok = await confirmar({
                titulo: 'Desativar todas as câmeras',
                mensagem: `Deseja pausar todas as ${cameras.length} câmera(s) deste evento? As conexões de vídeo e IA serão encerradas imediatamente, mantendo os cadastros salvos.`,
                textoConfirmar: 'Desativar todas'
            });
            if (!ok) return;
        }
        try {
            setTogglingAll(true);
            const novoStatus = desativar ? 'desativada' : 'offline';
            await Promise.all(cameras.map(c => api.put(`/cameras/${c.id}`, { status: novoStatus })));
            setTestResults({});
            setCameras(prev => prev.map(c => ({ ...c, status: novoStatus })));
            enqueueSnackbar(
                desativar ? 'Todas as câmeras foram desativadas.' : 'Todas as câmeras foram reativadas!',
                { variant: desativar ? 'warning' : 'success' }
            );
        } catch (err) {
            enqueueSnackbar('Erro ao alterar status das câmeras.', { variant: 'error' });
            fetchCameras();
        } finally {
            setTogglingAll(false);
        }
    };

    return (
        <Box sx={{ p: { xs: 2, md: 4 } }}>
            <PageHeader
                title="Câmeras e IA facial"
                subtitle="Cadastre as câmeras IP e ajuste o motor de reconhecimento facial."
                breadcrumbs={[{ text: 'Configurações' }, { text: 'Equipamentos' }, { text: 'Câmeras e IA facial' }]}
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
                        <Tab icon={<IaIcon sx={{ mr: 1 }} />} iconPosition="start" label="Motor de IA facial" />
                    </Tabs>

                    <Stack direction="row" spacing={1.5} flexWrap="wrap" useFlexGap>
                        {activeTab === 0 && cameras.length > 0 && (
                            <Button
                                variant="outlined"
                                size="small"
                                color={temCameraAtiva ? 'warning' : 'success'}
                                startIcon={togglingAll ? <CircularProgress size={14} color="inherit" /> : <PowerIcon />}
                                onClick={handleToggleAllCameras}
                                disabled={togglingAll}
                                sx={{ fontWeight: 700 }}
                            >
                                {temCameraAtiva ? 'Desativar todas' : 'Ativar todas'}
                            </Button>
                        )}
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
                                const isDesativada = cam.status === 'desativada' || cam.status === 'inativa';
                                const status = isDesativada ? 'desativada' : (testResults[cam.id] || cam.status || 'unknown');
                                const isTesting = testingId === cam.id;
                                const isToggling = togglingId === cam.id;
                                return (
                                    <Grid item xs={12} sm={6} lg={4} key={cam.id}>
                                        <GlassCard sx={{
                                            overflow: 'hidden',
                                            opacity: isDesativada ? 0.72 : 1,
                                            border: isDesativada
                                                ? '1px dashed rgba(255, 184, 0, 0.35)'
                                                : status === 'online'
                                                    ? '1px solid rgba(0, 255, 136, 0.3)'
                                                    : '1px solid rgba(255,255,255,0.08)',
                                            transition: 'all 0.3s ease',
                                            '&:hover': { transform: 'translateY(-3px)', boxShadow: '0 8px 30px rgba(0,0,0,0.5)' }
                                        }}>
                                            {/* Situação da câmera (as imagens ficam no Monitoramento) */}
                                            {(() => {
                                                const sit = situacaoCamera(cam, status, isDesativada, statusDaCamera(iaStatus, cam.id), iaErro);
                                                return (
                                                    <Box sx={{ p: 2, borderBottom: '1px solid rgba(255,255,255,0.06)', bgcolor: `${sit.cor}0F` }}>
                                                        <Stack direction="row" alignItems="center" spacing={1.25}>
                                                            <Box sx={{ width: 12, height: 12, borderRadius: '50%', flexShrink: 0, bgcolor: sit.cor, boxShadow: `0 0 10px ${sit.cor}` }} />
                                                            <Box sx={{ minWidth: 0 }}>
                                                                <Typography fontWeight={700} sx={{ color: sit.cor, lineHeight: 1.25 }}>{sit.titulo}</Typography>
                                                                <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.6)', display: 'block' }}>{sit.detalhe}</Typography>
                                                            </Box>
                                                        </Stack>
                                                        <Stack direction="row" spacing={0.75} useFlexGap flexWrap="wrap" sx={{ mt: 1.25 }}>
                                                            {sit.chips.map((c) => (
                                                                <Chip key={c} label={c} size="small" sx={{ bgcolor: 'rgba(255,255,255,0.06)', color: 'rgba(255,255,255,0.8)', fontWeight: 600, fontSize: '0.72rem' }} />
                                                            ))}
                                                            <Chip label={cam.fabricante || 'RTSP'} size="small" sx={{ bgcolor: 'rgba(0,0,0,0.4)', color: '#00D4FF', fontWeight: 700, fontSize: '0.72rem', border: '1px solid rgba(0,212,255,0.3)' }} />
                                                            {cam.area?.nome_area && (
                                                                <Chip
                                                                    icon={<ShieldIcon sx={{ fontSize: 13, color: '#FFFFFF !important' }} />}
                                                                    label={cam.area.nome_area}
                                                                    size="small"
                                                                    sx={{ bgcolor: 'rgba(0,0,0,0.4)', color: '#FFFFFF', fontWeight: 600, fontSize: '0.72rem' }}
                                                                />
                                                            )}
                                                        </Stack>
                                                    </Box>
                                                );
                                            })()}

                                            {/* Informações da Câmera */}
                                            <Box sx={{ p: 2.5 }}>
                                                <Stack direction="row" justifyContent="space-between" alignItems="center" spacing={1}>
                                                    <Typography variant="h6" fontWeight={700} noWrap sx={{ color: '#FFFFFF', flex: 1 }}>
                                                        {cam.nome}
                                                    </Typography>
                                                    <Tooltip title={cam.ia_ativa === false ? 'Reconhecimento facial desligado nesta câmera (clique para ligar)' : 'Reconhecimento facial ativo (clique para pausar só a IA)'}>
                                                        <Chip
                                                            icon={<FaceIcon sx={{ fontSize: 14 }} />}
                                                            label={cam.ia_ativa === false ? 'IA pausada' : 'IA ativa'}
                                                            size="small"
                                                            onClick={() => handleToggleCameraIa(cam)}
                                                            disabled={isToggling || isDesativada}
                                                            sx={{
                                                                cursor: 'pointer',
                                                                fontWeight: 700,
                                                                fontSize: '0.7rem',
                                                                bgcolor: cam.ia_ativa === false ? 'rgba(255,255,255,0.06)' : 'rgba(0, 212, 255, 0.14)',
                                                                color: cam.ia_ativa === false ? '#94A3B8' : '#00D4FF',
                                                                border: '1px solid currentColor'
                                                            }}
                                                        />
                                                    </Tooltip>
                                                </Stack>

                                                <Typography variant="body2" color="text.secondary" sx={{ fontFamily: '"Inter", sans-serif', fontSize: '0.8125rem', mt: 0.5 }}>
                                                    {cam.ip_address}:{cam.porta} • {cam.protocolo?.toUpperCase() || 'RTSP'}
                                                </Typography>

                                                <Typography variant="caption" sx={{ display: 'block', color: 'rgba(255,255,255,0.5)', mt: 1, noWrap: true, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                                    Stream: {cam.stream_url || 'Padrão / RTSP'}
                                                </Typography>

                                                {/* Ações */}
                                                <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap" mt={2.5} sx={{ '& .MuiButton-root': { flex: '1 1 30%', minWidth: 96 } }}>
                                                    <Button
                                                        variant={isDesativada ? 'contained' : 'outlined'}
                                                        color={isDesativada ? 'success' : 'warning'}
                                                        size="small"
                                                        fullWidth
                                                        startIcon={isToggling ? <CircularProgress size={14} color="inherit" /> : <PowerIcon />}
                                                        onClick={() => handleToggleCameraStatus(cam)}
                                                        disabled={isToggling}
                                                        sx={{ fontSize: '0.75rem', fontWeight: 700 }}
                                                    >
                                                        {isDesativada ? 'Ativar' : 'Desativar'}
                                                    </Button>
                                                    {!isDesativada && (
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
                                                    )}
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

            {/* ABA 1: MOTOR DE IA (as catracas são cadastradas em Leitores e dispositivos) */}
            {activeTab === 1 && <ConfigIAFacial embutido />}

            {/* MODAL DE CADASTRO / EDIÇÃO DE CÂMERA */}
            <Dialog
                open={cameraModalOpen}
                onClose={() => setCameraModalOpen(false)}
                fullWidth
                maxWidth="sm"
            >
                <DialogTitle sx={{ fontWeight: 700, borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
                    {editingCamera?.id ? 'Editar câmera IP' : 'Cadastrar nova câmera IP'}
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

                        <Typography variant="subtitle2" sx={{ fontWeight: 700, pt: 0.5 }}>
                            Status e reconhecimento facial
                        </Typography>
                        <Grid container spacing={2} alignItems="center">
                            <Grid item xs={12} sm={4}>
                                <FormControlLabel
                                    control={
                                        <Switch
                                            checked={editingCamera?.status !== 'desativada' && editingCamera?.status !== 'inativa'}
                                            onChange={(e) => setEditingCamera({
                                                ...editingCamera,
                                                status: e.target.checked ? 'offline' : 'desativada'
                                            })}
                                        />
                                    }
                                    label="Câmera ativa"
                                />
                            </Grid>
                            <Grid item xs={12} sm={4}>
                                <FormControlLabel
                                    control={
                                        <Switch
                                            checked={editingCamera?.ia_ativa !== false}
                                            onChange={(e) => setEditingCamera({ ...editingCamera, ia_ativa: e.target.checked })}
                                        />
                                    }
                                    label="IA ligada"
                                />
                            </Grid>
                            <Grid item xs={12} sm={4}>
                                <FormControlLabel
                                    control={
                                        <Switch
                                            checked={editingCamera?.vigilancia_ativa !== false && editingCamera?.ia_ativa !== false}
                                            disabled={editingCamera?.ia_ativa === false}
                                            onChange={(e) => setEditingCamera({ ...editingCamera, vigilancia_ativa: e.target.checked })}
                                        />
                                    }
                                    label="Vigilância 24 h"
                                />
                            </Grid>
                        </Grid>
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
