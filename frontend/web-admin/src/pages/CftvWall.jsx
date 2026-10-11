import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import {
    Box, Typography, Grid, Stack, Button, IconButton, Chip,
    Dialog, DialogTitle, DialogContent, DialogActions,
    Checkbox, FormControlLabel, FormGroup, Tooltip, Fade
} from '@mui/material';
import {
    Fullscreen as FullscreenIcon, FullscreenExit as FullscreenExitIcon,
    GridView as Grid2x2Icon, ViewModule as Grid3x3Icon, ViewComfy as Grid4x4Icon,
    CropSquare as Grid1x1Icon,
    VolumeUp as SoundIcon, VolumeOff as MuteIcon,
    Tune as TuneIcon, NotificationsActive as AlarmIcon,
    Close as CloseIcon, CameraAlt as SnapshotIcon,
    Shield as ShieldIcon, CheckCircle as CheckCircleIcon,
    Videocam as CameraIcon
} from '@mui/icons-material';
import { useSearchParams } from 'react-router-dom';
import { useSnackbar } from 'notistack';
import api from '../services/api';
import { urlMidiaCamera } from '../utils/cameraMedia';
import PessoaFoto from '../components/common/PessoaFoto';
import { usarConexao } from '../services/realtime';
import { useAuth } from '../contexts/AuthContext';

import { comoRotulo } from '../utils/formatadores';
const CftvWall = () => {
    const { enqueueSnackbar } = useSnackbar();
    const { user } = useAuth();
    // Varredura de IA alerta sobre watchlist (sigilosa): só Admin Master, como no Monitor
    const isAdminMaster = user?.nivel_acesso === 'admin_master';
    const [searchParams] = useSearchParams();
    const eventoId = searchParams.get('evento_id') || localStorage.getItem('active_evento_id');

    // Layout do Mosaico: '1x1', '2x2', '3x3', '4x4', '1+5'
    const [layout, setLayout] = useState(() => {
        return localStorage.getItem('cftv_wall_layout') || '2x2';
    });

    const [cameras, setCameras] = useState([]);
    const [selectedCameraIds, setSelectedCameraIds] = useState(() => {
        try {
            const saved = localStorage.getItem('cftv_selected_cameras_ids');
            return saved ? JSON.parse(saved) : [];
        } catch {
            return [];
        }
    });

    const [isFullscreen, setIsFullscreen] = useState(false);
    const [soundEnabled, setSoundEnabled] = useState(true);
    const [openSelectModal, setOpenSelectModal] = useState(false);
    const [focusedCamId, setFocusedCamId] = useState(null);
    const [currentTime, setCurrentTime] = useState(new Date().toLocaleTimeString());

    // Alertas e Rastreamento em Tempo Real
    const [activeAlert, setActiveAlert] = useState(null);
    const [alertCameras, setAlertCameras] = useState({}); // { [camId]: timestamp }
    const notifiedTargetsRef = useRef(new Set());
    const isScanningRef = useRef(false);

    // Relógio OSD em tempo real
    useEffect(() => {
        const timer = setInterval(() => {
            setCurrentTime(new Date().toLocaleTimeString());
        }, 1000);
        return () => clearInterval(timer);
    }, []);

    // Carregar Câmeras do Evento
    const fetchCameras = useCallback(async () => {
        if (!eventoId) return;
        try {
            const resp = await api.get('/cameras', { params: { evento_id: eventoId }, timeout: 8000, hideDefaultError: true });
            const camList = resp.data.data || [];
            setCameras(camList);

            // Se ainda não houver seleção salva, selecionar todas as disponíveis
            if (selectedCameraIds.length === 0 && camList.length > 0) {
                const allIds = camList.map(c => c.id);
                setSelectedCameraIds(allIds);
                localStorage.setItem('cftv_selected_cameras_ids', JSON.stringify(allIds));
            }
        } catch (err) {
            console.error('Erro ao buscar câmeras do CFTV:', err);
        }
    }, [eventoId, selectedCameraIds.length]);

    useEffect(() => {
        fetchCameras();
    }, [fetchCameras]);

    // Salvar Layout
    const handleLayoutChange = (newLayout) => {
        setLayout(newLayout);
        localStorage.setItem('cftv_wall_layout', newLayout);
    };

    // Alternar Seleção de Câmera
    const toggleCameraSelection = (camId) => {
        setSelectedCameraIds(prev => {
            const updated = prev.includes(camId)
                ? prev.filter(id => id !== camId)
                : [...prev, camId];
            localStorage.setItem('cftv_selected_cameras_ids', JSON.stringify(updated));
            return updated;
        });
    };

    const selectAllCameras = () => {
        const allIds = cameras.map(c => c.id);
        setSelectedCameraIds(allIds);
        localStorage.setItem('cftv_selected_cameras_ids', JSON.stringify(allIds));
    };

    const clearAllCameras = () => {
        setSelectedCameraIds([]);
        localStorage.setItem('cftv_selected_cameras_ids', JSON.stringify([]));
    };

    // Áudio Sirene
    const playAlarmSound = useCallback(() => {
        if (!soundEnabled) return;
        try {
            const ctx = new (window.AudioContext || window.webkitAudioContext)();
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.type = 'sawtooth';
            osc.frequency.setValueAtTime(850, ctx.currentTime);
            osc.frequency.exponentialRampToValueAtTime(420, ctx.currentTime + 0.35);
            gain.gain.setValueAtTime(0.18, ctx.currentTime);
            gain.gain.linearRampToValueAtTime(0.01, ctx.currentTime + 0.35);
            osc.connect(gain);
            gain.connect(ctx.destination);
            osc.start();
            osc.stop(ctx.currentTime + 0.35);
        } catch {
            // áudio indisponível
        }
    }, [soundEnabled]);

    // Alternar Tela Cheia
    const toggleFullscreen = () => {
        if (!document.fullscreenElement) {
            document.documentElement.requestFullscreen().then(() => setIsFullscreen(true)).catch(() => {});
        } else {
            document.exitFullscreen().then(() => setIsFullscreen(false)).catch(() => {});
        }
    };

    // Concluir Rastreamento
    const handleConcluirRastreamento = async (cpf) => {
        if (!eventoId || !cpf) return;
        try {
            const cpfLimpo = String(cpf).replace(/\D/g, '');
            notifiedTargetsRef.current.delete(cpfLimpo);
            await api.post('/watchlist/concluir-rastreamento', {
                evento_id: eventoId,
                cpf: cpfLimpo,
                motivo: 'Alvo localizado / abordado pela equipe de segurança'
            });
            setActiveAlert(null);
            enqueueSnackbar('Rastreamento concluído com sucesso!', { variant: 'success' });
        } catch (err) {
            console.error('Erro ao concluir rastreamento:', err);
            enqueueSnackbar('Erro ao concluir rastreamento', { variant: 'error' });
        }
    };

    // WebSocket para Alertas Globais da Watchlist
    useEffect(() => {
        if (!eventoId) return;

        // Conexão compartilhada da aba (services/realtime.js)
        const socket = usarConexao();
        socket.entrarEvento(eventoId);

        socket.on('watchlist_alert', (alert) => {
            playAlarmSound();
            const pessoa = alert.pessoa || {};
            setActiveAlert({
                id: alert.alerta_id || Math.random().toString(36),
                target_name: pessoa.nome || alert.target_name || 'Alvo em Monitoramento',
                pessoa: {
                    nome: pessoa.nome || alert.target_name || 'Alvo Detectado',
                    cpf: pessoa.cpf || '—',
                    foto_url: pessoa.foto_url,
                    funcao: pessoa.funcao,
                    numero_pulseira: pessoa.numero_pulseira
                },
                foto_capturada: alert.foto_capturada || null,
                face_crop: alert.face_crop || null,
                dispositivo: alert.dispositivo || {
                    nome: alert.camera_nome || 'Câmera IP',
                    ip: alert.dispositivo_ip,
                    fabricante: alert.dispositivo_fabricante
                },
                location: alert.localizacao || alert.area || 'Câmera de Monitoramento',
                localizacao: alert.localizacao || alert.area || 'Área do Evento',
                localizacao_detalhe: alert.localizacao_detalhe || alert.localizacao || alert.area,
                timestamp: alert.timestamp || new Date().toISOString(),
                watchlist: alert.watchlist || { motivo: 'Alvo procurado na Watchlist', nivel_alerta: 'alto' }
            });
        });

        socket.on('watchlist_alert_concluido', (data) => {
            setActiveAlert(prev => {
                if (prev) {
                    const alertCpf = (prev.pessoa?.cpf || '').replace(/\D/g, '');
                    const doneCpf = (data?.cpf || '').replace(/\D/g, '');
                    if (!doneCpf || alertCpf === doneCpf) return null;
                }
                return prev;
            });
        });

        return () => socket.liberar();
    }, [eventoId, playAlarmSound]);

    // Ciclo de IA para Varredura Automática das Câmeras Ativas
    useEffect(() => {
        if (!isAdminMaster || cameras.length === 0) return;

        const scanInterval = setInterval(async () => {
            // Sem varredura sobreposta nem com a aba do navegador escondida
            if (isScanningRef.current || document.hidden) return;

            const visibleCams = cameras.filter(c => selectedCameraIds.includes(c.id));
            if (visibleCams.length === 0) return;

            // Focar na câmera com foco ou na primeira visível
            const targetCam = (focusedCamId && cameras.find(c => c.id === focusedCamId)) || visibleCams[0];
            if (!targetCam || !targetCam.id) return;

            try {
                isScanningRef.current = true;
                const resp = await api.get(`/cameras/${targetCam.id}/track`, {
                    params: { threshold: 0.48 },
                    timeout: 10000,
                    hideDefaultError: true
                });

                if (resp.data?.success && Array.isArray(resp.data.results)) {
                    for (const item of resp.data.results) {
                        const mp = item.matched_person;
                        if (mp && (mp.is_watchlist || mp.watchlist || mp.bloqueado)) {
                            const cpfLimpo = String(mp.cpf || '').replace(/\D/g, '');

                            if (mp.em_rastreamento || (cpfLimpo && notifiedTargetsRef.current.has(cpfLimpo))) {
                                setAlertCameras(prev => ({ ...prev, [targetCam.id]: Date.now() }));
                                break;
                            }

                            if (cpfLimpo) notifiedTargetsRef.current.add(cpfLimpo);
                            playAlarmSound();
                            setAlertCameras(prev => ({ ...prev, [targetCam.id]: Date.now() }));

                            const snapshotB64 = resp.data.annotated_frame_base64
                                ? `data:image/jpeg;base64,${resp.data.annotated_frame_base64}`
                                : null;
                            const faceCropB64 = item.face_crop_base64
                                ? `data:image/jpeg;base64,${item.face_crop_base64}`
                                : null;

                            const camAreaNome = targetCam.area?.nome_area || resp.data.camera?.area;
                            const locFinal = camAreaNome
                                ? `${camAreaNome} (Câmera: ${targetCam.nome})`
                                : targetCam.nome;

                            setActiveAlert({
                                id: `alert_${Date.now()}_${targetCam.id}`,
                                target_name: mp.nome,
                                pessoa: {
                                    nome: mp.nome,
                                    cpf: mp.cpf,
                                    foto_url: mp.foto_url,
                                    funcao: mp.funcao,
                                    numero_pulseira: mp.numero_pulseira
                                },
                                foto_capturada: snapshotB64,
                                face_crop: faceCropB64,
                                dispositivo: {
                                    id: targetCam.id,
                                    nome: targetCam.nome,
                                    ip: targetCam.ip_address,
                                    porta: targetCam.porta,
                                    fabricante: targetCam.fabricante
                                },
                                location: locFinal,
                                localizacao: locFinal,
                                timestamp: new Date().toISOString(),
                                watchlist: mp.watchlist || { motivo: 'Alvo em monitoramento ativo na Watchlist', nivel_alerta: 'CRÍTICO' }
                            });
                            break;
                        }
                    }
                }
            } catch {
                // Silencioso
            } finally {
                isScanningRef.current = false;
            }
        }, 4500);

        return () => clearInterval(scanInterval);
    }, [cameras, selectedCameraIds, focusedCamId, playAlarmSound, isAdminMaster]);

    // Filtrar Câmeras Ativas para o Mosaico
    const displayedCameras = useMemo(() => {
        if (focusedCamId) {
            const cam = cameras.find(c => c.id === focusedCamId);
            return cam ? [cam] : [];
        }
        return cameras.filter(c => selectedCameraIds.includes(c.id));
    }, [cameras, selectedCameraIds, focusedCamId]);

    // Calcular Colunas de Grade pelo Layout
    const getGridConfig = () => {
        if (focusedCamId || layout === '1x1') return { xs: 12, sm: 12, md: 12, lg: 12, height: 'calc(100vh - 70px)' };
        if (layout === '2x2') return { xs: 12, sm: 6, md: 6, lg: 6, height: 'calc(50vh - 40px)' };
        if (layout === '3x3') return { xs: 12, sm: 6, md: 4, lg: 4, height: 'calc(33.3vh - 28px)' };
        if (layout === '4x4') return { xs: 6, sm: 4, md: 3, lg: 3, height: 'calc(25vh - 22px)' };
        return { xs: 12, sm: 6, md: 6, lg: 6, height: 'calc(50vh - 40px)' };
    };

    const gridConfig = getGridConfig();

    return (
        <Box sx={{
            width: '100vw',
            height: '100vh',
            bgcolor: '#050B18',
            color: '#FFFFFF',
            overflow: 'hidden',
            display: 'flex',
            flexDirection: 'column',
            userSelect: 'none'
        }}>
            {/* HEADER DO CFTV / VIDEO WALL */}
            <Box sx={{
                height: 52,
                px: 2,
                bgcolor: '#0A1628',
                borderBottom: '1px solid rgba(0, 212, 255, 0.2)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                zIndex: 100
            }}>
                {/* Lado Esquerdo: Identificação e Status */}
                <Stack direction="row" spacing={2} alignItems="center">
                    <Stack direction="row" spacing={1} alignItems="center">
                        <Box sx={{
                            width: 10, height: 10, borderRadius: '50%', bgcolor: '#00FF88',
                            boxShadow: '0 0 10px #00FF88', animation: 'cftvPulse 1.5s infinite alternate',
                            '@keyframes cftvPulse': { '0%': { opacity: 0.4 }, '100%': { opacity: 1 } }
                        }} />
                        <Typography variant="subtitle2" fontWeight={700} letterSpacing={1} sx={{ color: '#00D4FF' }}>
                            A2 CFTV command wall
                        </Typography>
                    </Stack>

                    <Chip
                        label={`${displayedCameras.length} CÂMERAS NO MOSAICO`}
                        size="small"
                        sx={{ bgcolor: 'rgba(0, 212, 255, 0.1)', color: '#00D4FF', fontWeight: 700, fontSize: '0.75rem' }}
                    />

                    {focusedCamId && (
                        <Chip
                            label="MODO FOCO (1x1)"
                            size="small"
                            onDelete={() => setFocusedCamId(null)}
                            color="warning"
                            sx={{ fontWeight: 700, fontSize: '0.75rem' }}
                        />
                    )}
                </Stack>

                {/* Centro: Relógio OSD de Alta Precisão */}
                <Box sx={{
                    px: 2, py: 0.4, borderRadius: 1.5,
                    bgcolor: 'rgba(0,0,0,0.6)', border: '1px solid rgba(255,255,255,0.1)',
                    fontFamily: '"Inter", sans-serif', fontWeight: 700, fontSize: '1rem', color: '#00FF88', letterSpacing: 2
                }}>
                    {currentTime}
                </Box>

                {/* Lado Direito: Controles do Mosaico */}
                <Stack direction="row" spacing={1} alignItems="center">
                    {/* Botões de Layout */}
                    <Tooltip title="Layout 1x1 (foco único)">
                        <IconButton
                            size="small"
                            onClick={() => { setFocusedCamId(null); handleLayoutChange('1x1'); }}
                            sx={{ color: layout === '1x1' ? '#00D4FF' : 'rgba(255,255,255,0.6)', bgcolor: layout === '1x1' ? 'rgba(0,212,255,0.15)' : 'transparent' }}
                        >
                            <Grid1x1Icon fontSize="small" />
                        </IconButton>
                    </Tooltip>

                    <Tooltip title="Layout 2x2 (4 câmeras)">
                        <IconButton
                            size="small"
                            onClick={() => { setFocusedCamId(null); handleLayoutChange('2x2'); }}
                            sx={{ color: layout === '2x2' ? '#00D4FF' : 'rgba(255,255,255,0.6)', bgcolor: layout === '2x2' ? 'rgba(0,212,255,0.15)' : 'transparent' }}
                        >
                            <Grid2x2Icon fontSize="small" />
                        </IconButton>
                    </Tooltip>

                    <Tooltip title="Layout 3x3 (9 câmeras)">
                        <IconButton
                            size="small"
                            onClick={() => { setFocusedCamId(null); handleLayoutChange('3x3'); }}
                            sx={{ color: layout === '3x3' ? '#00D4FF' : 'rgba(255,255,255,0.6)', bgcolor: layout === '3x3' ? 'rgba(0,212,255,0.15)' : 'transparent' }}
                        >
                            <Grid3x3Icon fontSize="small" />
                        </IconButton>
                    </Tooltip>

                    <Tooltip title="Layout 4x4 (16 câmeras)">
                        <IconButton
                            size="small"
                            onClick={() => { setFocusedCamId(null); handleLayoutChange('4x4'); }}
                            sx={{ color: layout === '4x4' ? '#00D4FF' : 'rgba(255,255,255,0.6)', bgcolor: layout === '4x4' ? 'rgba(0,212,255,0.15)' : 'transparent' }}
                        >
                            <Grid4x4Icon fontSize="small" />
                        </IconButton>
                    </Tooltip>

                    {/* Botão Selecionar Câmeras */}
                    <Button
                        variant="outlined"
                        size="small"
                        startIcon={<TuneIcon />}
                        onClick={() => setOpenSelectModal(true)}
                        sx={{ borderColor: 'rgba(255,255,255,0.2)', color: '#FFFFFF', fontSize: '0.75rem', fontWeight: 700, ml: 1 }}
                    >
                        Selecionar câmeras
                    </Button>

                    {/* Silenciar / Ativar Áudio */}
                    <Tooltip title={soundEnabled ? 'Silenciar Sirenes' : 'Ativar Sirenes'}>
                        <IconButton
                            size="small"
                            onClick={() => setSoundEnabled(!soundEnabled)}
                            sx={{ color: soundEnabled ? '#00FF88' : '#FF3366' }}
                        >
                            {soundEnabled ? <SoundIcon fontSize="small" /> : <MuteIcon fontSize="small" />}
                        </IconButton>
                    </Tooltip>

                    {/* Tela Cheia */}
                    <Tooltip title={isFullscreen ? 'Sair da Tela Cheia' : 'Modo Tela Cheia Total'}>
                        <IconButton
                            size="small"
                            onClick={toggleFullscreen}
                            sx={{ color: '#00D4FF' }}
                        >
                            {isFullscreen ? <FullscreenExitIcon /> : <FullscreenIcon />}
                        </IconButton>
                    </Tooltip>
                </Stack>
            </Box>

            {/* ÁREA PRINCIPAL DO MOSAICO DE VÍDEO (CFTV GRID) */}
            <Box sx={{ flex: 1, p: 0.8, overflow: 'auto', bgcolor: '#000000' }}>
                {displayedCameras.length === 0 ? (
                    <Box sx={{
                        height: '100%', display: 'flex', flexDirection: 'column',
                        alignItems: 'center', justifyContent: 'center', textAlign: 'center'
                    }}>
                        <CameraIcon sx={{ fontSize: 72, color: 'rgba(255,255,255,0.15)', mb: 2 }} />
                        <Typography variant="h6" fontWeight={700} color="text.secondary">
                            Nenhuma câmera selecionada no mosaico
                        </Typography>
                        <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
                            Abra o seletor para escolher quais câmeras exibir neste monitor.
                        </Typography>
                        <Button
                            variant="contained"
                            startIcon={<TuneIcon />}
                            onClick={() => setOpenSelectModal(true)}
                            sx={{ bgcolor: '#00D4FF', color: '#000000', fontWeight: 700 }}
                        >
                            Selecionar câmeras agora
                        </Button>
                    </Box>
                ) : (
                    <Grid container spacing={0.8} sx={{ height: '100%' }}>
                        {displayedCameras.map((cam, _idx) => {
                            const isAlarming = alertCameras[cam.id] && (Date.now() - alertCameras[cam.id] < 12000);
                            return (
                                <Grid item key={cam.id} xs={gridConfig.xs} sm={gridConfig.sm} md={gridConfig.md} lg={gridConfig.lg}>
                                    <Box sx={{
                                        position: 'relative',
                                        width: '100%',
                                        height: gridConfig.height,
                                        bgcolor: '#050B18',
                                        borderRadius: 1.5,
                                        overflow: 'hidden',
                                        border: isAlarming ? '3px solid #FF3366' : '1px solid rgba(255,255,255,0.08)',
                                        boxShadow: isAlarming ? '0 0 25px rgba(255, 0, 85, 0.8)' : 'none',
                                        transition: 'all 0.2s ease',
                                        '&:hover .cftv-overlay-controls': { opacity: 1 }
                                    }}>
                                        {/* STREAM MJPEG AO VIVO COM IA */}
                                        <img
                                            src={urlMidiaCamera(cam.id, 'stream', { annotate: true, t: Date.now() })}
                                            alt={cam.nome}
                                            style={{
                                                width: '100%',
                                                height: '100%',
                                                objectFit: 'cover',
                                                display: 'block'
                                            }}
                                            onError={(e) => {
                                                if (!e.target.dataset.fallbackTried) {
                                                    e.target.dataset.fallbackTried = 'true';
                                                    e.target.src = urlMidiaCamera(cam.id, 'snapshot', { t: Date.now() });
                                                } else {
                                                    e.target.src = '/assets/cam_offline.png';
                                                }
                                            }}
                                        />

                                        {/* OSD SUPERIOR: NOME DA CÂMERA, REC/LIVE E ÁREA */}
                                        <Box sx={{
                                            position: 'absolute', top: 0, left: 0, right: 0,
                                            p: 1, background: 'linear-gradient(180deg, rgba(0,0,0,0.85) 0%, rgba(0,0,0,0) 100%)',
                                            display: 'flex', justifyContent: 'space-between', alignItems: 'center'
                                        }}>
                                            <Stack direction="row" spacing={1} alignItems="center">
                                                {/* Indicador REC / LIVE */}
                                                <Box sx={{
                                                    display: 'flex', alignItems: 'center', gap: 0.5,
                                                    bgcolor: 'rgba(0,0,0,0.7)', px: 0.8, py: 0.2, borderRadius: 1,
                                                    border: '1px solid rgba(255,255,255,0.1)'
                                                }}>
                                                    <Box sx={{ width: 7, height: 7, borderRadius: '50%', bgcolor: '#FF3366' }} />
                                                    <Typography variant="caption" fontWeight={700} sx={{ fontSize: '0.75rem', color: '#FF3366' }}>
                                                        REC
                                                    </Typography>
                                                </Box>

                                                <Typography variant="body2" fontWeight={700} noWrap sx={{
                                                    color: '#FFFFFF', fontSize: '0.8125rem', textShadow: '0 1px 3px rgba(0,0,0,0.9)'
                                                }}>
                                                    {cam.nome}
                                                </Typography>
                                            </Stack>

                                            <Stack direction="row" spacing={0.8} alignItems="center">
                                                {cam.area?.nome_area && (
                                                    <Chip
                                                        icon={<ShieldIcon sx={{ fontSize: 11, color: '#FFFFFF !important' }} />}
                                                        label={cam.area.nome_area}
                                                        size="small"
                                                        sx={{ bgcolor: 'rgba(0, 212, 255, 0.25)', color: '#FFFFFF', fontWeight: 700, fontSize: '0.75rem', height: 20 }}
                                                    />
                                                )}
                                                {isAlarming && (
                                                    <Chip
                                                        label="Alvo detectado!"
                                                        size="small"
                                                        color="error"
                                                        sx={{ fontWeight: 700, fontSize: '0.75rem', height: 20, animation: 'blink 0.8s infinite' }}
                                                    />
                                                )}
                                            </Stack>
                                        </Box>

                                        {/* OSD INFERIOR: IP, FPS E RELÓGIO DA CÂMERA */}
                                        <Box sx={{
                                            position: 'absolute', bottom: 0, left: 0, right: 0,
                                            p: 0.8, background: 'linear-gradient(0deg, rgba(0,0,0,0.85) 0%, rgba(0,0,0,0) 100%)',
                                            display: 'flex', justifyContent: 'space-between', alignItems: 'center'
                                        }}>
                                            <Typography variant="caption" sx={{
                                                fontFamily: '"Inter", sans-serif', fontSize: '0.75rem', color: 'rgba(255,255,255,0.7)'
                                            }}>
                                                {cam.ip_address}:{cam.porta} • {cam.protocolo?.toUpperCase() || 'RTSP'}
                                            </Typography>

                                            <Typography variant="caption" sx={{
                                                fontFamily: '"Inter", sans-serif', fontSize: '0.75rem', color: '#00FF88', fontWeight: 700
                                            }}>
                                                30 FPS • {currentTime}
                                            </Typography>
                                        </Box>

                                        {/* CONTROLES OVERLAY AO PASSAR O MOUSE */}
                                        <Box className="cftv-overlay-controls" sx={{
                                            position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)',
                                            opacity: 0, transition: 'opacity 0.2s ease', display: 'flex', gap: 1,
                                            bgcolor: 'rgba(0,0,0,0.6)', p: 1, borderRadius: 1.5, backdropFilter: 'blur(4px)'
                                        }}>
                                            <Tooltip title="Focar nesta câmera (1x1)">
                                                <IconButton
                                                    size="small"
                                                    onClick={() => setFocusedCamId(focusedCamId === cam.id ? null : cam.id)}
                                                    sx={{ color: '#00D4FF', bgcolor: 'rgba(0,212,255,0.2)' }}
                                                >
                                                    <Grid1x1Icon />
                                                </IconButton>
                                            </Tooltip>
                                            <Tooltip title="Capturar snapshot">
                                                <IconButton
                                                    size="small"
                                                    onClick={() => window.open(urlMidiaCamera(cam.id, 'snapshot'), '_blank')}
                                                    sx={{ color: '#FFFFFF', bgcolor: 'rgba(255,255,255,0.2)' }}
                                                >
                                                    <SnapshotIcon />
                                                </IconButton>
                                            </Tooltip>
                                        </Box>
                                    </Box>
                                </Grid>
                            );
                        })}
                    </Grid>
                )}
            </Box>

            {/* MODAL DE SELEÇÃO DE CÂMERAS NO MOSAICO */}
            <Dialog
                open={openSelectModal}
                onClose={() => setOpenSelectModal(false)}
                fullWidth
                maxWidth="sm"
            >
                <DialogTitle sx={{ fontWeight: 700, color: '#00D4FF' }}>
                    Selecionar câmeras no mosaico
                </DialogTitle>
                <DialogContent>
                    <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                        Marque quais câmeras você deseja exibir na tela deste monitor. As câmeras são cadastradas na aba de Configurações.
                    </Typography>

                    <Stack direction="row" spacing={1} sx={{ mb: 2 }}>
                        <Button size="small" variant="outlined" onClick={selectAllCameras}>
                            Selecionar todas
                        </Button>
                        <Button size="small" variant="outlined" color="error" onClick={clearAllCameras}>
                            Desmarcar todas
                        </Button>
                    </Stack>

                    <FormGroup>
                        {cameras.map((c) => (
                            <FormControlLabel
                                key={c.id}
                                control={
                                    <Checkbox
                                        checked={selectedCameraIds.includes(c.id)}
                                        onChange={() => toggleCameraSelection(c.id)}
                                        sx={{ color: '#00D4FF', '&.Mui-checked': { color: '#00D4FF' } }}
                                    />
                                }
                                label={
                                    <Box sx={{ py: 0.5 }}>
                                        <Typography variant="body2" fontWeight={700}>
                                            {c.nome}
                                        </Typography>
                                        <Typography variant="caption" color="text.secondary">
                                            {c.ip_address}:{c.porta} • {c.area?.nome_area ? `Área: ${c.area.nome_area}` : 'Área Geral'}
                                        </Typography>
                                    </Box>
                                }
                            />
                        ))}
                    </FormGroup>
                </DialogContent>
                <DialogActions sx={{ p: 2 }}>
                    <Button onClick={() => setOpenSelectModal(false)} variant="contained" sx={{ bgcolor: '#00D4FF', color: '#000000', fontWeight: 700 }}>
                        Aplicar ao mosaico
                    </Button>
                </DialogActions>
            </Dialog>

            {/* OVERLAY DE ALERTA RICO DA WATCHLIST (COMPARATIVO COM FOTO CAPTURADA PELA CÂMERA) */}
            {activeAlert && (
                <Fade in={!!activeAlert}>
                    <Box sx={{
                        position: 'fixed', top: 32, right: 32, width: { xs: '92vw', sm: 520 }, zIndex: 999999,
                        background: 'linear-gradient(135deg, rgba(220, 20, 60, 0.98) 0%, rgba(139, 0, 0, 0.98) 100%)',
                        color: '#FFFFFF', borderRadius: 1.5, p: 3,
                        boxShadow: '0 0 60px rgba(255, 30, 86, 0.9), 0 25px 50px rgba(0,0,0,0.9)',
                        border: '2px solid #FF3366',
                        animation: 'cftvAlertPulse 1.2s infinite alternate',
                        '@keyframes cftvAlertPulse': {
                            '0%': { borderColor: '#FFFFFF', boxShadow: '0 0 30px rgba(255, 51, 102, 0.8)' },
                            '100%': { borderColor: '#FF3366', boxShadow: '0 0 70px rgba(255, 0, 80, 1)' }
                        }
                    }}>
                        <Stack direction="row" spacing={2} justifyContent="space-between" alignItems="center">
                            <Stack direction="row" spacing={1.5} alignItems="center">
                                <AlarmIcon sx={{ fontSize: 36, color: '#FFFFFF' }} />
                                <Box>
                                    <Typography variant="h6" fontWeight={700} letterSpacing={0.5} sx={{ color: '#FFFFFF' }}>
                                        Alvo identificado na watchlist!
                                    </Typography>
                                    <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.9)', fontWeight: 700 }}>
                                        CFTV • alerta de segurança e vigilância IA
                                    </Typography>
                                </Box>
                            </Stack>
                            <IconButton onClick={() => setActiveAlert(null)} size="small" sx={{ color: '#FFFFFF', bgcolor: 'rgba(0,0,0,0.3)' }}>
                                <CloseIcon />
                            </IconButton>
                        </Stack>

                        {/* COMPARATIVO VISUAL: FOTO CADASTRADA VS FOTO CAPTURADA PELA CÂMERA */}
                        <Box sx={{ mt: 2.5, p: 1.5, borderRadius: 1.5, bgcolor: 'rgba(0,0,0,0.4)', border: '1px solid rgba(255,255,255,0.15)' }}>
                            <Typography variant="caption" fontWeight={700} sx={{ color: '#00D4FF', letterSpacing: 1, display: 'block', mb: 1 }}>
                                Comparativo biométrico facial
                            </Typography>
                            <Grid container spacing={2} alignItems="center">
                                {/* Foto Cadastrada */}
                                <Grid item xs={6} sx={{ textAlign: 'center' }}>
                                    <Typography variant="caption" sx={{ display: 'block', mb: 0.5, fontWeight: 700, color: 'rgba(255,255,255,0.8)' }}>
                                        Foto cadastrada
                                    </Typography>
                                    <Box sx={{ display: 'flex', justifyContent: 'center' }}>
                                        <PessoaFoto
                                            src={activeAlert?.pessoa?.foto_url}
                                            nome={activeAlert?.pessoa?.nome}
                                            width={110}
                                            borderRadius="10px"
                                            accentColor="#00D4FF"
                                            borderWidth="2px"
                                        />
                                    </Box>
                                </Grid>

                                {/* Foto Capturada no Local */}
                                <Grid item xs={6} sx={{ textAlign: 'center' }}>
                                    <Typography variant="caption" sx={{ display: 'block', mb: 0.5, fontWeight: 700, color: '#FF3366' }}>
                                        Foto capturada na câmera
                                    </Typography>
                                    <Box sx={{
                                        width: 110, height: 110, mx: 'auto', borderRadius: '10px',
                                        overflow: 'hidden', bgcolor: '#000000', border: '2px solid #FF3366',
                                        display: 'flex', alignItems: 'center', justifyContent: 'center'
                                    }}>
                                        {activeAlert?.face_crop || activeAlert?.foto_capturada ? (
                                            <img
                                                src={activeAlert.face_crop || activeAlert.foto_capturada}
                                                alt="Captura"
                                                style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                                            />
                                        ) : (
                                            <CameraIcon sx={{ fontSize: 40, color: 'rgba(255,255,255,0.3)' }} />
                                        )}
                                    </Box>
                                </Grid>
                            </Grid>
                        </Box>

                        {/* DADOS DA PESSOA */}
                        <Box sx={{ mt: 2 }}>
                            <Typography variant="h5" fontWeight={700} sx={{ color: '#FFFFFF' }}>
                                {activeAlert?.target_name || activeAlert?.pessoa?.nome}
                            </Typography>
                            <Typography variant="body2" sx={{ fontFamily: '"Inter", sans-serif', fontWeight: 700 }}>
                                CPF: {activeAlert?.pessoa?.cpf || '—'}
                            </Typography>
                            <Chip
                                label={comoRotulo(activeAlert?.watchlist?.nivel_alerta) || 'Crítico / alto risco'}
                                size="small"
                                sx={{ mt: 1, bgcolor: '#FFFFFF', color: '#FF3366', fontWeight: 700, fontSize: '0.75rem' }}
                            />
                        </Box>

                        {/* DISPOSITIVO QUE IDENTIFICOU & LOCALIZAÇÃO DENTRO DO EVENTO */}
                        <Box sx={{ mt: 2, p: 1.5, borderRadius: 1.5, bgcolor: 'rgba(0,0,0,0.4)', border: '1px solid rgba(255,255,255,0.1)' }}>
                            <Typography variant="body2" sx={{ fontSize: '0.8125rem' }}>
                                <b>Dispositivo:</b> {activeAlert?.dispositivo?.nome || activeAlert?.location || 'Câmera IP'} ({activeAlert?.dispositivo?.ip || 'Rede'})
                            </Typography>
                            <Typography variant="body2" sx={{ fontSize: '0.8125rem', mt: 0.4 }}>
                                <b>Local no evento:</b> {activeAlert?.localizacao || activeAlert?.location || 'Área Principal'}
                            </Typography>
                            <Typography variant="body2" sx={{ fontSize: '0.8125rem', mt: 0.4 }}>
                                <b>Motivo:</b> {activeAlert?.watchlist?.motivo || 'Alvo em monitoramento de segurança.'}
                            </Typography>
                            <Typography variant="caption" sx={{ mt: 0.8, display: 'block', opacity: 0.8 }}>
                                Horário: {activeAlert?.timestamp ? new Date(activeAlert.timestamp).toLocaleTimeString() : 'Agora'} • IA ArcFace 512-D
                            </Typography>
                        </Box>

                        {/* AÇÃO PRINCIPAL: ALVO LOCALIZADO */}
                        <Box sx={{ mt: 2.5 }}>
                            <Button
                                variant="contained"
                                color="success"
                                fullWidth
                                size="large"
                                startIcon={<CheckCircleIcon />}
                                onClick={() => handleConcluirRastreamento(activeAlert?.pessoa?.cpf)}
                                sx={{
                                    bgcolor: '#00FF88',
                                    color: '#000000',
                                    fontWeight: 700,
                                    fontSize: '0.875rem',
                                    letterSpacing: '0.5px',
                                    py: 1.2,
                                    boxShadow: '0 4px 20px rgba(0, 230, 118, 0.5)',
                                    '&:hover': { bgcolor: '#00FF88', color: '#000000' }
                                }}
                            >
                                Alvo localizado (concluir rastreamento)
                            </Button>
                        </Box>

                        <Stack direction="row" spacing={1.5} mt={1.5}>
                            <Button
                                variant="contained"
                                size="small"
                                fullWidth
                                startIcon={<SoundIcon />}
                                onClick={playAlarmSound}
                                sx={{ bgcolor: '#FFFFFF', color: '#FF3366', fontWeight: 700, fontSize: '0.75rem' }}
                            >
                                Sirene
                            </Button>
                            <Button
                                variant="contained"
                                size="small"
                                fullWidth
                                onClick={() => setActiveAlert(null)}
                                sx={{ bgcolor: 'rgba(0,0,0,0.6)', color: '#FFFFFF', fontWeight: 700, fontSize: '0.75rem' }}
                            >
                                Minimizar
                            </Button>
                        </Stack>
                    </Box>
                </Fade>
            )}
        </Box>
    );
};

export default CftvWall;
