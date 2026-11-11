import React, { useState, useEffect, useCallback } from 'react';
import {
    Box, Typography, Grid, Button, Chip, Stack,
    IconButton, CircularProgress, Tabs, Tab
} from '@mui/material';
import {
    Videocam as CameraIcon, VideoLibrary as GravacoesIcon,
    Psychology as IaIcon, Add as AddIcon, Delete as DeleteIcon,
    Refresh as RefreshIcon, OpenInNew as OpenInNewIcon, Shield as ShieldIcon,
    Tune as TuneIcon, PowerSettingsNew as PowerIcon
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
import CameraFormDialog from '../../components/cameras/CameraFormDialog';
import CamerasEventoBarra from '../../components/cameras/CamerasEventoBarra';
import GravacoesPainel from '../../components/cameras/GravacoesPainel';
import SeletorModo from '../../components/cameras/SeletorModo';
import { MODOS_IA, MODOS_GRAVACAO, modoIaDe, camposDoModoIa } from '../../components/cameras/opcoesCamera';

const ABAS = { cameras: 0, gravacoes: 1, ia: 2 };

/**
 * Situação de uma câmera em linguagem simples. O vídeo não depende mais do motor de IA: com IA
 * ligada vale o que o motor vê agora; sem IA, o último teste de conexão.
 */
const situacaoCamera = (cam, status, isDesativada, st, iaErro, motorLigado) => {
    if (isDesativada) {
        return { cor: '#FFB800', titulo: 'Desativada', detalhe: 'Sem vídeo, IA e gravação.', chips: [] };
    }
    const chips = [];
    const modo = modoIaDe(cam);
    if (modo === 'monitorar') chips.push('Não usa o motor de IA');
    else if (motorLigado === false) chips.push('Motor de IA desligado no evento');
    else if (st?.ia_analisando) chips.push(st.rostos ? `IA analisando · ${st.rostos} rosto(s)` : 'IA analisando');
    else if (st) chips.push(modo === '24h' ? 'IA em espera (sem movimento)' : 'IA em espera (ninguém assistindo)');
    else if (iaErro) chips.push('Motor de IA do evento indisponível');
    if (cam.gravacao_modo === 'continua') chips.push('Gravando sempre');
    if (cam.gravacao_modo === 'alertas') chips.push('Grava em alertas');

    if (modo !== 'monitorar' && st) {
        if (st.conectada && st.video_fps) chips.push(`${Math.round(st.video_fps)} quadros/s`);
        return st.conectada
            ? { cor: '#00FF88', titulo: 'Online', detalhe: 'Recebendo vídeo agora.', chips }
            : { cor: '#FF3366', titulo: 'Sem sinal', detalhe: 'O PC do evento não está recebendo o vídeo desta câmera.', chips };
    }
    if (status === 'online') return { cor: '#00FF88', titulo: 'Online', detalhe: 'Respondeu ao último teste.', chips };
    if (status === 'offline') return { cor: '#FF3366', titulo: 'Offline', detalhe: 'Não respondeu ao último teste.', chips };
    return { cor: '#94A3B8', titulo: 'Não verificada', detalhe: 'Toque em Testar para checar a conexão.', chips };
};

const ConfigCameras = ({ abaInicial = null }) => {
    const confirmar = useConfirmacao();
    const { enqueueSnackbar } = useSnackbar();
    const [searchParams] = useSearchParams();
    const navigate = useNavigate();
    const eventoId = searchParams.get('evento_id') || localStorage.getItem('active_evento_id');

    // 0 = Câmeras, 1 = Gravações, 2 = Motor de IA facial (/config/ia-facial abre direto nesta aba)
    const [activeTab, setActiveTab] = useState(ABAS[abaInicial] ?? 0);
    const [cameras, setCameras] = useState([]);
    const [areas, setAreas] = useState([]);
    const [loadingCameras, setLoadingCameras] = useState(true);
    // Situação ao vivo das câmeras com IA (vídeo chegando, fps, IA), atualizada a cada 15 s
    const temCameraComIa = cameras.some(c => c.ia_ativa === true);
    const { status: iaStatus, erro: iaErro } = useIaStatus(activeTab === 0 && temCameraComIa, 15000);
    // null = ainda não se sabe (não assume ligado nem desligado)
    const [motorLigado, setMotorLigado] = useState(null);

    // Dialog de Câmera (Criar / Editar)
    const [cameraModalOpen, setCameraModalOpen] = useState(false);
    const [editingCamera, setEditingCamera] = useState(null);
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

    useEffect(() => {
        api.get('/cameras/evento-config', { hideDefaultError: true })
            .then(({ data }) => setMotorLigado(data.data?.motor_ia_ativo !== false))
            .catch(() => {
                setMotorLigado(null);
                enqueueSnackbar('Não foi possível verificar se o motor de IA do evento está ligado.', { variant: 'warning' });
            });
    }, [activeTab]);

    // Abrir Modal de Câmera
    const handleOpenModal = (camera = null) => {
        setEditingCamera(camera);
        setCameraModalOpen(true);
    };

    /** Muda o modo de IA ou de gravação direto no cartão (salva na hora) */
    const mudarOpcao = async (cam, campos, mensagem) => {
        const anterior = { ...cam };
        setCameras(prev => prev.map(c => c.id === cam.id ? { ...c, ...campos } : c));
        try {
            await api.put(`/cameras/${cam.id}`, campos);
            enqueueSnackbar(mensagem, { variant: 'success' });
        } catch (err) {
            setCameras(prev => prev.map(c => c.id === cam.id ? anterior : c));
            enqueueSnackbar(err.response?.data?.error || 'Não foi possível salvar a opção da câmera.', { variant: 'error' });
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
                subtitle="As câmeras funcionam sem IA. Ligue o reconhecimento facial e a gravação só onde precisar."
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
                        <Tab icon={<CameraIcon sx={{ mr: 1 }} />} iconPosition="start" label={`Câmeras (${cameras.length})`} />
                        <Tab icon={<GravacoesIcon sx={{ mr: 1 }} />} iconPosition="start" label="Gravações" />
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
                {activeTab === 0 && (
                    <Box sx={{ mt: 2, pt: 2, borderTop: '1px solid rgba(255,255,255,0.08)' }}>
                        <CamerasEventoBarra />
                    </Box>
                )}
            </GlassCard>

            {/* ABA 1: GRAVAÇÕES (ficam no PC do evento) */}
            {activeTab === 1 && <GravacoesPainel cameras={cameras} />}

            {/* ABA 0: CÂMERAS DO EVENTO */}
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
                                                const sit = situacaoCamera(cam, status, isDesativada, statusDaCamera(iaStatus, cam.id), iaErro, motorLigado);
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
                                                </Stack>

                                                <Typography variant="body2" color="text.secondary" sx={{ fontFamily: '"Inter", sans-serif', fontSize: '0.8125rem', mt: 0.5 }}>
                                                    {cam.ip_address}:{cam.porta} • {cam.protocolo?.toUpperCase() || 'RTSP'}
                                                </Typography>

                                                <Stack spacing={1.5} sx={{ mt: 2 }}>
                                                    <SeletorModo compacto id={`ia-${cam.id}`} rotulo="Inteligência" opcoes={MODOS_IA}
                                                        valor={modoIaDe(cam)} disabled={isDesativada}
                                                        onChange={(m) => mudarOpcao(cam, camposDoModoIa(m),
                                                            `${cam.nome}: ${MODOS_IA.find(o => o.valor === m).rotulo}.`)} />
                                                    <SeletorModo compacto id={`grav-${cam.id}`} rotulo="Gravação" opcoes={MODOS_GRAVACAO}
                                                        valor={cam.gravacao_modo || 'desligada'} disabled={isDesativada}
                                                        onChange={(m) => mudarOpcao(cam, { gravacao_modo: m },
                                                            `${cam.nome}: gravação ${MODOS_GRAVACAO.find(o => o.valor === m).rotulo.toLowerCase()}.`)} />
                                                </Stack>

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

            {/* ABA 2: MOTOR DE IA (as catracas são cadastradas em Leitores e dispositivos) */}
            {activeTab === 2 && <ConfigIAFacial embutido />}

            {/* CADASTRO / EDIÇÃO DE CÂMERA (mesmo formulário do Monitor) */}
            <CameraFormDialog
                open={cameraModalOpen}
                camera={editingCamera}
                areas={areas}
                eventoId={eventoId}
                onClose={() => setCameraModalOpen(false)}
                onSalvo={fetchCameras}
            />
        </Box>
    );
};

export default ConfigCameras;
