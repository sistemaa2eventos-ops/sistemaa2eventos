import React, { useState, useEffect, useMemo } from 'react';
import {
  Box, Typography, Grid, Stack, Avatar, Tabs, Tab,
  IconButton, TextField, MenuItem, Select, FormControl,
  InputLabel, Button, Table, TableBody, TableCell,
  TableContainer, TableHead, TableRow, Paper, Chip,
  Dialog, DialogTitle, DialogContent, DialogActions,
  CircularProgress, Tooltip, Fade, Zoom, Divider
} from '@mui/material';
import { useSnackbar } from 'notistack';
import {
  MonitorHeart as MonitorIcon, Search as SearchIcon,
  FiberManualRecord as DotIcon, Videocam as CameraIcon, 
  Warning as AlertIcon, PersonAdd as PersonAddIcon,
  NotificationsActive as AlarmIcon, Close as CloseIcon,
  Delete as TrashIcon, FilterList as FilterIcon,
  Refresh as RefreshIcon, ExitToApp as CheckoutIcon,
  Login as LoginIcon, Block as BlockIcon, CloudUpload as UploadIcon,
  FileDownload as DownloadIcon, Settings as SettingsIcon,
  Add as AddIcon, PowerSettingsNew as PowerIcon,
  Schedule as ClockIcon, CorporateFare as CompanyIcon
} from '@mui/icons-material';
import { styled } from '@mui/material/styles';
import { format } from 'date-fns';

import api from '../services/api';
import PageHeader from '../components/common/PageHeader';
import GlassCard from '../components/common/GlassCard';
import NeonButton from '../components/common/NeonButton';
import { useMonitor } from '../hooks/useMonitor';

const LogItem = styled(Box, { shouldForwardProp: (p) => p !== 'tipo' })(({ tipo, monitorado }) => ({
    display: 'flex', alignItems: 'center', p: 1.5, gap: 2,
    borderBottom: '1px solid rgba(255,255,255,0.03)',
    borderLeft: `5px solid ${
        monitorado ? '#FFB800' : 
        tipo === 'negado' ? '#FF3366' : 
        tipo === 'checkin' ? '#00FF88' : 
        tipo === 'checkout' ? '#FF3366' : 
        'transparent'
    }`,
    background: tipo === 'negado' ? 'rgba(255, 51, 102, 0.05)' : 
               monitorado ? 'rgba(255, 184, 0, 0.05)' : 'transparent',
    transition: 'all 0.2s ease'
}));

const Monitor = () => {
  const { enqueueSnackbar } = useSnackbar();
  const [tabIndex, setTabIndex] = useState(0);
  const {
    logs, stats, loading, tick, areas, dispositivosLista, terminais,
    cameras, setCameras, fetchCameras, fetchWatchlist,
    watchlist, newCpf, setNewCpf, isTracking, activeAlert, setActiveAlert,
    sysStatus, sysLogs, sysPerf, sysError,
    addToWatchlist, removeFromWatchlist, fetchSystemHealth,
    filtros, setFiltros, eventoId
  } = useMonitor();

  // Dialogs States
  const [openCameraDialog, setOpenCameraDialog] = useState(false);
  const [editingCamera, setEditingCamera] = useState(null);
  const [testResults, setTestResults] = useState({});

  // Chamar fetchSystemHealth ao entrar na aba Saúde
  useEffect(() => {
    if (tabIndex === 4) fetchSystemHealth();
  }, [tabIndex, fetchSystemHealth]);

  const FABRICANTES = ['Intelbras', 'Hikvision', 'Genérica'];

  // Handlers
  const handleExportCSV = () => {
    window.location.href = `${api.defaults.baseURL}/excel/export/pessoas?evento_id=${eventoId}`;
  };

  const handleUploadCSV = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const formData = new FormData();
    formData.append('file', file);
    formData.append('evento_id', eventoId);
    try {
        await api.post('/watchlist/upload', formData);
        enqueueSnackbar('CSV Importado com sucesso', { variant: 'success' });
        fetchWatchlist();
    } catch (err) {
        enqueueSnackbar('Erro ao importar CSV', { variant: 'error' });
    }
  };

  const handleTestCamera = async (id) => {
    setTestResults(prev => ({ ...prev, [id]: 'testing' }));
    try {
        const resp = await api.post(`/cameras/${id}/testar`);
        setTestResults(prev => ({ ...prev, [id]: resp.data.online ? 'online' : 'offline' }));
    } catch (err) {
        setTestResults(prev => ({ ...prev, [id]: 'offline' }));
    }
  };

  return (
    <Box sx={{ p: 4, maxWidth: 1600, margin: '0 auto' }}>
      <PageHeader
        title="NZT Intelligence Monitor"
        subtitle="Centro de Comando e Segurança Biométrica"
        icon={<MonitorIcon sx={{ fontSize: 40, color: '#00D4FF' }} />}
      />

      <Box sx={{ borderBottom: 1, borderColor: 'divider', mb: 3 }}>
        <Tabs value={tabIndex} onChange={(e, v) => setTabIndex(v)} textColor="inherit" TabIndicatorProps={{ style: { backgroundColor: '#00D4FF' } }}>
          <Tab label="FEED AO VIVO" />
          <Tab label="TERMINAIS" />
          <Tab label="WATCHLIST" />
          <Tab label="CÂMERAS IP" />
          <Tab label="SAÚDE" />
        </Tabs>
      </Box>

      {/* WATCHLIST ALERT OVERLAY */}
      {activeAlert && (
          <Fade in={!!activeAlert}>
             <Box sx={{ 
                 position: 'fixed', top: 40, right: 40, width: 450, zIndex: 9999,
                 background: 'rgba(255, 51, 102, 0.95)', color: '#fff', borderRadius: 4,
                 p: 3, boxShadow: '0 20px 50px rgba(0,0,0,0.5)', border: '2px solid #fff'
             }}>
                 <Stack direction="row" spacing={2} justifyContent="space-between" alignItems="center">
                    <Stack direction="row" spacing={1} alignItems="center">
                        <AlarmIcon sx={{ fontSize: 40, animation: 'pulse 0.5s infinite' }} />
                        <Typography variant="h5" fontWeight={900}>ALVO MONITORADO!</Typography>
                    </Stack>
                    <IconButton onClick={() => setActiveAlert(null)} size="small" sx={{ color: '#fff' }}><CloseIcon /></IconButton>
                 </Stack>

                 <Stack direction="row" spacing={3} mt={3}>
                    <Avatar src={activeAlert.pessoa?.foto_url} sx={{ width: 100, height: 100, border: '4px solid #fff' }} />
                    <Box>
                        <Typography variant="h4" fontWeight={900}>{activeAlert.target_name}</Typography>
                        <Typography variant="h6" sx={{ opacity: 0.8 }}>CPF: {activeAlert.pessoa?.cpf}</Typography>
                        <Chip label={activeAlert.watchlist?.nivel_alerta || 'ALTO RISCO'} sx={{ mt: 1, bgcolor: '#fff', color: '#FF3366', fontWeight: 900 }} />
                    </Box>
                 </Stack>
                 <Divider sx={{ my: 2, borderColor: 'rgba(255,255,255,0.2)' }} />
                 <Typography variant="body1"><b>LOCAL:</b> {activeAlert.location}</Typography>
                 <Typography variant="body1"><b>EVENTO:</b> {activeAlert.metodo?.toUpperCase()}</Typography>
                 <Typography variant="caption" sx={{ mt: 2, display: 'block', opacity: 0.6 }}>Detectado em: {new Date(activeAlert.timestamp).toLocaleString()}</Typography>
             </Box>
          </Fade>
      )}

      {/* ABA 0: FEED AO VIVO */}
      {tabIndex === 0 && (
        <Grid container spacing={3}>
            <Grid item xs={12}>
                <GlassCard sx={{ p: 2, mb: 2, display: 'flex', gap: 2, alignItems: 'center' }}>
                    <FilterIcon sx={{ color: '#00D4FF' }} />
                    <FormControl size="small" sx={{ minWidth: 200 }}>
                        <InputLabel>ÁREA</InputLabel>
                        <Select label="ÁREA" value={filtros.area_id} onChange={(e) => setFiltros({...filtros, area_id: e.target.value})}>
                            <MenuItem value="">Todas as Áreas</MenuItem>
                            {areas.map(a => <MenuItem key={a.id} value={a.id}>{a.nome}</MenuItem>)}
                        </Select>
                    </FormControl>
                    <FormControl size="small" sx={{ minWidth: 200 }}>
                        <InputLabel>TERMINAL</InputLabel>
                        <Select label="TERMINAL" value={filtros.dispositivo_id} onChange={(e) => setFiltros({...filtros, dispositivo_id: e.target.value})}>
                            <MenuItem value="">Todos os Terminais</MenuItem>
                            {dispositivosLista.map(d => <MenuItem key={d.id} value={d.id}>{d.nome}</MenuItem>)}
                        </Select>
                    </FormControl>
                    <FormControl size="small" sx={{ minWidth: 150 }}>
                        <InputLabel>TIPO</InputLabel>
                        <Select label="TIPO" value={filtros.tipo} onChange={(e) => setFiltros({...filtros, tipo: e.target.value})}>
                            <MenuItem value="todos">Todos</MenuItem>
                            <MenuItem value="checkin">Check-in</MenuItem>
                            <MenuItem value="checkout">Check-out</MenuItem>
                            <MenuItem value="negado">Negado</MenuItem>
                        </Select>
                    </FormControl>
                    <Button variant="outlined" color="primary" onClick={() => setFiltros({area_id:'', dispositivo_id: '', tipo: ''})}>LIMPAR</Button>
                </GlassCard>

                <GlassCard sx={{ height: 'calc(100vh - 350px)', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
                    <Box sx={{ p: 2, background: 'rgba(0,0,0,0.3)', display: 'flex', justifyContent: 'space-between' }}>
                        <Typography variant="subtitle2" fontWeight={800} color="#00D4FF">FEED DE ACESSOS REAIS</Typography>
                        <Typography variant="caption" color="#00FF88">● {logs.length} EVENTOS NO BUFFER</Typography>
                    </Box>
                    <Box sx={{ flex: 1, overflowY: 'auto' }}>
                        {logs.map((log, idx) => {
                            const isNegado = log.tipo === 'negado' || log.resultado === 'negado';
                            const isWatchlist = watchlist.some(w => w.cpf === log.pessoas?.cpf);
                            return (
                                <LogItem key={log.id || idx} tipo={isNegado ? 'negado' : log.tipo} monitorado={isWatchlist}>
                                    <Avatar src={log.pessoas?.foto_url} sx={{ width: 50, height: 50, border: '2px solid rgba(255,255,255,0.1)' }} />
                                    <Box sx={{ flex: 1 }}>
                                        <Typography variant="body1" fontWeight={800} color={isWatchlist ? '#FFB800' : '#fff'}>
                                            {log.pessoas?.nome_completo || log.pessoas?.nome || 'Anônimo'}
                                            {isWatchlist && <Chip label="MONITORADO" size="small" sx={{ ml: 1, bgcolor: '#FFB800', color: '#000', fontWeight: 900, height: 20 }} />}
                                        </Typography>
                                        <Stack direction="row" spacing={2}>
                                            <Typography variant="caption" color="text.secondary">📍 {log.area_nome || 'Local Externo'}</Typography>
                                            <Typography variant="caption" color="text.secondary">| Terminal: {log.dispositivos_acesso?.nome || log.dispositivo_nome || log.dispositivo_id}</Typography>
                                        </Stack>
                                    </Box>
                                    <Box sx={{ textAlign: 'right', minWidth: 120 }}>
                                        <Stack direction="row" spacing={1} justifyContent="flex-end" alignItems="center">
                                            {isNegado ? <BlockIcon sx={{ color: '#FF3366', fontSize: 18 }} /> : 
                                             log.tipo === 'checkin' ? <LoginIcon sx={{ color: '#00FF88', fontSize: 18 }} /> : 
                                             <CheckoutIcon sx={{ color: '#FF3366', fontSize: 18 }} />}
                                            <Typography variant="subtitle2" fontWeight={900} color={isNegado ? '#FF3366' : log.tipo === 'checkin' ? '#00FF88' : '#FF3366'}>
                                                {isNegado ? 'NEGADO' : log.tipo?.toUpperCase()}
                                            </Typography>
                                        </Stack>
                                        <Typography variant="caption" color="text.secondary">
                                            {format(new Date(log.created_at || new Date()), 'HH:mm:ss')}
                                        </Typography>
                                        {isNegado && <Typography variant="caption" display="block" color="#FF3366" sx={{ fontSize: 9 }}>{log.observacao}</Typography>}
                                    </Box>
                                </LogItem>
                            );
                        })}
                    </Box>
                </GlassCard>
            </Grid>
        </Grid>
      )}

      {/* ABA 1: TERMINAIS */}
      {tabIndex === 1 && (
          <GlassCard sx={{ p: 0 }}>
              <TableContainer component={Paper} sx={{ background: 'transparent' }}>
                  <Table>
                      <TableHead sx={{ bgcolor: 'rgba(0,0,0,0.4)' }}>
                          <TableRow>
                              <TableCell sx={{ color: '#00D4FF', fontWeight: 900 }}>TERMINAL</TableCell>
                              <TableCell sx={{ color: '#00D4FF', fontWeight: 900 }}>LOCALIZAÇÃO</TableCell>
                              <TableCell sx={{ color: '#00D4FF', fontWeight: 900 }}>TIPO</TableCell>
                              <TableCell sx={{ color: '#00D4FF', fontWeight: 900 }}>STATUS</TableCell>
                              <TableCell sx={{ color: '#00D4FF', fontWeight: 900 }}>VISTO POR ÚLTIMO</TableCell>
                          </TableRow>
                      </TableHead>
                      <TableBody>
                          {terminais.map(t => (
                              <TableRow key={t.id}>
                                  <TableCell sx={{ fontWeight: 700 }}>{t.nome}</TableCell>
                                  <TableCell>{t.evento_areas?.nome || 'N/A'}</TableCell>
                                  <TableCell><Chip label={t.tipo?.toUpperCase()} size="small" variant="outlined" /></TableCell>
                                  <TableCell>
                                      <Chip 
                                        label={t.status?.toUpperCase()} 
                                        color={t.status === 'online' ? 'success' : 'error'}
                                        sx={{ fontWeight: 800 }}
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

      {/* ABA 2: WATCHLIST */}
      {tabIndex === 2 && (
          <Grid container spacing={3}>
              <Grid item xs={12} md={8}>
                  <GlassCard sx={{ p: 3 }}>
                      <Stack direction="row" justifyContent="space-between" mb={3}>
                        <Typography variant="h6" fontWeight={900} color="#FFB800">CPFS MONITORADOS</Typography>
                        <Stack direction="row" spacing={1}>
                            <Button variant="outlined" component="label" startIcon={<UploadIcon />}>
                                IMPORTAR CSV
                                <input type="file" hidden accept=".csv" onChange={handleUploadCSV} />
                            </Button>
                            <Button variant="outlined" startIcon={<DownloadIcon />} onClick={handleExportCSV}>EXPORTAR PARTICIPANTES</Button>
                        </Stack>
                      </Stack>
                      <TableContainer>
                          <Table size="small">
                              <TableHead>
                                  <TableRow>
                                      <TableCell>CPF</TableCell>
                                      <TableCell>NOME</TableCell>
                                      <TableCell>MOTIVO</TableCell>
                                      <TableCell>NÍVEL</TableCell>
                                      <TableCell>AÇÕES</TableCell>
                                  </TableRow>
                              </TableHead>
                              <TableBody>
                                  {watchlist.map(w => (
                                      <TableRow key={w.id}>
                                          <TableCell>{w.cpf}</TableCell>
                                          <TableCell>{w.nome}</TableCell>
                                          <TableCell>{w.motivo}</TableCell>
                                          <TableCell><Chip label={w.nivel_alerta} size="small" color="error" /></TableCell>
                                          <TableCell>
                                              <IconButton color="error" size="small" onClick={() => removeFromWatchlist(w.id)}><TrashIcon fontSize="small" /></IconButton>
                                          </TableCell>
                                      </TableRow>
                                  ))}
                              </TableBody>
                          </Table>
                      </TableContainer>
                  </GlassCard>
              </Grid>

              <Grid item xs={12} md={4}>
                  <GlassCard sx={{ p: 3 }}>
                      <Typography variant="h6" fontWeight={900} color="#00D4FF" mb={2}>NOTIFICAÇÕES EXTERNAS</Typography>
                      <Typography variant="caption" sx={{ mb: 2, display: 'block', opacity: 0.6 }}>O sistema enviará alertas reais para estes contatos.</Typography>
                      
                      <Box sx={{ mt: 2 }}>
                        {/* Listagem de Contatos viria aqui */}
                        <Button fullWidth variant="contained" startIcon={<AddIcon />}>ADICIONAR CONTATO</Button>
                      </Box>
                  </GlassCard>
              </Grid>
          </Grid>
      )}

      {/* ABA 3: CÂMERAS IP */}
      {tabIndex === 3 && (
          <Box>
            <Stack direction="row" justifyContent="space-between" mb={3}>
                <Typography variant="h5" fontWeight={900}>VIGILÂNCIA IP</Typography>
                <NeonButton onClick={() => { setEditingCamera({}); setOpenCameraDialog(true); }} startIcon={<AddIcon />}>NOVA CÂMERA</NeonButton>
            </Stack>
            <Grid container spacing={3}>
                {cameras.map(cam => (
                    <Grid item xs={12} md={6} lg={4} key={cam.id}>
                        <GlassCard sx={{ p: 0, overflow: 'hidden' }}>
                            <Box sx={{ p: 1.5, display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'rgba(0,0,0,0.5)' }}>
                                <Typography variant="subtitle2" fontWeight={800}>{cam.nome}</Typography>
                                <Chip label={cam.status} size="small" color={cam.status === 'online' ? 'success' : 'error'} />
                            </Box>
                            <Box sx={{ position: 'relative', aspectRatio: '16/9', bgcolor: '#000' }}>
                                <img 
                                    src={`${api.defaults.baseURL}/cameras/${cam.id}/snapshot?t=${tick}`} 
                                    style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                                    onError={(e) => { e.target.src = '/assets/cam_offline.png' }}
                                />
                            </Box>
                            <Box sx={{ p: 1, display: 'flex', gap: 1, alignItems: 'center' }}>
                                <Button
                                    size="small" fullWidth variant="outlined"
                                    disabled={testResults[cam.id] === 'testing'}
                                    onClick={() => handleTestCamera(cam.id)}
                                >
                                    {testResults[cam.id] === 'testing' ? <CircularProgress size={14} /> : 'TESTAR'}
                                </Button>
                                {testResults[cam.id] && testResults[cam.id] !== 'testing' && (
                                    <Chip
                                        size="small"
                                        label={testResults[cam.id] === 'online' ? 'ONLINE' : 'OFFLINE'}
                                        color={testResults[cam.id] === 'online' ? 'success' : 'error'}
                                    />
                                )}
                            </Box>
                        </GlassCard>
                    </Grid>
                ))}
            </Grid>
          </Box>
      )}

      {/* ABA 4: SAÚDE DO SISTEMA */}
      {tabIndex === 4 && (
          <Grid container spacing={3}>
              <Grid item xs={12} md={4}>
                  <GlassCard sx={{ p: 3 }}>
                      <Typography variant="subtitle2" color="#00D4FF" gutterBottom>PERFORMANCE NODE.JS</Typography>
                      <Typography variant="h4" fontWeight={900}>{sysPerf?.node?.memoria?.heap_usado_mb} MB</Typography>
                      <Typography variant="caption">Memória Heap em uso</Typography>
                  </GlassCard>
              </Grid>
              <Grid item xs={12} md={4}>
                  <GlassCard sx={{ p: 3 }}>
                      <Typography variant="subtitle2" color="#00D4FF" gutterBottom>UPTIME</Typography>
                      <Typography variant="h4" fontWeight={900}>{sysPerf?.node?.uptime_formatado}</Typography>
                      <Typography variant="caption">Tempo de atividade contínua</Typography>
                  </GlassCard>
              </Grid>
          </Grid>
      )}

      {/* DIALOG CADASTRO CÂMERA */}
      <Dialog open={openCameraDialog} onClose={() => setOpenCameraDialog(false)} fullWidth maxWidth="sm">
          <DialogTitle>CONFIGURAÇÃO DE CÂMERA IP</DialogTitle>
          <DialogContent>
              <Stack spacing={2} pt={1}>
                  <TextField label="Nome da Câmera" fullWidth value={editingCamera?.nome || ''} onChange={(e) => setEditingCamera({...editingCamera, nome: e.target.value})} />
                  <FormControl fullWidth>
                      <InputLabel>Fabricante</InputLabel>
                      <Select label="Fabricante" value={editingCamera?.fabricante || ''} onChange={(e) => setEditingCamera({...editingCamera, fabricante: e.target.value})}>
                          {FABRICANTES.map(f => <MenuItem key={f} value={f}>{f}</MenuItem>)}
                      </Select>
                  </FormControl>
                  <TextField label="Endereço IP" fullWidth value={editingCamera?.ip_address || ''} onChange={(e) => setEditingCamera({...editingCamera, ip_address: e.target.value})} />
                  <TextField label="Snapshot URL (Manual)" fullWidth value={editingCamera?.snapshot_url || ''} onChange={(e) => setEditingCamera({...editingCamera, snapshot_url: e.target.value})} helperText="Deixe vazio para usar o padrão do fabricante" />
              </Stack>
          </DialogContent>
          <DialogActions>
              <Button onClick={() => setOpenCameraDialog(false)}>CANCELAR</Button>
              <Button variant="contained" onClick={async () => {
                   await api.post('/cameras', editingCamera);
                   fetchCameras();
                   setOpenCameraDialog(false);
              }}>SALVAR</Button>
          </DialogActions>
      </Dialog>
    </Box>
  );
};

export default Monitor;
