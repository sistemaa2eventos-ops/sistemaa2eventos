import React, { useState, useEffect, useMemo } from 'react';
import {
  Box, Typography, Grid, Stack, Avatar, Tabs, Tab,
  IconButton, TextField, MenuItem, Select, FormControl,
  InputLabel, Button, Table, TableBody, TableCell,
  TableContainer, TableHead, TableRow, Paper, Chip,
  Dialog, DialogTitle, DialogContent, DialogActions,
  CircularProgress, LinearProgress, Tooltip, Fade, Divider,
  ButtonGroup,
  Checkbox, List, ListItem, ListItemButton, ListItemIcon, ListItemText,
  useTheme, useMediaQuery
} from '@mui/material';
import { useSnackbar } from 'notistack';
import {
  MonitorHeart as MonitorIcon,
  FiberManualRecord as DotIcon, Videocam as CameraIcon, 
  PersonAdd as PersonAddIcon,
  NotificationsActive as AlarmIcon, Close as CloseIcon,
  Delete as TrashIcon, FilterList as FilterIcon,
  Refresh as RefreshIcon, ExitToApp as CheckoutIcon,
  Login as LoginIcon, Block as BlockIcon, CloudUpload as UploadIcon,
  FileDownload as DownloadIcon, Settings as SettingsIcon,
  Add as AddIcon,
  Security as SecurityIcon,
  Shield as ShieldIcon,
  Place as AreaIcon,
  Telegram as TelegramIcon, WhatsApp as WhatsAppIcon, Email as EmailIcon,
  Fullscreen as FullscreenIcon, FullscreenExit as FullscreenExitIcon,
  ZoomIn as ZoomInIcon, ZoomOut as ZoomOutIcon,
  GridView as GridViewIcon,
  CheckCircle as CheckCircleIcon,
  DesktopWindows as DesktopWindowsIcon,
  PhotoCamera as PhotoCameraIcon,
  VisibilityOff as VisibilityOffIcon,
  Dvr as DvrIcon,
  VolumeUp as SomIcon, VolumeOff as SemSomIcon,
  Face as RostoIcon,
  PowerSettingsNew as PowerIcon
} from '@mui/icons-material';
import { styled } from '@mui/material/styles';
import { format } from 'date-fns';
import { formatLocalTime } from '../utils/dateUtils';

import api from '../services/api';
import { urlMidiaCamera } from '../utils/cameraMedia';
import PageHeader from '../components/common/PageHeader';
import NeonButton from '../components/common/NeonButton';
import GlassCard from '../components/common/GlassCard';
import PessoaFoto from '../components/common/PessoaFoto';
import { useMonitor } from '../hooks/useMonitor';
import { useAuth } from '../contexts/AuthContext';
import GerenciarCamerasModal from '../components/cameras/GerenciarCamerasModal';
import CameraVideo from '../components/cameras/CameraVideo';
import { useIaConfig, useIaStatus, statusDaCamera, NOMES_PERFIL } from '../hooks/useIaConfig';
import useFecharComVoltar from '../hooks/useFecharComVoltar';
import { useSomAlertas } from '../utils/alertSound';
import KpiCards from '../components/monitor/KpiCards';
import AbaSaude from '../components/monitor/AbaSaude';

import { botaoSecundario } from '../styles/tokens';
import { comoRotulo } from '../utils/formatadores';
// Selo de conexão em tempo real
const SELO_CONEXAO = {
  conectado: { label: 'Ao vivo', cor: '#00FF88' },
  conectando: { label: 'Conectando...', cor: '#FFB800' },
  reconectando: { label: 'Reconectando...', cor: '#FFB800' },
  offline: { label: 'Sem conexão', cor: '#FF3366' }
};

const LogItem = styled(Box, { shouldForwardProp: (p) => !['tipo', 'monitorado'].includes(p) })(({ theme, tipo, monitorado }) => ({
    // styled() não entende os atalhos do sx (p, gap: 2): valores em px
    display: 'flex', alignItems: 'center', padding: '12px 16px', gap: '14px',
    [theme.breakpoints.down('sm')]: {
        padding: '10px 12px',
        gap: '10px',
    },
    borderBottom: '1px solid rgba(148,163,184,0.08)',
    borderLeft: `3px solid ${
        monitorado ? '#FFB800' : 
        tipo === 'negado' ? '#FF3366' : 
        tipo === 'checkin' ? '#00FF88' : 
        tipo === 'checkout' ? '#FF8800' : 
        tipo === 'fiscalizacao' ? '#00D4FF' :
        'transparent'
    }`,
    background: tipo === 'negado' ? 'rgba(255, 51, 102, 0.05)' : 
               monitorado ? 'rgba(255, 184, 0, 0.05)' : 
               tipo === 'fiscalizacao' ? 'rgba(0, 212, 255, 0.03)' : 'transparent',
    transition: 'all 0.2s ease'
}));

const Monitor = () => {
  const { enqueueSnackbar } = useSnackbar();
  const { user } = useAuth();
  const isAdminMaster = user?.nivel_acesso === 'admin_master';
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));
  // Detecção estável de mobile/tablet em qualquer orientação (largura <= 1024px OU altura de celular deitado <= 540px)
  const isMobileOrTablet = useMediaQuery('(max-width: 1024px), (max-height: 540px)');
  const isLandscape = useMediaQuery('(orientation: landscape)');

  // Abas dinâmicas: 'watchlist' só existe para admin_master (sigilo total para operadores)
  const TABS_CONFIG = useMemo(() => {
    const list = [
      { id: 'feed', label: 'Ao vivo' },
      { id: 'terminais', label: 'Leitores' },
    ];
    if (isAdminMaster) {
      list.push({ id: 'watchlist', label: 'Watchlist' });
    }
    list.push({ id: 'cameras', label: 'Câmeras' });
    list.push({ id: 'saude', label: 'Saúde do sistema' });
    return list;
  }, [isAdminMaster]);

  const [activeTab, setActiveTab] = useState('feed');

  const {
    logs, stats, loading, areas, dispositivosLista, terminais,
    cameras, fetchCameras, fetchWatchlist, historicoAlertas,
    watchlist, contatos, addContato, removeContato,
    desbloquearAlvo, deixarDeMonitorar, exportarParticipantes, baixarModeloCSV,
    activeAlert, setActiveAlert,
    activeAreaAlert, setActiveAreaAlert,
    playAlarmSound,
    sysPerf, sysStatus, sysLogs, sysError,
    conexao, ultimaAtualizacao,
    addToWatchlist, fetchSystemHealth,
    concluirRastreamento,
    filtros, setFiltros, eventoId
  } = useMonitor({ isAdminMaster });

  // Estados de Desbloqueio da Watchlist com Justificativa
  const [openUnblockDialog, setOpenUnblockDialog] = useState(false);
  const [targetToUnblock, setTargetToUnblock] = useState(null);
  const [unblockReason, setUnblockReason] = useState('');
  const [unblockLoading, setUnblockLoading] = useState(false);

  // Estados para Deixar de Monitorar (Alvo Localizado)
  const [openDeixarMonitorarDialog, setOpenDeixarMonitorarDialog] = useState(false);
  const [targetToStopMonitoring, setTargetToStopMonitoring] = useState(null);
  const [stopMonitoringReason, setStopMonitoringReason] = useState('');
  const [stopMonitoringLoading, setStopMonitoringLoading] = useState(false);

  // Modal direto de gerenciamento de câmeras na própria tela
  const [openGerenciarCamerasModal, setOpenGerenciarCamerasModal] = useState(false);

  // Modal executivo discreto de ocorrência da Watchlist (apenas admin_master)
  const [openSecretAlertModal, setOpenSecretAlertModal] = useState(false);

  // Vídeo e IA: limites do perfil (Configurações > IA facial) e status do motor do evento
  const { config: iaConfig } = useIaConfig();
  const { status: iaStatus, erro: iaErro } = useIaStatus(activeTab === 'cameras');
  const [somAtivo, setSomAtivo] = useSomAlertas();

  // Seleção de Câmeras para Exibição no Mosaico CFTV
  const [openSelectCamerasDialog, setOpenSelectCamerasDialog] = useState(false);
  const [selectedCameraIds, setSelectedCameraIds] = useState(() => {
    try {
      const saved = localStorage.getItem('monitor_cftv_selected_cams');
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  const handleToggleSelectCamera = (id) => {
    setSelectedCameraIds(prev => {
      const next = prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id];
      localStorage.setItem('monitor_cftv_selected_cams', JSON.stringify(next));
      return next;
    });
  };

  const handleSelectAllCameras = () => {
    const allIds = cameras.map(c => c.id);
    setSelectedCameraIds(allIds);
    localStorage.setItem('monitor_cftv_selected_cams', JSON.stringify(allIds));
  };

  const handleClearSelectedCameras = () => {
    setSelectedCameraIds([]);
    localStorage.setItem('monitor_cftv_selected_cams', JSON.stringify([]));
  };

  const displayedCameras = useMemo(() => {
    if (!selectedCameraIds || selectedCameraIds.length === 0) return cameras;
    const filtered = cameras.filter(c => selectedCameraIds.includes(c.id));
    return filtered.length > 0 ? filtered : cameras;
  }, [cameras, selectedCameraIds]);

  // Snapshot ou Frame completo da Câmera para a ocorrência da Watchlist
  const cameraSnapshotSrc = useMemo(() => {
    if (!activeAlert) return null;
    const src = activeAlert.foto_capturada || activeAlert.snapshot_url || activeAlert.face_crop;
    if (!src) return null;
    if (src.startsWith('data:') || src.startsWith('http')) return src;
    return `data:image/jpeg;base64,${src}`;
  }, [activeAlert]);

  // Modo de visualização do Snapshot CFTV (padrão 'cover' para preenchimento total profissional sem cantos pretos)
  const [snapshotFitMode, setSnapshotFitMode] = useState('cover');
  const [zoomSnapshotModal, setZoomSnapshotModal] = useState(false);

  const handleOpenVideoWallPopup = () => {
    const url = `/cftv?evento_id=${eventoId || ''}`;
    window.open(url, '_blank', 'popup=yes,width=1400,height=900,left=80,top=80');
  };

  // Dialogs States
  const [testResults, setTestResults] = useState({});
  const [activeStreamCam, setActiveStreamCam] = useState(null);

  // Watchlist Dialogs
  const [openTargetDialog, setOpenTargetDialog] = useState(false);
  const [newTarget, setNewTarget] = useState({ cpf: '', nome: '', motivo: '', nivel_alerta: 'alto' });
  const [openContactDialog, setOpenContactDialog] = useState(false);
  const [newContact, setNewContact] = useState({ nome: '', canal: 'telegram', telefone: '', bot_token: '' });

  // Configurações da Grade de Câmeras CFTV
  const [gridColumns, setGridColumns] = useState(() => {
    return localStorage.getItem('monitor_camera_grid_cols') || '3'; // '4', '3', '2', '1'
  });
  const [liveStreamInGrid, setLiveStreamInGrid] = useState(() => {
    return localStorage.getItem('monitor_camera_live_in_grid') === 'true';
  });

  // Câmera que gerou o último alerta fica destacada por 30 s (alertas chegam pelo tempo real)
  const [alertCameras, setAlertCameras] = useState({}); // { [camId]: timestamp }
  useEffect(() => {
    const camId = activeAlert?.dispositivo?.id;
    if (camId) setAlertCameras(prev => ({ ...prev, [camId]: Date.now() }));
  }, [activeAlert?.id, activeAlert?.dispositivo?.id]);
  // Passados os 30 s o destaque sai sozinho (antes só sumia quando algo mais redesenhava a tela)
  useEffect(() => {
    const ids = Object.keys(alertCameras);
    if (!ids.length) return undefined;
    const maisAntigo = Math.min(...ids.map(id => alertCameras[id]));
    const t = setTimeout(() => {
      setAlertCameras(prev => Object.fromEntries(Object.entries(prev).filter(([, ts]) => Date.now() - ts < 30000)));
    }, Math.max(0, maisAntigo + 30000 - Date.now()) + 50);
    return () => clearTimeout(t);
  }, [alertCameras]);

  // CPFs monitorados num Set: o feed checava a lista inteira para cada uma das 100 linhas a cada render
  const cpfsWatchlist = useMemo(() => new Set((watchlist || []).map(w => w.cpf).filter(Boolean)), [watchlist]);

  // Controles do Dialog Ao Vivo
  const [streamModalSize, setStreamModalSize] = useState('lg'); // 'md', 'lg', 'xl', 'fullscreen'
  const [streamZoom, setStreamZoom] = useState(100);

  // Modo Player YouTube para a Câmera Ao Vivo (Tela Cheia Total + Overlays Flutuantes)
  const [showPlayerControls, setShowPlayerControls] = useState(true);
  const playerControlsTimerRef = React.useRef(null);
  // "Voltar" do celular fecha o player em vez de sair do Monitor
  useFecharComVoltar(!!activeStreamCam, () => { setActiveStreamCam(null); setStreamZoom(100); });

  const resetPlayerControlsTimer = React.useCallback(() => {
    if (playerControlsTimerRef.current) clearTimeout(playerControlsTimerRef.current);
    setShowPlayerControls(true);
    playerControlsTimerRef.current = setTimeout(() => {
      setShowPlayerControls(false);
    }, 3800);
  }, []);

  const handleTogglePlayerControls = React.useCallback(() => {
    setShowPlayerControls(prev => {
      if (prev) {
        if (playerControlsTimerRef.current) clearTimeout(playerControlsTimerRef.current);
        return false;
      } else {
        resetPlayerControlsTimer();
        return true;
      }
    });
  }, [resetPlayerControlsTimer]);

  useEffect(() => {
    if (activeStreamCam) {
      setShowPlayerControls(true);
      resetPlayerControlsTimer();
    } else {
      if (playerControlsTimerRef.current) clearTimeout(playerControlsTimerRef.current);
    }
    return () => {
      if (playerControlsTimerRef.current) clearTimeout(playerControlsTimerRef.current);
    };
  }, [activeStreamCam, resetPlayerControlsTimer]);

  const handleColsChange = (cols) => {
    setGridColumns(cols);
    localStorage.setItem('monitor_camera_grid_cols', cols);
  };

  const handleLiveGridToggle = (val) => {
    setLiveStreamInGrid(val);
    localStorage.setItem('monitor_camera_live_in_grid', val ? 'true' : 'false');
  };
  // Simulação / Teste Rápido de Alerta Discreto (apenas visível/usado por admin_master)
  const handleTriggerTestAlert = () => {
    if (!isAdminMaster) return;
    playAlarmSound?.();
    const camMock = activeStreamCam || cameras[0] || {
      id: 'cam-sim-1',
      nome: 'Câmera 01 - entrada principal',
      ip_address: '127.0.0.1',
      porta: 8554,
      fabricante: 'Webcam RTSP'
    };

    setActiveAlert({
      id: `sim_alert_${Date.now()}`,
      target_name: 'PESSOA DE TESTE (SIMULAÇÃO)',
      pessoa: {
        nome: 'Pessoa de teste (simulação)',
        cpf: '000.000.000-00',
        foto_url: null,
        funcao: 'Simulação de alerta',
        categoria: 'Teste',
        pulseira: '—'
      },
      location: camMock.nome,
      timestamp: new Date().toISOString(),
      metodo: 'Vigilância Facial em Tempo Real (IA ArcFace 512-D)',
      watchlist: {
        motivo: 'SIMULAÇÃO — teste do fluxo de alerta (nenhum alvo real).',
        nivel_alerta: 'TESTE'
      },
      foto_capturada: urlMidiaCamera(camMock.id, 'snapshot', { t: Date.now() }),
      face_crop: null,
      snapshot_url: urlMidiaCamera(camMock.id, 'snapshot', { t: Date.now() }),
      dispositivo: {
        id: camMock.id,
        nome: camMock.nome,
        ip: camMock.ip_address || '127.0.0.1',
        porta: camMock.porta || 8554,
        fabricante: camMock.fabricante || 'Webcam RTSP'
      },
      localizacao: {
        nome_area: camMock.area?.nome_area || 'Área Principal',
        setor: 'Geral',
        localizacao: camMock.nome,
        camera_nome: camMock.nome
      }
    });
    enqueueSnackbar('Notificação de ocorrência sigilosa emitida no console.', { variant: 'info' });
  };

  // Sincronização automática da foto oficial do alvo na ocorrência caso venha vazia
  useEffect(() => {
    if (activeAlert?.pessoa && !activeAlert.pessoa.foto_url && activeAlert.pessoa.cpf) {
      const cpfLimpo = String(activeAlert.pessoa.cpf).replace(/\D/g, '');
      api.get('/pessoas', { params: { busca: cpfLimpo, limit: 1 }, hideDefaultError: true })
        .then(res => {
          const found = res.data?.data?.[0];
          if (found?.foto_url) {
            setActiveAlert(prev => prev ? ({
              ...prev,
              pessoa: {
                ...prev.pessoa,
                foto_url: found.foto_url
              }
            }) : null);
          }
        })
        .catch(() => {});
    }
    // Depende só de cpf/foto: com o objeto inteiro, cada atualização da foto dispararia de novo
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeAlert?.pessoa?.cpf, activeAlert?.pessoa?.foto_url]);

  // Aba Saúde: carrega ao entrar e atualiza a cada 15 s enquanto estiver aberta
  const [saudeAtualizadaEm, setSaudeAtualizadaEm] = useState(null);
  const atualizarSaude = React.useCallback(async () => {
    await fetchSystemHealth();
    setSaudeAtualizadaEm(new Date());
  }, [fetchSystemHealth]);
  useEffect(() => {
    if (activeTab !== 'saude') return undefined;
    atualizarSaude();
    const timer = setInterval(() => { if (!document.hidden) atualizarSaude(); }, 15000);
    return () => clearInterval(timer);
  }, [activeTab, atualizarSaude]);

  // Handlers
  const handleExportCSV = async () => {
    await exportarParticipantes();
  };

  const handleOpenUnblock = (alvo) => {
    setTargetToUnblock(alvo);
    setUnblockReason('');
    setOpenUnblockDialog(true);
  };

  const handleConfirmUnblock = async () => {
    if (!unblockReason || unblockReason.trim().length < 3) {
      enqueueSnackbar('Por favor, informe a justificativa do desbloqueio (mínimo 3 caracteres).', { variant: 'warning' });
      return;
    }
    setUnblockLoading(true);
    try {
      const ok = await desbloquearAlvo(targetToUnblock.id, unblockReason.trim());
      if (ok) {
        setOpenUnblockDialog(false);
        setTargetToUnblock(null);
        setUnblockReason('');
      }
    } finally {
      setUnblockLoading(false);
    }
  };

  const handleOpenDeixarMonitorar = (alvo) => {
    setTargetToStopMonitoring(alvo);
    setStopMonitoringReason('Alvo localizado e abordado pela equipe de segurança no evento.');
    setOpenDeixarMonitorarDialog(true);
  };

  const handleConfirmDeixarMonitorar = async () => {
    if (!targetToStopMonitoring) return;
    setStopMonitoringLoading(true);
    try {
      const ok = await deixarDeMonitorar(targetToStopMonitoring.id, stopMonitoringReason);
      if (ok) {
        setOpenDeixarMonitorarDialog(false);
        setTargetToStopMonitoring(null);
        setStopMonitoringReason('');
      }
    } finally {
      setStopMonitoringLoading(false);
    }
  };

  const handleUploadCSV = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const formData = new FormData();
    formData.append('file', file);
    formData.append('evento_id', eventoId);
    try {
        await api.post('/watchlist/upload', formData);
        enqueueSnackbar('CSV da Watchlist importado e bloqueios globais ativados com sucesso!', { variant: 'success' });
        fetchWatchlist();
    } catch (err) {
        enqueueSnackbar('Erro ao importar CSV: ' + (err.response?.data?.error || err.message), { variant: 'error' });
    } finally {
        e.target.value = ''; // Reset input
    }
  };

  const handleTestCamera = async (id) => {
    setTestResults(prev => ({ ...prev, [id]: 'testing' }));
    try {
        const resp = await api.post(`/cameras/${id}/testar`);
        setTestResults(prev => ({ ...prev, [id]: resp.data.online ? 'online' : 'offline' }));
        fetchCameras();
    } catch (err) {
        setTestResults(prev => ({ ...prev, [id]: 'offline' }));
    }
  };

  const [togglingCamId, setTogglingCamId] = useState(null);
  const [togglingAllCams, setTogglingAllCams] = useState(false);
  const temCameraAtiva = useMemo(() => cameras.some(c => c.status !== 'desativada' && c.status !== 'inativa'), [cameras]);

  const handleToggleCameraStatus = async (cam) => {
    const isDesativada = cam.status === 'desativada' || cam.status === 'inativa';
    const novoStatus = isDesativada ? 'offline' : 'desativada';
    try {
      setTogglingCamId(cam.id);
      if (!isDesativada && activeStreamCam?.id === cam.id) {
        setActiveStreamCam(null);
      }
      await api.put(`/cameras/${cam.id}`, { status: novoStatus });
      setTestResults(prev => {
        const copy = { ...prev };
        delete copy[cam.id];
        return copy;
      });
      await fetchCameras();
      if (isDesativada) {
        enqueueSnackbar(`Câmera "${cam.nome}" ativada!`, { variant: 'success' });
        handleTestCamera(cam.id);
      } else {
        enqueueSnackbar(`Câmera "${cam.nome}" desativada.`, { variant: 'warning' });
      }
    } catch (err) {
      enqueueSnackbar('Erro ao alterar status da câmera.', { variant: 'error' });
    } finally {
      setTogglingCamId(null);
    }
  };

  const handleToggleAllCameras = async () => {
    if (cameras.length === 0) return;
    const desativar = temCameraAtiva;
    try {
      setTogglingAllCams(true);
      if (desativar) setActiveStreamCam(null);
      const novoStatus = desativar ? 'desativada' : 'offline';
      await Promise.all(cameras.map(c => api.put(`/cameras/${c.id}`, { status: novoStatus })));
      setTestResults({});
      await fetchCameras();
      enqueueSnackbar(
        desativar ? 'Todas as câmeras foram desativadas.' : 'Todas as câmeras foram reativadas!',
        { variant: desativar ? 'warning' : 'success' }
      );
    } catch (err) {
      enqueueSnackbar('Erro ao alterar status das câmeras.', { variant: 'error' });
    } finally {
      setTogglingAllCams(false);
    }
  };

  return (
    <Box sx={{ p: { xs: 1.5, sm: 2.5, md: 3 }, maxWidth: '100%', overflowX: 'hidden' }}>
      <Box sx={{ 
        display: 'flex', 
        justifyContent: 'space-between', 
        alignItems: { xs: 'flex-start', sm: 'center' }, 
        mb: { xs: 2, sm: 2.5 }, 
        flexDirection: { xs: 'column', sm: 'row' },
        gap: 1.5 
      }}>
        <PageHeader
          title="Monitor em tempo real"
          subtitle="Passagens, leitores, câmeras e saúde do sistema ao vivo."
          icon={<MonitorIcon sx={{ fontSize: 36, color: '#00D4FF' }} />}
          sx={{ mb: 0 }}
        />
        <Tooltip title={ultimaAtualizacao ? `Dados atualizados às ${ultimaAtualizacao.toLocaleTimeString('pt-BR')}` : 'Aguardando dados'}>
          <Chip
            icon={<DotIcon sx={{ fontSize: 10, color: `${(SELO_CONEXAO[conexao] || SELO_CONEXAO.offline).cor} !important` }} />}
            label={(SELO_CONEXAO[conexao] || SELO_CONEXAO.offline).label}
            sx={{
              fontFamily: '"Inter", sans-serif',
              fontWeight: 700,
              fontSize: '0.75rem',
              bgcolor: `${(SELO_CONEXAO[conexao] || SELO_CONEXAO.offline).cor}1A`,
              color: (SELO_CONEXAO[conexao] || SELO_CONEXAO.offline).cor,
              border: `1px solid ${(SELO_CONEXAO[conexao] || SELO_CONEXAO.offline).cor}4D`,
              height: 36,
              borderRadius: '10px',
              alignSelf: { xs: 'flex-start', sm: 'center' }
            }}
          />
        </Tooltip>
      </Box>

      <Box sx={{ borderBottom: 1, borderColor: 'divider', mb: { xs: 2, sm: 3 } }}>
        <Tabs 
          value={activeTab} 
          onChange={(e, v) => setActiveTab(v)} 
          variant="scrollable"
          scrollButtons="auto"
          allowScrollButtonsMobile
          textColor="inherit" 
          TabIndicatorProps={{ style: { backgroundColor: '#00D4FF' } }}
        >
          {TABS_CONFIG.map(tab => (
            <Tab 
              key={tab.id} 
              value={tab.id} 
              label={tab.label} 
              sx={{ fontWeight: 700, fontSize: '0.8125rem' }} 
            />
          ))}
        </Tabs>
      </Box>

      {/* NOTIFICAÇÃO DISCRETA DE SEGURANÇA (EXCLUSIVA PARA ADMIN_MASTER - ZERO IMPACTO EM OPERADORES) */}
      {activeAlert && isAdminMaster && !openSecretAlertModal && (
        <Fade in={!!activeAlert && !openSecretAlertModal}>
          <Box sx={{ 
            position: 'fixed', 
            // No celular fica abaixo da barra do topo, com a mesma margem dos dois lados
            top: { xs: 'calc(env(safe-area-inset-top, 0px) + 68px)', md: 24 }, 
            right: { xs: 12, sm: 24 }, 
            zIndex: 99999, 
            width: { xs: 'calc(100% - 24px)', sm: 420 },
            bgcolor: '#0A1628', 
            borderRadius: 1.5,
            p: 2, 
            boxShadow: '0 10px 40px rgba(0,0,0,0.85), 0 0 1px 1px rgba(255, 184, 0, 0.4)',
            border: '1px solid rgba(255, 184, 0, 0.5)',
            backdropFilter: 'blur(12px)'
          }}>
            <Stack direction="row" spacing={1.5} alignItems="center" justifyContent="space-between">
              <Stack direction="row" spacing={1.2} alignItems="center">
                <Box sx={{
                  width: 34, height: 34, borderRadius: 1.5,
                  bgcolor: 'rgba(255, 184, 0, 0.12)',
                  border: '1px solid rgba(255, 184, 0, 0.3)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center'
                }}>
                  <SecurityIcon sx={{ fontSize: 18, color: '#FFB800' }} />
                </Box>
                <Box>
                  <Typography variant="subtitle2" fontWeight={700} sx={{ color: '#FFB800', lineHeight: 1.15 }}>
                    Notificação sigilosa de segurança
                  </Typography>
                  <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.65)', fontSize: '0.75rem' }}>
                    Alvo da Watchlist detectado por câmera
                  </Typography>
                </Box>
              </Stack>
              <IconButton 
                size="small" 
                onClick={() => setActiveAlert(null)} 
                sx={{ color: 'rgba(255,255,255,0.6)', '&:hover': { color: '#FFFFFF' } }}
              >
                <CloseIcon fontSize="small" />
              </IconButton>
            </Stack>

            <Box sx={{ mt: 1.5, p: 1.2, borderRadius: 1.5, bgcolor: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
              <Typography variant="body2" fontWeight={700} color="#FFFFFF" noWrap>
                {activeAlert?.target_name || activeAlert?.pessoa?.nome || 'Alvo em Monitoramento'}
              </Typography>
              <Typography variant="caption" sx={{ color: '#00D4FF', display: 'block', mt: 0.3, fontWeight: 700 }}>
                {activeAlert?.localizacao?.nome_area || activeAlert?.location || 'Câmera CFTV'}
              </Typography>
              <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.5)', display: 'block', fontSize: '0.75rem', mt: 0.2 }}>
                Identificado às {activeAlert?.timestamp ? new Date(activeAlert.timestamp).toLocaleTimeString() : 'Agora'}
              </Typography>
            </Box>

            <Stack direction="row" spacing={1} mt={1.5}>
              <Button
                fullWidth
                variant="contained"
                size="small"
                onClick={() => setOpenSecretAlertModal(true)}
                sx={{ 
                  bgcolor: '#FFB800', 
                  color: '#000000', 
                  fontWeight: 700, 
                  fontSize: '0.75rem',
                  '&:hover': { bgcolor: '#FFB800' } 
                }}
              >
                Abrir ocorrência (sigiloso)
              </Button>
              <Button
                variant="outlined"
                size="small"
                onClick={() => setActiveAlert(null)}
                sx={{ borderColor: 'rgba(255,255,255,0.15)', color: '#94A3B8', fontSize: '0.75rem' }}
              >
                Dispensar
              </Button>
            </Stack>
          </Box>
        </Fade>
      )}

      {/* MODAL EXECUTIVO DE OCORRÊNCIA SIGILOSA DA WATCHLIST (ADMIN_MASTER ONLY) */}
      <Dialog
        open={openSecretAlertModal && !!activeAlert && isAdminMaster}
        onClose={() => { setOpenSecretAlertModal(false); setActiveAlert(null); }}
        maxWidth="md"
        fullWidth
        PaperProps={{
          sx: {
            border: '1px solid #FFB800',
            boxShadow: '0 0 50px rgba(0,0,0,0.9), 0 0 30px rgba(255, 184, 0, 0.2)',
            maxHeight: { sm: '90dvh' },
            overflowY: 'auto',
            '&::-webkit-scrollbar': { width: 6 },
            '&::-webkit-scrollbar-thumb': { bgcolor: 'rgba(255, 184, 0, 0.2)', borderRadius: 1.5 }
                    }
        }}
      >
        <DialogTitle sx={{ pb: 1, borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
          <Stack direction="row" justifyContent="space-between" alignItems="center">
            <Stack direction="row" spacing={1.5} alignItems="center">
              <Box sx={{
                width: 36, height: 36, borderRadius: 1.5,
                bgcolor: 'rgba(255, 184, 0, 0.15)',
                border: '1px solid #FFB800',
                display: 'flex', alignItems: 'center', justifyContent: 'center'
              }}>
                <SecurityIcon sx={{ fontSize: 20, color: '#FFB800' }} />
              </Box>
              <Box>
                <Typography variant="h6" fontWeight={700} sx={{ color: '#FFB800', fontSize: '1rem', lineHeight: 1.2 }}>
                  Central de inteligência • ocorrência sigilosa
                </Typography>
                <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.65)' }}>
                  Alvo da watchlist reconhecido por câmera de vigilância facial
                </Typography>
              </Box>
            </Stack>
            <IconButton 
              onClick={() => { setOpenSecretAlertModal(false); setActiveAlert(null); }} 
              size="small" 
              sx={{ color: '#94A3B8', '&:hover': { color: '#FFFFFF' } }}
            >
              <CloseIcon />
            </IconButton>
          </Stack>
        </DialogTitle>

        <DialogContent sx={{ p: { xs: 1.5, sm: 2.5 } }}>
          {/* COMPARATIVO FOTO OFICIAL VS SNAPSHOT GRAVADO NO STORAGE */}
          <Box sx={{
            p: { xs: 1.5, sm: 2.5 },
            borderRadius: 1.5,
            bgcolor: 'rgba(0,0,0,0.65)',
            border: '1px solid rgba(255,255,255,0.08)',
            boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
            mb: 2
          }}>
            <Stack direction="row" justifyContent="space-between" alignItems="center" flexWrap="wrap" gap={1} mb={1.5}>
              <Typography variant="caption" sx={{ color: '#00D4FF', fontWeight: 700, letterSpacing: 0.5, display: 'flex', alignItems: 'center', gap: 0.8 }}>
                <SecurityIcon sx={{ fontSize: 16, color: '#00D4FF' }} />
                Comprovação biométrica facial
              </Typography>
              <Chip
                label="Correspondência confirmada"
                size="small"
                sx={{
                  bgcolor: 'rgba(0, 230, 118, 0.15)',
                  color: '#00FF88',
                  border: '1px solid rgba(0, 230, 118, 0.4)',
                  fontWeight: 700,
                  fontSize: '0.72rem'
                }}
              />
            </Stack>

            <Box sx={{
              display: 'flex',
              flexDirection: { xs: 'column', md: 'row' },
              alignItems: 'stretch',
              justifyContent: 'center',
              gap: { xs: 1.5, md: 2.5 },
              width: '100%'
            }}>
              {/* PAINEL 1: FOTO DO REGISTRO CADASTRADO (PROPORÇÃO BIOMÉTRICA RETRATO 3:4 - ZERO CORTE) */}
              <Box sx={{
                width: { xs: '100%', md: 230 },
                flexShrink: 0,
                display: 'flex',
                flexDirection: 'column'
              }}>
                <Box sx={{
                  width: '100%',
                  height: { xs: 200, sm: 290 },
                  borderRadius: 1.5,
                  overflow: 'hidden',
                  border: '2px solid #00D4FF',
                  bgcolor: '#050B18',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  position: 'relative',
                  boxShadow: '0 4px 20px rgba(0,0,0,0.8), 0 0 15px rgba(0, 212, 255, 0.15)'
                }}>
                  {activeAlert?.pessoa?.foto_url ? (
                    <img
                      src={activeAlert.pessoa.foto_url}
                      alt="Cadastro Oficial"
                      style={{
                        width: '100%',
                        height: '100%',
                        objectFit: 'contain',
                        objectPosition: 'center',
                        display: 'block',
                        backgroundColor: '#050B18'
                      }}
                    />
                  ) : (
                    <PessoaFoto
                      src={activeAlert?.pessoa?.foto_url}
                      nome={activeAlert?.target_name || activeAlert?.pessoa?.nome}
                      width={120}
                      borderRadius="12px"
                    />
                  )}

                  {/* OSD BIOMÉTRICO SUPERIOR */}
                  <Box sx={{
                    position: 'absolute',
                    top: 8,
                    left: 8,
                    bgcolor: 'rgba(4, 7, 13, 0.85)',
                    px: 0.9,
                    py: 0.3,
                    borderRadius: 1,
                    border: '1px solid rgba(0, 212, 255, 0.4)',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 0.6
                  }}>
                    <Box sx={{ width: 6, height: 6, borderRadius: '50%', bgcolor: '#00D4FF', boxShadow: '0 0 6px #00D4FF' }} />
                    <Typography variant="caption" sx={{ fontFamily: '"Inter", sans-serif', fontSize: '0.72rem', color: '#00D4FF', fontWeight: 700 }}>
                      ID BIOMÉTRICO (3:4)
                    </Typography>
                  </Box>

                  {/* BADGE INFERIOR */}
                  <Box sx={{
                    position: 'absolute',
                    bottom: 0,
                    left: 0,
                    right: 0,
                    p: 0.8,
                    background: 'linear-gradient(to top, rgba(0,0,0,0.95) 0%, rgba(0,0,0,0.4) 70%, transparent 100%)',
                    display: 'flex',
                    justifyContent: 'center'
                  }}>
                    <Chip
                      label="Registro cadastrado"
                      size="small"
                      sx={{
                        height: 22,
                        fontSize: '0.72rem',
                        fontWeight: 700,
                        bgcolor: '#00D4FF',
                        color: '#000000',
                        letterSpacing: 0.5
                      }}
                    />
                  </Box>
                </Box>
                <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.6)', mt: 0.5, textAlign: 'center', fontSize: '0.72rem', fontWeight: 600 }}>
                  Foto oficial de perfil (sem cortes)
                </Typography>
              </Box>

              {/* PAINEL 2: SNAPSHOT DE IDENTIFICAÇÃO CFTV (WIDESCREEN 16:9 - SEM BORDAS PRETAS) */}
              <Box sx={{
                flex: 1,
                minWidth: { xs: '100%', md: 480 },
                display: 'flex',
                flexDirection: 'column'
              }}>
                <Box sx={{
                  width: '100%',
                  height: { xs: 200, sm: 290 },
                  borderRadius: 1.5,
                  overflow: 'hidden',
                  border: '2px solid #FFB800',
                  bgcolor: '#000000',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  position: 'relative',
                  boxShadow: '0 4px 20px rgba(0,0,0,0.8), 0 0 15px rgba(255, 184, 0, 0.15)'
                }}>
                  {cameraSnapshotSrc ? (
                    <img
                      src={cameraSnapshotSrc}
                      alt="Snapshot da Câmera CFTV"
                      onClick={() => setZoomSnapshotModal(true)}
                      title="Clique para inspecionar em tela cheia"
                      style={{
                        width: '100%',
                        height: '100%',
                        objectFit: snapshotFitMode,
                        objectPosition: 'center',
                        display: 'block',
                        backgroundColor: '#000000',
                        cursor: 'pointer'
                      }}
                    />
                  ) : (
                    <Stack alignItems="center" spacing={1}>
                      <PhotoCameraIcon sx={{ fontSize: 44, color: '#FFB800', opacity: 0.8 }} />
                      <Typography variant="caption" sx={{ fontSize: '0.75rem', color: '#FFB800', fontWeight: 700 }}>
                        Aguardando frame da câmera
                      </Typography>
                    </Stack>
                  )}

                  {/* OSD CFTV SUPERIOR */}
                  <Box sx={{
                    position: 'absolute',
                    top: 8,
                    left: 8,
                    bgcolor: 'rgba(0,0,0,0.85)',
                    px: 0.9,
                    py: 0.3,
                    borderRadius: 1,
                    border: '1px solid rgba(255, 184, 0, 0.4)',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 0.6
                  }}>
                    <Box sx={{ width: 7, height: 7, borderRadius: '50%', bgcolor: '#FFB800', boxShadow: '0 0 6px #FFB800' }} />
                    <Typography variant="caption" sx={{ fontFamily: '"Inter", sans-serif', fontSize: '0.75rem', color: '#FFB800', fontWeight: 700 }}>
                      CFTV • captura real da câmera
                    </Typography>
                  </Box>

                  {/* CONTROLES SUPERIORES (FIT MODE & ZOOM) */}
                  <Box sx={{
                    position: 'absolute',
                    top: 8,
                    right: 8,
                    display: 'flex',
                    alignItems: 'center',
                    gap: 0.8,
                    zIndex: 2
                  }}>
                    <Tooltip title={snapshotFitMode === 'cover' ? "Modo Preenchimento Total (Sem bordas pretas). Clique para ver a lente inteira." : "Modo Lente Original. Clique para preencher o quadro sem bordas pretas."}>
                      <Button
                        size="small"
                        onClick={() => setSnapshotFitMode(prev => prev === 'cover' ? 'contain' : 'cover')}
                        sx={{
                          height: 22,
                          px: 1,
                          fontSize: '0.75rem',
                          fontWeight: 700,
                          bgcolor: 'rgba(0,0,0,0.85)',
                          color: '#FFB800',
                          border: '1px solid rgba(255, 184, 0, 0.5)',
                          borderRadius: 1,
                          '&:hover': { bgcolor: 'rgba(255, 184, 0, 0.25)' }
                        }}
                      >
                        {snapshotFitMode === 'cover' ? 'Preenchimento 100%' : 'Lente original'}
                      </Button>
                    </Tooltip>
                    <Tooltip title="Inspecionar captura em tela cheia">
                      <IconButton
                        size="small"
                        onClick={() => setZoomSnapshotModal(true)}
                        sx={{
                          width: 22,
                          height: 22,
                          bgcolor: 'rgba(0,0,0,0.85)',
                          color: '#FFB800',
                          border: '1px solid rgba(255, 184, 0, 0.5)',
                          borderRadius: 1,
                          '&:hover': { bgcolor: 'rgba(255, 184, 0, 0.25)' }
                        }}
                      >
                        <ZoomInIcon sx={{ fontSize: 14 }} />
                      </IconButton>
                    </Tooltip>
                  </Box>

                  {/* CHIP INFERIOR */}
                  <Box sx={{
                    position: 'absolute',
                    bottom: 0,
                    left: 0,
                    right: 0,
                    p: 0.8,
                    background: 'linear-gradient(to top, rgba(0,0,0,0.95) 0%, rgba(0,0,0,0.4) 70%, transparent 100%)',
                    display: 'flex',
                    justifyContent: 'center'
                  }}>
                    <Chip
                      label="Snapshot de identificação (CFTV)"
                      size="small"
                      sx={{
                        height: 22,
                        fontSize: '0.75rem',
                        fontWeight: 700,
                        bgcolor: '#FFB800',
                        color: '#000000',
                        letterSpacing: 0.5
                      }}
                    />
                  </Box>
                </Box>
                <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.6)', mt: 0.8, textAlign: 'center', fontSize: '0.75rem', fontWeight: 600 }}>
                  Captura completa da câmera no momento da detecção (16:9)
                </Typography>
              </Box>
            </Box>
          </Box>

          {/* DADOS DO ALVO */}
          <Box sx={{ p: 2, borderRadius: 1.5, bgcolor: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)', mb: 2 }}>
            <Stack direction="row" justifyContent="space-between" alignItems="flex-start" gap={1}>
              <Box>
                <Typography variant="h6" fontWeight={700} sx={{ color: '#FFFFFF', fontSize: '1rem', lineHeight: 1.2 }}>
                  {activeAlert?.target_name || activeAlert?.pessoa?.nome || 'Alvo em Monitoramento'}
                </Typography>
                <Typography variant="body2" sx={{ color: '#00D4FF', fontWeight: 700, fontFamily: '"Inter", sans-serif', mt: 0.3 }}>
                  CPF: {activeAlert?.pessoa?.cpf || 'Não informado'}
                </Typography>
                {activeAlert?.pessoa?.funcao && (
                  <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.7)', display: 'block', mt: 0.2 }}>
                    Função: <b>{activeAlert.pessoa.funcao}</b> {activeAlert.pessoa?.categoria ? `• Categoria: ${activeAlert.pessoa.categoria}` : ''}
                  </Typography>
                )}
              </Box>
              <Chip
                label={comoRotulo(activeAlert?.watchlist?.nivel_alerta) || 'Crítico'}
                size="small"
                sx={{ bgcolor: '#FFB800', color: '#000000', fontWeight: 700, fontSize: '0.75rem' }}
              />
            </Stack>

            <Divider sx={{ my: 1.5, borderColor: 'rgba(255,255,255,0.08)' }} />

            <Typography variant="body2" sx={{ fontSize: '0.8125rem', color: '#FFB800', lineHeight: 1.4 }}>
              <b>Motivo da restrição:</b> {activeAlert?.watchlist?.motivo || 'Indivíduo cadastrado na Watchlist com restrição de acesso.'}
            </Typography>
          </Box>

          {/* LOCALIZAÇÃO E DISPOSITIVO */}
          <Box sx={{ p: 2, borderRadius: 1.5, bgcolor: 'rgba(0, 212, 255, 0.04)', border: '1px solid rgba(0, 212, 255, 0.2)' }}>
            <Grid container spacing={2}>
              <Grid item xs={12} sm={6}>
                <Stack direction="row" spacing={1} alignItems="flex-start">
                  <CameraIcon sx={{ color: '#00D4FF', fontSize: 20, mt: 0.2 }} />
                  <Box>
                    <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.5)', fontWeight: 700, fontSize: '0.75rem', }}>
                      Dispositivo CFTV
                    </Typography>
                    <Typography variant="body2" fontWeight={700} color="#FFFFFF">
                      {activeAlert?.dispositivo?.nome || activeAlert?.location || 'Câmera IP'}
                    </Typography>
                    <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.65)', fontFamily: '"Inter", sans-serif', display: 'block' }}>
                      {activeAlert?.dispositivo?.fabricante ? `${activeAlert.dispositivo.fabricante} • ` : ''}
                      {activeAlert?.dispositivo?.ip ? `${activeAlert.dispositivo.ip}:${activeAlert.dispositivo.porta || ''}` : 'Rede CFTV'}
                    </Typography>
                  </Box>
                </Stack>
              </Grid>

              <Grid item xs={12} sm={6}>
                <Stack direction="row" spacing={1} alignItems="flex-start">
                  <AreaIcon sx={{ color: '#FFB800', fontSize: 20, mt: 0.2 }} />
                  <Box>
                    <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.5)', fontWeight: 700, fontSize: '0.75rem', }}>
                      Localização no evento
                    </Typography>
                    <Typography variant="body2" fontWeight={700} sx={{ color: '#FFB800' }}>
                      {activeAlert?.localizacao?.nome_area || 'Área Principal do Evento'}
                    </Typography>
                    <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.65)', display: 'block' }}>
                      {activeAlert?.localizacao?.setor ? `Setor: ${activeAlert.localizacao.setor}` : ''}
                      {activeAlert?.localizacao?.localizacao ? ` • ${activeAlert.localizacao.localizacao}` : ''}
                    </Typography>
                  </Box>
                </Stack>
              </Grid>
            </Grid>
            <Typography variant="caption" sx={{ mt: 1.2, display: 'block', opacity: 0.6, fontSize: '0.75rem', textAlign: 'right' }}>
              Registro gerado em {activeAlert?.timestamp ? new Date(activeAlert.timestamp).toLocaleString() : 'Agora'}
            </Typography>
          </Box>
        </DialogContent>

        <DialogActions sx={{ p: { xs: 1.5, sm: 2.5 }, borderTop: '1px solid rgba(255,255,255,0.08)', gap: 1, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
          {cameras.length > 0 && (
            <Button
              variant="outlined"
              size="small"
              startIcon={<CameraIcon />}
              onClick={() => {
                const foundCam = cameras.find(c => c.nome === (activeAlert?.dispositivo?.nome || activeAlert?.location)) || cameras[0];
                if (foundCam) setActiveStreamCam(foundCam);
                setOpenSecretAlertModal(false);
                setActiveAlert(null);
              }}
              sx={{ borderColor: '#00D4FF', color: '#00D4FF', fontWeight: 700, flex: { xs: '1 1 100%', sm: '0 0 auto' } }}
            >
              Ver câmera ao vivo
            </Button>
          )}

          <Button
            variant="contained"
            color="success"
            size="small"
            startIcon={<CheckCircleIcon />}
            onClick={async () => {
              const cpf = activeAlert?.pessoa?.cpf;
              await concluirRastreamento(cpf);
              setOpenSecretAlertModal(false);
              setActiveAlert(null);
            }}
            sx={{
              bgcolor: '#00FF88',
              color: '#000000',
              fontWeight: 700,
              flex: { xs: '1 1 auto', sm: '0 0 auto' },
              boxShadow: '0 4px 14px rgba(0, 230, 118, 0.4)',
              '&:hover': { bgcolor: '#00FF88', color: '#000000' }
            }}
          >
            Concluir rastreamento
          </Button>

          <Button
            variant="outlined"
            size="small"
            onClick={() => {
              setOpenSecretAlertModal(false);
              setActiveAlert(null);
            }}
            sx={{ ...botaoSecundario, flex: { xs: '0 0 auto', sm: '0 0 auto' } }}
          >
            Fechar
          </Button>
        </DialogActions>
      </Dialog>

      {/* AREA RESTRICTED ALERT OVERLAY */}
      {activeAreaAlert && (
          <Fade in={!!activeAreaAlert}>
             <Box sx={{ 
                 position: 'fixed',
                 top: activeAlert ? { xs: 190, sm: 240 } : { xs: 68, sm: 40 },
                 right: { xs: 12, sm: 40 },
                 width: { xs: 'calc(100vw - 24px)', sm: 450 },
                 zIndex: 9999,
                 background: 'linear-gradient(135deg, rgba(255, 30, 86, 0.96) 0%, rgba(180, 0, 40, 0.98) 100%)',
                 color: '#FFFFFF', borderRadius: 1.5,
                 p: { xs: 2, sm: 3 }, boxShadow: '0 20px 50px rgba(255,0,80,0.4)', border: '2px solid #FF3366',
                 backdropFilter: 'blur(10px)'
             }}>
                 <Stack direction="row" spacing={1.5} justifyContent="space-between" alignItems="center">
                    <Stack direction="row" spacing={1} alignItems="center">
                        <ShieldIcon sx={{ fontSize: { xs: 28, sm: 36 }, color: '#FFFFFF' }} />
                        <Typography variant="h6" fontWeight={700} letterSpacing={0.5} sx={{ fontSize: { xs: '1rem', sm: '1.25rem' } }}>Acesso não autorizado!</Typography>
                    </Stack>
                    <IconButton onClick={() => setActiveAreaAlert(null)} size="small" sx={{ color: '#FFFFFF' }}><CloseIcon /></IconButton>
                 </Stack>

                 <Stack direction="row" spacing={2} mt={2} alignItems="center">
                    <PessoaFoto
                        src={activeAreaAlert?.pessoa_foto}
                        nome={activeAreaAlert?.pessoa_nome}
                        width={64}
                        borderRadius="10px"
                        accentColor="#FF3366"
                        borderWidth="2px"
                    />
                    <Box sx={{ minWidth: 0 }}>
                        <Typography fontWeight={700} sx={{ fontSize: { xs: '1.1rem', sm: '1.4rem' }, lineHeight: 1.2 }}>{activeAreaAlert?.pessoa_nome || 'Indivíduo Não Autorizado'}</Typography>
                        <Chip label="Área restrita" sx={{ mt: 0.5, bgcolor: '#FFFFFF', color: '#FF3366', fontWeight: 700, height: 22 }} />
                    </Box>
                 </Stack>
                 <Divider sx={{ my: 1.5, borderColor: 'rgba(255,255,255,0.25)' }} />
                 <Typography variant="body2"><b>Área tentada:</b> {activeAreaAlert?.area_nome || 'Restrita'}</Typography>
                 <Typography variant="caption" sx={{ mt: 0.75, display: 'block', opacity: 0.8 }}>Horário: {formatLocalTime(activeAreaAlert?.timestamp)}</Typography>
             </Box>
          </Fade>
      )}

      {/* ABA 0: FEED AO VIVO (KPIs e Filtro de Área exclusivos desta aba) */}
      {activeTab === 'feed' && (
        <>
          {/* INDICADORES DO DIA (fuso local) */}
          <KpiCards stats={stats} />

          {/* CARROSSEL / SELETOR DE ÁREAS EM TEMPO REAL COM FILTRO DE 1 CLIQUE */}
          {stats.areas && stats.areas.length > 0 && (
              <Box sx={{ mb: 2.5 }}>
                  <Typography variant="caption" fontWeight={700} color="#94A3B8" sx={{ letterSpacing: 1, mb: 1, display: 'block' }}>
                      Filtrar por área
                  </Typography>
                  <Stack direction="row" spacing={1.25} sx={{ overflowX: 'auto', pb: 1 }}>
                      <Chip
                          clickable
                          onClick={() => setFiltros(f => ({ ...f, area_id: '' }))}
                          label="Todas as áreas"
                          variant={filtros.area_id === '' ? 'filled' : 'outlined'}
                          color={filtros.area_id === '' ? 'primary' : 'default'}
                          sx={{ fontWeight: 700, px: 1 }}
                      />
                      {stats.areas.map(area => {
                          const isSelected = filtros.area_id === area.id;
                          return (
                              <Chip
                                  key={area.id}
                                  clickable
                                  onClick={() => setFiltros(f => ({ ...f, area_id: isSelected ? '' : area.id }))}
                                  icon={<AreaIcon sx={{ fontSize: 16 }} />}
                                  label={`${area.nome || area.nome_area} (${area.total_acessos_hoje || 0})${area.total_negados_hoje > 0 ? ` ${area.total_negados_hoje}` : ''}`}
                                  color={isSelected ? 'info' : area.total_negados_hoje > 0 ? 'error' : 'default'}
                                  variant={isSelected ? 'filled' : 'outlined'}
                                  sx={{
                                      fontWeight: 700,
                                      borderColor: isSelected ? '#00D4FF' : area.total_negados_hoje > 0 ? '#FF3366' : 'rgba(255,255,255,0.15)',
                                      boxShadow: isSelected ? '0 0 10px rgba(0,212,255,0.4)' : 'none'
                                  }}
                              />
                          );
                      })}
                  </Stack>
              </Box>
          )}

        <Grid container spacing={3}>
            <Grid item xs={12}>
                <GlassCard sx={{ 
                    p: { xs: 1.5, sm: 2 }, 
                    mb: 2, 
                    display: 'flex', 
                    flexDirection: { xs: 'column', md: 'row' }, 
                    gap: 1.5, 
                    alignItems: { xs: 'stretch', md: 'center' },
                    flexWrap: 'wrap'
                }}>
                    <Stack direction="row" spacing={1} alignItems="center" sx={{ display: { xs: 'none', md: 'flex' } }}>
                        <FilterIcon sx={{ color: '#00D4FF', fontSize: 22 }} />
                    </Stack>
                    <FormControl size="small" sx={{ flex: { xs: '1 1 100%', sm: '1 1 180px' }, minWidth: 140 }}>
                        <InputLabel>Área</InputLabel>
                        <Select 
                            label="Área" 
                            value={filtros.area_id} 
                            onChange={(e) => setFiltros({...filtros, area_id: e.target.value})}
                            sx={{ height: 38, borderRadius: '8px', fontSize: '0.8125rem' }}
                        >
                            <MenuItem value="">Todas as áreas</MenuItem>
                            {areas.map(a => <MenuItem key={a.id} value={a.id}>{a.nome || a.nome_area}</MenuItem>)}
                        </Select>
                    </FormControl>
                    <FormControl size="small" sx={{ flex: { xs: '1 1 100%', sm: '1 1 180px' }, minWidth: 140 }}>
                        <InputLabel>Leitor</InputLabel>
                        <Select 
                            label="Leitor" 
                            value={filtros.dispositivo_id} 
                            onChange={(e) => setFiltros({...filtros, dispositivo_id: e.target.value})}
                            sx={{ height: 38, borderRadius: '8px', fontSize: '0.8125rem' }}
                        >
                            <MenuItem value="">Todos os leitores</MenuItem>
                            {dispositivosLista.map(d => <MenuItem key={d.id} value={d.id}>{d.nome}</MenuItem>)}
                        </Select>
                    </FormControl>
                    <FormControl size="small" sx={{ flex: { xs: '1 1 100%', sm: '1 1 140px' }, minWidth: 120 }}>
                        <InputLabel>Tipo</InputLabel>
                        <Select 
                            label="Tipo" 
                            value={filtros.tipo} 
                            onChange={(e) => setFiltros({...filtros, tipo: e.target.value})}
                            sx={{ height: 38, borderRadius: '8px', fontSize: '0.8125rem' }}
                        >
                            <MenuItem value="todos">Todos</MenuItem>
                            <MenuItem value="checkin">Check-in</MenuItem>
                            <MenuItem value="checkout">Check-out</MenuItem>
                            <MenuItem value="fiscalizacao">Fiscalização</MenuItem>
                            <MenuItem value="negado">Negado</MenuItem>
                        </Select>
                    </FormControl>
                    <Button 
                        variant="outlined" 
                        color="primary" 
                        onClick={() => setFiltros({area_id:'', dispositivo_id: '', tipo: ''})}
                        sx={{ 
                            height: 38, 
                            minHeight: 38,
                            fontWeight: 700, 
                            fontSize: '0.75rem',
                            borderRadius: '8px',
                            px: 2.5
                        }}
                    >
                        Limpar
                    </Button>
                </GlassCard>

                <GlassCard sx={{ 
                    minHeight: { xs: 450, md: 520 }, 
                    maxHeight: { xs: '70dvh', md: 'calc(100vh - 280px)' }, 
                    overflow: 'hidden', 
                    display: 'flex', 
                    flexDirection: 'column' 
                }}>
                    <Box sx={{ p: 2, background: 'rgba(0,0,0,0.3)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <Typography variant="subtitle2" fontWeight={700} color="#FFFFFF">Acessos em tempo real</Typography>
                        <Stack direction="row" spacing={1} alignItems="center">
                            {loading && <CircularProgress size={12} sx={{ color: '#00D4FF' }} />}
                            <Typography variant="caption" color="#94A3B8">{logs.length} registros</Typography>
                        </Stack>
                    </Box>
                    {loading && logs.length === 0 && <LinearProgress sx={{ height: 2 }} />}
                    <Box sx={{ 
                        flex: 1, 
                        overflowY: 'auto',
                        '&::-webkit-scrollbar': { width: 6 },
                        '&::-webkit-scrollbar-thumb': { bgcolor: 'rgba(0, 212, 255, 0.2)', borderRadius: 1.5 }
                    }}>
                        {!loading && logs.length === 0 && (
                            <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', gap: 2, opacity: 0.5 }}>
                                <MonitorIcon sx={{ fontSize: 48, color: '#00D4FF' }} />
                                <Typography variant="body2" color="text.secondary">Nenhum acesso registrado ainda.</Typography>
                                <Typography variant="caption" color="text.secondary">Os eventos aparecerão aqui em tempo real conforme as pessoas passam pelos leitores.</Typography>
                            </Box>
                        )}
                        {logs.map((log, idx) => {
                            const isNegado = log.tipo === 'negado' || log.resultado === 'negado';
                            const isFiscalizacao = log.tipo === 'fiscalizacao';
                            const isWatchlist = isAdminMaster && !!log.pessoas?.cpf && cpfsWatchlist.has(log.pessoas.cpf);
                            return (
                                <LogItem key={log.id || idx} tipo={isNegado ? 'negado' : log.tipo} monitorado={isWatchlist}>
                                    <PessoaFoto
                                        src={log.pessoas?.foto_url}
                                        nome={log.pessoas?.nome_completo || log.pessoas?.nome || log.pessoa_nome}
                                        width={44}
                                        borderRadius="8px"
                                        accentColor={isNegado ? '#FF3366' : isWatchlist ? '#FFB800' : isFiscalizacao ? '#00D4FF' : log.tipo === 'checkin' ? '#00FF88' : '#FF8800'}
                                    />
                                    <Box sx={{ flex: 1, minWidth: 0 }}>
                                        <Typography component="div" variant="body2" fontWeight={700} color={isWatchlist ? '#FFB800' : '#FFFFFF'} noWrap sx={{ fontSize: { xs: '0.875rem', sm: '0.9375rem' } }}>
                                            {log.pessoas?.nome_completo || log.pessoas?.nome || log.pessoa_nome || 'Anônimo'}
                                            {isWatchlist && <Chip label="Monitorado" size="small" sx={{ ml: 1, bgcolor: '#FFB800', color: '#000000', fontWeight: 700, height: 18, fontSize: '0.6875rem' }} />}
                                        </Typography>
                                        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={{ xs: 0, sm: 2 }}>
                                            <Typography variant="caption" color="text.secondary" noWrap>{log.area_nome || 'Sem área'}</Typography>
                                            <Typography variant="caption" color="text.secondary" noWrap>Leitor: {log.dispositivos_acesso?.nome || log.dispositivo_nome || (/^[0-9a-f]{8}-/i.test(log.dispositivo_id || '') ? 'Leitor' : log.dispositivo_id) || 'Fiscal Portátil'}</Typography>
                                        </Stack>
                                    </Box>
                                    <Box sx={{ textAlign: 'right', minWidth: { xs: 78, sm: 120 }, flexShrink: 0 }}>
                                        <Stack direction="row" spacing={0.5} justifyContent="flex-end" alignItems="center">
                                            {isNegado ? <BlockIcon sx={{ color: '#FF3366', fontSize: 16 }} /> : 
                                             isFiscalizacao ? <SecurityIcon sx={{ color: '#00D4FF', fontSize: 16 }} /> :
                                             log.tipo === 'checkin' ? <LoginIcon sx={{ color: '#00FF88', fontSize: 16 }} /> : 
                                             <CheckoutIcon sx={{ color: '#FF8800', fontSize: 16 }} />}
                                            <Typography
                                                variant="caption"
                                                fontWeight={700}
                                                sx={{ fontSize: { xs: '0.75rem', sm: '0.8125rem' } }}
                                                color={
                                                    isNegado ? '#FF3366' : 
                                                    isFiscalizacao ? '#00D4FF' :
                                                    log.tipo === 'checkin' ? '#00FF88' : '#FF8800'
                                                }
                                            >
                                                {isNegado ? 'Negado' : isFiscalizacao ? 'Fiscaliz.' : log.tipo === 'checkin' ? 'Entrada' : 'Saída'}
                                            </Typography>
                                        </Stack>
                                        <Typography variant="caption" color="text.secondary" sx={{ fontVariantNumeric: 'tabular-nums' }}>
                                            {formatLocalTime(log.created_at)}
                                        </Typography>
                                        {isNegado && <Typography variant="caption" display="block" color="#FF3366" noWrap sx={{ maxWidth: { xs: 110, sm: 260 } }}>{log.observacao}</Typography>}
                                    </Box>
                                </LogItem>
                            );
                        })}
                    </Box>
                </GlassCard>
            </Grid>
        </Grid>
        </>
      )}

      {/* ABA 1: TERMINAIS */}
      {activeTab === 'terminais' && (
          <GlassCard sx={{ p: { xs: 1.5, sm: 0 } }}>
              {/* VISÃO MOBILE (CARDS) */}
              <Stack spacing={1.25} sx={{ display: { xs: 'flex', sm: 'none' } }}>
                  {terminais.length === 0 && (
                      <Box sx={{ py: 4, textAlign: 'center' }}>
                          <Typography variant="body2" color="text.secondary">
                              Nenhum leitor ou terminal cadastrado neste evento.
                          </Typography>
                      </Box>
                  )}
                  {terminais.map(t => (
                      <Box
                          key={t.id}
                          sx={{
                              p: 1.5,
                              borderRadius: 1.5,
                              bgcolor: 'rgba(255,255,255,0.03)',
                              border: '1px solid rgba(255,255,255,0.08)'
                          }}
                      >
                          <Stack direction="row" justifyContent="space-between" alignItems="center" spacing={1} mb={0.75}>
                              <Typography variant="subtitle2" fontWeight={700} color="#FFFFFF" noWrap>
                                  {t.nome}
                              </Typography>
                              <Chip
                                  label={comoRotulo(t.status)}
                                  size="small"
                                  color={t.status === 'online' ? 'success' : 'error'}
                                  sx={{ fontWeight: 700, height: 20, fontSize: '0.72rem' }}
                              />
                          </Stack>
                          <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap mb={0.5}>
                              <Chip label={comoRotulo(t.tipo)} size="small" variant="outlined" sx={{ height: 20, fontSize: '0.7rem' }} />
                              <Typography variant="caption" color="text.secondary">
                                  Área: <b style={{ color: '#E2E8F0' }}>{t.evento_areas?.nome_area || t.evento_areas?.nome || 'Sem área'}</b>
                              </Typography>
                          </Stack>
                          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', fontSize: '0.72rem' }}>
                              Último contato: {t.ultimo_ping ? format(new Date(t.ultimo_ping), 'dd/MM HH:mm:ss') : 'Nunca conectado'}
                          </Typography>
                      </Box>
                  ))}
              </Stack>

              {/* VISÃO DESKTOP (TABELA) */}
              <TableContainer component={Paper} sx={{ 
                  display: { xs: 'none', sm: 'block' },
                  background: 'transparent',
                  overflowX: 'auto',
                  '&::-webkit-scrollbar': { height: 6 },
                  '&::-webkit-scrollbar-thumb': { bgcolor: 'rgba(0, 212, 255, 0.2)', borderRadius: 1.5 }
              }}>
                  <Table sx={{ minWidth: 620 }}>
                      <TableHead sx={{ bgcolor: 'rgba(0,0,0,0.4)' }}>
                          <TableRow>
                              <TableCell>Leitor</TableCell>
                              <TableCell>Área</TableCell>
                              <TableCell>Tipo</TableCell>
                              <TableCell>Status</TableCell>
                              <TableCell>Último contato</TableCell>
                          </TableRow>
                      </TableHead>
                      <TableBody>
                          {terminais.map(t => (
                              <TableRow key={t.id}>
                                  <TableCell sx={{ fontWeight: 700 }}>{t.nome}</TableCell>
                                  <TableCell>{t.evento_areas?.nome_area || t.evento_areas?.nome || 'Sem área'}</TableCell>
                                  <TableCell><Chip label={comoRotulo(t.tipo)} size="small" variant="outlined" /></TableCell>
                                  <TableCell>
                                      <Chip 
                                        label={comoRotulo(t.status)} 
                                        color={t.status === 'online' ? 'success' : 'error'}
                                        sx={{ fontWeight: 700 }}
                                      />
                                  </TableCell>
                                  <TableCell>{t.ultimo_ping ? format(new Date(t.ultimo_ping), 'dd/MM HH:mm:ss') : 'Nunca Conectado'}</TableCell>
                              </TableRow>
                          ))}
                      </TableBody>
                  </Table>
              </TableContainer>
          </GlassCard>
      )}

      {/* ABA 2: WATCHLIST (ADMIN_MASTER ONLY) */}
      {activeTab === 'watchlist' && isAdminMaster && (
          <Grid container spacing={2.5}>
              <Grid item xs={12} md={8}>
                  <GlassCard sx={{ p: { xs: 2, sm: 3 } }}>
                      <Stack direction="column" gap={2} mb={2.5}>
                        <Box>
                            <Typography variant="h6" fontWeight={700} sx={{ fontSize: { xs: '1.05rem', sm: '1.25rem' } }}>Alvos em monitoramento (watchlist)</Typography>
                            <Typography variant="caption" color="text.secondary">
                                Pessoas procuradas ou em atenção especial. Disparam alarmes ao passar em catracas, check-ins ou câmeras.
                            </Typography>
                        </Box>
                        <Stack direction="row" useFlexGap flexWrap="wrap" gap={1} alignItems="center">
                            <Button variant="outlined" component="label" size="small" startIcon={<UploadIcon />} sx={{ ...botaoSecundario, flex: { xs: '1 1 calc(50% - 4px)', sm: '0 0 auto' } }}>
                                Importar CSV
                                <input type="file" hidden accept=".csv" onChange={handleUploadCSV} />
                            </Button>
                            <Button variant="outlined" size="small" startIcon={<DownloadIcon />} onClick={baixarModeloCSV} sx={{ ...botaoSecundario, flex: { xs: '1 1 calc(50% - 4px)', sm: '0 0 auto' } }}>
                                Modelo CSV
                            </Button>
                            <Button variant="outlined" size="small" startIcon={<DownloadIcon />} onClick={handleExportCSV} sx={{ ...botaoSecundario, flex: { xs: '1 1 calc(50% - 4px)', sm: '0 0 auto' } }}>
                                Exportar base
                            </Button>
                            <NeonButton size="small" startIcon={<PersonAddIcon />} onClick={() => setOpenTargetDialog(true)} sx={{ whiteSpace: 'nowrap', flex: { xs: '1 1 calc(50% - 4px)', sm: '0 0 auto' } }}>
                                Novo alvo
                            </NeonButton>
                        </Stack>
                      </Stack>

                      {/* VISÃO MOBILE (CARDS DA WATCHLIST) */}
                      <Stack spacing={1.5} sx={{ display: { xs: 'flex', sm: 'none' } }}>
                          {watchlist.length === 0 ? (
                              <Box sx={{ textAlign: 'center', py: 3, color: 'text.secondary' }}>
                                  <Typography variant="body2">Nenhum CPF cadastrado na lista de alvos monitorados.</Typography>
                              </Box>
                          ) : (
                              watchlist.map(w => (
                                  <Box
                                      key={w.id}
                                      sx={{
                                          p: 1.5,
                                          borderRadius: 1.5,
                                          bgcolor: 'rgba(255, 184, 0, 0.04)',
                                          border: '1px solid rgba(255, 184, 0, 0.25)'
                                      }}
                                  >
                                      <Stack direction="row" justifyContent="space-between" alignItems="flex-start" spacing={1} mb={0.5}>
                                          <Box sx={{ minWidth: 0 }}>
                                              <Typography variant="subtitle2" fontWeight={700} color="#FFFFFF" noWrap>
                                                  {w.nome || 'Alvo Monitorado'}
                                              </Typography>
                                              <Typography variant="caption" sx={{ fontFamily: '"Inter", sans-serif', color: '#FFB800', fontWeight: 700 }}>
                                                  CPF: {w.cpf}
                                              </Typography>
                                          </Box>
                                          <Chip
                                              label={comoRotulo(w.nivel_alerta || 'alto')}
                                              size="small"
                                              color={w.nivel_alerta === 'critico' ? 'error' : w.nivel_alerta === 'alto' ? 'warning' : 'info'}
                                              sx={{ fontWeight: 700, height: 20, fontSize: '0.7rem' }}
                                          />
                                      </Stack>
                                      <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1.25 }}>
                                          {w.motivo || 'Monitoramento Policial / Restrição'}
                                      </Typography>
                                      <Stack direction="row" spacing={1}>
                                          <Button
                                              fullWidth
                                              variant="outlined"
                                              size="small"
                                              startIcon={<VisibilityOffIcon fontSize="small" />}
                                              onClick={() => handleOpenDeixarMonitorar(w)}
                                              sx={{
                                                  fontSize: '0.72rem',
                                                  fontWeight: 700,
                                                  borderColor: '#00D4FF',
                                                  color: '#00D4FF',
                                                  py: 0.5
                                              }}
                                          >
                                              Localizado
                                          </Button>
                                          <Button
                                              fullWidth
                                              variant="contained"
                                              color="success"
                                              size="small"
                                              startIcon={<CheckCircleIcon fontSize="small" />}
                                              onClick={() => handleOpenUnblock(w)}
                                              sx={{ fontSize: '0.72rem', fontWeight: 700, py: 0.5 }}
                                          >
                                              Desbloquear
                                          </Button>
                                      </Stack>
                                  </Box>
                              ))
                          )}
                      </Stack>

                      {/* VISÃO DESKTOP (TABELA DA WATCHLIST) */}
                      <TableContainer sx={{ 
                          display: { xs: 'none', sm: 'block' },
                          overflowX: 'auto',
                          '&::-webkit-scrollbar': { height: 6 },
                          '&::-webkit-scrollbar-thumb': { bgcolor: 'rgba(255, 184, 0, 0.2)', borderRadius: 1.5 }
                      }}>
                          <Table size="small" sx={{ minWidth: 560 }}>
                              <TableHead sx={{ bgcolor: 'rgba(0,0,0,0.3)' }}>
                                  <TableRow>
                                      <TableCell>CPF</TableCell>
                                      <TableCell>Nome</TableCell>
                                      <TableCell>Motivo do bloqueio</TableCell>
                                      <TableCell>Nível</TableCell>
                                      <TableCell sx={{ textAlign: 'center' }}>Ações de segurança</TableCell>
                                  </TableRow>
                              </TableHead>
                              <TableBody>
                                  {watchlist.map(w => (
                                      <TableRow key={w.id} sx={{ '&:hover': { bgcolor: 'rgba(255, 184, 0, 0.05)' } }}>
                                          <TableCell sx={{ fontFamily: '"Inter", sans-serif', fontWeight: 700 }}>{w.cpf}</TableCell>
                                          <TableCell sx={{ fontWeight: 700 }}>{w.nome || 'Alvo Monitorado'}</TableCell>
                                          <TableCell sx={{ color: 'text.secondary' }}>{w.motivo || 'Monitoramento Policial / Restrição'}</TableCell>
                                          <TableCell>
                                              <Chip 
                                                  label={comoRotulo(w.nivel_alerta || 'alto')} 
                                                  size="small" 
                                                  color={w.nivel_alerta === 'critico' ? 'error' : w.nivel_alerta === 'alto' ? 'warning' : 'info'} 
                                                  sx={{ fontWeight: 700 }}
                                              />
                                          </TableCell>
                                          <TableCell sx={{ textAlign: 'center' }}>
                                              <Stack direction="row" spacing={1} justifyContent="center">
                                                  <Tooltip title="Alvo localizado! Deixar de monitorar e encerrar rastreamento">
                                                      <Button
                                                          variant="outlined"
                                                          size="small"
                                                          startIcon={<VisibilityOffIcon fontSize="small" />}
                                                          onClick={() => handleOpenDeixarMonitorar(w)}
                                                          sx={{ 
                                                              fontSize: '0.75rem', 
                                                              fontWeight: 700, 
                                                              borderColor: '#00D4FF', 
                                                              color: '#00D4FF',
                                                              px: 1.2,
                                                              py: 0.5,
                                                              '&:hover': { bgcolor: 'rgba(0, 212, 255, 0.1)', borderColor: '#00D4FF' } 
                                                          }}
                                                      >
                                                          Localizado
                                                      </Button>
                                                  </Tooltip>
                                                  <Tooltip title="Desbloquear indivíduo (libera acesso geral em todos os eventos)">
                                                      <Button
                                                          variant="contained"
                                                          color="success"
                                                          size="small"
                                                          startIcon={<CheckCircleIcon fontSize="small" />}
                                                          onClick={() => handleOpenUnblock(w)}
                                                          sx={{ fontSize: '0.75rem', fontWeight: 700, px: 1.2, py: 0.5 }}
                                                      >
                                                          Desbloquear
                                                      </Button>
                                                  </Tooltip>
                                              </Stack>
                                          </TableCell>
                                      </TableRow>
                                  ))}
                                  {watchlist.length === 0 && (
                                      <TableRow>
                                          <TableCell colSpan={5} sx={{ textAlign: 'center', py: 4, color: 'text.secondary' }}>
                                              Nenhum CPF cadastrado na lista de alvos monitorados deste evento.
                                          </TableCell>
                                      </TableRow>
                                  )}
                              </TableBody>
                          </Table>
                      </TableContainer>
                  </GlassCard>
              </Grid>

              <Grid item xs={12} md={4}>
                  <GlassCard sx={{ p: { xs: 2, sm: 3 } }}>
                      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
                          <Box>
                              <Typography variant="h6" fontWeight={700}>Notificações externas</Typography>
                              <Typography variant="caption" sx={{ display: 'block', opacity: 0.7 }}>
                                  Alertas instantâneos via Telegram e WhatsApp
                              </Typography>
                          </Box>
                          <IconButton 
                              size="small" 
                              onClick={() => setOpenContactDialog(true)}
                              sx={{ bgcolor: 'rgba(0,212,255,0.1)', color: '#00D4FF', '&:hover': { bgcolor: 'rgba(0,212,255,0.2)' } }}
                          >
                              <AddIcon fontSize="small" />
                          </IconButton>
                      </Box>
                      
                      <Box sx={{ mt: 2, display: 'flex', flexDirection: 'column', gap: 1.5 }}>
                          {contatos.map(c => (
                              <GlassCard key={c.id} sx={{ p: 1.5, display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'rgba(0,0,0,0.3)' }}>
                                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                                      <Avatar sx={{ 
                                          bgcolor: c.canal === 'telegram' ? 'rgba(0, 136, 204, 0.2)' : c.canal === 'whatsapp' ? 'rgba(37, 211, 102, 0.2)' : 'rgba(255, 136, 0, 0.2)',
                                          color: c.canal === 'telegram' ? '#0099BB' : c.canal === 'whatsapp' ? '#25D366' : '#FF8800',
                                          width: 36, height: 36
                                      }}>
                                          {c.canal === 'telegram' ? <TelegramIcon sx={{ fontSize: 20 }} /> : c.canal === 'whatsapp' ? <WhatsAppIcon sx={{ fontSize: 20 }} /> : <EmailIcon sx={{ fontSize: 20 }} />}
                                      </Avatar>
                                      <Box>
                                          <Typography variant="subtitle2" fontWeight={700}>{c.nome}</Typography>
                                          <Typography variant="caption" sx={{ fontFamily: '"Inter", sans-serif', color: 'text.secondary', display: 'block' }}>
                                              {c.canal?.toUpperCase()}: {c.telefone}
                                          </Typography>
                                      </Box>
                                  </Box>
                                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                                      <Chip size="small" label="Ativo" color="success" sx={{ fontSize: '0.75rem', height: 20, fontWeight: 700 }} />
                                      <IconButton size="small" color="error" onClick={() => removeContato(c.id)}>
                                          <TrashIcon sx={{ fontSize: 16 }} />
                                      </IconButton>
                                  </Box>
                              </GlassCard>
                          ))}

                          {contatos.length === 0 && (
                              <Box sx={{ p: 2, textAlign: 'center', bgcolor: 'rgba(255,255,255,0.02)', borderRadius: 1.5 }}>
                                  <Typography variant="caption" color="text.secondary">
                                      Nenhum contato externo configurado.<br />
                                      Os alertas serão despachados aos administradores master.
                                  </Typography>
                              </Box>
                          )}

                          <Button 
                              fullWidth 
                              variant="outlined" 
                              startIcon={<AddIcon />} 
                              onClick={() => setOpenContactDialog(true)}
                              sx={{ mt: 1, borderColor: '#00D4FF', color: '#00D4FF' }}
                          >
                              Adicionar contato
                          </Button>
                      </Box>
                  </GlassCard>
              </Grid>
          </Grid>
      )}

      {/* ABA 3: CENTRAL CFTV & CÂMERAS IP */}
      {activeTab === 'cameras' && (
          <Box>
            {/* CABEÇALHO DA CENTRAL CFTV */}
            <Stack direction={{ xs: 'column', md: 'row' }} justifyContent="space-between" alignItems={{ xs: 'flex-start', md: 'center' }} gap={1.5} mb={2}>
                <Box sx={{ width: '100%' }}>
                    <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap sx={{ mb: 0.5 }}>
                        <Typography variant="h5" fontWeight={700} sx={{ fontSize: { xs: '1.1rem', sm: '1.35rem' }, letterSpacing: 0.5, display: 'flex', alignItems: 'center', gap: 1 }}>
                            <DvrIcon sx={{ color: '#00D4FF', fontSize: { xs: 22, sm: 28 } }} />
                            Central de monitoramento CFTV
                        </Typography>
                        {(() => {
                            const cor = iaErro ? '#FF3366' : iaStatus ? (iaStatus.hardware_acceleration === 'CPU' ? '#FFB800' : '#00FF88') : '#94A3B8';
                            const rotulo = iaErro ? 'IA offline'
                                : iaStatus ? `IA ativa • ${iaStatus.hardware_acceleration}`
                                : 'Verificando IA...';
                            return (
                                <Tooltip title={iaErro || (iaStatus?.hardware_acceleration === 'CPU' ? 'A IA está rodando sem placa de vídeo: reconhecimento mais lento' : '')}>
                                    <Chip
                                        icon={<DotIcon sx={{ fontSize: 10, color: `${cor} !important` }} />}
                                        label={rotulo}
                                        size="small"
                                        sx={{ bgcolor: `${cor}1F`, color: cor, border: '1px solid currentColor', fontWeight: 700, fontSize: '0.72rem', height: 22 }}
                                    />
                                </Tooltip>
                            );
                        })()}
                        <Chip
                            label={`${displayedCameras.length}/${cameras.length} no mosaico`}
                            size="small"
                            sx={{
                                bgcolor: 'rgba(0, 212, 255, 0.12)',
                                color: '#00D4FF',
                                border: '1px solid rgba(0, 212, 255, 0.3)',
                                fontWeight: 700,
                                fontSize: '0.72rem',
                                height: 22
                            }}
                        />
                    </Stack>
                    <Typography variant="caption" color="text.secondary" sx={{ display: 'block', lineHeight: 1.4 }}>
                        {iaStatus
                            ? `Perfil ${NOMES_PERFIL[iaConfig.perfil] || iaConfig.perfil} • ${(iaStatus.cameras || []).filter(c => c.conectada).length} com vídeo • ${(iaStatus.cameras || []).reduce((n, c) => n + (c.rostos || 0), 0)} rosto(s) • ${iaStatus.ia?.ms_por_analise ?? 0} ms • ${iaStatus.registered_faces_indexed ?? 0} na base`
                            : 'Stream IP / RTSP • Detecção facial SCRFD • Reconhecimento ArcFace 512-D'}
                    </Typography>
                </Box>
            </Stack>

            {/* BARRA DE FERRAMENTAS CFTV RESPONSIVA */}
            <Box sx={{ 
                display: 'flex', 
                flexDirection: { xs: 'column', md: 'row' },
                alignItems: { xs: 'stretch', md: 'center' }, 
                justifyContent: 'space-between', 
                gap: 1, 
                mb: 2
            }}>
                {/* BOTÕES DE GERENCIAMENTO E SELEÇÃO */}
                <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap>
                    <Button
                        variant="contained"
                        size="small"
                        startIcon={<SettingsIcon sx={{ fontSize: 16 }} />}
                        onClick={() => setOpenGerenciarCamerasModal(true)}
                        sx={{ height: 34, whiteSpace: 'nowrap', flex: { xs: '1 1 auto', sm: '0 0 auto' }, fontSize: '0.75rem' }}
                    >
                        Gerenciar câmeras
                    </Button>

                    <Button
                        variant="outlined"
                        size="small"
                        startIcon={<GridViewIcon sx={{ fontSize: 16 }} />}
                        onClick={() => setOpenSelectCamerasDialog(true)}
                        sx={{ ...botaoSecundario, height: 34, minHeight: 34, flex: { xs: '1 1 auto', sm: '0 0 auto' }, fontSize: '0.75rem' }}
                    >
                        Mosaico ({displayedCameras.length})
                    </Button>

                    {cameras.length > 0 && (
                        <Button
                            variant="outlined"
                            size="small"
                            color={temCameraAtiva ? 'warning' : 'success'}
                            startIcon={togglingAllCams ? <CircularProgress size={14} color="inherit" /> : <PowerIcon sx={{ fontSize: 16 }} />}
                            onClick={handleToggleAllCameras}
                            disabled={togglingAllCams}
                            sx={{ height: 34, minHeight: 34, fontWeight: 700, fontSize: '0.75rem', whiteSpace: 'nowrap', flex: { xs: '1 1 auto', sm: '0 0 auto' } }}
                        >
                            {temCameraAtiva ? 'Desativar todas' : 'Ativar todas'}
                        </Button>
                    )}
                </Stack>

                {/* CONTROLES DE GRADE, MODO, VIDEO WALL E ATUALIZAR */}
                <Stack direction="row" spacing={1} alignItems="center" justifyContent={{ xs: 'space-between', md: 'flex-end' }} sx={{ overflowX: 'auto' }}>
                    {/* SELETOR DE COLUNAS MOBILE (1x1 ou 2x2) */}
                    <ButtonGroup size="small" variant="outlined" sx={{ height: 32, borderColor: 'rgba(255,255,255,0.15)', display: { xs: 'inline-flex', md: 'none' } }}>
                        {[
                            { id: '1', label: '1x1', active: gridColumns !== '2' },
                            { id: '2', label: '2x2', active: gridColumns === '2' }
                        ].map(({ id, label, active }) => (
                            <Button
                                key={id}
                                onClick={() => handleColsChange(id)}
                                sx={{
                                    height: 32,
                                    fontSize: '0.75rem',
                                    fontWeight: 700,
                                    px: 1.25,
                                    minWidth: 44,
                                    bgcolor: active ? '#00D4FF' : 'transparent',
                                    color: active ? '#000000' : '#94A3B8',
                                    borderColor: 'rgba(255,255,255,0.15)',
                                    '&:hover': { bgcolor: active ? '#00D4FF' : 'rgba(255,255,255,0.05)' }
                                }}
                            >
                                {label}
                            </Button>
                        ))}
                    </ButtonGroup>

                    {/* SELETOR DE COLUNAS DESKTOP */}
                    <ButtonGroup size="small" variant="outlined" sx={{ height: 32, borderColor: 'rgba(255,255,255,0.15)', display: { xs: 'none', md: 'inline-flex' } }}>
                        {[
                            { id: '4', label: '4 câmeras' },
                            { id: '3', label: '3 câmeras' },
                            { id: '2', label: '2 câmeras' },
                            { id: '1', label: '1 (Foco)' }
                        ].map(({ id, label }) => (
                            <Button
                                key={id}
                                onClick={() => handleColsChange(id)}
                                sx={{
                                    height: 32,
                                    fontSize: '0.75rem',
                                    fontWeight: 700,
                                    px: 1.2,
                                    whiteSpace: 'nowrap',
                                    bgcolor: gridColumns === id ? '#00D4FF' : 'transparent',
                                    color: gridColumns === id ? '#000000' : '#94A3B8',
                                    borderColor: 'rgba(255,255,255,0.15)',
                                    '&:hover': { bgcolor: gridColumns === id ? '#00D4FF' : 'rgba(255,255,255,0.05)' }
                                }}
                            >
                                {label}
                            </Button>
                        ))}
                    </ButtonGroup>

                    {/* MODO DE TRANSMISSÃO */}
                    <ButtonGroup size="small" variant="outlined" sx={{ height: 32, borderColor: 'rgba(255,255,255,0.15)' }}>
                        <Button
                            onClick={() => handleLiveGridToggle(true)}
                            sx={{
                                height: 32,
                                fontSize: '0.75rem',
                                fontWeight: 700,
                                px: 1.2,
                                whiteSpace: 'nowrap',
                                bgcolor: liveStreamInGrid ? 'rgba(0, 255, 136, 0.15)' : 'transparent',
                                color: liveStreamInGrid ? '#00FF88' : '#94A3B8',
                                borderColor: liveStreamInGrid ? '#00FF88' : 'rgba(255,255,255,0.15)',
                                '&:hover': { bgcolor: 'rgba(0, 255, 136, 0.2)' }
                            }}
                        >
                            Ao vivo
                        </Button>
                        <Button
                            onClick={() => handleLiveGridToggle(false)}
                            sx={{
                                height: 32,
                                fontSize: '0.75rem',
                                fontWeight: 700,
                                px: 1.2,
                                whiteSpace: 'nowrap',
                                bgcolor: !liveStreamInGrid ? 'rgba(0, 212, 255, 0.15)' : 'transparent',
                                color: !liveStreamInGrid ? '#00D4FF' : '#94A3B8',
                                borderColor: !liveStreamInGrid ? '#00D4FF' : 'rgba(255,255,255,0.15)',
                                '&:hover': { bgcolor: 'rgba(0, 212, 255, 0.2)' }
                            }}
                        >
                            Snapshots
                        </Button>
                    </ButtonGroup>

                    {/* VIDEO WALL PARA 2º MONITOR */}
                    <Button
                        variant="outlined"
                        size="small"
                        startIcon={<DesktopWindowsIcon sx={{ fontSize: 16 }} />}
                        onClick={handleOpenVideoWallPopup}
                        sx={{
                            display: { xs: 'none', sm: 'inline-flex' },
                            height: 32,
                            borderColor: 'rgba(0, 255, 136, 0.5)',
                            color: '#00FF88',
                            fontWeight: 700,
                            fontSize: '0.75rem',
                            px: 1.5,
                            borderRadius: 1.5,
                            whiteSpace: 'nowrap',
                            bgcolor: 'rgba(0, 255, 136, 0.05)',
                            '&:hover': {
                                borderColor: '#00FF88',
                                bgcolor: 'rgba(0, 255, 136, 0.15)'
                            }
                        }}
                    >
                        Video wall
                    </Button>

                    <Stack direction="row" spacing={0.75} alignItems="center">
                        {/* SOM DOS ALERTAS */}
                        <Tooltip title={somAtivo ? 'Silenciar alertas' : 'Ativar som dos alertas'}>
                            <IconButton
                                size="small"
                                onClick={() => setSomAtivo(!somAtivo)}
                                sx={{
                                    height: 32,
                                    width: 32,
                                    border: '1px solid rgba(255,255,255,0.18)',
                                    color: somAtivo ? '#00FF88' : '#FF3366',
                                    borderRadius: 1.5
                                }}
                            >
                                {somAtivo ? <SomIcon sx={{ fontSize: 16 }} /> : <SemSomIcon sx={{ fontSize: 16 }} />}
                            </IconButton>
                        </Tooltip>

                        {/* ATUALIZAR GRID */}
                        <Tooltip title="Atualizar câmeras">
                            <IconButton
                                size="small"
                                onClick={fetchCameras}
                                sx={{
                                    height: 32,
                                    width: 32,
                                    border: '1px solid rgba(255,255,255,0.18)',
                                    color: '#00D4FF',
                                    borderRadius: 1.5,
                                    '&:hover': { bgcolor: 'rgba(0, 212, 255, 0.1)', borderColor: '#00D4FF' }
                                }}
                            >
                                <RefreshIcon sx={{ fontSize: 16 }} />
                            </IconButton>
                        </Tooltip>
                    </Stack>
                </Stack>
            </Box>

            {/* SE NENHUMA CÂMERA CADASTRADA OU SELECIONADA */}
            {displayedCameras.length === 0 ? (
                <GlassCard sx={{ p: { xs: 3, sm: 5 }, textAlign: 'center', border: '1px dashed rgba(0, 212, 255, 0.3)' }}>
                    <CameraIcon sx={{ fontSize: 52, color: 'text.secondary', mb: 1.5, opacity: 0.5 }} />
                    <Typography variant="h6" fontWeight={700} color="#FFFFFF" gutterBottom sx={{ fontSize: { xs: '1rem', sm: '1.25rem' } }}>
                        {cameras.length === 0 ? 'Nenhuma câmera IP cadastrada no sistema' : 'Nenhuma câmera selecionada no mosaico'}
                    </Typography>
                    <Typography variant="body2" color="text.secondary" sx={{ maxWidth: 520, mx: 'auto', mb: 2.5 }}>
                        {cameras.length === 0
                            ? 'Cadastre câmeras RTSP ou IPs da rede para iniciar a vigilância e monitoramento biométrico.'
                            : 'Você filtrou ou desmarcou as câmeras. Toque no botão abaixo para escolher quais exibir.'}
                    </Typography>
                    <Stack direction="row" spacing={2} justifyContent="center">
                        {cameras.length > 0 ? (
                            <Button
                                variant="contained"
                                startIcon={<GridViewIcon />}
                                onClick={() => setOpenSelectCamerasDialog(true)}
                                sx={{ bgcolor: '#00D4FF', color: '#000000', fontWeight: 700 }}
                            >
                                Selecionar câmeras no mosaico
                            </Button>
                        ) : (
                            <Button
                                variant="contained"
                                startIcon={<SettingsIcon />}
                                onClick={() => setOpenGerenciarCamerasModal(true)}
                                sx={{ bgcolor: '#00D4FF', color: '#000000', fontWeight: 700 }}
                            >
                                Gerenciar câmeras agora
                            </Button>
                        )}
                    </Stack>
                </GlassCard>
            ) : (
                /* GRADE DE CÂMERAS CFTV PROFISSIONAL 16:9 NATIVO COM OSD */
                <Grid container spacing={{ xs: 1.25, sm: 2 }}>
                    {displayedCameras.map((cam, indice) => {
                        const isDesativada = cam.status === 'desativada' || cam.status === 'inativa';
                        const isToggling = togglingCamId === cam.id;
                        const isAlertActive = !isDesativada && alertCameras[cam.id] && (Date.now() - alertCameras[cam.id] < 30000);
                        // Vídeo ao vivo até o limite do perfil; as demais em snapshot (não sobrecarrega a internet do evento)
                        const aoVivo = !isDesativada && liveStreamInGrid && indice < (iaConfig.painel?.max_streams_ao_vivo || 9);
                        const stCam = isDesativada ? null : statusDaCamera(iaStatus, cam.id);
                        const isCompactMobile = gridColumns === '2';
                        const colProps = gridColumns === '4'
                            ? { xs: 12, sm: 6, md: 4, lg: 3 }
                            : gridColumns === '3'
                            ? { xs: 12, sm: 6, md: 6, lg: 4 }
                            : gridColumns === '2'
                            ? { xs: 6, sm: 6, md: 6, lg: 6 }
                            : { xs: 12, lg: 12 };

                        return (
                            <Grid item {...colProps} key={cam.id}>
                                <GlassCard sx={{
                                    p: 0,
                                    overflow: 'hidden',
                                    transition: 'all 0.3s ease',
                                    opacity: isDesativada ? 0.72 : 1,
                                    border: isAlertActive
                                        ? '2px solid #FF3366'
                                        : isDesativada
                                            ? '1px dashed rgba(255, 184, 0, 0.35)'
                                            : '1px solid rgba(0, 212, 255, 0.2)',
                                    bgcolor: '#050B18',
                                    boxShadow: isAlertActive ? '0 0 30px rgba(255, 30, 86, 0.7)' : '0 10px 25px rgba(0,0,0,0.6)',
                                    display: 'flex',
                                    flexDirection: 'column'
                                }}>
                                    {/* CABEÇALHO DO CARD DA CÂMERA */}
                                    <Box sx={{
                                        px: { xs: isCompactMobile ? 1 : 1.5, sm: 1.5 },
                                        py: { xs: isCompactMobile ? 0.75 : 1, sm: 1 },
                                        display: 'flex',
                                        justifyContent: 'space-between',
                                        alignItems: 'center',
                                        background: 'rgba(10, 15, 26, 0.95)',
                                        borderBottom: '1px solid rgba(255,255,255,0.06)'
                                    }}>
                                        <Stack direction="row" spacing={0.75} alignItems="center" sx={{ overflow: 'hidden', flex: 1, mr: 0.75 }}>
                                            <CameraIcon sx={{ fontSize: 15, color: isDesativada ? '#FFB800' : '#00D4FF', flexShrink: 0 }} />
                                            <Typography variant="subtitle2" fontWeight={700} noWrap sx={{ fontSize: { xs: isCompactMobile ? '0.75rem' : '0.8125rem', sm: '0.8125rem' }, color: '#FFFFFF' }}>
                                                {cam.nome}
                                            </Typography>
                                            {cam.area?.nome_area && (
                                                <Chip
                                                    label={cam.area.nome_area}
                                                    size="small"
                                                    sx={{ display: { xs: isCompactMobile ? 'none' : 'inline-flex', sm: 'inline-flex' }, height: 18, fontSize: '0.7rem', bgcolor: 'rgba(255,255,255,0.08)', color: '#94A3B8', fontWeight: 700 }}
                                                />
                                            )}
                                        </Stack>
                                        <Chip
                                            label={isDesativada ? 'Pausada' : (comoRotulo(cam.status) || 'Offline')}
                                            size="small"
                                            color={isDesativada ? 'warning' : cam.status === 'online' ? 'success' : 'error'}
                                            sx={{ height: 18, fontSize: '0.68rem', fontWeight: 700, '& .MuiChip-label': { px: 0.75 } }}
                                        />
                                    </Box>

                                    {/* CONTAINER DE VÍDEO NATIVO 16:9 COM OSD PROFISSIONAL */}
                                    <Box 
                                        sx={{
                                            position: 'relative',
                                            width: '100%',
                                            aspectRatio: '16/9',
                                            bgcolor: '#000000',
                                            cursor: isDesativada ? 'default' : 'pointer',
                                            overflow: 'hidden',
                                            display: 'flex',
                                            alignItems: 'center',
                                            justifyContent: 'center'
                                        }}
                                        onClick={() => { if (!isDesativada) setActiveStreamCam(cam); }}
                                    >
                                        <CameraVideo
                                            camId={cam.id}
                                            alt={cam.nome}
                                            modo={aoVivo ? 'stream' : 'snapshot'}
                                            qualidade="mini"
                                            // Com uma câmera em tela grande, a grade inteira pausa (as miniaturas atrás
                                            // do player continuavam baixando vídeo e disputando a internet do evento)
                                            pausado={isDesativada || !!activeStreamCam}
                                            textoPausado={isDesativada ? 'Câmera desativada' : (activeStreamCam?.id === cam.id ? 'Aberta em tela grande' : 'Pausada enquanto outra está em tela grande')}
                                        />

                                        {/* OSD: MODO, FPS REAL E ROSTOS NA CENA (CANTO SUPERIOR ESQUERDO) */}
                                        <Box sx={{
                                            position: 'absolute', top: 6, left: 6,
                                            bgcolor: 'rgba(0,0,0,0.75)', px: 0.7, py: 0.2, borderRadius: 1,
                                            display: 'flex', alignItems: 'center', gap: 0.5,
                                            border: '1px solid rgba(255,255,255,0.1)'
                                        }}>
                                            <DotIcon sx={{ fontSize: 8, color: isDesativada ? '#FFB800' : (stCam ? stCam.conectada : cam.status === 'online') ? '#00FF88' : '#94A3B8' }} />
                                            <Typography variant="caption" sx={{ fontFamily: '"Inter", sans-serif', fontSize: { xs: isCompactMobile ? '0.65rem' : '0.72rem', sm: '0.75rem' }, color: '#FFFFFF', fontWeight: 700 }}>
                                                {isDesativada ? 'PAUSADA' : `${aoVivo ? 'AO VIVO' : 'SNAP'}${stCam?.conectada ? ` • ${Math.round(stCam.video_fps)} fps` : ''}`}
                                            </Typography>
                                            {stCam?.rostos > 0 && (
                                                <>
                                                    <RostoIcon sx={{ fontSize: 11, color: '#00D4FF', ml: 0.3 }} />
                                                    <Typography variant="caption" sx={{ fontSize: '0.7rem', color: '#00D4FF', fontWeight: 700 }}>
                                                        {stCam.rostos}
                                                    </Typography>
                                                </>
                                            )}
                                        </Box>

                                        {/* OSD: IP DA CÂMERA (CANTO INFERIOR ESQUERDO COM GRADIENTE) */}
                                        <Box sx={{
                                            position: 'absolute', bottom: 0, left: 0, right: 0,
                                            background: 'linear-gradient(to top, rgba(0,0,0,0.85) 0%, transparent 100%)',
                                            px: 1, pb: 0.6, pt: 1.5,
                                            display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end'
                                        }}>
                                            <Typography variant="caption" noWrap sx={{ color: 'rgba(255,255,255,0.7)', fontFamily: '"Inter", sans-serif', fontSize: { xs: isCompactMobile ? '0.62rem' : '0.72rem', sm: '0.75rem' }, mr: 0.5 }}>
                                                {cam.ip_address ? `${cam.ip_address}:${cam.porta || 554}` : (cam.fabricante || 'RTSP')}
                                            </Typography>

                                            {!isDesativada && (
                                                <Box sx={{
                                                    bgcolor: 'rgba(0, 212, 255, 0.2)',
                                                    border: '1px solid rgba(0, 212, 255, 0.4)',
                                                    borderRadius: 1,
                                                    px: 0.6, py: 0.15,
                                                    display: 'flex', alignItems: 'center', gap: 0.3,
                                                    flexShrink: 0
                                                }}>
                                                    <FullscreenIcon sx={{ fontSize: 12, color: '#00D4FF' }} />
                                                    <Typography variant="caption" sx={{ display: { xs: isCompactMobile ? 'none' : 'inline', sm: 'inline' }, fontSize: '0.7rem', color: '#00D4FF', fontWeight: 700 }}>
                                                        Expandir
                                                    </Typography>
                                                </Box>
                                            )}
                                        </Box>
                                    </Box>

                                    {/* BARRA DE AÇÕES DO CARD */}
                                    <Box sx={{ p: { xs: isCompactMobile ? 0.75 : 1, sm: 1 }, display: 'flex', gap: 0.75, alignItems: 'center', bgcolor: 'rgba(0,0,0,0.6)', borderTop: '1px solid rgba(255,255,255,0.04)' }}>
                                        {isDesativada ? (
                                            <Button
                                                size="small" fullWidth variant="contained" color="success"
                                                startIcon={isToggling ? <CircularProgress size={14} color="inherit" /> : <PowerIcon sx={{ fontSize: 15 }} />}
                                                disabled={isToggling}
                                                onClick={() => handleToggleCameraStatus(cam)}
                                                sx={{ height: 30, minHeight: 30, fontWeight: 700, fontSize: '0.72rem', px: 1 }}
                                            >
                                                Ativar
                                            </Button>
                                        ) : (
                                            <>
                                                <Button
                                                    size="small" fullWidth variant="outlined"
                                                    startIcon={<CameraIcon sx={{ fontSize: 15, display: { xs: isCompactMobile ? 'none' : 'inline-flex', sm: 'inline-flex' } }} />}
                                                    onClick={() => setActiveStreamCam(cam)}
                                                    sx={{ ...botaoSecundario, height: 30, minHeight: 30, fontSize: '0.72rem', px: 1 }}
                                                >
                                                    Ao vivo
                                                </Button>
                                                <Button
                                                    size="small" fullWidth variant="outlined"
                                                    disabled={testResults[cam.id] === 'testing'}
                                                    onClick={() => handleTestCamera(cam.id)}
                                                    sx={{ ...botaoSecundario, height: 30, minHeight: 30, fontSize: '0.72rem', px: 1, display: { xs: isCompactMobile ? 'none' : 'inline-flex', sm: 'inline-flex' } }}
                                                >
                                                    {testResults[cam.id] === 'testing' ? <CircularProgress size={14} /> : 'Testar'}
                                                </Button>
                                                <Tooltip title="Desativar câmera (pausar vídeo e IA)">
                                                    <IconButton
                                                        size="small"
                                                        disabled={isToggling}
                                                        onClick={() => handleToggleCameraStatus(cam)}
                                                        sx={{
                                                            height: 30,
                                                            width: 30,
                                                            flexShrink: 0,
                                                            color: '#FFB800',
                                                            border: '1px solid rgba(255, 184, 0, 0.35)',
                                                            borderRadius: 1.5,
                                                            '&:hover': { bgcolor: 'rgba(255, 184, 0, 0.15)' }
                                                        }}
                                                    >
                                                        {isToggling ? <CircularProgress size={14} color="inherit" /> : <PowerIcon sx={{ fontSize: 15 }} />}
                                                    </IconButton>
                                                </Tooltip>
                                            </>
                                        )}
                                        {!isDesativada && testResults[cam.id] && testResults[cam.id] !== 'testing' && (
                                            <Chip
                                                size="small"
                                                label={testResults[cam.id] === 'online' ? 'Online' : 'Offline'}
                                                color={testResults[cam.id] === 'online' ? 'success' : 'error'}
                                                sx={{ display: { xs: isCompactMobile ? 'none' : 'inline-flex', sm: 'inline-flex' }, height: 24, fontSize: '0.7rem', fontWeight: 700 }}
                                            />
                                        )}
                                    </Box>
                                </GlassCard>
                            </Grid>
                        );
                    })}
                </Grid>
            )}

            {/* ÚLTIMOS ALERTAS DA IA (o alerta na tela é um só; os anteriores ficam aqui) */}
            {isAdminMaster && historicoAlertas.length > 0 && (
                <GlassCard sx={{ mt: 2, p: 2 }}>
                    <Typography variant="subtitle2" fontWeight={700} sx={{ mb: 1, display: 'flex', alignItems: 'center', gap: 1 }}>
                        <AlarmIcon sx={{ fontSize: 18, color: '#FF3366' }} /> Últimos alertas das câmeras
                    </Typography>
                    <Stack spacing={0.5}>
                        {historicoAlertas.map(a => (
                            <Stack
                                key={a.id}
                                direction="row"
                                spacing={1.5}
                                alignItems="center"
                                onClick={() => { setActiveAlert(a); setOpenSecretAlertModal(true); }}
                                sx={{ cursor: 'pointer', p: 0.75, borderRadius: 1, '&:hover': { bgcolor: 'rgba(255,255,255,0.04)' } }}
                            >
                                <Typography variant="caption" sx={{ color: 'text.secondary', minWidth: 64 }}>
                                    {new Date(a.timestamp).toLocaleTimeString()}
                                </Typography>
                                <Typography variant="body2" fontWeight={700} noWrap sx={{ flex: 1 }}>{a.pessoa?.nome}</Typography>
                                <Typography variant="caption" noWrap sx={{ color: 'text.secondary', maxWidth: '45%' }}>
                                    {a.dispositivo?.nome || a.location}
                                </Typography>
                            </Stack>
                        ))}
                    </Stack>
                </GlassCard>
            )}
          </Box>
      )}

      {/* ABA 4: SAÚDE DO SISTEMA */}
      {activeTab === 'saude' && (
          <AbaSaude
              sysStatus={sysStatus}
              sysPerf={sysPerf}
              sysLogs={sysLogs}
              sysError={sysError}
              terminais={terminais}
              atualizadoEm={saudeAtualizadaEm}
              onAtualizar={atualizarSaude}
          />
      )}

      {/* DIALOG DE TRANSMISSÃO AO VIVO ESTILO YOUTUBE (TELA CHEIA TOTAL COM CONTROLES FLUTUANTES) */}
      <Dialog 
        open={!!activeStreamCam} 
        onClose={(event, reason) => {
            // NUNCA fechar ao girar a tela ou ao clicar na área preta do player
            if (reason === 'backdropClick') return;
            setActiveStreamCam(null);
            setStreamZoom(100);
        }} 
        maxWidth={isMobileOrTablet || streamModalSize === 'fullscreen' ? false : streamModalSize} 
        fullWidth
        fullScreen={isMobileOrTablet || streamModalSize === 'fullscreen'}
        PaperProps={{
            sx: {
                bgcolor: '#000000',
                backgroundImage: 'none',
                m: { xs: 0, sm: (isMobileOrTablet || streamModalSize === 'fullscreen') ? 0 : 2 },
                width: '100%',
                maxHeight: { xs: '100dvh', sm: (isMobileOrTablet || streamModalSize === 'fullscreen') ? '100dvh' : '92dvh' },
                height: { xs: '100dvh', sm: (isMobileOrTablet || streamModalSize === 'fullscreen') ? '100dvh' : 'auto' },
                // Modo janela (computador): o vídeo fica "solto" (position absolute) e não dá altura à
                // janela — com height auto ela ficava com altura zero e a imagem não aparecia.
                // A proporção de vídeo dá a altura (limitada pelo maxHeight acima).
                aspectRatio: { sm: (isMobileOrTablet || streamModalSize === 'fullscreen') ? 'auto' : '16 / 9' },
                borderRadius: { xs: 0, sm: (isMobileOrTablet || streamModalSize === 'fullscreen') ? 0 : 2.5 },
                display: 'flex',
                flexDirection: 'column',
                overflow: 'hidden',
                position: 'relative'
            }
        }}
      >
        {/* ÁREA DE VÍDEO TOTAL (OCUPA 100% DA TELA COM AJUSTE AUTOMÁTICO DE PROPORÇÃO) */}
        <Box 
            onClick={handleTogglePlayerControls}
            sx={{
                position: 'absolute',
                inset: 0,
                width: '100%',
                height: '100%',
                bgcolor: '#000000',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                overflow: 'hidden',
                cursor: 'pointer',
                userSelect: 'none'
            }}
        >
            {activeStreamCam && (
                <CameraVideo
                    camId={activeStreamCam.id}
                    alt={activeStreamCam.nome}
                    modo="stream"
                    qualidade="foco"
                    // Preencher a tela (cortando bordas) só no celular deitado; no computador, imagem
                    // inteira — "cover" ampliava e cortava o vídeo, deixando-o com aspecto pior
                    fit={isMobileOrTablet && isLandscape ? 'cover' : 'contain'}
                    imgStyle={{
                        width: '100%',
                        height: '100%',
                        objectFit: isMobileOrTablet && isLandscape ? 'cover' : 'contain',
                        transform: `scale(${streamZoom / 100})`,
                        transformOrigin: 'center center',
                        transition: 'transform 0.15s ease'
                    }}
                />
            )}
        </Box>

        {/* Com os controles escondidos, o fechar continua no mesmo lugar: o player nunca fica sem saída */}
        {!showPlayerControls && (
            <IconButton
                onClick={(e) => { e.stopPropagation(); setActiveStreamCam(null); setStreamZoom(100); }}
                aria-label="Fechar câmera"
                sx={{
                    position: 'absolute',
                    top: 'calc(env(safe-area-inset-top, 0px) + 12px)',
                    right: 'calc(env(safe-area-inset-right, 0px) + 14px)',
                    zIndex: 21,
                    width: 40,
                    height: 40,
                    borderRadius: 2,
                    color: '#FFFFFF',
                    bgcolor: 'rgba(0, 0, 0, 0.45)',
                    border: '1px solid rgba(255, 255, 255, 0.25)',
                    backdropFilter: 'blur(8px)',
                    '&:hover': { bgcolor: 'rgba(255, 51, 102, 0.35)', borderColor: '#FF3366' }
                }}
            >
                <CloseIcon fontSize="small" />
            </IconButton>
        )}

        {/* OVERLAYS FLUTUANTES ESTILO YOUTUBE (CABEÇALHO + RODAPÉ QUE APARECEM E SOMEM COM FADE) */}
        <Fade in={showPlayerControls} timeout={250}>
            <Box 
                onClick={(e) => {
                    // Clicar na área livre do overlay alterna a visibilidade dos controles
                    if (e.target === e.currentTarget) handleTogglePlayerControls();
                }}
                sx={{
                    position: 'absolute',
                    inset: 0,
                    pointerEvents: showPlayerControls ? 'auto' : 'none',
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'space-between',
                    zIndex: 20
                }}
            >
                {/* CABEÇALHO FLUTUANTE (TOP GRADIENT) */}
                <Box sx={{
                    background: 'linear-gradient(to bottom, rgba(0,0,0,0.88) 0%, rgba(0,0,0,0.5) 65%, transparent 100%)',
                    pt: 'calc(env(safe-area-inset-top, 0px) + 12px)',
                    pb: 3.5,
                    px: { xs: 1.75, sm: 3 },
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 1
                }}>
                    <Stack direction="row" spacing={1.25} alignItems="center" justifyContent="space-between" sx={{ width: '100%' }}>
                        {/* Identificação da Câmera */}
                        <Stack direction="row" spacing={1.25} alignItems="center" sx={{ minWidth: 0, flex: 1 }}>
                            <Box sx={{
                                width: { xs: 34, sm: 38 },
                                height: { xs: 34, sm: 38 },
                                borderRadius: 1.5,
                                bgcolor: 'rgba(0, 212, 255, 0.2)',
                                backdropFilter: 'blur(8px)',
                                border: '1px solid rgba(0, 212, 255, 0.4)',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                flexShrink: 0
                            }}>
                                <CameraIcon sx={{ fontSize: { xs: 20, sm: 22 }, color: '#00D4FF' }} />
                            </Box>
                            <Box sx={{ minWidth: 0, flex: 1 }}>
                                <Typography variant="h6" fontWeight={700} color="#FFFFFF" noWrap sx={{ fontSize: { xs: '0.95rem', sm: '1.15rem' }, lineHeight: 1.25, textShadow: '0 2px 8px rgba(0,0,0,0.9)' }}>
                                    {activeStreamCam?.nome || 'Transmissão ao vivo'}
                                </Typography>
                                <Typography variant="caption" noWrap sx={{ color: '#00D4FF', fontWeight: 600, fontSize: { xs: '0.7rem', sm: '0.75rem' }, textShadow: '0 1px 4px rgba(0,0,0,0.9)' }}>
                                    {activeStreamCam?.area?.nome_area
                                        ? `Área: ${activeStreamCam.area.nome_area} • Reconhecimento Facial IA`
                                        : 'Stream IP / RTSP • Reconhecimento Facial ArcFace'}
                                </Typography>
                            </Box>
                        </Stack>

                        {/* Botões do Topo: Zoom + Alternador Janela/Full (Desktop) + Fechar */}
                        <Stack direction="row" spacing={0.75} alignItems="center" sx={{ flexShrink: 0 }}>
                            {/* Controles de Zoom */}
                            <ButtonGroup size="small" sx={{ height: 32, bgcolor: 'rgba(0, 0, 0, 0.55)', backdropFilter: 'blur(8px)', borderRadius: 2, border: '1px solid rgba(255,255,255,0.18)' }}>
                                <IconButton
                                    size="small"
                                    onClick={(e) => { e.stopPropagation(); resetPlayerControlsTimer(); setStreamZoom(z => Math.max(80, z - 15)); }}
                                    sx={{ color: '#E2E8F0', width: 28, height: 32 }}
                                >
                                    <ZoomOutIcon sx={{ fontSize: 16 }} />
                                </IconButton>
                                <Button
                                    size="small"
                                    onClick={(e) => { e.stopPropagation(); resetPlayerControlsTimer(); setStreamZoom(100); }}
                                    sx={{ fontSize: '0.72rem', fontWeight: 700, px: 0.8, minWidth: 40, height: 32, color: '#00D4FF' }}
                                >
                                    {streamZoom}%
                                </Button>
                                <IconButton
                                    size="small"
                                    onClick={(e) => { e.stopPropagation(); resetPlayerControlsTimer(); setStreamZoom(z => Math.min(220, z + 15)); }}
                                    sx={{ color: '#E2E8F0', width: 28, height: 32 }}
                                >
                                    <ZoomInIcon sx={{ fontSize: 16 }} />
                                </IconButton>
                            </ButtonGroup>

                            {/* Alternador Tela Cheia / Janela (apenas Desktop Grande) */}
                            {!isMobileOrTablet && (
                                <Tooltip title={streamModalSize === 'fullscreen' ? "Modo janela" : "Tela cheia"}>
                                    <IconButton
                                        size="small"
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            resetPlayerControlsTimer();
                                            setStreamModalSize(s => s === 'fullscreen' ? 'lg' : 'fullscreen');
                                        }}
                                        sx={{
                                            color: streamModalSize === 'fullscreen' ? '#00D4FF' : '#E2E8F0',
                                            bgcolor: 'rgba(0, 0, 0, 0.55)',
                                            backdropFilter: 'blur(8px)',
                                            border: '1px solid rgba(255,255,255,0.18)',
                                            width: 34,
                                            height: 34,
                                            borderRadius: 2,
                                            '&:hover': { bgcolor: 'rgba(0, 212, 255, 0.2)', borderColor: '#00D4FF' }
                                        }}
                                    >
                                        {streamModalSize === 'fullscreen' ? <FullscreenExitIcon fontSize="small" /> : <FullscreenIcon fontSize="small" />}
                                    </IconButton>
                                </Tooltip>
                            )}

                            {/* Botão Fechar estilo YouTube */}
                            <IconButton
                                onClick={(e) => { e.stopPropagation(); setActiveStreamCam(null); setStreamZoom(100); }}
                                size="small"
                                aria-label="Fechar câmera"
                                sx={{
                                    color: '#FFFFFF',
                                    bgcolor: 'rgba(255, 255, 255, 0.15)',
                                    backdropFilter: 'blur(8px)',
                                    border: '1px solid rgba(255, 255, 255, 0.25)',
                                    width: 34,
                                    height: 34,
                                    borderRadius: 2,
                                    '&:hover': { bgcolor: 'rgba(255, 51, 102, 0.35)', borderColor: '#FF3366' }
                                }}
                            >
                                <CloseIcon fontSize="small" />
                            </IconButton>
                        </Stack>
                    </Stack>

                    {/* Faixa compacta de status de telemetria */}
                    <Stack direction="row" spacing={1} alignItems="center">
                        {(() => {
                            const st = statusDaCamera(iaStatus, activeStreamCam?.id);
                            const fpsVideo = iaConfig.video?.foco?.fps;
                            return (
                                <Chip
                                    icon={<DotIcon sx={{ fontSize: 9, color: '#00FF88 !important' }} />}
                                    label={st
                                        ? `Ao vivo • ${Math.round(st.video_fps)} fps • IA ${st.ia_fps_alvo}/s${st.rostos ? ` • ${st.rostos} rosto(s)` : ''}`
                                        : `Ao vivo • até ${fpsVideo} fps`}
                                    size="small"
                                    sx={{
                                        bgcolor: 'rgba(0, 255, 136, 0.18)',
                                        border: '1px solid rgba(0, 255, 136, 0.35)',
                                        color: '#00FF88',
                                        fontWeight: 700,
                                        fontSize: '0.72rem',
                                        height: 24,
                                        backdropFilter: 'blur(8px)'
                                    }}
                                />
                            );
                        })()}
                    </Stack>
                </Box>

                {/* CENTRO: AVISO SUTIL DE INTERAÇÃO (TOCAR NA TELA OCULTA / MOSTRA) */}
                <Box sx={{ textAlign: 'center', pointerEvents: 'none', px: 2 }}>
                    <Typography variant="caption" sx={{ color: 'rgba(255, 255, 255, 0.4)', textShadow: '0 1px 4px rgba(0,0,0,0.9)', fontSize: '0.7rem' }}>
                        Toque no vídeo para ocultar / exibir os controles
                    </Typography>
                </Box>

                {/* RODAPÉ FLUTUANTE (BOTTOM GRADIENT) */}
                <Box sx={{
                    background: 'linear-gradient(to top, rgba(0,0,0,0.92) 0%, rgba(0,0,0,0.6) 65%, transparent 100%)',
                    pb: 'calc(env(safe-area-inset-bottom, 0px) + 14px)',
                    pt: 3.5,
                    px: { xs: 1.75, sm: 3 },
                    display: 'flex',
                    flexDirection: { xs: 'column', sm: 'row' },
                    alignItems: { xs: 'stretch', sm: 'center' },
                    justifyContent: 'space-between',
                    gap: 1.25
                }}>
                    <Stack direction="row" spacing={1} alignItems="center" sx={{ minWidth: 0 }}>
                        <Typography variant="caption" noWrap sx={{ color: 'rgba(255,255,255,0.7)', fontFamily: '"Inter", sans-serif', fontSize: '0.75rem', textShadow: '0 1px 4px rgba(0,0,0,0.9)' }}>
                            {activeStreamCam?.stream_url || `${activeStreamCam?.ip_address || ''}:${activeStreamCam?.porta || 554}`}
                        </Typography>
                        {activeStreamCam?.fabricante && (
                            <Chip
                                label={activeStreamCam.fabricante}
                                size="small"
                                sx={{ height: 20, fontSize: '0.68rem', bgcolor: 'rgba(255,255,255,0.1)', color: '#CBD5E1', border: '1px solid rgba(255,255,255,0.15)', backdropFilter: 'blur(6px)' }}
                            />
                        )}
                    </Stack>

                    <Stack direction="row" spacing={1.25} sx={{ width: { xs: '100%', sm: 'auto' } }}>
                        {isAdminMaster && (
                            <Button
                                variant="contained"
                                color="warning"
                                size="medium"
                                startIcon={<AlarmIcon />}
                                onClick={(e) => {
                                    e.stopPropagation();
                                    resetPlayerControlsTimer();
                                    handleTriggerTestAlert();
                                }}
                                sx={{
                                    fontWeight: 700,
                                    flex: { xs: 1, sm: 'initial' },
                                    minHeight: { xs: 42, sm: 36 },
                                    borderRadius: 2,
                                    bgcolor: 'rgba(255, 184, 0, 0.25)',
                                    border: '1px solid #FFB800',
                                    color: '#FFB800',
                                    backdropFilter: 'blur(8px)',
                                    textTransform: 'none',
                                    whiteSpace: 'nowrap',
                                    '&:hover': { bgcolor: 'rgba(255, 184, 0, 0.4)' }
                                }}
                            >
                                Testar alerta
                            </Button>
                        )}
                        <Button
                            variant="contained"
                            size="medium"
                            startIcon={<FullscreenExitIcon />}
                            onClick={(e) => {
                                e.stopPropagation();
                                setActiveStreamCam(null);
                                setStreamZoom(100);
                            }}
                            sx={{
                                fontWeight: 700,
                                flex: { xs: 1, sm: 'initial' },
                                minHeight: { xs: 42, sm: 36 },
                                borderRadius: 2,
                                bgcolor: 'rgba(0, 212, 255, 0.25)',
                                border: '1px solid #00D4FF',
                                color: '#00D4FF',
                                backdropFilter: 'blur(8px)',
                                textTransform: 'none',
                                whiteSpace: 'nowrap',
                                '&:hover': { bgcolor: 'rgba(0, 212, 255, 0.4)' }
                            }}
                        >
                            Sair da tela cheia
                        </Button>
                    </Stack>
                </Box>
            </Box>
        </Fade>
      </Dialog>

      {/* DIALOG SELEÇÃO DE CÂMERAS NO MOSAICO CFTV */}
      <Dialog 
          open={openSelectCamerasDialog} 
          onClose={() => setOpenSelectCamerasDialog(false)} 
          fullWidth 
          maxWidth="sm"
          PaperProps={{
              sx: {
                  maxHeight: { sm: '90dvh' }
              }
          }}
      >
          <DialogTitle sx={{ pb: 1, borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
              <Stack direction="row" spacing={1.5} alignItems="center">
                  <GridViewIcon sx={{ fontSize: 24, color: '#00D4FF', flexShrink: 0 }} />
                  <Box sx={{ minWidth: 0 }}>
                      <Typography variant="h6" fontWeight={700} color="#FFFFFF" noWrap sx={{ fontSize: { xs: '1rem', sm: '1.15rem' } }}>
                          Selecionar câmeras no mosaico
                      </Typography>
                      <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
                          Escolha quais câmeras serão exibidas nesta tela
                      </Typography>
                  </Box>
              </Stack>
          </DialogTitle>

          <DialogContent sx={{ p: { xs: 1.5, sm: 2 }, overflowY: 'auto' }}>
              {/* BARRA DE AÇÕES RÁPIDAS: MARCAR / DESMARCAR TODAS */}
              <Stack direction="row" justifyContent="space-between" alignItems="center" flexWrap="wrap" useFlexGap gap={1} my={1}>
                  <Stack direction="row" spacing={1}>
                      <Button 
                          size="small" 
                          variant="outlined" 
                          onClick={handleSelectAllCameras}
                          sx={{ fontSize: '0.72rem', borderColor: 'rgba(255,255,255,0.2)', color: '#00D4FF' }}
                      >
                          Marcar todas ({cameras.length})
                      </Button>
                      <Button 
                          size="small" 
                          variant="outlined" 
                          onClick={handleClearSelectedCameras}
                          sx={{ fontSize: '0.72rem', borderColor: 'rgba(255,255,255,0.2)', color: '#94A3B8' }}
                      >
                          Limpar
                      </Button>
                  </Stack>
                  <Chip
                      label={`${selectedCameraIds.length === 0 ? 'Exibindo todas (' + cameras.length + ')' : selectedCameraIds.length + ' selecionada(s)'}`}
                      size="small"
                      sx={{ bgcolor: 'rgba(0, 212, 255, 0.1)', color: '#00D4FF', fontWeight: 700, fontSize: '0.72rem' }}
                  />
              </Stack>

              {/* LISTA DE CÂMERAS DISPONÍVEIS */}
              {cameras.length === 0 ? (
                  <Box sx={{ p: 4, textAlign: 'center', bgcolor: 'rgba(255,255,255,0.02)', borderRadius: 1.5 }}>
                      <CameraIcon sx={{ fontSize: 48, color: 'text.secondary', opacity: 0.5, mb: 1 }} />
                      <Typography variant="subtitle2" color="#FFFFFF" fontWeight={700}>
                          Nenhuma câmera cadastrada no sistema.
                      </Typography>
                      <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 2 }}>
                          As câmeras devem ser configuradas primeiro.
                      </Typography>
                      <Button
                          variant="contained"
                          size="small"
                          startIcon={<SettingsIcon />}
                          onClick={() => { setOpenSelectCamerasDialog(false); setOpenGerenciarCamerasModal(true); }}
                          sx={{ bgcolor: '#00D4FF', color: '#000000', fontWeight: 700 }}
                      >
                          Gerenciar câmeras agora
                      </Button>
                  </Box>
              ) : (
                  <List sx={{ maxHeight: { xs: '48dvh', sm: 380 }, overflow: 'auto', p: 0 }}>
                      {cameras.map(cam => {
                          const isChecked = selectedCameraIds.length === 0 || selectedCameraIds.includes(cam.id);
                          return (
                              <ListItem 
                                  key={cam.id} 
                                  disablePadding 
                                  sx={{ 
                                      mb: 1, 
                                      borderRadius: 1.5, 
                                      bgcolor: isChecked ? 'rgba(0, 212, 255, 0.06)' : 'rgba(255,255,255,0.02)',
                                      border: isChecked ? '1px solid rgba(0, 212, 255, 0.3)' : '1px solid rgba(255,255,255,0.06)'
                                  }}
                              >
                                  <ListItemButton onClick={() => handleToggleSelectCamera(cam.id)} dense>
                                      <ListItemIcon sx={{ minWidth: 36 }}>
                                          <Checkbox
                                              edge="start"
                                              checked={isChecked}
                                              tabIndex={-1}
                                              disableRipple
                                              sx={{ color: '#00D4FF', '&.Mui-checked': { color: '#00D4FF' } }}
                                          />
                                      </ListItemIcon>
                                      <ListItemText
                                          primary={
                                              <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap">
                                                  <Typography variant="subtitle2" fontWeight={700} color="#FFFFFF">
                                                      {cam.nome}
                                                  </Typography>
                                                  <Chip
                                                      label={comoRotulo(cam.status) || 'Offline'}
                                                      size="small"
                                                      color={cam.status === 'online' ? 'success' : 'default'}
                                                      sx={{ height: 18, fontSize: '0.7rem', fontWeight: 700 }}
                                                  />
                                              </Stack>
                                          }
                                          secondary={
                                              <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.6)', display: 'block', wordBreak: 'break-word' }}>
                                                  {cam.fabricante} • {cam.ip_address}:{cam.porta} 
                                                  {cam.area?.nome_area ? ` • Área: ${cam.area.nome_area}` : ''}
                                              </Typography>
                                          }
                                      />
                                  </ListItemButton>
                              </ListItem>
                          );
                      })}
                  </List>
              )}

              {/* ATALHO PARA GERENCIAR CÂMERAS */}
              <Box sx={{ mt: 2, p: 1.5, borderRadius: 1.5, bgcolor: 'rgba(255,255,255,0.03)', border: '1px dashed rgba(255,255,255,0.1)' }}>
                  <Stack direction={{ xs: 'column', sm: 'row' }} justifyContent="space-between" alignItems={{ xs: 'stretch', sm: 'center' }} spacing={1}>
                      <Typography variant="caption" color="text.secondary">
                          Precisa cadastrar, editar IP ou testar uma nova câmera?
                      </Typography>
                      <Button
                          size="small"
                          variant="outlined"
                          startIcon={<SettingsIcon sx={{ fontSize: 16 }} />}
                          onClick={() => { setOpenSelectCamerasDialog(false); setOpenGerenciarCamerasModal(true); }}
                          sx={{ fontSize: '0.75rem', borderColor: 'rgba(0, 212, 255, 0.35)', color: '#00D4FF', fontWeight: 700, whiteSpace: 'nowrap' }}
                      >
                          Gerenciar câmeras
                      </Button>
                  </Stack>
              </Box>
          </DialogContent>

          <DialogActions sx={{ p: { xs: 1.5, sm: 2 }, borderTop: '1px solid rgba(255,255,255,0.08)', gap: 1 }}>
              <Button
                  variant="outlined" 
                  onClick={() => setOpenSelectCamerasDialog(false)}
                  sx={{ ...botaoSecundario, flex: { xs: 1, sm: 'initial' } }}
              >
                  Cancelar
              </Button>
              <Button 
                  variant="contained" 
                  onClick={() => {
                      setOpenSelectCamerasDialog(false);
                      enqueueSnackbar('Mosaico CFTV atualizado!', { variant: 'success' });
                  }}
                  sx={{ bgcolor: '#00D4FF', color: '#000000', fontWeight: 700, flex: { xs: 1, sm: 'initial' }, '&:hover': { bgcolor: '#00D4FF' } }}
              >
                  Aplicar mosaico
              </Button>
          </DialogActions>
      </Dialog>

      {/* DIALOG CADASTRAR ALVO NA WATCHLIST */}
      <Dialog 
          open={openTargetDialog} 
          onClose={() => setOpenTargetDialog(false)} 
          fullWidth 
          maxWidth="xs"
          PaperProps={{
              sx: { maxHeight: { sm: '90dvh' } }
          }}
      >
          <DialogTitle sx={{ fontWeight: 700, color: '#FFB800' }}>Cadastrar alvo na watchlist</DialogTitle>
          <DialogContent sx={{ overflowY: 'auto' }}>
              <Stack spacing={2} pt={1}>
                  <TextField
                      label="CPF do Alvo" fullWidth required
                      placeholder="000.000.000-00"
                      value={newTarget.cpf}
                      onChange={(e) => setNewTarget({ ...newTarget, cpf: e.target.value })}
                      helperText="CPF numérico ou formatado da pessoa procurada."
                  />
                  <TextField
                      label="Nome completo (opcional)" fullWidth
                      placeholder="Nome do indivíduo"
                      value={newTarget.nome}
                      onChange={(e) => setNewTarget({ ...newTarget, nome: e.target.value })}
                  />
                  <TextField
                      label="Motivo / descrição" fullWidth
                      placeholder="Ex: Mandado de prisão, Bloqueio judicial, VIP Blacklist"
                      value={newTarget.motivo}
                      onChange={(e) => setNewTarget({ ...newTarget, motivo: e.target.value })}
                  />
                  <FormControl fullWidth>
                      <InputLabel>Nível de risco</InputLabel>
                      <Select
                          label="Nível de risco"
                          value={newTarget.nivel_alerta}
                          onChange={(e) => setNewTarget({ ...newTarget, nivel_alerta: e.target.value })}
                      >
                          <MenuItem value="critico">CRÍTICO (perigo imediato)</MenuItem>
                          <MenuItem value="alto">ALTO (risco elevado)</MenuItem>
                          <MenuItem value="medio">MÉDIO (atenção / monitoramento)</MenuItem>
                      </Select>
                  </FormControl>
              </Stack>
          </DialogContent>
          <DialogActions sx={{ p: 2 }}>
              <Button variant="outlined" onClick={() => setOpenTargetDialog(false)} sx={botaoSecundario}>Cancelar</Button>
              <Button 
                  variant="contained" 
                  color="warning"
                  onClick={async () => {
                      if (!newTarget.cpf) {
                          enqueueSnackbar('O CPF é obrigatório para cadastrar na Watchlist.', { variant: 'warning' });
                          return;
                      }
                      const ok = await addToWatchlist(newTarget);
                      if (ok) {
                          setOpenTargetDialog(false);
                          setNewTarget({ cpf: '', nome: '', motivo: '', nivel_alerta: 'alto' });
                      }
                  }}
              >
                  Salvar alvo
              </Button>
          </DialogActions>
      </Dialog>

      {/* DIALOG CADASTRAR CONTATO PARA NOTIFICAÇÕES EXTERNAS */}
      <Dialog 
          open={openContactDialog} 
          onClose={() => setOpenContactDialog(false)} 
          fullWidth 
          maxWidth="xs"
          PaperProps={{
              sx: { maxHeight: { sm: '90dvh' } }
          }}
      >
          <DialogTitle sx={{ fontWeight: 700 }}>Novo contato de alerta</DialogTitle>
          <DialogContent sx={{ overflowY: 'auto' }}>
              <Stack spacing={2} pt={1}>
                  <TextField
                      label="Nome do contato ou central" fullWidth required
                      placeholder="Ex: Cel. Roberto, Central de Comando, Wanderley"
                      value={newContact.nome}
                      onChange={(e) => setNewContact({ ...newContact, nome: e.target.value })}
                  />
                  <FormControl fullWidth required>
                      <InputLabel>Canal de notificação</InputLabel>
                      <Select
                          label="Canal de notificação"
                          value={newContact.canal}
                          onChange={(e) => setNewContact({ ...newContact, canal: e.target.value })}
                      >
                          <MenuItem value="telegram">TELEGRAM (chat / grupo)</MenuItem>
                          <MenuItem value="whatsapp">WHATSAPP (mensagem direta)</MenuItem>
                          <MenuItem value="email">E-MAIL (relatório imediato)</MenuItem>
                      </Select>
                  </FormControl>
                  <TextField
                      label={newContact.canal === 'telegram' ? 'Chat ID do Telegram ou @Canal' : newContact.canal === 'whatsapp' ? 'Número WhatsApp (com DDI)' : 'E-mail para Alerta'}
                      fullWidth required
                      placeholder={newContact.canal === 'telegram' ? 'Ex: 123456789 ou -100123456789' : newContact.canal === 'whatsapp' ? 'Ex: 5511999999999' : 'seguranca@empresa.com'}
                      value={newContact.telefone}
                      onChange={(e) => setNewContact({ ...newContact, telefone: e.target.value })}
                      helperText={
                          newContact.canal === 'telegram' 
                              ? 'Obtenha o Chat ID enviando /start para o bot ou usando @userinfobot.'
                              : newContact.canal === 'whatsapp' 
                              ? 'Digite número completo com DDI (55) e DDD sem traços ou parênteses.'
                              : 'Endereço de e-mail que receberá a ficha do alvo com foto.'
                      }
                  />
                  {newContact.canal === 'telegram' && (
                      <TextField
                          label="Token do bot (opcional)" fullWidth
                          placeholder="Deixe vazio para usar o bot padrão do sistema"
                          value={newContact.bot_token}
                          onChange={(e) => setNewContact({ ...newContact, bot_token: e.target.value })}
                          helperText="Token fornecido pelo @BotFather caso queira bot exclusivo."
                      />
                  )}
              </Stack>
          </DialogContent>
          <DialogActions sx={{ p: 2 }}>
              <Button variant="outlined" onClick={() => setOpenContactDialog(false)} sx={botaoSecundario}>Cancelar</Button>
              <Button 
                  variant="contained" 
                  onClick={async () => {
                      if (!newContact.nome || !newContact.telefone) {
                          enqueueSnackbar('Nome e destinatário (Chat ID / Telefone) são obrigatórios.', { variant: 'warning' });
                          return;
                      }
                      const ok = await addContato(newContact);
                      if (ok) {
                          setOpenContactDialog(false);
                          setNewContact({ nome: '', canal: 'telegram', telefone: '', bot_token: '' });
                      }
                  }}
              >
                  Salvar contato
              </Button>
          </DialogActions>
      </Dialog>

      {/* MODAL DE DESBLOQUEIO DE ALVO DA WATCHLIST (ADMIN_MASTER ONLY) */}
      <Dialog 
          open={openUnblockDialog} 
          onClose={() => !unblockLoading && setOpenUnblockDialog(false)} 
          maxWidth="sm" 
          fullWidth
      >
          <DialogTitle sx={{ color: '#00FF88', fontWeight: 700, display: 'flex', alignItems: 'center', gap: 1 }}>
              <CheckCircleIcon sx={{ color: '#00FF88' }} />
              Desbloqueio de alvo • liberação geral multi-evento
          </DialogTitle>
          <DialogContent>
              <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                  Esta ação revoga imediatamente o bloqueio do indivíduo. Ele será <strong>automaticamente liberado para credenciamento, cadastro e acesso em todos os eventos</strong>.
              </Typography>

              {targetToUnblock && (
                  <Paper sx={{ p: 2, mb: 2.5, bgcolor: 'rgba(0,0,0,0.5)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 1.5 }}>
                      <Typography variant="subtitle1" fontWeight={700} color="#FFFFFF">
                          {targetToUnblock.nome || 'Nome Não Informado'}
                      </Typography>
                      <Typography variant="body2" sx={{ fontFamily: '"Inter", sans-serif', color: '#FFB800', mt: 0.5 }}>
                          CPF: {targetToUnblock.cpf}
                      </Typography>
                      <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1 }}>
                          <strong>Motivo da restrição atual:</strong> {targetToUnblock.motivo || 'Restrição geral de segurança'}
                      </Typography>
                  </Paper>
              )}

              <TextField
                  label="Motivo / justificativa do desbloqueio (obrigatório)"
                  fullWidth
                  multiline
                  rows={3}
                  required
                  placeholder="Ex: Situação regularizada, ordem do responsável pelo evento, engano cadastral..."
                  value={unblockReason}
                  onChange={(e) => setUnblockReason(e.target.value)}
                  disabled={unblockLoading}
                  helperText="O Admin Master receberá uma notificação formal de segurança por e-mail com esta justificativa."
                  sx={{ mt: 1 }}
              />
          </DialogContent>
          <DialogActions sx={{ p: 2, gap: 1 }}>
              <Button variant="outlined" onClick={() => setOpenUnblockDialog(false)} disabled={unblockLoading} sx={botaoSecundario}>
                  Cancelar
              </Button>
              <Button 
                  variant="contained" 
                  color="success" 
                  onClick={handleConfirmUnblock}
                  disabled={unblockLoading || !unblockReason.trim()}
                  startIcon={unblockLoading ? <CircularProgress size={16} color="inherit" /> : <CheckCircleIcon />}
                  sx={{ fontWeight: 700 }}
              >
                  {unblockLoading ? 'Liberando...' : 'Confirmar desbloqueio e liberar'}
              </Button>
          </DialogActions>
      </Dialog>

      {/* MODAL DE ALVO LOCALIZADO / DEIXAR DE MONITORAR */}
      <Dialog 
          open={openDeixarMonitorarDialog} 
          onClose={() => !stopMonitoringLoading && setOpenDeixarMonitorarDialog(false)} 
          maxWidth="sm" 
          fullWidth
      >
          <DialogTitle sx={{ fontWeight: 700, display: 'flex', alignItems: 'center', gap: 1 }}>
              <VisibilityOffIcon sx={{ }} />
              Alvo localizado • deixar de monitorar
          </DialogTitle>
          <DialogContent>
              <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                  Confirma que o alvo procurado foi <strong>localizado no evento</strong>? Ao confirmar, o sistema encerrará o rastreamento, desativará os alarmes sonoros/visuais e <strong>retirará o indivíduo da lista de monitoramento ativo</strong>.
              </Typography>

              {targetToStopMonitoring && (
                  <Paper sx={{ p: 2, mb: 2, bgcolor: 'rgba(0,0,0,0.5)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 1.5 }}>
                      <Typography variant="subtitle1" fontWeight={700} color="#FFFFFF">
                          {targetToStopMonitoring.nome || 'Nome Não Informado'}
                      </Typography>
                      <Typography variant="body2" sx={{ fontFamily: '"Inter", sans-serif', color: '#00D4FF', mt: 0.5 }}>
                          CPF: {targetToStopMonitoring.cpf}
                      </Typography>
                      <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.5 }}>
                          <strong>Motivo do monitoramento:</strong> {targetToStopMonitoring.motivo || 'Atenção especial de segurança'}
                      </Typography>
                  </Paper>
              )}

              <TextField
                  label="Observação da abordagem / encerramento"
                  fullWidth
                  multiline
                  rows={2}
                  value={stopMonitoringReason}
                  onChange={(e) => setStopMonitoringReason(e.target.value)}
                  disabled={stopMonitoringLoading}
                  sx={{ mt: 1 }}
              />
          </DialogContent>
          <DialogActions sx={{ p: 2, gap: 1 }}>
              <Button variant="outlined" onClick={() => setOpenDeixarMonitorarDialog(false)} disabled={stopMonitoringLoading} sx={botaoSecundario}>
                  Cancelar
              </Button>
              <Button 
                  variant="contained" 
                  onClick={handleConfirmDeixarMonitorar}
                  disabled={stopMonitoringLoading}
                  startIcon={stopMonitoringLoading ? <CircularProgress size={16} color="inherit" /> : <VisibilityOffIcon />}
                  sx={{ bgcolor: '#00D4FF', color: '#000000', fontWeight: 700, '&:hover': { bgcolor: '#00D4FF' } }}
              >
                  {stopMonitoringLoading ? 'Encerrando...' : 'Confirmar e deixar de monitorar'}
              </Button>
          </DialogActions>
      </Dialog>

      {/* MODAL DE ZOOM PERICIAL DO SNAPSHOT CFTV EM ALTA RESOLUÇÃO */}
      <Dialog
        open={zoomSnapshotModal}
        onClose={() => setZoomSnapshotModal(false)}
        maxWidth="lg"
        fullWidth
        fullScreen={isMobile}
        PaperProps={{
          sx: {
            border: isMobile ? 'none' : '2px solid #FFB800',
            bgcolor: '#050B18'
          }
        }}
      >
        <DialogTitle sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', p: 1.5, borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
          <Typography variant="subtitle1" fontWeight={700} sx={{ color: '#FFB800', display: 'flex', alignItems: 'center', gap: 1 }}>
            <PhotoCameraIcon sx={{ color: '#FFB800' }} />
            Inspeção pericial • captura original da câmera em alta resolução
          </Typography>
          <IconButton onClick={() => setZoomSnapshotModal(false)} size="small" sx={{ color: '#94A3B8', '&:hover': { color: '#FFFFFF' } }}>
            <CloseIcon />
          </IconButton>
        </DialogTitle>
        <DialogContent sx={{ p: 1, display: 'flex', justifyContent: 'center', alignItems: 'center', bgcolor: '#000000', minHeight: 400 }}>
          {cameraSnapshotSrc && (
            <img
              src={cameraSnapshotSrc}
              alt="Perícia CFTV"
              style={{
                maxWidth: '100%',
                maxHeight: '82dvh',
                objectFit: 'contain',
                borderRadius: 1.5,
                boxShadow: '0 0 30px rgba(0,0,0,0.8)'
              }}
            />
          )}
        </DialogContent>
      </Dialog>

      {/* MODAL / GAVETA DIRETO DE GERENCIAMENTO DE CÂMERAS IP NA TELA */}
      <GerenciarCamerasModal
        open={openGerenciarCamerasModal}
        onClose={() => setOpenGerenciarCamerasModal(false)}
        cameras={cameras}
        eventoId={eventoId}
        areas={areas}
        onCamerasUpdated={fetchCameras}
        onCamerasChange={fetchCameras}
      />
    </Box>
  );
};

export default Monitor;
