import React, { useState, useEffect, useCallback } from 'react';
import {
  Box, Button, Dialog, DialogTitle, DialogContent, DialogActions,
  TextField, Select, MenuItem, FormControl, InputLabel, Grid,
  Card, CardContent, CardActions, Chip, CircularProgress, Alert,
  Table, TableBody, TableCell, TableContainer, TableHead, TableRow,
  Paper, Tooltip, IconButton, Collapse, Typography, Divider, Badge,
  LinearProgress, Switch, FormControlLabel
} from '@mui/material';
import {
  Add as AddIcon, Edit as EditIcon, Delete as DeleteIcon,
  Refresh as RefreshIcon, Sync as SyncIcon, NetworkCheck as PingIcon,
  LockOpen as UnlockIcon, Lock as LockIcon, DoorFront as DoorIcon,
  CameraAlt as SnapshotIcon, Settings as PushIcon,
  ExpandMore as ExpandMoreIcon, ExpandLess as ExpandLessIcon,
  CheckCircle as OkIcon, Error as ErrIcon, Warning as WarnIcon,
  PowerSettingsNew as PowerIcon, Timeline as QueueIcon,
  Videocam as CamIcon, RouterOutlined as RouterIcon,
  ContentCopy as CopyIcon
} from '@mui/icons-material';
import { useSnackbar } from 'notistack';
import PageHeader from '../../components/common/PageHeader';
import GlassCard from '../../components/common/GlassCard';
import NeonButton from '../../components/common/NeonButton';
import ConfirmDialog from '../../components/common/ConfirmDialog';
import api from '../../services/api';

// ── Paleta padronizada do sistema
const CYAN = '#00D4FF';
const GREEN = '#00FF88';
const RED = '#FF3366';
const PURP = '#7B2FBE';
const BG = 'rgba(5,11,24,0.85)';

// ── Helpers visuais
const statusColor = (s) => s === 'online' ? GREEN : RED;
const statusLabel = (s) => s === 'online' ? '● Online' : '○ Offline';
const queueChip = (s) => ({ sucesso: 'success', erro: 'error', pendente: 'warning', processando: 'info' }[s] ?? 'default');

const FORM_DEFAULT = {
  id: null, nome: '', marca: 'intelbras', tipo: 'terminal_facial',
  ip_address: '', porta: 80, user_device: 'admin', password_device: '',
  modo: 'ambos', area_nome: '', offline_mode: 'fail_closed',
  config: { fluxo: 'checkin', controla_rele: true }
};

export default function DispositivosPage() {
  const { enqueueSnackbar } = useSnackbar();

  const [dispositivos, setDispositivos] = useState([]);
  const [queue, setQueue] = useState([]);
  const [loading, setLoading] = useState(true);
  const [autoRefresh, setAutoRefresh] = useState(true);

  // Dialog estados
  const [openDialog, setOpenDialog] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState(null);

  // Estados de ação por dispositivo
  const [actionLoading, setActionLoading] = useState({});
  const [expandedCards, setExpandedCards] = useState({});

  // Snapshot dialog
  const [snapshotDialog, setSnapshotDialog] = useState({ open: false, url: null, nome: '' });

  // Test-connection dialog
  const [testDialog, setTestDialog] = useState({ open: false, result: null, testing: false });
  const [testIp, setTestIp] = useState('');
  const [testPorta, setTestPorta] = useState(80);

  // Formulário
  const [formData, setFormData] = useState(FORM_DEFAULT);

  // ── Carregamento
  const carregarDados = useCallback(async () => {
    try {
      setLoading(true);
      const [devRes, queueRes] = await Promise.allSettled([
        api.get('/api/dispositivos'),
        api.get('/api/dispositivos/queue')
      ]);
      setDispositivos(devRes.status === 'fulfilled' ? (devRes.value.data?.data ?? []) : []);
      setQueue(queueRes.status === 'fulfilled' ? (queueRes.value.data?.data ?? []) : []);
    } catch (err) {
      enqueueSnackbar('Erro ao carregar dados: ' + err.message, { variant: 'error' });
    } finally {
      setLoading(false);
    }
  }, [enqueueSnackbar]);

  useEffect(() => {
    carregarDados();
    if (autoRefresh) {
      const interval = setInterval(carregarDados, 12000);
      return () => clearInterval(interval);
    }
  }, [autoRefresh, carregarDados]);

  // ── Auxiliar: loading por dispositivo
  const setDevLoading = (id, key, val) =>
    setActionLoading(prev => ({ ...prev, [`${id}_${key}`]: val }));
  const isDevLoading = (id, key) => !!actionLoading[`${id}_${key}`];

  // ── Formulário
  const handleOpenDialog = (device = null) => {
    if (device) {
      setFormData({
        ...FORM_DEFAULT,
        ...device,
        config: { ...FORM_DEFAULT.config, ...(device.config || {}) }
      });
    } else {
      setFormData({ ...FORM_DEFAULT, config: { ...FORM_DEFAULT.config } });
    }
    setIsEditing(!!device);
    setOpenDialog(true);
  };

  const handleFormChange = (e) => {
    const { name, value, type, checked } = e.target;
    if (name.startsWith('config.')) {
      const key = name.slice(7);
      setFormData(p => ({ ...p, config: { ...(p.config || {}), [key]: type === 'checkbox' ? checked : value } }));
    } else {
      setFormData(p => ({ ...p, [name]: name === 'porta' ? parseInt(value) || 0 : value }));
    }
  };

  const handleSave = async () => {
    if (!formData.nome || !formData.ip_address) {
      enqueueSnackbar('Nome e IP são obrigatórios', { variant: 'warning' });
      return;
    }
    try {
      if (isEditing) {
        await api.put(`/api/dispositivos/${formData.id}`, formData);
        enqueueSnackbar('Dispositivo atualizado', { variant: 'success' });
      } else {
        await api.post('/api/dispositivos', formData);
        enqueueSnackbar('Dispositivo criado', { variant: 'success' });
      }
      setOpenDialog(false);
      carregarDados();
    } catch (err) {
      enqueueSnackbar('Erro ao salvar: ' + err.message, { variant: 'error' });
    }
  };

  const handleDelete = async (id) => {
    try {
      await api.delete(`/api/dispositivos/${id}`);
      enqueueSnackbar('Dispositivo removido', { variant: 'success' });
      setDeleteConfirm(null);
      carregarDados();
    } catch (err) {
      enqueueSnackbar('Erro ao remover: ' + err.message, { variant: 'error' });
    }
  };

  // ── Ações de hardware
  const runAction = async (id, key, fn, successMsg) => {
    setDevLoading(id, key, true);
    try {
      await fn();
      enqueueSnackbar(successMsg, { variant: 'success' });
      carregarDados();
    } catch (err) {
      enqueueSnackbar(`Falha: ${err.message}`, { variant: 'error' });
    } finally {
      setDevLoading(id, key, false);
    }
  };

  const handleSync = (id) => runAction(id, 'sync', () => api.post(`/api/dispositivos/${id}/sync`), 'Sincronização iniciada');
  const handleOpenDoor = (id) => runAction(id, 'open', () => api.post(`/api/dispositivos/${id}/remote-open`), 'Porta ABERTA (pulso)');
  const handleUnlockDoor = (id) => runAction(id, 'unlock', () => api.post(`/api/dispositivos/${id}/remote-unlock`), 'Acesso LIBERADO permanentemente');
  const handleLockDoor = (id) => runAction(id, 'lock', () => api.post(`/api/dispositivos/${id}/remote-lock`), 'Porta TRAVADA (bloqueio total)');
  const handleCloseDoor = (id) => runAction(id, 'close', () => api.post(`/api/dispositivos/${id}/remote-close`), 'Porta retornada ao estado NORMAL');
  const handleForceQueue = (id) => runAction(id, 'queue', () => api.post(`/api/dispositivos/${id}/force-queue`), 'Fila de pendências reprocessada');

  const handleConfigurePush = async (device) => {
    setDevLoading(device.id, 'push', true);
    try {
      const serverIp = prompt('IP do servidor (deixe vazio para auto-detectar):', '');
      await api.post(`/api/dispositivos/${device.id}/configure-push`, { server_ip: serverIp || undefined });
      enqueueSnackbar(`Push configurado em ${device.nome}`, { variant: 'success' });
    } catch (err) {
      enqueueSnackbar(`Erro no push: ${err.message}`, { variant: 'error' });
    } finally {
      setDevLoading(device.id, 'push', false);
    }
  };

  const handleSnapshot = async (device) => {
    setDevLoading(device.id, 'snap', true);
    try {
      const res = await api.get(`/api/dispositivos/${device.id}/snapshot`, { responseType: 'blob' });
      const url = URL.createObjectURL(res.data);
      setSnapshotDialog({ open: true, url, nome: device.nome });
    } catch (err) {
      enqueueSnackbar(`Snapshot falhou: ${err.message}`, { variant: 'error' });
    } finally {
      setDevLoading(device.id, 'snap', false);
    }
  };

  const handleTestConnection = async () => {
    if (!testIp) return;
    setTestDialog(p => ({ ...p, testing: true, result: null }));
    try {
      const res = await api.post('/api/dispositivos/test-connection', { ip_address: testIp, porta: testPorta });
      setTestDialog(p => ({ ...p, testing: false, result: { ok: true, msg: res.data.message } }));
    } catch (err) {
      const msg = err.response?.data?.error || err.message;
      setTestDialog(p => ({ ...p, testing: false, result: { ok: false, msg } }));
    }
  };

  // ── Contagem de itens pendentes na fila por dispositivo
  const queueCount = (id) => queue.filter(q => q.dispositivo_id === id && q.status === 'pendente').length;

  // ── Render de um card de dispositivo
  const renderCard = (device) => {
    const expanded = !!expandedCards[device.id];
    const isOnline = device.status_online === 'online';
    const pending = queueCount(device.id);

    return (
      <Grid item xs={12} sm={6} lg={4} key={device.id}>
        <Card sx={{
          background: BG,
          border: `1px solid ${isOnline ? GREEN : 'rgba(255,51,102,0.3)'}`,
          backdropFilter: 'blur(12px)',
          borderRadius: 3,
          transition: 'box-shadow 0.3s',
          '&:hover': { boxShadow: `0 0 20px ${isOnline ? 'rgba(0,255,136,0.15)' : 'rgba(255,51,102,0.1)'}` }
        }}>

          {/* ── Header do card */}
          <CardContent sx={{ pb: 1 }}>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 1.5 }}>
              <Box>
                <Typography variant="subtitle1" sx={{ color: CYAN, fontWeight: 700, fontSize: '0.95rem' }}>
                  {device.nome}
                </Typography>
                <Typography variant="caption" sx={{ color: '#888', fontSize: '0.72rem' }}>
                  {device.marca?.toUpperCase() || 'N/A'} · {device.tipo?.replace('_', ' ') || ''}
                </Typography>
              </Box>
              <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 0.5 }}>
                <Chip
                  label={statusLabel(device.status_online)}
                  size="small"
                  sx={{
                    backgroundColor: `${statusColor(device.status_online)}22`,
                    color: statusColor(device.status_online),
                    border: `1px solid ${statusColor(device.status_online)}55`,
                    fontWeight: 700, fontSize: '0.7rem'
                  }}
                />
                {pending > 0 && (
                  <Chip label={`${pending} pendentes`} size="small" color="warning" sx={{ fontSize: '0.65rem' }} />
                )}
              </Box>
            </Box>

            <Box sx={{ fontSize: '0.8rem', color: '#aaa', lineHeight: 1.8 }}>
              <Box>🌐 <code style={{ color: '#ccc' }}>{device.ip_address}:{device.porta || 80}</code></Box>
              {device.area_nome && <Box>📍 {device.area_nome}</Box>}
              {device.modo && <Box>⚙️ Registro: <b style={{ color: '#ccc' }}>{device.modo}</b>
                {device.config?.fluxo && <> · Fluxo: <b style={{ color: CYAN }}>{device.config.fluxo}</b></>}
              </Box>}
              {device.config?.controla_rele === false && (
                <Box sx={{ fontSize: '0.7rem', color: '#FFB800' }}>🔌 Sem controle de relé (modo online)</Box>
              )}
              {device.offline_mode === 'fail_open' && (
                <Box sx={{ fontSize: '0.7rem', color: RED }}>⚠️ Fail Open — libera se offline</Box>
              )}
              {device.ultimo_ping && (
                <Box sx={{ fontSize: '0.7rem', color: '#666', mt: 0.5 }}>
                  ⏱️ Último ping: {new Date(device.ultimo_ping).toLocaleTimeString('pt-BR')}
                </Box>
              )}
            </Box>
          </CardContent>

          {/* ── Linha 1 de botões: Sync + Snapshot + Edit + Delete */}
          <CardActions sx={{ flexWrap: 'wrap', gap: 0.5, px: 2, pt: 0, pb: 1 }}>
            <Tooltip title="Sincronizar todos os rostos do evento">
              <span>
                <Button size="small" startIcon={isDevLoading(device.id, 'sync') ? <CircularProgress size={12} /> : <SyncIcon />}
                  onClick={() => handleSync(device.id)}
                  disabled={isDevLoading(device.id, 'sync')}
                  sx={{ color: CYAN, fontSize: '0.72rem', minWidth: 0 }}>
                  Sync
                </Button>
              </span>
            </Tooltip>

            {device.tipo === 'terminal_facial' || device.tipo === 'camera' ? (
              <Tooltip title="Ver snapshot da câmera">
                <span>
                  <Button size="small" startIcon={isDevLoading(device.id, 'snap') ? <CircularProgress size={12} /> : <SnapshotIcon />}
                    onClick={() => handleSnapshot(device)}
                    disabled={isDevLoading(device.id, 'snap')}
                    sx={{ color: '#FFB800', fontSize: '0.72rem', minWidth: 0 }}>
                    Câmera
                  </Button>
                </span>
              </Tooltip>
            ) : null}

            <Tooltip title="Editar dispositivo">
              <IconButton size="small" onClick={() => handleOpenDialog(device)} sx={{ color: PURP }}>
                <EditIcon fontSize="small" />
              </IconButton>
            </Tooltip>
            <Tooltip title="Remover dispositivo">
              <IconButton size="small" onClick={() => setDeleteConfirm(device.id)} sx={{ color: RED }}>
                <DeleteIcon fontSize="small" />
              </IconButton>
            </Tooltip>

            <Box sx={{ ml: 'auto' }}>
              <Tooltip title={expanded ? 'Fechar controles' : 'Abrir controles de hardware'}>
                <IconButton size="small" onClick={() => setExpandedCards(p => ({ ...p, [device.id]: !expanded }))}
                  sx={{ color: '#888' }}>
                  {expanded ? <ExpandLessIcon fontSize="small" /> : <ExpandMoreIcon fontSize="small" />}
                </IconButton>
              </Tooltip>
            </Box>
          </CardActions>

          {/* ── Painel expandível: controles de hardware */}
          <Collapse in={expanded} unmountOnExit>
            <Divider sx={{ borderColor: 'rgba(0,212,255,0.1)' }} />
            <Box sx={{ p: 1.5, display: 'flex', flexWrap: 'wrap', gap: 1 }}>

              {/* Abertura / bloqueio de porta */}
              <Tooltip title="Abrir porta (pulso único)">
                <span>
                  <Button variant="outlined" size="small"
                    startIcon={isDevLoading(device.id, 'open') ? <CircularProgress size={10} /> : <DoorIcon />}
                    onClick={() => handleOpenDoor(device.id)}
                    disabled={isDevLoading(device.id, 'open')}
                    sx={{ color: GREEN, borderColor: `${GREEN}44`, fontSize: '0.7rem' }}>
                    Abrir
                  </Button>
                </span>
              </Tooltip>

              <Tooltip title="Liberar porta (acesso livre permanente)">
                <span>
                  <Button variant="outlined" size="small"
                    startIcon={isDevLoading(device.id, 'unlock') ? <CircularProgress size={10} /> : <UnlockIcon />}
                    onClick={() => handleUnlockDoor(device.id)}
                    disabled={isDevLoading(device.id, 'unlock')}
                    sx={{ color: '#FFB800', borderColor: '#FFB80044', fontSize: '0.7rem' }}>
                    Liberar
                  </Button>
                </span>
              </Tooltip>

              <Tooltip title="Travar porta (bloqueio total)">
                <span>
                  <Button variant="outlined" size="small"
                    startIcon={isDevLoading(device.id, 'lock') ? <CircularProgress size={10} /> : <LockIcon />}
                    onClick={() => handleLockDoor(device.id)}
                    disabled={isDevLoading(device.id, 'lock')}
                    sx={{ color: RED, borderColor: `${RED}44`, fontSize: '0.7rem' }}>
                    Travar
                  </Button>
                </span>
              </Tooltip>

              <Tooltip title="Voltar ao estado normal">
                <span>
                  <Button variant="outlined" size="small"
                    startIcon={isDevLoading(device.id, 'close') ? <CircularProgress size={10} /> : <DoorIcon />}
                    onClick={() => handleCloseDoor(device.id)}
                    disabled={isDevLoading(device.id, 'close')}
                    sx={{ color: '#888', borderColor: '#33333388', fontSize: '0.7rem' }}>
                    Normal
                  </Button>
                </span>
              </Tooltip>

              {/* Config Online Mode */}
              <Tooltip title="Enviar configuração de Modo Online ao dispositivo (requer acesso de rede direto)">
                <span>
                  <Button variant="outlined" size="small"
                    startIcon={isDevLoading(device.id, 'push') ? <CircularProgress size={10} /> : <PushIcon />}
                    onClick={() => handleConfigurePush(device)}
                    disabled={isDevLoading(device.id, 'push')}
                    sx={{ color: PURP, borderColor: `${PURP}44`, fontSize: '0.7rem' }}>
                    Config Online
                  </Button>
                </span>
              </Tooltip>

              {/* Forçar fila pendente */}
              {pending > 0 && (
                <Tooltip title={`Reprocessar ${pending} comando(s) pendentes`}>
                  <span>
                    <Button variant="outlined" size="small"
                      startIcon={isDevLoading(device.id, 'queue') ? <CircularProgress size={10} /> : <QueueIcon />}
                      onClick={() => handleForceQueue(device.id)}
                      disabled={isDevLoading(device.id, 'queue')}
                      sx={{ color: '#FFB800', borderColor: '#FFB80044', fontSize: '0.7rem' }}>
                      Fila ({pending})
                    </Button>
                  </span>
                </Tooltip>
              )}
            </Box>
          </Collapse>
        </Card>
      </Grid>
    );
  };

  // ── Render principal
  return (
    <Box sx={{ p: { xs: 2, md: 4 } }}>
      <PageHeader
        title="Terminais & Dispositivos"
        subtitle="Terminais faciais Intelbras/Hikvision, câmeras e catracas"
      />

      {/* ── Barra de ações */}
      <Box sx={{ mb: 3, display: 'flex', gap: 2, flexWrap: 'wrap', alignItems: 'center' }}>
        <NeonButton startIcon={<AddIcon />} onClick={() => handleOpenDialog()}>
          Novo Dispositivo
        </NeonButton>

        <NeonButton variant="outlined" startIcon={<RefreshIcon />} onClick={carregarDados} disabled={loading}>
          {loading ? 'Atualizando...' : 'Atualizar'}
        </NeonButton>

        <Button
          variant="outlined" size="small"
          startIcon={<PingIcon />}
          onClick={() => setTestDialog({ open: true, result: null, testing: false })}
          sx={{ color: CYAN, borderColor: `${CYAN}44`, fontSize: '0.8rem' }}
        >
          Testar Conexão
        </Button>

        <Box sx={{ ml: 'auto' }}>
          <FormControlLabel
            control={<Switch checked={autoRefresh} onChange={e => setAutoRefresh(e.target.checked)} size="small" />}
            label={<Typography variant="caption" sx={{ color: '#888' }}>Auto-refresh 12s</Typography>}
          />
        </Box>
      </Box>

      {loading && <LinearProgress sx={{ mb: 2, height: 2 }} />}

      {/* ── Seção 1: Cards de dispositivos */}
      <GlassCard glowColor={CYAN} sx={{ mb: 4 }}>
        <Box sx={{ p: 3 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
            <RouterIcon sx={{ color: CYAN }} />
            <Typography variant="h6" sx={{ color: CYAN, fontWeight: 700 }}>
              Dispositivos ({dispositivos.length})
            </Typography>
            <Chip
              label={`${dispositivos.filter(d => d.status_online === 'online').length} online`}
              size="small" sx={{ ml: 1, backgroundColor: `${GREEN}22`, color: GREEN, fontWeight: 700 }}
            />
          </Box>

          {dispositivos.length === 0 ? (
            <Alert severity="info" sx={{ background: 'rgba(0,212,255,0.05)', border: '1px solid rgba(0,212,255,0.15)' }}>
              Nenhum dispositivo cadastrado. Clique em <b>"Novo Dispositivo"</b> para começar.
            </Alert>
          ) : (
            <Grid container spacing={2}>
              {dispositivos.map(renderCard)}
            </Grid>
          )}
        </Box>
      </GlassCard>

      {/* ── Seção 2: Fila de sincronização */}
      <GlassCard glowColor={PURP}>
        <Box sx={{ p: 3 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
            <QueueIcon sx={{ color: PURP }} />
            <Typography variant="h6" sx={{ color: PURP, fontWeight: 700 }}>
              Fila de Sincronização ({queue.length})
            </Typography>
          </Box>

          {queue.length === 0 ? (
            <Alert severity="success" sx={{ background: 'rgba(0,255,136,0.05)', border: '1px solid rgba(0,255,136,0.15)' }}>
              Nenhum item pendente — todos os terminais sincronizados!
            </Alert>
          ) : (
            <TableContainer component={Paper} sx={{ background: 'rgba(5,11,24,0.8)', borderRadius: 2 }}>
              <Table size="small">
                <TableHead>
                  <TableRow sx={{ background: `${PURP}22` }}>
                    {['Dispositivo', 'Comando', 'Status', 'Tentativas', 'Erro', 'Ação'].map(h => (
                      <TableCell key={h} sx={{ color: PURP, fontWeight: 700, fontSize: '0.75rem' }}>{h}</TableCell>
                    ))}
                  </TableRow>
                </TableHead>
                <TableBody>
                  {queue.map(item => (
                    <TableRow key={item.id} sx={{ '&:hover': { background: `${CYAN}08` } }}>
                      <TableCell sx={{ color: '#ccc', fontSize: '0.8rem' }}>{item.device_name ?? item.dispositivo_id?.slice(0, 8)}</TableCell>
                      <TableCell sx={{ fontSize: '0.78rem', color: '#aaa' }}>
                        {item.tipo_comando === 'enroll_face' ? '👤 Enroll Face'
                          : item.tipo_comando === 'delete_face' ? '🗑️ Delete Face'
                            : item.tipo_comando}
                      </TableCell>
                      <TableCell>
                        <Chip label={item.status} size="small" color={queueChip(item.status)} sx={{ fontSize: '0.65rem' }} />
                      </TableCell>
                      <TableCell sx={{ color: '#888', fontSize: '0.78rem' }}>{item.attempt_count}/{item.max_attempts ?? 5}</TableCell>
                      <TableCell sx={{ fontSize: '0.7rem', color: RED, maxWidth: 140 }}>
                        <Tooltip title={item.error_message ?? ''}>
                          <span>{item.error_message ? item.error_message.substring(0, 35) + (item.error_message.length > 35 ? '…' : '') : '–'}</span>
                        </Tooltip>
                      </TableCell>
                      <TableCell>
                        {item.status === 'erro' && (
                          <Button size="small" onClick={() => handleForceQueue(item.dispositivo_id)}
                            sx={{ color: GREEN, fontSize: '0.68rem', minWidth: 0 }}>
                            Reenviar
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          )}
        </Box>
      </GlassCard>

      {/* ── Dialog: Criar / Editar dispositivo */}
      <Dialog open={openDialog} onClose={() => setOpenDialog(false)} maxWidth="sm" fullWidth
        PaperProps={{ sx: { background: 'linear-gradient(135deg,#050B18,#0A1628)', border: `1px solid ${CYAN}33` } }}>
        <DialogTitle sx={{ color: CYAN, fontWeight: 700, borderBottom: `1px solid ${CYAN}22` }}>
          {isEditing ? '✏️ Editar Dispositivo' : '➕ Novo Dispositivo'}
        </DialogTitle>
        <DialogContent sx={{ pt: 3 }}>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, mt: 1 }}>
            <TextField label="Nome" name="nome" value={formData.nome} onChange={handleFormChange} fullWidth size="small" required />
            <Grid container spacing={2}>
              <Grid item xs={6}>
                <FormControl fullWidth size="small">
                  <InputLabel id="marca-label" htmlFor="marca-select">Marca</InputLabel>
                  <Select labelId="marca-label" inputProps={{ id: 'marca-select', name: 'marca' }}
                    value={formData.marca} onChange={handleFormChange} label="Marca">
                    <MenuItem value="intelbras">Intelbras</MenuItem>
                    <MenuItem value="hikvision">Hikvision</MenuItem>
                    <MenuItem value="dahua">Dahua</MenuItem>
                  </Select>
                </FormControl>
              </Grid>
              <Grid item xs={6}>
                <FormControl fullWidth size="small">
                  <InputLabel id="tipo-label" htmlFor="tipo-select">Tipo</InputLabel>
                  <Select labelId="tipo-label" inputProps={{ id: 'tipo-select', name: 'tipo' }}
                    value={formData.tipo} onChange={handleFormChange} label="Tipo">
                    <MenuItem value="terminal_facial">Terminal Facial</MenuItem>
                    <MenuItem value="camera">Câmera</MenuItem>
                    <MenuItem value="catraca">Catraca</MenuItem>
                    <MenuItem value="impressora">Impressora</MenuItem>
                  </Select>
                </FormControl>
              </Grid>
            </Grid>
            <Grid container spacing={2}>
              <Grid item xs={8}>
                <TextField label="IP Address" name="ip_address" value={formData.ip_address} onChange={handleFormChange}
                  fullWidth size="small" placeholder="192.168.1.100" required />
              </Grid>
              <Grid item xs={4}>
                <TextField label="Porta" name="porta" type="number" value={formData.porta} onChange={handleFormChange}
                  fullWidth size="small" />
              </Grid>
            </Grid>
            <Grid container spacing={2}>
              <Grid item xs={6}>
                <TextField label="Usuário" name="user_device" value={formData.user_device} onChange={handleFormChange}
                  fullWidth size="small" />
              </Grid>
              <Grid item xs={6}>
                <TextField label="Senha" name="password_device" type="password" value={formData.password_device}
                  onChange={handleFormChange} fullWidth size="small" />
              </Grid>
            </Grid>
            {isEditing && formData.control_token && (
              <Box sx={{
                background: 'rgba(0,212,255,0.05)', border: `1px solid ${CYAN}33`,
                borderRadius: 1.5, p: 1.5
              }}>
                <Typography variant="caption" sx={{ color: '#888', display: 'block', mb: 0.5 }}>
                  Token do dispositivo — use este token na URL de configuração do hardware
                </Typography>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  <code style={{ color: CYAN, fontSize: '0.78rem', flex: 1, wordBreak: 'break-all' }}>
                    {formData.control_token}
                  </code>
                  <Tooltip title="Copiar token">
                    <IconButton size="small" onClick={() => {
                      navigator.clipboard.writeText(formData.control_token);
                      enqueueSnackbar('Token copiado!', { variant: 'success', autoHideDuration: 1500 });
                    }}>
                      <CopyIcon sx={{ fontSize: 16, color: CYAN }} />
                    </IconButton>
                  </Tooltip>
                </Box>
                <Typography variant="caption" sx={{ color: '#666', mt: 0.5, display: 'block' }}>
                  URL Online Mode: <code style={{ color: '#888' }}>http://VPS_IP/api/intelbras/online?token={formData.control_token}</code>
                </Typography>
              </Box>
            )}

            <Grid container spacing={2}>
              <Grid item xs={6}>
                <FormControl fullWidth size="small">
                  <InputLabel id="modo-label" htmlFor="modo-select">Modo de Registro</InputLabel>
                  <Select labelId="modo-label" inputProps={{ id: 'modo-select', name: 'modo' }}
                    value={formData.modo} onChange={handleFormChange} label="Modo de Registro">
                    <MenuItem value="checkin">Checkin</MenuItem>
                    <MenuItem value="checkout">Checkout</MenuItem>
                    <MenuItem value="ambos">Ambos</MenuItem>
                  </Select>
                </FormControl>
              </Grid>
              <Grid item xs={6}>
                <TextField label="Área / Local" name="area_nome" value={formData.area_nome} onChange={handleFormChange}
                  fullWidth size="small" placeholder="Ex: Entrada Principal" />
              </Grid>
            </Grid>

            <Divider sx={{ borderColor: `${CYAN}22`, my: 1 }} />
            <Typography variant="caption" sx={{ color: '#888', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 1 }}>
              Configurações de Controle de Acesso
            </Typography>

            <Grid container spacing={2}>
              <Grid item xs={6}>
                <FormControl fullWidth size="small">
                  <InputLabel id="fluxo-label" htmlFor="fluxo-select">Fluxo de Acesso</InputLabel>
                  <Select labelId="fluxo-label" inputProps={{ id: 'fluxo-select', name: 'config.fluxo' }}
                    value={formData.config?.fluxo || 'checkin'} onChange={handleFormChange} label="Fluxo de Acesso">
                    <MenuItem value="checkin">Checkin (entrada)</MenuItem>
                    <MenuItem value="checkout">Checkout (saída)</MenuItem>
                    <MenuItem value="toggle">Toggle (alternado)</MenuItem>
                  </Select>
                </FormControl>
              </Grid>
              <Grid item xs={6}>
                <FormControl fullWidth size="small">
                  <InputLabel id="offline-mode-label" htmlFor="offline-mode-select">Modo Offline</InputLabel>
                  <Select labelId="offline-mode-label" inputProps={{ id: 'offline-mode-select', name: 'offline_mode' }}
                    value={formData.offline_mode || 'fail_closed'} onChange={handleFormChange} label="Modo Offline">
                    <MenuItem value="fail_closed">Fail Closed (negar acesso)</MenuItem>
                    <MenuItem value="fail_open">Fail Open (liberar acesso)</MenuItem>
                  </Select>
                </FormControl>
              </Grid>
            </Grid>

            <FormControlLabel
              control={
                <Switch
                  id="controla-rele-switch"
                  name="controla_rele"
                  checked={formData.config?.controla_rele !== false}
                  onChange={e => setFormData(p => ({ ...p, config: { ...(p.config || {}), controla_rele: e.target.checked } }))}
                  size="small"
                />
              }
              label={
                <Typography variant="caption" sx={{ color: '#ccc' }}>
                  Acionar relé/catraca via servidor (modo Push)
                </Typography>
              }
            />
          </Box>
        </DialogContent>
        <DialogActions sx={{ borderTop: `1px solid ${CYAN}22`, p: 2 }}>
          <Button onClick={() => setOpenDialog(false)} sx={{ color: '#888' }}>Cancelar</Button>
          <Button onClick={handleSave} variant="contained" sx={{ background: CYAN, color: '#000', fontWeight: 700 }}>
            {isEditing ? 'Atualizar' : 'Criar'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* ── Dialog: Snapshot */}
      <Dialog open={snapshotDialog.open} onClose={() => setSnapshotDialog({ open: false, url: null, nome: '' })} maxWidth="md"
        PaperProps={{ sx: { background: '#050B18', border: `1px solid ${CYAN}33` } }}>
        <DialogTitle sx={{ color: CYAN }}>📸 Snapshot — {snapshotDialog.nome}</DialogTitle>
        <DialogContent>
          {snapshotDialog.url ? (
            <Box component="img" src={snapshotDialog.url} alt="Snapshot"
              sx={{ width: '100%', borderRadius: 2, border: `1px solid ${CYAN}33` }} />
          ) : (
            <CircularProgress />
          )}
        </DialogContent>
        <DialogActions>
          <Button
            href={snapshotDialog.url} download={`snapshot_${snapshotDialog.nome}.jpg`}
            sx={{ color: GREEN }}>Baixar</Button>
          <Button onClick={() => setSnapshotDialog({ open: false, url: null, nome: '' })} sx={{ color: '#888' }}>Fechar</Button>
        </DialogActions>
      </Dialog>

      {/* ── Dialog: Test Connection */}
      <Dialog open={testDialog.open} onClose={() => setTestDialog({ open: false, result: null, testing: false })} maxWidth="xs" fullWidth
        PaperProps={{ sx: { background: 'linear-gradient(135deg,#050B18,#0A1628)', border: `1px solid ${CYAN}33` } }}>
        <DialogTitle sx={{ color: CYAN, fontWeight: 700 }}>🔌 Testar Conexão TCP</DialogTitle>
        <DialogContent sx={{ pt: 2 }}>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, mt: 1 }}>
            <TextField label="IP Address" value={testIp} onChange={e => setTestIp(e.target.value)}
              fullWidth size="small" placeholder="192.168.1.100" />
            <TextField label="Porta" type="number" value={testPorta} onChange={e => setTestPorta(parseInt(e.target.value) || 80)}
              fullWidth size="small" />
            {testDialog.testing && <LinearProgress />}
            {testDialog.result && (
              <Alert severity={testDialog.result.ok ? 'success' : 'error'}
                icon={testDialog.result.ok ? <OkIcon /> : <ErrIcon />}>
                {testDialog.result.msg}
              </Alert>
            )}
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setTestDialog({ open: false, result: null, testing: false })} sx={{ color: '#888' }}>Fechar</Button>
          <Button onClick={handleTestConnection} variant="contained" disabled={testDialog.testing || !testIp}
            sx={{ background: CYAN, color: '#000', fontWeight: 700 }}>
            {testDialog.testing ? 'Testando...' : 'Testar'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* ── Dialog: Confirm delete */}
      <ConfirmDialog
        open={!!deleteConfirm}
        title="Remover Dispositivo"
        message="Tem certeza que deseja remover este dispositivo? A fila de sincronização associada também será removida."
        onConfirm={() => handleDelete(deleteConfirm)}
        onCancel={() => setDeleteConfirm(null)}
      />
    </Box>
  );
}
