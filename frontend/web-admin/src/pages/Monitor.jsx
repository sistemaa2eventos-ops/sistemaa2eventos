import React, { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  Box,
  Typography,
  Grid,
  Stack,
  Avatar,
  Tabs,
  Tab,
  Card,
  CardContent,
  Divider
} from '@mui/material';
import {
  MonitorHeart as MonitorIcon,
  Sensors as SensorIcon,
  Memory as MemoryIcon,
  WifiTethering as NetworkIcon,
  Storage as StorageIcon,
  FiberManualRecord as DotIcon,
} from '@mui/icons-material';
import api from '../services/api';
import GlassCard from '../components/common/GlassCard';

import PageHeader from '../components/common/PageHeader';
import { styled } from '@mui/material/styles';
import { format } from 'date-fns';

import io from 'socket.io-client';
import {
  Videocam as CameraIcon,
  Search as SearchIcon,
  Warning as AlertIcon,
  PersonAdd as PersonAddIcon,
  NotificationsActive as AlarmIcon,
  Close as CloseIcon,
  Visibility as ViewIcon,
  Delete as TrashIcon
} from '@mui/icons-material';
import { Button, TextField, Chip, IconButton, Badge, Tooltip, Drawer } from '@mui/material';

const MonitorGrid = styled(Box)(({ theme }) => ({
  height: '75vh',
  background: 'rgba(5, 12, 25, 0.7)',
  backdropFilter: 'blur(10px)',
  borderRadius: 24,
  border: '1px solid rgba(0, 212, 255, 0.1)',
  position: 'relative',
  overflow: 'hidden',
  display: 'flex',
  flexDirection: 'column',
  boxShadow: '0 0 40px rgba(0,0,0,0.5)'
}));

const CameraCard = styled(Box)(({ theme }) => ({
  background: '#000',
  borderRadius: 12,
  overflow: 'hidden',
  position: 'relative',
  aspectRatio: '16/9',
  border: '1px solid rgba(255,255,255,0.05)',
  '&:hover .cam-controls': {
    opacity: 1
  }
}));

const WatchlistPanel = styled(Box)(({ theme }) => ({
  background: 'rgba(255, 51, 102, 0.03)',
  borderRadius: 16,
  border: '1px solid rgba(255, 51, 102, 0.1)',
  height: '100%',
  display: 'flex',
  flexDirection: 'column'
}));

const AlertOverlay = styled(Box)(({ theme }) => ({
  position: 'fixed',
  top: 40,
  right: 40,
  width: 400,
  background: 'rgba(255, 51, 102, 0.95)',
  color: '#fff',
  borderRadius: 16,
  padding: theme.spacing(3),
  zIndex: 9999,
  boxShadow: '0 0 50px rgba(255, 51, 102, 0.5)',
  animation: 'slideInRight 0.5s ease-out, pulseAlert 2s infinite',
  '@keyframes slideInRight': {
    from: { transform: 'translateX(100%)', opacity: 0 },
    to: { transform: 'translateX(0)', opacity: 1 }
  },
  '@keyframes pulseAlert': {
    '0%': { boxShadow: '0 0 20px rgba(255, 51, 102, 0.4)' },
    '50%': { boxShadow: '0 0 50px rgba(255, 51, 102, 0.8)' },
    '100%': { boxShadow: '0 0 20px rgba(255, 51, 102, 0.4)' }
  }
}));

const CustomTab = styled(Tab)({
  fontWeight: 700,
  fontSize: '0.9rem',
  color: 'rgba(255,255,255,0.5)',
  '&.Mui-selected': {
    color: '#00D4FF',
    textShadow: '0 0 10px rgba(0,212,255,0.5)',
  }
});

const MetricCard = styled(Card)(({ theme }) => ({
  background: 'rgba(5, 12, 25, 0.8)',
  backdropFilter: 'blur(10px)',
  borderRadius: 16,
  border: '1px solid rgba(0, 212, 255, 0.1)',
  boxShadow: '0 4px 24px rgba(0,0,0,0.4)',
  height: '100%',
}));

const Monitor = () => {
  const [tabIndex, setTabIndex] = useState(0);

  // --- TAB 0 STATS (Nexus Command) ---
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState({ presentes: 0, capacidade: 0, empresas: [] });

  // Cameras
  const [cameras, setCameras] = useState([]);
  const [selectedCameras, setSelectedCameras] = useState([]);
  const [isCamDrawerOpen, setIsCamDrawerOpen] = useState(false);

  // Watchlist
  const [watchlist, setWatchlist] = useState([]);
  const [newCpf, setNewCpf] = useState('');
  const [isTracking, setIsTracking] = useState(false);
  const [activeAlert, setActiveAlert] = useState(null);

  // Audio Alerts
  const alertAudio = React.useMemo(() => new Audio('/assets/alarm.mp3'), []);

  const [sysStatus, setSysStatus] = useState(null);
  const [sysLogs, setSysLogs] = useState([]);
  const [sysPerf, setSysPerf] = useState(null);
  const [sysError, setSysError] = useState(false);  // Estado de erro na aba Saúde

  // Snapshot Refresh Tick
  const [tick, setTick] = useState(0);

  const [searchParams] = useSearchParams();
  const eventoId = searchParams.get('evento_id') || localStorage.getItem('active_evento_id');

  useEffect(() => {
    fetchData();
    fetchCameras();
    fetchWatchlist();
    const interval = setInterval(fetchData, 30000);

    const socketUrl = (import.meta.env.VITE_API_URL || '').replace(/\/api$/, '') || window.location.origin;
    const socket = io(socketUrl, { transports: ['polling', 'websocket'], reconnectionAttempts: 5 });

    socket.on('connect', () => {
      if (eventoId) socket.emit('join_event', eventoId);
    });

    socket.on('new_access', (newLog) => {
      setLogs(prev => [newLog, ...prev.slice(0, 19)]);
      if (newLog.tipo === 'checkin' || newLog.tipo === 'checkout') {
        updateStats(newLog);
      }
    });

    socket.on('new_alert', (alert) => {
      console.log('🚨 ALERTA WATCHLIST:', alert);
      setActiveAlert(alert);
      try { alertAudio.play().catch(e => console.warn('Audio blocked')); } catch (e) { }

      // Auto-hide alert after 10s
      setTimeout(() => setActiveAlert(null), 10000);
    });

    return () => {
      clearInterval(interval);
      socket.disconnect();
    };
  }, [eventoId]);

  // Snapshot Auto-Refresh (5s)
  useEffect(() => {
    const timer = setInterval(() => setTick(t => t + 1), 5000);
    return () => clearInterval(timer);
  }, []);

  const updateStats = (newLog) => {
    setStats(prev => {
      const isCheckin = newLog.tipo === 'checkin';
      const newPresentes = isCheckin ? prev.presentes + 1 : Math.max(0, prev.presentes - 1);
      return { ...prev, presentes: newPresentes };
    });
  };

  const fetchCameras = async () => {
    try {
      const response = await api.get('/dispositivos', { params: { evento_id: eventoId, tipo: 'camera' } });
      const cams = response.data.data.filter(d => d.tipo === 'camera');
      setCameras(cams);
      // Selecionar as primeiras 2 por padrão
      if (selectedCameras.length === 0) setSelectedCameras(cams.slice(0, 2));
    } catch (e) { console.error('Erro cams:', e); }
  };

  const fetchWatchlist = async () => {
    try {
      const response = await api.get('/monitor/watchlist', { params: { evento_id: eventoId } });
      setWatchlist(response.data.data);
    } catch (e) { console.error('Erro watchlist:', e); }
  };

  const addToWatchlist = async () => {
    if (!newCpf) return;
    try {
      setIsTracking(true);
      await api.post('/monitor/watchlist', { cpf: newCpf, evento_id: eventoId });
      setNewCpf('');
      fetchWatchlist();
    } catch (e) { console.error('Erro tracking:', e); }
    finally { setIsTracking(false); }
  };

  const removeFromWatchlist = async (id) => {
    try {
      await api.delete(`/monitor/watchlist/${id}`);
      fetchWatchlist();
    } catch (e) { console.error('Erro remove:', e); }
  };

  useEffect(() => {
    if (tabIndex === 1) {
      fetchSystemHealth();
    }
  }, [tabIndex]);

  const fetchData = async () => {
    try {
      const [logsResp, statsResp] = await Promise.all([
        api.get('/access/logs', { params: { limit: 15, evento_id: eventoId } }),
        api.get('/access/stats/realtime', { params: { evento_id: eventoId } })
      ]);

      setLogs(logsResp.data.data || []);
      setStats(statsResp.data.data || { presentes: 0, capacidade: 0, empresas: [] });
    } catch (error) {
      console.error('Erro no monitoramento:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchSystemHealth = async () => {
    setSysError(false);
    setSysStatus(null);  // Reset para mostrar loading enquanto carrega
    try {
      const [statusR, logsR, perfR] = await Promise.all([
        api.get('/monitor/system/status'),   // Rota global, sem evento_id
        api.get('/monitor/system/logs?lines=30'),
        api.get('/monitor/system/performance')
      ]);
      setSysStatus(statusR.data);
      setSysLogs(logsR.data.logs || []);
      setSysPerf(perfR.data);
    } catch (error) {
      console.error('Falha ao obter saude do sistema', error);
      setSysError(true);
    }
  };

  return (
    <Box sx={{ p: 4, maxWidth: 1400, margin: '0 auto' }}>
      <PageHeader
        title="Monitoramento NZT"
        subtitle="Fluxo de dados biométricos, eventos de acesso em tempo real e saúde do sistema."
        breadcrumbs={[{ text: 'Dashboard' }, { text: 'Monitor' }]}
      />

      <Box sx={{ borderBottom: 1, borderColor: 'divider', mb: 3 }}>
        <Tabs value={tabIndex} onChange={(e, v) => setTabIndex(v)} textColor="inherit" TabIndicatorProps={{ style: { backgroundColor: '#00D4FF', boxShadow: '0 0 10px #00D4FF' } }}>
          <CustomTab label="FEED EM TEMPO REAL" />
          <CustomTab label="SAÚDE DO SISTEMA" />
        </Tabs>
      </Box>

      {/* ALERT OVERLAY */}
      {activeAlert && (
        <AlertOverlay>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <Box sx={{ display: 'flex', gap: 2, alignItems: 'center' }}>
              <AlarmIcon sx={{ fontSize: 32 }} />
              <Typography variant="h6" sx={{ fontWeight: 900 }}>ALVO DETECTADO!</Typography>
            </Box>
            <IconButton onClick={() => setActiveAlert(null)} sx={{ color: '#fff' }}><CloseIcon /></IconButton>
          </Box>
          <Stack spacing={2} sx={{ mt: 2 }}>
            <Box sx={{ display: 'flex', gap: 2 }}>
              <Avatar src={activeAlert.pessoa?.foto_url} sx={{ width: 80, height: 80, border: '3px solid #fff' }} />
              <Box>
                <Typography variant="h5" sx={{ fontWeight: 800 }}>{activeAlert.target_name}</Typography>
                <Typography variant="body2" sx={{ opacity: 0.8 }}>CPF: {activeAlert.pessoa?.cpf || 'Não informado'}</Typography>
                <Typography variant="body2" sx={{ fontWeight: 700, mt: 1 }}>📍 {activeAlert.location}</Typography>
              </Box>
            </Box>
            <Divider sx={{ bgcolor: 'rgba(255,255,255,0.2)' }} />
            <Typography variant="caption" sx={{ fontStyle: 'italic' }}>
              Detectado em: {format(new Date(activeAlert.timestamp), 'HH:mm:ss')} via {(activeAlert.metodo || '').toUpperCase()}
            </Typography>
          </Stack>
        </AlertOverlay>
      )}

      {/* NEXUS COMMAND DASHBOARD */}
      {tabIndex === 0 && (
        <Grid container spacing={2} sx={{ animation: 'fadeIn 0.5s ease-out' }}>

          {/* COLUNA 1: CAMERAS & RECENT FEED */}
          <Grid item xs={12} lg={8}>
            <Stack spacing={2}>
              {/* Camera Grid */}
              <Grid container spacing={2}>
                {selectedCameras.map((cam, idx) => (
                  <Grid item xs={12} md={selectedCameras.length > 1 ? 6 : 12} key={cam.id}>
                    <CameraCard>
                      <Box sx={{ position: 'absolute', top: 12, left: 12, zIndex: 10, display: 'flex', alignItems: 'center', gap: 1 }}>
                        <DotIcon sx={{ color: '#ff0000', fontSize: 12, animation: 'pulse 1s infinite' }} />
                        <Typography variant="caption" sx={{ color: '#fff', fontWeight: 900, textShadow: '0 0 5px #000', letterSpacing: 1 }}>
                          CAM-{idx + 1}: {cam.nome.toUpperCase()}
                        </Typography>
                      </Box>

                      <Box sx={{ width: '100%', height: '100%', bgcolor: '#050a14', display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative' }}>
                        {/* Imagem real via Proxy */}
                        <Box
                          component="img"
                          src={`${api.defaults.baseURL}/dispositivos/${cam.id}/snapshot?t=${tick}`}
                          sx={{
                            width: '100%',
                            height: '100%',
                            objectFit: 'cover',
                            position: 'absolute',
                            top: 0, left: 0,
                            zIndex: 1
                          }}
                          onError={(e) => {
                            e.target.style.display = 'none';
                            e.target.nextSibling.style.display = 'flex';
                          }}
                        />

                        <Box sx={{ width: '100%', height: '100%', bgcolor: '#050a14', display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', zIndex: 0 }}>
                          <CameraIcon sx={{ fontSize: 60, color: 'rgba(0,212,255,0.1)', mb: 1 }} />
                          <Typography variant="caption" sx={{ color: 'rgba(0,212,255,0.3)' }}>ESTABELECENDO CONEXÃO RTSP / SNAPSHOT...</Typography>
                        </Box>
                      </Box>

                      <Box className="cam-controls" sx={{ position: 'absolute', bottom: 12, right: 12, opacity: 0, transition: '0.3s', display: 'flex', gap: 1, zIndex: 10 }}>
                        <IconButton size="small" sx={{ bgcolor: 'rgba(0,0,0,0.5)', color: '#fff' }}><ViewIcon fontSize="small" /></IconButton>
                      </Box>
                    </CameraCard>
                  </Grid>
                ))}

                {selectedCameras.length === 0 && (
                  <Grid item xs={12}>
                    <Box sx={{ height: 300, bgcolor: 'rgba(0,0,0,0.3)', borderRadius: 4, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', border: '2px dashed rgba(0,212,255,0.1)' }}>
                      <CameraIcon sx={{ fontSize: 48, color: 'rgba(0,212,255,0.2)', mb: 2 }} />
                      <Typography variant="body2" sx={{ color: 'text.secondary', mb: 2 }}>Nenhuma câmera selecionada para exibição.</Typography>
                      <Button variant="outlined" onClick={() => setIsCamDrawerOpen(true)}>SELECIONAR CÂMERAS</Button>
                    </Box>
                  </Grid>
                )}
              </Grid>

              {/* Feed de Acessos */}
              <MonitorGrid sx={{ height: 400 }}>
                <Box sx={{ p: 2, borderBottom: '1px solid rgba(0,212,255,0.1)', bgcolor: 'rgba(0,0,0,0.3)', display: 'flex', justifyContent: 'space-between' }}>
                  <Typography variant="caption" sx={{ fontWeight: 900, letterSpacing: 1 }}>ULTIMOS EVENTOS DE ACESSO</Typography>
                  <Typography variant="caption" sx={{ color: '#00FF88' }}>● LIVE</Typography>
                </Box>
                <Box sx={{ flex: 1, overflowY: 'auto' }}>
                  {logs.map(log => {
                    const isNegado = log.tipo === 'negado' || log.tipo === 'expulsao';
                    const color = isNegado ? '#FF3366' : '#00FF88';
                    return (
                      <Box key={log.id} sx={{ display: 'flex', alignItems: 'center', p: 1.5, borderBottom: '1px solid rgba(255,255,255,0.03)', gap: 2 }}>
                        <Avatar src={log.pessoas?.foto_url} sx={{ width: 32, height: 32, border: `1px solid ${color}` }} />
                        <Box sx={{ flex: 1 }}>
                          <Typography variant="caption" sx={{ fontWeight: 700, color: '#fff', display: 'block' }}>{log.pessoas?.nome}</Typography>
                          <Typography variant="caption" sx={{ color: 'text.secondary', fontSize: '10px' }}>📍 {log.dispositivo_id} • {(log.metodo || '').toUpperCase()}</Typography>
                        </Box>
                        <Box sx={{ textAlign: 'right' }}>
                          <Typography variant="caption" sx={{ color: color, fontWeight: 900, fontSize: '10px', display: 'block' }}>
                            {isNegado ? 'NEGADO' : 'AUTORIZADO'}
                          </Typography>
                          <Typography variant="caption" sx={{ color: 'text.secondary', fontSize: '10px' }}>{format(new Date(log.created_at), 'HH:mm:ss')}</Typography>
                        </Box>
                      </Box>
                    );
                  })}
                </Box>
              </MonitorGrid>
            </Stack>
          </Grid>

          {/* COLUNA 2: WATCHLIST & ALERTS */}
          <Grid item xs={12} lg={4}>
            <WatchlistPanel>
              <Box sx={{ p: 3, borderBottom: '1px solid rgba(255, 51, 102, 0.2)', bgcolor: 'rgba(255, 51, 102, 0.1)' }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 2 }}>
                  <AlertIcon sx={{ color: '#FF3366' }} />
                  <Typography variant="h6" sx={{ fontWeight: 900 }}>NEXUS WATCHLIST</Typography>
                </Box>

                <Stack direction="row" spacing={1}>
                  <TextField
                    size="small"
                    placeholder="CPF para rastrear..."
                    fullWidth
                    value={newCpf}
                    onChange={(e) => setNewCpf(e.target.value)}
                    sx={{ bgcolor: 'rgba(0,0,0,0.3)', borderRadius: 1 }}
                  />
                  <IconButton color="error" sx={{ bgcolor: 'rgba(255, 51, 102, 0.1)' }} onClick={addToWatchlist} disabled={isTracking}>
                    <PersonAddIcon />
                  </IconButton>
                </Stack>
              </Box>

              <Box sx={{ flex: 1, overflowY: 'auto', p: 2 }}>
                <Typography variant="caption" sx={{ fontWeight: 800, color: 'text.secondary', mb: 2, display: 'block' }}>
                  ALVOS SENDO RASTREADOS ({watchlist.length})
                </Typography>
                <Stack spacing={1.5}>
                  {watchlist.map(item => (
                    <Box key={item.id} sx={{ p: 1.5, bgcolor: 'rgba(255,255,255,0.03)', borderRadius: 2, display: 'flex', alignItems: 'center', gap: 2 }}>
                      <Avatar src={item.pessoas?.foto_url} sx={{ width: 40, height: 40, border: '1px solid rgba(255, 51, 102, 0.3)' }} />
                      <Box sx={{ flex: 1 }}>
                        <Typography variant="caption" sx={{ fontWeight: 700, color: '#fff', display: 'block' }}>
                          {item.pessoas?.nome || item.cpf}
                        </Typography>
                        <Typography variant="caption" sx={{ color: '#FF3366', fontWeight: 600 }}>EM RASTREAMENTO</Typography>
                      </Box>
                      <IconButton size="small" color="error" onClick={() => removeFromWatchlist(item.id)}><TrashIcon fontSize="small" /></IconButton>
                    </Box>
                  ))}
                  {watchlist.length === 0 && (
                    <Typography variant="caption" sx={{ color: 'text.secondary', textAlign: 'center', py: 4 }}>
                      Nenhum CPF na lista de rastreamento.
                    </Typography>
                  )}
                </Stack>
              </Box>

              <Box sx={{ p: 2, borderTop: '1px solid rgba(255,255,255,0.05)', bgcolor: 'rgba(0,0,0,0.2)' }}>
                <Typography variant="caption" sx={{ color: 'text.secondary', display: 'flex', alignItems: 'center', gap: 1 }}>
                  <AlarmIcon sx={{ fontSize: 14 }} /> Alertas automáticos via WebSocket ativados.
                </Typography>
              </Box>
            </WatchlistPanel>
          </Grid>

        </Grid>
      )}

      {/* SEARCH/CAM DRAWER */}
      <Drawer anchor="right" open={isCamDrawerOpen} onClose={() => setIsCamDrawerOpen(false)} PaperProps={{ sx: { width: 350, bgcolor: '#0A0F1A', p: 3, borderLeft: '1px solid rgba(0,212,255,0.2)' } }}>
        <Typography variant="h6" sx={{ fontWeight: 900, mb: 3 }}>SELECIONAR CÂMERAS</Typography>
        <Stack spacing={2}>
          {cameras.map(cam => (
            <Box
              key={cam.id}
              sx={{
                p: 2, borderRadius: 2, border: '1px solid rgba(255,255,255,0.1)', cursor: 'pointer',
                bgcolor: selectedCameras.find(c => c.id === cam.id) ? 'rgba(0,212,255,0.1)' : 'transparent',
                '&:hover': { bgcolor: 'rgba(255,255,255,0.05)' }
              }}
              onClick={() => {
                if (selectedCameras.find(c => c.id === cam.id)) {
                  setSelectedCameras(selectedCameras.filter(c => c.id !== cam.id));
                } else {
                  if (selectedCameras.length < 4) setSelectedCameras([...selectedCameras, cam]);
                }
              }}
            >
              <Typography variant="subtitle2">{cam.nome}</Typography>
              <Typography variant="caption" sx={{ opacity: 0.6 }}>IP: {cam.ip_address}</Typography>
            </Box>
          ))}
        </Stack>
        <Button fullWidth variant="contained" sx={{ mt: 4 }} onClick={() => setIsCamDrawerOpen(false)}>CONFIRMAR</Button>
      </Drawer>

      {/* TABA 1: SAÚDE DO SISTEMA */}
      {tabIndex === 1 && !sysStatus && !sysError && (
        <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: 300, flexDirection: 'column', gap: 2 }}>
          <MonitorIcon sx={{ fontSize: 48, color: 'rgba(0,212,255,0.2)', animation: 'pulse 1.5s infinite' }} />
          <Typography variant="body2" sx={{ color: 'text.secondary' }}>Carregando saúde do sistema...</Typography>
        </Box>
      )}
      {tabIndex === 1 && sysError && (
        <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: 300, flexDirection: 'column', gap: 2 }}>
          <AlertIcon sx={{ fontSize: 48, color: 'rgba(255,51,102,0.5)' }} />
          <Typography variant="body2" sx={{ color: '#FF3366' }}>Erro ao conectar com o backend. Verifique se o servidor está online.</Typography>
          <Button variant="outlined" color="error" onClick={fetchSystemHealth} size="small">Tentar Novamente</Button>
        </Box>
      )}
      {tabIndex === 1 && sysStatus && (
        <Grid container spacing={3} sx={{ animation: 'fadeIn 0.3s' }}>

          <Grid item xs={12} md={4}>
            <MetricCard>
              <CardContent>
                <Box sx={{ display: 'flex', alignItems: 'center', mb: 2, gap: 1 }}>
                  <MemoryIcon sx={{ color: '#00D4FF' }} />
                  <Typography variant="subtitle2" sx={{ fontWeight: 800, color: '#fff' }}>USO DE MEMÓRIA (NODE VM)</Typography>
                </Box>
                <Divider sx={{ mb: 2, borderColor: 'rgba(255,255,255,0.05)' }} />
                <Typography variant="body2" sx={{ color: 'text.secondary', display: 'flex', justifyContent: 'space-between', mb: 1 }}>
                  <span>Memória RSS:</span> <span style={{ color: '#fff' }}>{sysStatus.system?.memory?.rss || (sysPerf?.node?.memoria?.rss_mb ? sysPerf.node.memoria.rss_mb + ' MB' : '—')}</span>
                </Typography>
                <Typography variant="body2" sx={{ color: 'text.secondary', display: 'flex', justifyContent: 'space-between', mb: 1 }}>
                  <span>Heap Total:</span> <span style={{ color: '#fff' }}>{sysStatus.system?.memory?.heapTotal || (sysPerf?.node?.memoria?.heap_total_mb ? sysPerf.node.memoria.heap_total_mb + ' MB' : '—')}</span>
                </Typography>
                <Typography variant="body2" sx={{ color: 'text.secondary', display: 'flex', justifyContent: 'space-between' }}>
                  <span>Heap Used:</span> <span style={{ color: '#00FF88', fontWeight: 700 }}>{sysStatus.system?.memory?.heapUsed || (sysPerf?.node?.memoria?.heap_usado_mb ? sysPerf.node.memoria.heap_usado_mb + ' MB' : '—')}</span>
                </Typography>
                {sysPerf?.os && (
                  <Typography variant="body2" sx={{ color: 'text.secondary', display: 'flex', justifyContent: 'space-between', mt: 1 }}>
                    <span>RAM do Servidor:</span> <span style={{ color: sysPerf.os.uso_memoria_pct > 80 ? '#FF3366' : '#FFB800' }}>{sysPerf.os.uso_memoria_pct}% ({sysPerf.os.memoria_livre_mb} MB livres)</span>
                  </Typography>
                )}
                <Typography variant="caption" sx={{ display: 'block', mt: 3, color: 'text.secondary' }}>
                  Uptime: {sysStatus.system?.uptime || sysPerf?.node?.uptime_formatado || '—'}
                </Typography>
              </CardContent>
            </MetricCard>
          </Grid>

          <Grid item xs={12} md={4}>
            <MetricCard>
              <CardContent>
                <Box sx={{ display: 'flex', alignItems: 'center', mb: 2, gap: 1 }}>
                  <StorageIcon sx={{ color: '#7B2FBE' }} />
                  <Typography variant="subtitle2" sx={{ fontWeight: 800, color: '#fff' }}>BANCOS DE DADOS</Typography>
                </Box>
                <Divider sx={{ mb: 2, borderColor: 'rgba(255,255,255,0.05)' }} />
                <Typography variant="body2" sx={{ color: 'text.secondary', display: 'flex', justifyContent: 'space-between', mb: 1 }}>
                  <span>Supabase (PostgreSQL):</span>
                  <span style={{ color: sysStatus.services.supabase === 'online' ? '#00FF88' : '#FF3366', fontWeight: 700 }}>
                    {sysStatus.services.supabase.toUpperCase()}
                  </span>
                </Typography>
                <Typography variant="body2" sx={{ color: 'text.secondary', display: 'flex', justifyContent: 'space-between', mb: 1 }}>
                  <span>SQL Server LPR/Logs:</span>
                  <span style={{ color: sysStatus.services.sql_server === 'online' ? '#00FF88' : '#FF3366', fontWeight: 700 }}>
                    {sysStatus.services.sql_server.toUpperCase()}
                  </span>
                </Typography>

                {sysPerf && (
                  <Box sx={{ mt: 3, pt: 2, borderTop: '1px dashed rgba(255,255,255,0.1)' }}>
                    <Typography variant="caption" sx={{ color: 'text.secondary' }}>SQL Server:</Typography>
                    <Typography variant="body2" sx={{ color: sysPerf.sql_server?.status === 'ok' ? '#00FF88' : '#FFB800', fontWeight: 700 }}>
                      {sysPerf.sql_server?.status === 'ok' ? '✅ CONECTADO' : '⚠️ SEM PERMISSÃO VIEW STATE'}
                    </Typography>
                    {sysPerf.os && (
                      <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block', mt: 1 }}>CPUs: {sysPerf.os.cpus}x {sysPerf.os.modelo_cpu?.split('@')[0]?.trim()}</Typography>
                    )}
                  </Box>
                )}
              </CardContent>
            </MetricCard>
          </Grid>

          <Grid item xs={12} md={4}>
            <MetricCard>
              <CardContent>
                <Box sx={{ display: 'flex', alignItems: 'center', mb: 2, gap: 1 }}>
                  <NetworkIcon sx={{ color: '#FFB800' }} />
                  <Typography variant="subtitle2" sx={{ fontWeight: 800, color: '#fff' }}>SINCRONIZAÇÃO OFFLINE</Typography>
                </Box>
                <Divider sx={{ mb: 2, borderColor: 'rgba(255,255,255,0.05)' }} />
                <Typography variant="body2" sx={{ color: 'text.secondary', display: 'flex', justifyContent: 'space-between', mb: 1 }}>
                  <span>Itens Pendentes (Queue):</span>
                  <span style={{ color: sysStatus.sync.pending > 0 ? '#FFB800' : '#00FF88', fontWeight: 700 }}>
                    {sysStatus.sync.pending}
                  </span>
                </Typography>
                <Typography variant="body2" sx={{ color: 'text.secondary', display: 'flex', justifyContent: 'space-between', mb: 1 }}>
                  <span>Lote Sincronizado:</span> <span style={{ color: '#fff' }}>{sysStatus.sync.synced}</span>
                </Typography>
                <Typography variant="body2" sx={{ color: 'text.secondary', display: 'flex', justifyContent: 'space-between', mb: 1 }}>
                  <span>Falhas Isoladas:</span> <span style={{ color: sysStatus.sync.failed > 0 ? '#FF3366' : '#fff' }}>{sysStatus.sync.failed}</span>
                </Typography>
              </CardContent>
            </MetricCard>
          </Grid>

          {/* Raw System Logs Console */}
          <Grid item xs={12}>
            <MetricCard sx={{ bgcolor: '#02040A' }}>
              <CardContent>
                <Typography variant="subtitle2" sx={{ fontWeight: 800, color: '#fff', mb: 2, display: 'flex', justifyContent: 'space-between' }}>
                  <span>RAW SYSTEM TERMINAL</span>
                  <Typography variant="caption" sx={{ color: 'text.secondary' }}>Últimas 30 linhas (/logs/combined.log)</Typography>
                </Typography>
                <Box sx={{
                  height: 300,
                  overflowY: 'auto',
                  bgcolor: '#000',
                  borderRadius: 2,
                  p: 2,
                  fontFamily: '"Fira Code", monospace',
                  fontSize: '0.75rem',
                  color: '#A0AABF',
                  border: '1px solid rgba(255,255,255,0.05)',
                  boxShadow: 'inset 0 0 20px rgba(0,0,0,0.8)'
                }}>
                  {sysLogs.length === 0 ? (
                    <Typography variant="caption" sx={{ color: 'text.secondary' }}>Arquivo de log vazio ou não encontrado pelo agente de borda.</Typography>
                  ) : (
                    sysLogs.map((logLine, idx) => {
                      let color = '#A0AABF';
                      const strLog = typeof logLine === 'string' ? logLine : JSON.stringify(logLine);
                      if (strLog.includes('ERROR') || strLog.includes('FAIL')) color = '#FF3366';
                      else if (strLog.includes('WARN')) color = '#FFB800';
                      else if (strLog.includes('INFO')) color = '#00FF88';

                      return (
                        <Box key={idx} sx={{ mb: 0.5, borderBottom: '1px solid rgba(255,255,255,0.02)', pb: 0.5, color }}>
                          {strLog}
                        </Box>
                      );
                    })
                  )}
                </Box>
              </CardContent>
            </MetricCard>
          </Grid>

        </Grid>
      )}
    </Box>
  );
};

export default Monitor;
