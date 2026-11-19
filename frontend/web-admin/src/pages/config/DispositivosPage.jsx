import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  Box, Button, Dialog, DialogTitle, DialogContent, DialogActions,
  TextField, Select, MenuItem, FormControl, InputLabel, Grid,
  Card, CardContent, CardActions, Chip, CircularProgress, Alert,
  Table, TableBody, TableCell, TableContainer, TableHead, TableRow,
  Paper, Tooltip, IconButton, Collapse, Typography, Divider,
  LinearProgress, Switch, FormControlLabel
} from '@mui/material';
import {
  Add as AddIcon, Edit as EditIcon, Delete as DeleteIcon,
  Refresh as RefreshIcon, Sync as SyncIcon, NetworkCheck as PingIcon,
  LockOpen as UnlockIcon, Lock as LockIcon, DoorFront as DoorIcon,
  CameraAlt as SnapshotIcon, Settings as PushIcon,
  ExpandMore as ExpandMoreIcon, ExpandLess as ExpandLessIcon,
  CheckCircle as OkIcon, Error as ErrIcon,
  Timeline as QueueIcon,
  RouterOutlined as RouterIcon,
  ContentCopy as CopyIcon
} from '@mui/icons-material';
import { useSnackbar } from 'notistack';
import PageHeader from '../../components/common/PageHeader';
import GlassCard from '../../components/common/GlassCard';
import NeonButton from '../../components/common/NeonButton';
import ConfirmDialog from '../../components/common/ConfirmDialog';
import api from '../../services/api';
import AgentesLocais from '../../components/dispositivos/AgentesLocais';
import ConfiancaFacial from '../../components/dispositivos/ConfiancaFacial';
import ServidorLeitores from '../../components/dispositivos/ServidorLeitores';

import { botaoSecundario } from '../../styles/tokens';
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

// Data/hora curta em pt-BR ('nunca' quando vazio)
const formatarMomento = (iso) => {
  if (!iso) return 'nunca';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '–';
  return d.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
};

// Caminho RTSP padrão por marca (só para mostrar como placeholder; o servidor usa o que estiver salvo)
// Hikvision: canal N = /Streaming/Channels/N01 (stream principal). Intelbras/Dahua: /cam/realmonitor?channel=N
const caminhoRtspPadrao = (marca, canal) => {
  const n = Number(canal) || 1;
  return marca === 'hikvision' ? `/Streaming/Channels/${n * 100 + 1}` : `/cam/realmonitor?channel=${n}&subtype=0`;
};

// Prévia da URL RTSP com a senha mascarada (a senha real nunca aparece na tela)
const urlRtspPrevia = (f) => {
  const c = f.config || {};
  const caminho = c.rtsp_caminho || caminhoRtspPadrao(f.marca, c.canal);
  return `rtsp://${f.user_device || 'usuario'}:****@${f.ip_address || 'ip'}:${c.rtsp_porta || 554}${caminho}`;
};

// Linha de métrica do card (rótulo + valor; dica opcional ao passar o mouse)
const MetricaItem = ({ rotulo, valor, cor, dica }) => {
  const conteudo = (
    <Box>
      <Typography variant="caption" sx={{ color: '#64748B', display: 'block', fontSize: '0.68rem', lineHeight: 1.2 }}>{rotulo}</Typography>
      <Typography variant="body2" sx={{ color: cor || '#CBD5E1', fontSize: '0.78rem', fontWeight: 600, lineHeight: 1.3 }}>{valor}</Typography>
    </Box>
  );
  return dica ? <Tooltip title={dica}><span>{conteudo}</span></Tooltip> : conteudo;
};

const FORM_DEFAULT = {
  id: null, nome: '', marca: 'intelbras', tipo: 'terminal_facial',
  ip_address: '', porta: 80, user_device: 'admin', password_device: '',
  modo: 'ambos', area_id: null, area_nome: '', offline_mode: 'fail_closed',
  config: { fluxo: 'checkin', controla_rele: true }
};

export default function DispositivosPage() {
  const { enqueueSnackbar } = useSnackbar();

  const [dispositivos, setDispositivos] = useState([]);
  const [queue, setQueue] = useState([]);
  const [areas, setAreas] = useState([]);
  const [agentes, setAgentes] = useState([]);
  // Métricas por dispositivo, indexadas por id (online, latência, último evento, faces, erros)
  const [metricas, setMetricas] = useState({});
  const [medindo, setMedindo] = useState(false);
  const [loading, setLoading] = useState(true);
  const [autoRefresh, setAutoRefresh] = useState(true);

  // Dialog estados
  const [openDialog, setOpenDialog] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState(null);

  // Estados de ação por dispositivo
  const [actionLoading, setActionLoading] = useState({});
  // Diagnóstico do leitor: { open, device, carregando, dados: { resumo, itens[] }, erro }
  const [diag, setDiag] = useState({ open: false, device: null, carregando: false, dados: null, erro: null });
  const [expandedCards, setExpandedCards] = useState({});

  // Snapshot dialog
  const [snapshotDialog, setSnapshotDialog] = useState({ open: false, url: null, nome: '' });
  // Libera a imagem da memória ao fechar (createObjectURL fica preso até revogar)
  const fecharSnapshot = () => setSnapshotDialog(prev => {
    if (prev.url) URL.revokeObjectURL(prev.url);
    return { open: false, url: null, nome: '' };
  });

  // Test-connection dialog
  const [testDialog, setTestDialog] = useState({ open: false, result: null, testing: false });
  const [testIp, setTestIp] = useState('');
  const [pushDialog, setPushDialog] = useState({ open: false, device: null, host: '', port: '' });
  // Endereço dos leitores salvo no painel ({ efetivo, origem, ... }), mostrado na janela do Config online
  const [servidorLeitores, setServidorLeitores] = useState(null);
  // Esvaziar leitor (fim do evento): confirmação digitando o nome
  const [esvaziar, setEsvaziar] = useState({ open: false, device: null, nome: '' });
  const [testPorta, setTestPorta] = useState(80);

  // Formulário
  const [formData, setFormData] = useState(FORM_DEFAULT);

  // ── Métricas: chamada separada, depois da lista, sem segurar o carregamento da tela.
  // O teste de alcance leva até ~2 s por leitor; enquanto não chega, o cartão mostra "medindo...".
  const [metricasCarregando, setMetricasCarregando] = useState(false);
  const metricasEmVooRef = useRef(false);
  const carregarMetricas = useCallback(async () => {
    if (metricasEmVooRef.current) return; // uma medição por vez
    metricasEmVooRef.current = true;
    setMetricasCarregando(true);
    try {
      const eventoId = new URLSearchParams(window.location.search).get('evento_id') || localStorage.getItem('active_evento_id');
      const { data } = await api.get('/dispositivos/metricas', { params: { evento_id: eventoId }, hideDefaultError: true, timeout: 20000 });
      setMetricas(Object.fromEntries((data?.data ?? []).map(m => [m.dispositivo_id, m])));
    } catch {
      // Sem métricas o cartão segue com o status gravado; nada é desligado por isso
    } finally {
      metricasEmVooRef.current = false;
      setMetricasCarregando(false);
    }
  }, []);

  // ── Carregamento
  // silencioso = atualização de fundo (sem indicador de carregamento)
  const carregarDados = useCallback(async (silencioso = false) => {
    try {
      if (!silencioso) setLoading(true);
      const eventoId = new URLSearchParams(window.location.search).get('evento_id') || localStorage.getItem('active_evento_id');
      const [devRes, queueRes, areasRes, agentesRes] = await Promise.allSettled([
        api.get('/dispositivos', { params: { evento_id: eventoId } }),
        api.get('/dispositivos/queue', { params: { evento_id: eventoId } }),
        api.get('/config/areas', { params: { evento_id: eventoId } }),
        api.get('/agentes', { hideDefaultError: true })
      ]);
      setAgentes(agentesRes.status === 'fulfilled' ? (agentesRes.value.data?.data ?? []) : []);
      setDispositivos(devRes.status === 'fulfilled' ? (devRes.value.data?.data ?? []) : []);
      setQueue(queueRes.status === 'fulfilled' ? (queueRes.value.data?.data ?? []) : []);
      setAreas(areasRes.status === 'fulfilled' ? (areasRes.value.data?.data ?? []) : []);
    } catch (err) {
      enqueueSnackbar('Erro ao carregar dados: ' + err.message, { variant: 'error' });
    } finally {
      setLoading(false);
    }
    carregarMetricas(); // sem await: a lista já aparece; as métricas chegam depois
  }, [enqueueSnackbar, carregarMetricas]);

  // Mede os equipamentos agora (ignora o cache curto do servidor), sem recarregar a lista inteira
  const medirAgora = async () => {
    setMedindo(true);
    try {
      const eventoId = new URLSearchParams(window.location.search).get('evento_id') || localStorage.getItem('active_evento_id');
      const { data } = await api.get('/dispositivos/metricas', {
        params: { evento_id: eventoId, force: 'true' }, hideDefaultError: true, timeout: 20000
      });
      setMetricas(Object.fromEntries((data?.data ?? []).map(m => [m.dispositivo_id, m])));
      enqueueSnackbar('Métricas atualizadas', { variant: 'success', autoHideDuration: 1500 });
    } catch (err) {
      enqueueSnackbar('Falha ao medir: ' + (err.response?.data?.error || err.message), { variant: 'error' });
    } finally {
      setMedindo(false);
    }
  };

  // Carga inicial: uma vez ao abrir (a quantidade de equipamentos não recarrega a tela)
  useEffect(() => { carregarDados(); }, [carregarDados]);

  // Atualização automática: a cada 60 s (ou 90 s com mais de 6 equipamentos) e só com a aba visível.
  // O intervalo lê a quantidade por ref e se reagenda sozinho, sem recriar o efeito.
  const qtdDispositivosRef = useRef(0);
  useEffect(() => { qtdDispositivosRef.current = dispositivos.length; }, [dispositivos.length]);
  const intervaloRef = useRef(null);
  useEffect(() => {
    if (!autoRefresh) return undefined;
    const agendar = () => {
      const intervaloMs = qtdDispositivosRef.current > 6 ? 90000 : 60000;
      intervaloRef.current = setTimeout(() => {
        if (!document.hidden) carregarDados(true);
        agendar();
      }, intervaloMs);
    };
    agendar();
    return () => clearTimeout(intervaloRef.current);
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
      // Canal, porta e caminho RTSP vazios vão como null: o servidor volta ao padrão do equipamento
      let valor = value;
      if (['canal', 'rtsp_porta'].includes(key)) valor = String(value).trim() === '' ? null : (parseInt(value, 10) || null);
      else if (key === 'rtsp_caminho') valor = String(value).trim() === '' ? null : value;
      setFormData(p => ({ ...p, config: { ...(p.config || {}), [key]: type === 'checkbox' ? checked : valor } }));
    } else {
      setFormData(p => ({ ...p, [name]: name === 'porta' ? parseInt(value) || 0 : value }));
    }
  };

  const handleSave = async () => {
    if (!formData.nome || !formData.ip_address) {
      enqueueSnackbar('Nome e IP são obrigatórios', { variant: 'warning' });
      return;
    }
    const exigeSenha = ['terminal_facial', 'catraca'].includes(formData.tipo)
      && ['intelbras', 'dahua', 'hikvision'].includes(formData.marca);
    if (!isEditing && exigeSenha && !String(formData.password_device || '').trim()) {
      enqueueSnackbar('A senha do leitor é obrigatória para este equipamento', { variant: 'warning' });
      return;
    }
    // rtsp_url vem do servidor com a senha mascarada (rtsp://usuario:****@...): nunca reenviar.
    // A tela não edita essa URL; o servidor a monta a partir de IP, usuário, senha, canal e porta.
    const payload = { ...formData };
    if (typeof payload.rtsp_url === 'string' && payload.rtsp_url.includes('****')) delete payload.rtsp_url;
    if (typeof payload.config?.rtsp_url === 'string' && payload.config.rtsp_url.includes('****')) {
      payload.config = { ...payload.config };
      delete payload.config.rtsp_url;
    }
    try {
      if (isEditing) {
        await api.put(`/dispositivos/${formData.id}`, payload);
        enqueueSnackbar('Dispositivo atualizado', { variant: 'success' });
      } else {
        await api.post('/dispositivos', payload);
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
      await api.delete(`/dispositivos/${id}`);
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

  const handleSync = (id) => runAction(id, 'sync', () => api.post(`/dispositivos/${id}/sync`), 'Sincronização iniciada');
  // Apaga todos os rostos do leitor e reenvia só quem tem acesso a ele (leitor bagunçado, fim de evento, equipamento alugado)
  const handleReset = (device) => {
    if (!window.confirm(`Apagar TODOS os rostos de "${device.nome}" e enviar de novo só quem tem acesso a ele?\n\nDurante alguns minutos o leitor pode não reconhecer as pessoas.`)) return;
    runAction(device.id, 'reset', () => api.post(`/dispositivos/${device.id}/sync?reset=true`), 'Leitor limpo e sincronização iniciada');
  };
  const handleOpenDoor = (id) => runAction(id, 'open', () => api.post(`/dispositivos/${id}/remote-open`), 'Porta ABERTA (pulso)');
  const handleUnlockDoor = (id) => runAction(id, 'unlock', () => api.post(`/dispositivos/${id}/remote-unlock`), 'Acesso LIBERADO permanentemente');
  const handleLockDoor = (id) => runAction(id, 'lock', () => api.post(`/dispositivos/${id}/remote-lock`), 'Porta TRAVADA (bloqueio total)');
  const handleCloseDoor = (id) => runAction(id, 'close', () => api.post(`/dispositivos/${id}/remote-close`), 'Porta retornada ao estado NORMAL');
  const handleForceQueue = (id) => runAction(id, 'queue', () => api.post(`/dispositivos/${id}/force-queue`), 'Fila de pendências reprocessada');

  // Fim do evento: apaga todas as pessoas do equipamento e o leitor deixa de receber cadastros
  const confirmarEsvaziar = async () => {
    const { device } = esvaziar;
    setEsvaziar({ open: false, device: null, nome: '' });
    setDevLoading(device.id, 'esvaziar', true);
    try {
      const { data } = await api.post(`/dispositivos/${device.id}/esvaziar`, {}, { hideDefaultError: true, timeout: 60000 });
      enqueueSnackbar(data?.message || `${device.nome} esvaziado`, { variant: data?.restantes > 0 ? 'warning' : 'success' });
      carregarDados();
    } catch (err) {
      enqueueSnackbar(`Não esvaziou: ${err.response?.data?.error || err.message}`, { variant: 'error' });
    } finally {
      setDevLoading(device.id, 'esvaziar', false);
    }
  };

  const handleConfigurePush = (device) => {
    setPushDialog({ open: true, device, host: '', port: '' });
  };

  const diagnosticar = async (device) => {
    setDiag({ open: true, device, carregando: true, dados: null, erro: null });
    try {
      const { data } = await api.post(`/dispositivos/${device.id}/diagnosticar`, {}, { timeout: 60000 });
      setDiag({ open: true, device, carregando: false, dados: data?.data || null, erro: null });
    } catch (err) {
      setDiag({ open: true, device, carregando: false, dados: null, erro: err.response?.data?.error || err.message });
    }
  };

  // Correção de um clique a partir do diagnóstico
  const corrigir = async (acao, device) => {
    if (acao === 'editar') { setDiag(d => ({ ...d, open: false })); handleOpenDialog(device); return; }
    if (acao === 'config_online') { setDiag(d => ({ ...d, open: false })); handleConfigurePush(device); return; }
    if (acao === 'sync') { await handleSync(device.id); return diagnosticar(device); }
    if (acao === 'limpar_sincronizar') { setDiag(d => ({ ...d, open: false })); handleReset(device); return; }
    if (acao === 'fila') { await handleForceQueue(device.id); return diagnosticar(device); }
    if (acao === 'acertar_relogio') {
      try {
        const { data } = await api.post(`/dispositivos/${device.id}/acertar-relogio`);
        enqueueSnackbar(data?.message || 'Relógio acertado', { variant: 'success' });
      } catch (err) {
        enqueueSnackbar(`Não acertou o relógio: ${err.response?.data?.error || err.message}`, { variant: 'error' });
      }
      return diagnosticar(device);
    }
  };

  const confirmConfigurePush = async () => {
    const { device, host, port } = pushDialog;
    setPushDialog(p => ({ ...p, open: false }));
    setDevLoading(device.id, 'push', true);
    try {
      const { data } = await api.post(`/dispositivos/${device.id}/configure-push`, {
        server_ip: host.trim() || undefined,
        server_port: port ? parseInt(port, 10) : undefined
      });
      enqueueSnackbar(data?.message || `Modo online configurado em ${device.nome}`, { variant: 'success' });
    } catch (err) {
      enqueueSnackbar(`Erro ao configurar: ${err.response?.data?.error || err.message}`, { variant: 'error' });
    } finally {
      setDevLoading(device.id, 'push', false);
    }
  };

  const handleSnapshot = async (device) => {
    setDevLoading(device.id, 'snap', true);
    try {
      // Regra 19: Timeout estendido para captura de hardware lenta e supressão de erro global para evitar duplicidade
      const res = await api.get(`/dispositivos/${device.id}/snapshot`, { 
        responseType: 'blob', 
        timeout: 25000, 
        hideDefaultError: true 
      });
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
      const res = await api.post('/dispositivos/test-connection', { ip_address: testIp, porta: testPorta }, {
        timeout: 15000,  // 15 segundos - dispositivos WiFi podem ser lentos
        hideDefaultError: true
      });
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
    const m = metricas[device.id];
    // Ações (Sync, Câmera) dependem só do status gravado: a métrica nunca desliga botão.
    const isOnline = device.status_online === 'online';
    // A métrica só informa: pinta a borda com o teste de alcance de agora, quando existe.
    const alcanceOk = m ? m.online : isOnline;
    const medindoCartao = !m && metricasCarregando;
    const pending = queueCount(device.id);

    return (
      <Grid item xs={12} sm={6} lg={4} key={device.id}>
        <Card sx={{
          background: BG,
          border: `1px solid ${alcanceOk ? GREEN : 'rgba(255,51,102,0.3)'}`,
          backdropFilter: 'blur(12px)',
          borderRadius: 1.5,
          minHeight: 215, // Fix CLS: Reserva altura mínima do card
          transition: 'box-shadow 0.3s',
          '&:hover': { boxShadow: `0 0 20px ${alcanceOk ? 'rgba(0,255,136,0.15)' : 'rgba(255,51,102,0.1)'}` }
        }}>

          {/* ── Header do card */}
          <CardContent sx={{ pb: 1 }}>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 1.5 }}>
              <Box>
                <Typography variant="subtitle1" sx={{ color: CYAN, fontWeight: 700, fontSize: '1rem' }}>
                  {device.nome}
                </Typography>
                <Typography variant="caption" sx={{ color: '#94A3B8', fontSize: '0.75rem' }}>
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
                    fontWeight: 700, fontSize: '0.75rem'
                  }}
                />
                {pending > 0 && (
                  <Chip label={`${pending} pendentes`} size="small" color="warning" sx={{ fontSize: '0.75rem' }} />
                )}
              </Box>
            </Box>

            <Box sx={{ fontSize: '0.8125rem', color: '#94A3B8', lineHeight: 1.8 }}>
              <Box><code style={{ color: '#CBD5E1' }}>{device.ip_address}:{device.porta || 80}</code></Box>
              
              <Box sx={{ my: 0.8, display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
                {device.modo === 'credenciamento' ? (
                  <Chip label="Credenciamento" size="small" sx={{ bgcolor: 'rgba(123,47,190,0.25)', color: '#A855F7', border: '1px solid rgba(123,47,190,0.5)', fontWeight: 700, fontSize: '0.75rem' }} />
                ) : device.modo === 'area_restrita' ? (
                  <Chip label={`Área restrita: ${device.area_nome || 'não definida'}`} size="small" sx={{ bgcolor: 'rgba(0,212,255,0.18)', color: '#00D4FF', border: '1px solid rgba(0,212,255,0.4)', fontWeight: 700, fontSize: '0.75rem' }} />
                ) : device.modo === 'checkout' ? (
                  <Chip label="Saída" size="small" sx={{ bgcolor: 'rgba(255,119,0,0.2)', color: '#FFB800', border: '1px solid rgba(255,119,0,0.4)', fontWeight: 700, fontSize: '0.75rem' }} />
                ) : (
                  <Chip label={device.area_nome ? `${device.area_nome}` : "Portaria geral"} size="small" sx={{ bgcolor: 'rgba(0,255,136,0.15)', color: '#00FF88', border: '1px solid rgba(0,255,136,0.4)', fontWeight: 700, fontSize: '0.75rem' }} />
                )}

                {device.config?.fluxo && (
                  <Chip label={`Fluxo: ${({ toggle: 'entrada e saída', entrada: 'só entrada', saida: 'só saída' })[device.config.fluxo] || device.config.fluxo}`} size="small" variant="outlined" sx={{ fontSize: '0.75rem', borderColor: 'rgba(255,255,255,0.2)', color: '#CBD5E1' }} />
                )}
              </Box>
              {device.config?.esvaziado_em && (
                <Box sx={{ fontSize: '0.75rem', color: '#FFB800' }}>
                  Esvaziado em {formatarMomento(device.config.esvaziado_em)}: não recebe ninguém até um “Sync”
                </Box>
              )}
              {device.config?.controla_rele === false && (
                <Box sx={{ fontSize: '0.75rem', color: '#FFB800' }}>Sem controle de relé (modo online)</Box>
              )}
              {device.offline_mode === 'fail_open' && (
                <Box sx={{ fontSize: '0.75rem', color: '#FFB800' }}>
                  Marcado para liberar sem servidor, mas o leitor ainda nega nesse caso (configuração não aplicada no equipamento)
                </Box>
              )}
              {device.ultimo_ping && (
                <Box sx={{ fontSize: '0.75rem', color: '#64748B', mt: 0.5 }}>
                  Último ping: {new Date(device.ultimo_ping).toLocaleTimeString('pt-BR')}
                </Box>
              )}
            </Box>

            {/* ── Métricas do equipamento */}
            <Box sx={{ mt: 1.2, pt: 1, borderTop: '1px solid rgba(255,255,255,0.06)', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 0.6 }}>
              <MetricaItem rotulo="Alcance"
                valor={medindoCartao ? 'medindo...' : !m ? '–' : m.online ? (m.latencia_ms != null ? `${m.latencia_ms} ms` : 'online') : 'sem resposta'}
                cor={!m ? '#94A3B8' : m.online ? GREEN : RED} />
              <MetricaItem rotulo="Último evento" valor={m ? formatarMomento(m.ultimo_evento_at) : '–'} />
              <MetricaItem rotulo="Faces no leitor" valor={m?.faces_sincronizadas ?? '–'} />
              <MetricaItem rotulo="Erros (24 h)"
                valor={m?.erros_24h ?? '–'}
                cor={m?.erros_24h > 0 ? RED : undefined}
                dica={m?.ultimo_erro ? `${m.ultimo_erro.operacao}: ${m.ultimo_erro.mensagem || 'sem mensagem'} (${formatarMomento(m.ultimo_erro.at)})` : null} />
              <MetricaItem rotulo="Fila pendente" valor={m?.fila_pendente ?? pending} cor={(m?.fila_pendente ?? pending) > 0 ? '#FFB800' : undefined} />
              <MetricaItem rotulo="Medido" valor={m ? formatarMomento(m.medido_em) : medindoCartao ? 'medindo...' : '–'} />
            </Box>
          </CardContent>

          {/* ── Linha 1 de botões: Sync + Snapshot + Edit + Delete */}
          <CardActions sx={{ flexWrap: 'wrap', gap: 0.5, px: 2, pt: 0, pb: 1 }}>
            <Tooltip title="Sincronizar todos os rostos do evento">
              <span>
                <Button size="small" 
                  aria-label={`Sincronizar dados com ${device.nome}`}
                  startIcon={isDevLoading(device.id, 'sync') ? <CircularProgress size={12} /> : <SyncIcon />}
                  onClick={() => handleSync(device.id)}
                  disabled={isDevLoading(device.id, 'sync') || !isOnline}
                  sx={{ color: CYAN, fontSize: '0.75rem', minWidth: 0 }}>
                  Sync
                </Button>
              </span>
            </Tooltip>
            <Tooltip title="Testa cadastro, conexão, senha, relógio, modo online e pessoas no leitor, e mostra como corrigir">
              <Button size="small"
                aria-label={`Diagnosticar ${device.nome}`}
                startIcon={<PingIcon />}
                onClick={() => diagnosticar(device)}
                sx={{ color: '#00FF88', fontSize: '0.75rem', minWidth: 0 }}>
                Diagnosticar
              </Button>
            </Tooltip>
            <Tooltip title="Apagar todos os rostos do leitor e enviar de novo só quem tem acesso (leitor com pessoas erradas, fim de evento)">
              <span>
                <Button size="small"
                  aria-label={`Limpar e sincronizar ${device.nome}`}
                  startIcon={isDevLoading(device.id, 'reset') ? <CircularProgress size={12} /> : null}
                  onClick={() => handleReset(device)}
                  disabled={isDevLoading(device.id, 'reset') || !isOnline}
                  sx={{ color: '#FFB800', fontSize: '0.75rem', minWidth: 0 }}>
                  Limpar e sincronizar
                </Button>
              </span>
            </Tooltip>

            {device.tipo === 'terminal_facial' || device.tipo === 'camera' ? (
              <Tooltip title="Ver snapshot da câmera">
                <span>
                  <Button size="small" 
                    aria-label={`Visualizar câmera de ${device.nome}`}
                    startIcon={isDevLoading(device.id, 'snap') ? <CircularProgress size={12} /> : <SnapshotIcon />}
                    onClick={() => handleSnapshot(device)}
                    disabled={isDevLoading(device.id, 'snap') || !isOnline}
                    sx={{ color: '#FFB800', fontSize: '0.75rem', minWidth: 0 }}>
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
                  sx={{ color: '#94A3B8' }}>
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
                    sx={{ color: GREEN, borderColor: `${GREEN}44`, fontSize: '0.75rem' }}>
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
                    sx={{ color: '#FFB800', borderColor: '#FFB80044', fontSize: '0.75rem' }}>
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
                    sx={{ color: RED, borderColor: `${RED}44`, fontSize: '0.75rem' }}>
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
                    sx={{ color: '#94A3B8', borderColor: '#33333388', fontSize: '0.75rem' }}>
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
                    sx={{ color: PURP, borderColor: `${PURP}44`, fontSize: '0.75rem' }}>
                    Config online
                  </Button>
                </span>
              </Tooltip>

              {/* Fim do evento: apagar todas as pessoas do leitor (LGPD) */}
              {device.tipo === 'terminal_facial' && (
                <Tooltip title="Fim do evento: apaga todas as pessoas e rostos do leitor. Ele não recebe mais ninguém até um Sync.">
                  <span>
                    <Button variant="outlined" size="small"
                      startIcon={isDevLoading(device.id, 'esvaziar') ? <CircularProgress size={10} /> : <DeleteIcon />}
                      onClick={() => setEsvaziar({ open: true, device, nome: '' })}
                      disabled={isDevLoading(device.id, 'esvaziar') || !isOnline}
                      sx={{ color: RED, borderColor: `${RED}44`, fontSize: '0.75rem' }}>
                      Esvaziar leitor
                    </Button>
                  </span>
                </Tooltip>
              )}

              {/* Forçar fila pendente */}
              {pending > 0 && (
                <Tooltip title={`Reprocessar ${pending} comando(s) pendentes`}>
                  <span>
                    <Button variant="outlined" size="small"
                      startIcon={isDevLoading(device.id, 'queue') ? <CircularProgress size={10} /> : <QueueIcon />}
                      onClick={() => handleForceQueue(device.id)}
                      disabled={isDevLoading(device.id, 'queue')}
                      sx={{ color: '#FFB800', borderColor: '#FFB80044', fontSize: '0.75rem' }}>
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

  // Leitor de acesso Intelbras/Dahua/Hikvision: o backend exige senha no cadastro
  const senhaObrigatoria = ['terminal_facial', 'catraca'].includes(formData.tipo)
    && ['intelbras', 'dahua', 'hikvision'].includes(formData.marca);

  // ── Render principal
  return (
    <Box sx={{ p: { xs: 2, md: 4 } }}>
      <PageHeader
        title="Leitores e dispositivos"
        subtitle="Terminais faciais Intelbras/Hikvision, câmeras e catracas"
      />

      <AgentesLocais agentes={agentes} onChange={() => carregarDados()} />
      <ConfiancaFacial />
      <ServidorLeitores onSalvo={setServidorLeitores} />

      {/* ── Barra de ações */}
      <Box sx={{ mb: 3, display: 'flex', gap: 2, flexWrap: 'wrap', alignItems: 'center' }}>
        <NeonButton startIcon={<AddIcon />} onClick={() => handleOpenDialog()}>
          Novo dispositivo
        </NeonButton>

        <NeonButton variant="outlined" startIcon={<RefreshIcon />} onClick={() => carregarDados()} disabled={loading}>
          {loading ? 'Atualizando...' : 'Atualizar'}
        </NeonButton>

        <NeonButton variant="outlined" startIcon={<PingIcon />} onClick={medirAgora} disabled={medindo}>
          {medindo ? 'Medindo...' : 'Medir agora'}
        </NeonButton>

        <Button variant="outlined"
          size="small"
          startIcon={<PingIcon />}
          onClick={() => setTestDialog({ open: true, result: null, testing: false })} sx={botaoSecundario}>
          Testar conexão
        </Button>

        <Box sx={{ ml: 'auto' }}>
          <FormControlLabel
            control={
              <Switch 
                id="auto-refresh-toggle"
                name="auto_refresh"
                checked={autoRefresh} 
                onChange={e => setAutoRefresh(e.target.checked)} 
                size="small" 
                inputProps={{ 'aria-label': 'Ativar atualização automática de terminais' }}
              />
            }
            label={<Typography variant="caption" sx={{ color: '#94A3B8' }}>Atualização automática (60 s)</Typography>}
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

          {loading && dispositivos.length === 0 ? (
            <Grid container spacing={2}>
              {[1, 2, 3].map((i) => (
                <Grid item xs={12} sm={6} lg={4} key={i}>
                  <Box sx={{ height: 215, bgcolor: 'rgba(255,255,255,0.02)', borderRadius: 1.5, border: '1px solid rgba(255,255,255,0.05)' }} />
                </Grid>
              ))}
            </Grid>
          ) : dispositivos.length === 0 ? (
            <Alert severity="info" sx={{ background: 'rgba(0,212,255,0.05)', border: '1px solid rgba(0,212,255,0.15)' }}>
              Nenhum dispositivo cadastrado. Clique em <b>&quot;Novo dispositivo&quot;</b> para começar.
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
            <TableContainer component={Paper} sx={{ background: 'rgba(5,11,24,0.8)', borderRadius: 1.5, overflowX: 'auto' }}>
              <Table size="small" sx={{ minWidth: 640 }}>
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
                      <TableCell sx={{ color: '#CBD5E1', fontSize: '0.8125rem' }}>{item.device_name ?? item.dispositivo_id?.slice(0, 8)}</TableCell>
                      <TableCell sx={{ fontSize: '0.75rem', color: '#94A3B8' }}>
                        {item.tipo_comando === 'enroll_face' ? 'Cadastrar face'
                          : item.tipo_comando === 'delete_face' ? 'Remover face'
                            : item.tipo_comando}
                      </TableCell>
                      <TableCell>
                        <Chip label={item.status} size="small" color={queueChip(item.status)} sx={{ fontSize: '0.75rem' }} />
                      </TableCell>
                      <TableCell sx={{ color: '#94A3B8', fontSize: '0.75rem' }}>{item.attempt_count}/{item.max_attempts ?? 5}</TableCell>
                      <TableCell sx={{ fontSize: '0.75rem', color: RED, maxWidth: 140 }}>
                        <Tooltip title={item.error_message ?? ''}>
                          <span>{item.error_message ? item.error_message.substring(0, 35) + (item.error_message.length > 35 ? '…' : '') : '–'}</span>
                        </Tooltip>
                      </TableCell>
                      <TableCell>
                        {item.status === 'erro' && (
                          <Button size="small" onClick={() => handleForceQueue(item.dispositivo_id)}
                            sx={{ color: GREEN, fontSize: '0.75rem', minWidth: 0 }}>
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
      <Dialog open={openDialog} onClose={() => setOpenDialog(false)} maxWidth="sm" fullWidth>
        <DialogTitle sx={{ color: CYAN, fontWeight: 700, borderBottom: `1px solid ${CYAN}22` }}>
          {isEditing ? 'Editar dispositivo' : 'Novo dispositivo'}
        </DialogTitle>
        <DialogContent sx={{ pt: 3 }}>
          <Box component="form" autoComplete="off" onSubmit={(e) => e.preventDefault()} sx={{ display: 'flex', flexDirection: 'column', gap: 2, mt: 1 }}>
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
                    <MenuItem value="terminal_facial">Terminal facial</MenuItem>
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
                <TextField label="Senha" id="password_device" name="password_device" type="password" value={formData.password_device}
                  onChange={handleFormChange} fullWidth size="small" autoComplete="new-password"
                  required={!isEditing && senhaObrigatoria}
                  placeholder={isEditing && formData.has_password ? '•••••• (mantida)' : ''}
                  helperText={isEditing
                    ? 'Deixe em branco para manter a senha atual'
                    : (senhaObrigatoria ? 'Obrigatória: senha deste leitor' : '')} />
              </Grid>
            </Grid>

            {/* ── Integração do equipamento: canal, vídeo RTSP e eventos */}
            {['terminal_facial', 'catraca', 'camera'].includes(formData.tipo) && (
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5, p: 1.5, border: `1px solid ${CYAN}22`, borderRadius: 1.5 }}>
                <Typography variant="subtitle2" sx={{ color: CYAN, fontWeight: 700 }}>
                  Integração do equipamento
                </Typography>
                <Grid container spacing={2}>
                  <Grid item xs={12} sm={4}>
                    <TextField label="Canal de vídeo" name="config.canal" type="number" value={formData.config?.canal ?? ''}
                      onChange={handleFormChange} fullWidth size="small" placeholder="1"
                      helperText="Canal da câmera no equipamento" />
                  </Grid>
                  <Grid item xs={12} sm={4}>
                    <TextField label="Porta RTSP" name="config.rtsp_porta" type="number" value={formData.config?.rtsp_porta ?? ''}
                      onChange={handleFormChange} fullWidth size="small" placeholder="554" />
                  </Grid>
                  <Grid item xs={12} sm={4}>
                    <TextField label="Caminho RTSP (opcional)" name="config.rtsp_caminho" value={formData.config?.rtsp_caminho ?? ''}
                      onChange={handleFormChange} fullWidth size="small"
                      placeholder={caminhoRtspPadrao(formData.marca, formData.config?.canal)} />
                  </Grid>
                </Grid>
                <Typography variant="caption" sx={{ color: '#64748B', wordBreak: 'break-all' }}>
                  Vídeo: <code style={{ color: '#94A3B8' }}>{urlRtspPrevia(formData)}</code>
                </Typography>
                <Typography variant="caption" sx={{ color: '#94A3B8' }}>
                  Eventos em tempo real (modo online): depois de salvar, use o botão <b>Config online</b> no cartão.
                  {formData.marca === 'hikvision'
                    ? ' Hikvision: o aparelho envia para o servidor pelo listening host (Event > httpHosts).'
                    : ' Intelbras/Dahua: o aparelho envia pela configuração Plataforma > Online / POST eventos.'}
                </Typography>
              </Box>
            )}

            {isEditing && formData.control_token && (
              <Box sx={{
                background: 'rgba(0,212,255,0.05)', border: `1px solid ${CYAN}33`,
                borderRadius: 1.5, p: 1.5
              }}>
                <Typography variant="caption" sx={{ color: '#94A3B8', display: 'block', mb: 0.5 }}>
                  Token do dispositivo — use este token na URL de configuração do hardware
                </Typography>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  <code style={{ color: CYAN, fontSize: '0.75rem', flex: 1, wordBreak: 'break-all' }}>
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
                <Typography variant="caption" sx={{ color: '#64748B', mt: 0.5, display: 'block' }}>
                  Caminho do modo online (o botão Config Online grava no leitor):{' '}
                  <code style={{ color: '#94A3B8' }}>/api/intelbras/online?token={formData.control_token}</code>
                </Typography>
              </Box>
            )}

            <Grid container spacing={2}>
              <Grid item xs={6}>
                <FormControl fullWidth size="small">
                  <InputLabel id="modo-label" htmlFor="modo-select">Modo de operação</InputLabel>
                  <Select labelId="modo-label" inputProps={{ id: 'modo-select', name: 'modo' }}
                    value={formData.modo || 'acesso_geral'} onChange={handleFormChange} label="Modo de operação">
                    <MenuItem value="credenciamento">Baia de credenciamento (operador)</MenuItem>
                    <MenuItem value="acesso_geral">Portaria geral (catraca principal)</MenuItem>
                    <MenuItem value="area_restrita">Área restrita (exige autorização)</MenuItem>
                    <MenuItem value="checkout">Portão de saída (checkout)</MenuItem>
                    <MenuItem value="ambos">Bidirecional (entrada/saída)</MenuItem>
                  </Select>
                </FormControl>
              </Grid>
              <Grid item xs={6}>
                <FormControl fullWidth size="small">
                  <InputLabel id="area-label">Área / local</InputLabel>
                  <Select labelId="area-label" inputProps={{ id: 'area-select', name: 'area_id' }}
                    value={formData.area_id || ''} label="Área / local"
                    onChange={(e) => {
                      const selected = areas.find(a => a.id === e.target.value);
                      setFormData(p => ({
                        ...p,
                        area_id: e.target.value,
                        area_nome: selected?.nome_area || ''
                      }));
                    }}>
                    <MenuItem value=""><em>Nenhuma</em></MenuItem>
                    {areas.map(area => (
                      <MenuItem key={area.id} value={area.id}>{area.nome_area}</MenuItem>
                    ))}
                  </Select>
                </FormControl>
              </Grid>
            </Grid>

            <Divider sx={{ borderColor: `${CYAN}22`, my: 1 }} />
            <Typography variant="caption" sx={{ color: '#94A3B8', fontWeight: 600, letterSpacing: 1 }}>
              Configurações de controle de acesso
            </Typography>

            <Grid container spacing={2}>
              <Grid item xs={6}>
                <FormControl fullWidth size="small">
                  <InputLabel id="fluxo-label" htmlFor="fluxo-select">Fluxo de acesso</InputLabel>
                  <Select labelId="fluxo-label" inputProps={{ id: 'fluxo-select', name: 'config.fluxo' }}
                    value={formData.config?.fluxo || 'checkin'} onChange={handleFormChange} label="Fluxo de acesso">
                    <MenuItem value="checkin">Checkin (entrada)</MenuItem>
                    <MenuItem value="checkout">Checkout (saída)</MenuItem>
                    <MenuItem value="toggle">Toggle (alternado)</MenuItem>
                  </Select>
                </FormControl>
              </Grid>
              <Grid item xs={6}>
                <FormControl fullWidth size="small">
                  <InputLabel id="offline-mode-label" htmlFor="offline-mode-select">Modo offline</InputLabel>
                  {/* A escolha ainda não é enviada ao leitor: em modo online, sem resposta do servidor ele nega.
                      Travado em "negar" até a configuração ser aplicada no equipamento (ver docs/sistema-cameras.md, 9.9). */}
                  <Select labelId="offline-mode-label" inputProps={{ id: 'offline-mode-select', name: 'offline_mode' }}
                    value="fail_closed" disabled label="Modo offline">
                    <MenuItem value="fail_closed">Negar acesso (sem servidor)</MenuItem>
                    <MenuItem value="fail_open">Liberar acesso (sem servidor)</MenuItem>
                  </Select>
                  <Box sx={{ fontSize: '0.72rem', color: '#94A3B8', mt: 0.5 }}>
                    Em modo online, se o leitor não alcança o servidor, ele nega o acesso. Liberar sem servidor ainda não está disponível.
                  </Box>
                </FormControl>
              </Grid>
              <Grid item xs={12}>
                <FormControl fullWidth size="small">
                  <InputLabel id="bloqueado-leitor-label" htmlFor="bloqueado-leitor-select">Pessoa bloqueada ou expulsa neste leitor</InputLabel>
                  <Select labelId="bloqueado-leitor-label" inputProps={{ id: 'bloqueado-leitor-select', name: 'bloqueado_no_leitor' }}
                    value={formData.config?.bloqueado_no_leitor === 'remover' ? 'remover' : 'suspender'}
                    onChange={e => setFormData(p => ({ ...p, config: { ...(p.config || {}), bloqueado_no_leitor: e.target.value } }))}
                    label="Pessoa bloqueada ou expulsa neste leitor">
                    <MenuItem value="suspender">Manter cadastrada e suspensa (desbloqueio volta na hora)</MenuItem>
                    <MenuItem value="remover">Remover do leitor</MenuItem>
                  </Select>
                  <Box sx={{ fontSize: '0.72rem', color: '#94A3B8', mt: 0.5 }}>
                    Suspensa: o rosto fica no leitor com a validade vencida e ele nega a passagem até o sistema desbloquear.
                    Confira no equipamento (teste do manual) antes de usar sem internet. Leitor que não suporta suspensão remove a pessoa.
                  </Box>
                </FormControl>
              </Grid>
              <Grid item xs={12}>
                <FormControl fullWidth size="small">
                  <InputLabel id="agente-label" htmlFor="agente-select">Conexão com o leitor</InputLabel>
                  <Select labelId="agente-label" inputProps={{ id: 'agente-select', name: 'agent_id' }}
                    value={formData.agent_id || ''} onChange={handleFormChange} label="Conexão com o leitor">
                    <MenuItem value="">Direta (servidor na mesma rede do leitor)</MenuItem>
                    {agentes.filter(a => a.ativo !== false).map(a => (
                      <MenuItem key={a.id} value={a.id}>Via agente local: {a.nome}{a.conectado ? '' : ' (desconectado)'}</MenuItem>
                    ))}
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
                <Typography variant="caption" sx={{ color: '#CBD5E1' }}>
                  Acionar relé/catraca via servidor (modo Push)
                </Typography>
              }
            />

            {formData.tipo === 'terminal_facial' && (
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5, pt: 1.5, borderTop: '1px solid rgba(255,255,255,0.08)' }}>
                <Typography variant="subtitle2" sx={{ color: CYAN, fontWeight: 700 }}>
                  Reconhecimento facial
                </Typography>
                <FormControl fullWidth size="small">
                  <InputLabel id="ia-confirmacao-label" htmlFor="ia-confirmacao-select">Quem reconhece o rosto</InputLabel>
                  <Select labelId="ia-confirmacao-label" inputProps={{ id: 'ia-confirmacao-select', name: 'ia_confirmacao' }}
                    label="Quem reconhece o rosto"
                    value={formData.config?.ia_confirmacao === true ? 'ia' : 'leitor'}
                    onChange={e => setFormData(p => ({ ...p, config: { ...(p.config || {}), ia_confirmacao: e.target.value === 'ia' } }))}>
                    <MenuItem value="leitor">Só o leitor (não usa o motor de IA)</MenuItem>
                    <MenuItem value="ia">Leitor + confirmação da IA (mais seguro)</MenuItem>
                  </Select>
                </FormControl>
                <Typography variant="caption" sx={{ color: '#94A3B8', mt: -0.5 }}>
                  {formData.config?.ia_confirmacao === true
                    ? 'O motor de IA do evento compara a foto tirada pelo leitor com o cadastro da pessoa identificada. Rosto diferente: acesso negado e alerta. Exige o leitor em modo online e o motor ligado.'
                    : 'O leitor identifica a pessoa sozinho e o servidor aplica as regras de área, horário e bloqueio.'}
                </Typography>
                {formData.config?.ia_confirmacao === true && (
                  <FormControl fullWidth size="small">
                    <InputLabel id="ia-falha-label" htmlFor="ia-falha-select">Se a IA não responder em 1,5 s</InputLabel>
                    <Select labelId="ia-falha-label" inputProps={{ id: 'ia-falha-select', name: 'ia_falha' }}
                      label="Se a IA não responder em 1,5 s"
                      value={formData.config?.ia_falha === 'negar' ? 'negar' : 'liberar'}
                      onChange={e => setFormData(p => ({ ...p, config: { ...(p.config || {}), ia_falha: e.target.value } }))}>
                      <MenuItem value="liberar">Vale o reconhecimento do leitor (fila não para)</MenuItem>
                      <MenuItem value="negar">Negar o acesso (áreas restritas)</MenuItem>
                    </Select>
                  </FormControl>
                )}
                <FormControlLabel
                  control={
                    <Switch
                      id="usar-como-camera-switch"
                      name="usar_como_camera"
                      checked={formData.config?.usar_como_camera === true}
                      onChange={e => setFormData(p => ({ ...p, config: { ...(p.config || {}), usar_como_camera: e.target.checked } }))}
                      size="small"
                    />
                  }
                  label={
                    <Typography variant="caption" sx={{ color: '#CBD5E1' }}>
                      Usar também como câmera (aparece no Monitor; IA e gravação se escolhem em Câmeras)
                    </Typography>
                  }
                />
              </Box>
            )}

          </Box>
        </DialogContent>
        <DialogActions sx={{ borderTop: `1px solid ${CYAN}22`, p: 2 }}>
          <Button variant="outlined" onClick={() => setOpenDialog(false)} sx={botaoSecundario}>Cancelar</Button>
          <Button onClick={handleSave} variant="contained" sx={{ background: CYAN, color: '#000000', fontWeight: 700 }}>
            {isEditing ? 'Atualizar' : 'Criar'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* ── Dialog: Snapshot */}
      <Dialog open={snapshotDialog.open} onClose={() => fecharSnapshot()} maxWidth="md">
        <DialogTitle sx={{ color: CYAN }}>Snapshot — {snapshotDialog.nome}</DialogTitle>
        <DialogContent>
          {snapshotDialog.url ? (
            <Box component="img" src={snapshotDialog.url} alt="Snapshot"
              sx={{ width: '100%', borderRadius: 1.5, border: `1px solid ${CYAN}33` }} />
          ) : (
            <CircularProgress />
          )}
        </DialogContent>
        <DialogActions>
          <Button
            href={snapshotDialog.url} download={`snapshot_${snapshotDialog.nome}.jpg`}
            sx={{ color: GREEN }}>Baixar</Button>
          <Button variant="outlined" onClick={() => fecharSnapshot()} sx={botaoSecundario}>Fechar</Button>
        </DialogActions>
      </Dialog>

      {/* ── Dialog: Test Connection */}
      <Dialog open={testDialog.open} onClose={() => setTestDialog({ open: false, result: null, testing: false })} maxWidth="xs" fullWidth>
        <DialogTitle sx={{ color: CYAN, fontWeight: 700 }}>Testar conexão</DialogTitle>
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
          <Button variant="outlined" onClick={() => setTestDialog({ open: false, result: null, testing: false })} sx={botaoSecundario}>Fechar</Button>
          <Button onClick={handleTestConnection} variant="contained" disabled={testDialog.testing || !testIp}
            sx={{ background: CYAN, color: '#000000', fontWeight: 700 }}>
            {testDialog.testing ? 'Testando...' : 'Testar'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* ── Dialog: Configurar modo online */}
      <Dialog open={diag.open} onClose={() => setDiag(d => ({ ...d, open: false }))} maxWidth="sm" fullWidth>
        <DialogTitle>Diagnóstico: {diag.device?.nome}</DialogTitle>
        <DialogContent dividers>
          {diag.carregando && (
            <Box sx={{ py: 3, textAlign: 'center' }}>
              <CircularProgress size={28} />
              <Typography variant="body2" sx={{ mt: 1, color: '#94A3B8' }}>Testando o leitor (até 30 s)...</Typography>
            </Box>
          )}
          {diag.erro && <Alert severity="error">Não deu para diagnosticar: {diag.erro}</Alert>}
          {diag.dados && (
            <>
              <Alert severity={diag.dados.itens.some(i => i.estado === 'erro') ? 'error' : diag.dados.itens.some(i => i.estado === 'alerta') ? 'warning' : 'success'} sx={{ mb: 1.5 }}>
                {diag.dados.resumo}
              </Alert>
              {diag.dados.itens.map((i) => {
                const cor = { ok: '#00FF88', alerta: '#FFB800', erro: RED, nao_testado: '#64748B' }[i.estado] || '#94A3B8';
                const rotuloAcao = {
                  editar: 'Editar leitor', config_online: 'Config Online', acertar_relogio: 'Acertar relógio',
                  sync: 'Sync', limpar_sincronizar: 'Limpar e sincronizar', fila: 'Reprocessar fila'
                }[i.acao];
                return (
                  <Box key={i.chave} sx={{ display: 'flex', gap: 1.5, py: 1, borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                    <Box sx={{ width: 10, height: 10, borderRadius: '50%', bgcolor: cor, mt: 0.75, flexShrink: 0 }} />
                    <Box sx={{ flex: 1, minWidth: 0 }}>
                      <Typography variant="body2" sx={{ fontWeight: 600 }}>{i.titulo}</Typography>
                      <Typography variant="body2" sx={{ color: '#CBD5E1' }}>{i.detalhe}</Typography>
                      {i.como_corrigir && <Typography variant="caption" sx={{ color: cor, display: 'block', mt: 0.25 }}>{i.como_corrigir}</Typography>}
                    </Box>
                    {rotuloAcao && (
                      <Button size="small" variant="outlined" onClick={() => corrigir(i.acao, diag.device)} sx={{ alignSelf: 'center', flexShrink: 0, fontSize: '0.72rem' }}>
                        {rotuloAcao}
                      </Button>
                    )}
                  </Box>
                );
              })}
            </>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => diag.device && diagnosticar(diag.device)} disabled={diag.carregando}>Testar de novo</Button>
          <Button onClick={() => setDiag(d => ({ ...d, open: false }))}>Fechar</Button>
        </DialogActions>
      </Dialog>

      <Dialog open={pushDialog.open} onClose={() => setPushDialog(p => ({ ...p, open: false }))} maxWidth="xs" fullWidth>
        <DialogTitle sx={{ color: CYAN, fontWeight: 700 }}>Configurar Modo Online — {pushDialog.device?.nome}</DialogTitle>
        <DialogContent sx={{ pt: 2 }}>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, mt: 1 }}>
            <Alert severity="info">
              Endereço que o LEITOR usa para falar com o servidor.{' '}
              {servidorLeitores?.efetivo
                ? <>Em branco = <b>{servidorLeitores.efetivo.host}{servidorLeitores.efetivo.porta ? `:${servidorLeitores.efetivo.porta}` : ''}</b> (o salvo em “Endereço do servidor para os leitores”).</>
                : <>Em branco = configuração do servidor. Para não digitar sempre, salve o endereço no cartão “Endereço do servidor para os leitores”.</>}
            </Alert>
            <TextField label="Host do servidor (IP ou domínio)" value={pushDialog.host}
              onChange={e => setPushDialog(p => ({ ...p, host: e.target.value }))}
              fullWidth size="small" placeholder={servidorLeitores?.efetivo?.host || '192.168.1.129'} />
            <TextField label="Porta" type="number" value={pushDialog.port}
              onChange={e => setPushDialog(p => ({ ...p, port: e.target.value }))}
              fullWidth size="small" placeholder={String(servidorLeitores?.efetivo?.porta || 3001)} />
          </Box>
        </DialogContent>
        <DialogActions>
          <Button variant="outlined" onClick={() => setPushDialog(p => ({ ...p, open: false }))} sx={botaoSecundario}>Cancelar</Button>
          <Button onClick={confirmConfigurePush} variant="contained"
            sx={{ background: CYAN, color: '#000000', fontWeight: 700 }}>
            Aplicar no leitor
          </Button>
        </DialogActions>
      </Dialog>

      {/* ── Dialog: Esvaziar leitor (fim do evento) */}
      <Dialog open={esvaziar.open} onClose={() => setEsvaziar({ open: false, device: null, nome: '' })} maxWidth="xs" fullWidth>
        <DialogTitle sx={{ color: RED, fontWeight: 700 }}>Esvaziar leitor — {esvaziar.device?.nome}</DialogTitle>
        <DialogContent sx={{ pt: 2 }}>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, mt: 1 }}>
            <Alert severity="warning">
              Apaga <b>todas</b> as pessoas e rostos guardados no equipamento e cancela os cadastros pendentes.
              A partir daí o leitor <b>não reconhece ninguém</b> e não recebe novos cadastros.
              Use no fim do evento ou antes de devolver um equipamento alugado.
              Para usar de novo, clique em “Sync”.
            </Alert>
            <TextField label="Digite o nome do leitor para confirmar" value={esvaziar.nome} autoFocus
              onChange={e => setEsvaziar(s => ({ ...s, nome: e.target.value }))}
              fullWidth size="small" placeholder={esvaziar.device?.nome || ''} />
          </Box>
        </DialogContent>
        <DialogActions>
          <Button variant="outlined" onClick={() => setEsvaziar({ open: false, device: null, nome: '' })} sx={botaoSecundario}>Cancelar</Button>
          <Button onClick={confirmarEsvaziar} variant="contained"
            disabled={!esvaziar.device || esvaziar.nome.trim() !== String(esvaziar.device.nome).trim()}
            sx={{ background: RED, color: '#FFFFFF', fontWeight: 700 }}>
            Esvaziar
          </Button>
        </DialogActions>
      </Dialog>

      {/* ── Dialog: Confirm delete */}
      <ConfirmDialog
        open={!!deleteConfirm}
        title="Remover dispositivo"
        message="Tem certeza que deseja remover este dispositivo? A fila de sincronização associada também será removida."
        onConfirm={() => handleDelete(deleteConfirm)}
        onCancel={() => setDeleteConfirm(null)}
      />
    </Box>
  );
}
