import React, { useState, useEffect, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Html5Qrcode } from "html5-qrcode";

import {
  Box,
  Typography,
  Grid,
  Stack,
  IconButton,
  Tooltip,
  TextField,
  Autocomplete,
  Avatar,
  CircularProgress,
  List,
  ListItem,
  ListItemAvatar,
  ListItemText,
  Chip,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
} from '@mui/material';
import {
  QrCodeScanner as ScannerIcon,
  FlashOn as FlashOnIcon,
  FlashOff as FlashOffIcon,
  FlipCameraIos as CameraIcon,
  CheckCircle as SuccessIcon,
  Error as ErrorIcon,
  Search as SearchIcon,
  History as HistoryIcon,
} from '@mui/icons-material';
import io from 'socket.io-client';
import api from '../services/api';
import localCheckinService from '../services/LocalCheckinService';
import GlassCard from '../components/common/GlassCard';
import PageHeader from '../components/common/PageHeader';
import NeonButton from '../components/common/NeonButton';
import { styled } from '@mui/material/styles';

const CameraFeed = styled(Box, {
  shouldForwardProp: (prop) => prop !== 'active' && prop !== 'result'
})(({ theme, active, result }) => ({
  width: '100%',
  height: 480,
  background: '#000',
  borderRadius: 24,
  position: 'relative',
  overflow: 'hidden',
  border: active ? '2px solid #00D4FF' : (result?.success ? '2px solid #00FF88' : '2px solid rgba(255,255,255,0.05)'),
  boxShadow: active ? '0 0 30px rgba(0, 212, 255, 0.2)' : (result?.success ? '0 0 30px rgba(0, 255, 136, 0.2)' : 'none'),
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  transition: '0.3s'
}));

const ScanOverlay = styled(Box)(({ theme }) => ({
  position: 'absolute',
  top: '50%',
  left: '50%',
  transform: 'translate(-50%, -50%)',
  width: 250,
  height: 250,
  border: '2px solid #00D4FF',
  borderRadius: 24,
  boxShadow: '0 0 0 1000px rgba(0,0,0,0.5)',
  '&::after': {
    content: '""',
    position: 'absolute',
    top: 0,
    left: 0,
    width: '100%',
    height: 2,
    background: '#00D4FF',
    boxShadow: '0 0 15px #00D4FF',
    animation: 'scanline 2s linear infinite',
  }
}));

const Checkin = () => {
  const [active, setActive] = useState(false);
  const [result, setResult] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [manualSaving, setManualSaving] = useState(false);
  const [devices, setDevices] = useState([]);
  const [selectedDevice, setSelectedDevice] = useState(null);
  const [recentLogs, setRecentLogs] = useState([]);
  const [offlineCount, setOfflineCount] = useState(0);
  const [eventModules, setEventModules] = useState([]);
  const [rfidValue, setRfidValue] = useState('');
  const [linkedTerminal, setLinkedTerminal] = useState(localStorage.getItem('linked_facial_terminal') || '');
  const [realtimeStats, setRealtimeStats] = useState(null);
  const rfidInputRef = useRef(null);

  const [searchParams] = useSearchParams();
  const eventoId = searchParams.get('evento_id') || localStorage.getItem('active_evento_id');

  useEffect(() => {
    loadInitialData();
    updateOfflineCount();

    // Add listener to update offline count badge when online 
    window.addEventListener('online', updateOfflineCount);
    window.addEventListener('sync-status-changed', updateOfflineCount);
    // WebSocket setup for real-time monitoring
    const socket = io((import.meta.env.VITE_API_URL || '').replace(/\/api$/, '') || window.location.origin, {
      transports: ['polling', 'websocket'],
      reconnectionAttempts: 5
    });

    socket.on('connect', () => {
      console.log('🔌 Conectado ao WebSocket de Acesso');
      if (eventoId) socket.emit('join_event', eventoId);
    });

    socket.on('new_access', (newLog) => {
      // Se for de outro evento, ignora (redundância do servidor)
      if (eventoId && newLog.evento_id && newLog.evento_id !== eventoId) return;

      console.log('🚀 Novo acesso detectado:', newLog);

      // Atualiza lista de logs recentes
      setRecentLogs(prev => {
        const updated = [newLog, ...prev];
        return updated.slice(0, 5); // Mantém apenas os 5 últimos
      });

      // Se for checkin com sucesso, mostra o feedback visual grande
      if (newLog.tipo === 'checkin' || newLog.tipo === 'negado' || newLog.tipo === 'expulsao') {
        setResult(newLog);
        // Auto-clear após 7 segundos para não travar a tela se for automático
        setTimeout(() => setResult(null), 7000);
      }
    });

    socket.on('face_identified', (identityLog) => {
      if (eventoId && identityLog.evento_id !== eventoId) return;

      console.log('👤 Face Identificada (Modo Automação):', identityLog);

      // Auto-preencher se o terminal atual está vinculado ao terminal que fez a leitura
      const currentLinkedTerminal = localStorage.getItem('linked_facial_terminal');
      if (currentLinkedTerminal && currentLinkedTerminal === identityLog.dispositivo_id) {
        // Preencher campo de busca com o ID direto para evitar a lista ambígua
        setSearchQuery(identityLog.pessoas?.nome || '');

        // Popular resultados diretos
        setSearchResults([{
          id: identityLog.pessoa_id,
          nome: identityLog.pessoas?.nome,
          cpf: identityLog.pessoas?.cpf,
          status: identityLog.pessoas?.status_acesso,
          confianca: identityLog.confianca
        }]);

        // Focar cursor no input de RFID se o módulo estiver ativo
        setTimeout(() => {
          if (rfidInputRef.current) {
            rfidInputRef.current.focus();
          }
        }, 300);
      }
    });

    return () => {
      window.removeEventListener('online', updateOfflineCount);
      window.removeEventListener('sync-status-changed', updateOfflineCount);
      socket.disconnect();
    };
  }, [eventoId]);

  const updateOfflineCount = async () => {
    const count = await localCheckinService.getPendenteCount();
    setOfflineCount(count);
  };

  useEffect(() => {
    let html5QrCode;
    if (active) {
      const startScanner = async () => {
        try {
          html5QrCode = new Html5Qrcode("reader");
          await html5QrCode.start(
            { facingMode: "user" },
            {
              fps: 10,
              qrbox: { width: 250, height: 250 }
            },
            async (decodedText) => {
              // Success
              console.log("QR Code detected:", decodedText);
              await html5QrCode.stop();
              setActive(false);
              await handleQRCodeCheckin(decodedText);
            },
            (errorMessage) => {
              // Ignore standard scanning errors
            }
          );
        } catch (err) {
          console.error("Error starting scanner:", err);
          setActive(false);
        }
      };
      // Small timeout to ensure DOM element is ready
      setTimeout(startScanner, 100);
    }

    return () => {
      if (html5QrCode && html5QrCode.isScanning) {
        html5QrCode.stop().catch(err => console.error("Error stopping scanner", err));
      }
    };
  }, [active]);

  const handleQRCodeCheckin = async (qrCode) => {
    try {
      setLoading(true);
      const res = await localCheckinService.realizarCheckin(
        { qrCode, dispositivoId: 'web-dashboard', evento_id: eventoId },
        'qrcode'
      );

      setResult(res.data || res);
      loadInitialData();
      updateOfflineCount();
    } catch (error) {
      console.error('Erro no checkin QR:', error);
    } finally {
      setLoading(false);
    }
  };


  const loadInitialData = async () => {
    try {
      const [devRes, logRes, eventRes, statsRes] = await Promise.all([
        api.get('/devices', { params: { evento_id: eventoId } }),
        api.get(`/access/logs?limit=5&evento_id=${eventoId}`),
        api.get(`/eventos/${eventoId}`),
        api.get('/access/stats/realtime', { params: { evento_id: eventoId } })
      ]);
      setDevices(devRes.data.data || []);
      setRecentLogs(logRes.data.data || []);
      setEventModules(eventRes.data.data?.event_modules || []);
      setRealtimeStats(statsRes.data.data || null);

      if (devRes.data.data?.length > 0) {
        setSelectedDevice(devRes.data.data[0]);
      }
    } catch (error) {
      console.error('Erro ao carregar dados:', error);
    }
  };

  const handleSearch = async (val) => {
    setSearchQuery(val);
    if (val.length < 3) return;
    try {
      setLoading(true);
      // USAMOS O ENDPOINT DE BUSCA PURA (PessoaController.search)
      // Isso evita tentar fazer check-in automático enquanto o operador digita
      const res = await api.get('/pessoas/search', { params: { q: val } });

      if (res.data.success) {
        setSearchResults(res.data.data);
      }
    } catch (error) {
      console.error('Erro na busca manual:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleManualCheckin = async (pessoaId) => {
    try {
      setManualSaving(true);
      const payload = {
        busca: pessoaId,
        dispositivoId: 'web-dashboard',
        evento_id: eventoId
      };

      // Se o módulo RFID estiver ativo e houver valor, envia
      const rfidModule = eventModules.find(m => m.module_key === 'checkin_rfid' && m.is_enabled);
      if (rfidModule && rfidValue) {
        payload.rfid = rfidValue;

        // Se temos um valor RFID e foi inserido via automação (campo único), o serviço central 
        // espera o payload correto para pulseira
        if (rfidValue.length >= 4) {
          // Opcional: Se a lógica no localCheckinService já der suporte a RFID misto no 'manual'.
          // Se não, poderíamos chamar localCheckinService.realizarCheckin(..., 'rfid') direto caso 
          // seja estritamente RFID. Por hora, enviamos 'manual' com a tag anexada.
        }
      }

      const res = await localCheckinService.realizarCheckin(payload, 'manual');

      // Auto-imprimir etiqueta se o módulo estiver ativo e a resposta for sucesso
      if ((res.data?.success || res?.success) && eventModules.find(m => m.module_key === 'checkin_etiqueta' && m.is_enabled)) {
        console.log("🖨️ Disparando impressão de etiqueta para:", pessoaId);
        // Chama endpoint de fila de impressão se existir
        api.post(`/devices/print-label`, { pessoa_id: pessoaId, evento_id: eventoId })
          .catch(err => console.error("Falha ao enviar comando de impressão:", err));
      }

      setResult(res.data || res);
      setSearchResults([]);
      setSearchQuery('');
      setRfidValue('');
      loadInitialData();
      updateOfflineCount();
    } catch (error) {
      console.error('Erro no checkin:', error);
    } finally {
      setManualSaving(false);
    }
  };

  const handleLinkTerminalChange = (e) => {
    const val = e.target.value;
    setLinkedTerminal(val);
    if (val) {
      localStorage.setItem('linked_facial_terminal', val);
    } else {
      localStorage.removeItem('linked_facial_terminal');
    }
  };

  return (
    <Box sx={{ p: 4 }}>
      <PageHeader
        title="Controle de Acesso - NEXUS"
        subtitle="Gerenciamento de entrada e saída em tempo real"
        icon={<ScannerIcon sx={{ fontSize: 40, color: '#00D4FF' }} />}
      />

      <Box sx={{ mb: 3 }}>
        <GlassCard sx={{ p: 2, display: 'flex', alignItems: 'center', gap: 2, border: linkedTerminal ? '1px solid #00FF88' : '1px solid rgba(0, 212, 255, 0.2)' }}>
          <CameraIcon sx={{ color: linkedTerminal ? '#00FF88' : '#00D4FF' }} />
          <FormControl fullWidth size="small">
            <InputLabel sx={{ color: 'text.secondary' }}>Vincular Leitor Facial (Modo Recepcionistta / Pulseira)</InputLabel>
            <Select
              value={linkedTerminal}
              onChange={(e) => {
                const val = e.target.value;
                setLinkedTerminal(val);
                if (val) {
                  localStorage.setItem('linked_facial_terminal', val);
                } else {
                  localStorage.removeItem('linked_facial_terminal');
                }
              }}
              label="Vincular Leitor Facial (Modo Recepcionistta / Pulseira)"
              sx={{ color: '#fff', '.MuiOutlinedInput-notchedOutline': { borderColor: 'rgba(255, 255, 255, 0.1)' } }}
            >
              <MenuItem value="">Nenhum (Ignorar Envios Autônomos)</MenuItem>
              {devices.map(d => (
                <MenuItem key={d.id} value={d.id}>{d.nome} {d.config?.modo_identificacao ? '(Modo Identidade)' : ''}</MenuItem>
              ))}
            </Select>
          </FormControl>
        </GlassCard>
      </Box>

      <Grid container spacing={3}>
        <Grid item xs={12} lg={8}>
          <GlassCard sx={{ p: 0, overflow: 'hidden' }}>
            <Box sx={{ p: 3, borderBottom: '1px solid rgba(255,255,255,0.05)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <Typography variant="h6" sx={{ color: '#00D4FF', fontWeight: 800 }}>
                LIVE FEED / MANUAL
                {offlineCount > 0 && <span style={{ marginLeft: 10, fontSize: '0.8rem', color: '#ffb74d' }}>({offlineCount} OFFLINE)</span>}
                {!navigator.onLine && <span style={{ marginLeft: 10, fontSize: '0.8rem', color: '#ef5350' }}>[DESCONECTADO]</span>}
              </Typography>
              <Box sx={{ display: 'flex', gap: 2, alignItems: 'center' }}>
                <FormControl size="small" sx={{ minWidth: 200 }}>
                  <InputLabel id="link-terminal-label" sx={{ color: '#fff' }}>Vincular Terminal Facial</InputLabel>
                  <Select
                    labelId="link-terminal-label"
                    value={linkedTerminal}
                    label="Vincular Terminal Facial"
                    onChange={handleLinkTerminalChange}
                    sx={{ color: '#fff', '.MuiOutlinedInput-notchedOutline': { borderColor: 'rgba(255,255,255,0.2)' } }}
                  >
                    <MenuItem value=""><em>Nenhum (Standalone)</em></MenuItem>
                    {devices.filter(d => d.tipo === 'terminal_facial').map(d => (
                      <MenuItem key={d.id} value={d.id}>{d.nome}</MenuItem>
                    ))}
                  </Select>
                </FormControl>
                <Chip label="TERMINAL WEB" variant="outlined" sx={{ color: '#00D4FF', borderColor: 'rgba(0, 212, 255, 0.3)', fontWeight: 800 }} />
              </Box>
            </Box>

            <Box sx={{ p: 3 }}>
              <CameraFeed active={active} result={result}>
                {!active && !result && (
                  <Stack alignItems="center" spacing={3} sx={{ width: '80%' }}>
                    <ScannerIcon sx={{ fontSize: 80, opacity: 0.2, color: '#00D4FF' }} />
                    <Typography sx={{ opacity: 0.5, letterSpacing: 2, fontWeight: 700 }}>AGUARDANDO ATIVAÇÃO DE SENSORES</Typography>

                    <Stack spacing={2} sx={{ width: '100%' }}>
                      <Box sx={{ width: '100%', position: 'relative' }}>
                        <TextField
                          fullWidth
                          placeholder="Pesquisar por Nome ou CPF..."
                          value={searchQuery}
                          onChange={(e) => handleSearch(e.target.value)}
                          InputProps={{
                            startAdornment: <SearchIcon sx={{ color: 'text.secondary', mr: 1 }} />,
                            sx: { height: 56, borderRadius: 4, fontSize: '1.1rem' }
                          }}
                        />
                        {loading && <CircularProgress size={20} sx={{ position: 'absolute', right: 10, top: 18 }} />}

                        {searchResults.length > 0 && (
                          <GlassCard sx={{ position: 'absolute', top: '110%', left: 0, right: 0, zIndex: 10, p: 0, maxHeight: 200, overflow: 'auto' }}>
                            <List>
                              {searchResults.map((f) => (
                                <ListItem
                                  key={f.id}
                                  button
                                  onClick={() => handleManualCheckin(f.id)}
                                  sx={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}
                                >
                                  <ListItemAvatar><Avatar>{f.nome[0]}</Avatar></ListItemAvatar>
                                  <ListItemText
                                    primary={f.nome}
                                    secondary={f.cpf}
                                    primaryTypographyProps={{ fontWeight: 700 }}
                                  />
                                  <Chip label={f.status_acesso || f.status || 'pendente'} size="small" />
                                </ListItem>
                              ))}
                            </List>
                          </GlassCard>
                        )}
                      </Box>

                      {eventModules.find(m => m.module_key === 'checkin_rfid' && m.is_enabled) && (
                        <TextField
                          fullWidth
                          inputRef={rfidInputRef}
                          placeholder="Número da Pulseira / RFID..."
                          value={rfidValue}
                          onChange={(e) => setRfidValue(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' && rfidValue && searchResults.length === 1) {
                              handleManualCheckin(searchResults[0].id);
                            }
                          }}
                          InputProps={{
                            sx: { height: 50, borderRadius: 3, background: 'rgba(0,0,0,0.2)' }
                          }}
                        />
                      )}
                    </Stack>

                    <Typography variant="caption" sx={{ color: 'text.secondary' }}>OU</Typography>
                    <NeonButton
                      onClick={() => setActive(true)}
                      disabled={manualSaving}
                      sx={{ minHeight: 56, borderRadius: 4, width: '100%', fontSize: '1.1rem' }}
                    >
                      INICIAR SCANNER ÓPTICO
                    </NeonButton>
                  </Stack>
                )}

                {active && (
                  <>
                    <div id="reader" style={{ width: '100%', height: '100%' }}></div>
                    <Box sx={{ position: 'absolute', bottom: 40, width: '100%', display: 'flex', justifyContent: 'center', zIndex: 10 }}>
                      <NeonButton variant="outlined" color="error" onClick={() => setActive(false)} sx={{ minHeight: 56, width: '80%', borderRadius: 4 }}>ENCERRAR SCANNER</NeonButton>
                    </Box>
                  </>
                )}

                {result && (
                  <Stack alignItems="center" spacing={2} sx={{ animation: 'counterUp 0.4s ease-out', width: '90%' }}>
                    {result.tipo === 'checkin' ? (
                      <>
                        <SuccessIcon sx={{ fontSize: 100, color: '#00FF88', filter: 'drop-shadow(0 0 10px rgba(0,255,136,0.3))' }} />
                        <Typography variant="h3" sx={{ fontWeight: 900, fontFamily: '"Orbitron", sans-serif', color: '#fff', textAlign: 'center' }}>ACESSO LIBERADO</Typography>
                      </>
                    ) : (
                      <>
                        <ErrorIcon sx={{ fontSize: 100, color: '#FF3366', filter: 'drop-shadow(0 0 10px rgba(255,51,102,0.3))' }} />
                        <Typography variant="h3" sx={{ fontWeight: 900, fontFamily: '"Orbitron", sans-serif', color: '#fff', textAlign: 'center' }}>ACESSO NEGADO</Typography>
                      </>
                    )}

                    <Box sx={{
                      p: 2.5,
                      background: result.tipo === 'checkin' ? 'rgba(0,255,136,0.1)' : 'rgba(255,51,102,0.1)',
                      borderRadius: 4,
                      textAlign: 'center',
                      border: result.tipo === 'checkin' ? '1px solid rgba(0,255,136,0.2)' : '1px solid rgba(255,51,102,0.2)',
                      width: '100%'
                    }}>
                      <Typography variant="h5" sx={{ color: result.tipo === 'checkin' ? '#00FF88' : '#FF3366', fontWeight: 800 }}>
                        {result.pessoas?.nome || result.pessoa?.nome || result.data?.pessoa?.nome || 'USUÁRIO DESCONHECIDO'}
                      </Typography>
                      <Typography variant="body1" sx={{ color: 'text.secondary', mt: 0.5 }}>
                        {result.observacao || result.pessoas?.empresas?.nome || result.pessoa?.empresas?.nome || 'Verifique as credenciais'}
                      </Typography>
                    </Box>
                    <Stack direction="row" spacing={2} sx={{ mt: 2 }}>
                      <NeonButton variant="outlined" onClick={() => setResult(null)} sx={{ minHeight: 56 }}>LIMPAR TELA</NeonButton>
                      <NeonButton onClick={() => setResult(null)} sx={{ minHeight: 56 }}>OK</NeonButton>
                    </Stack>
                  </Stack>
                )}
              </CameraFeed>
            </Box>

          </GlassCard>
        </Grid>

        <Grid item xs={12} lg={4}>
          <Stack spacing={3}>
            <GlassCard sx={{ p: 3 }} glowColor="#00FF88">
              <Typography variant="subtitle2" sx={{ color: '#00FF88', fontWeight: 900, mb: 2, letterSpacing: 2 }}>MÉTRICAS DA OPERAÇÃO</Typography>

              {realtimeStats && (
                <Stack spacing={1.5} sx={{ mb: 3, p: 2, bgcolor: 'rgba(0,0,0,0.2)', borderRadius: 2, border: '1px solid rgba(0, 255, 136, 0.1)' }}>
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <Typography variant="body2" sx={{ color: 'text.secondary', fontWeight: 700 }}>Pessoas Presentes:</Typography>
                    <Typography variant="body1" sx={{ color: '#fff', fontWeight: 800 }}>
                      {realtimeStats.presentes} {realtimeStats.capacidade > 0 ? `/ ${realtimeStats.capacidade}` : ''}
                    </Typography>
                  </Box>
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <Typography variant="body2" sx={{ color: 'text.secondary', fontWeight: 700 }}>Empresas Logadas:</Typography>
                    <Typography variant="body1" sx={{ color: '#fff', fontWeight: 800 }}>
                      {realtimeStats.empresas?.length || 0}
                    </Typography>
                  </Box>
                </Stack>
              )}

              <Typography variant="caption" sx={{ color: 'text.secondary', mb: 1, display: 'block', fontWeight: 700 }}>MÓDULOS PERMITIDOS:</Typography>
              <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
                {eventModules.filter(m => m.is_enabled).map(mod => (
                  <Chip
                    key={mod.module_key}
                    label={mod.module_key.replace('checkin_', '').toUpperCase()}
                    size="small"
                    sx={{ background: 'rgba(0, 212, 255, 0.1)', color: '#00D4FF', border: '1px solid rgba(0, 212, 255, 0.2)', fontWeight: 700 }}
                  />
                ))}
                {eventModules.filter(m => m.is_enabled).length === 0 && (
                  <Typography variant="caption" sx={{ color: 'text.secondary', fontStyle: 'italic' }}>Nenhum módulo configurado</Typography>
                )}
              </Stack>
            </GlassCard>

            <GlassCard sx={{ p: 3 }}>
              <Stack direction="row" justifyContent="space-between" alignItems="center" mb={2}>
                <Typography variant="subtitle2" sx={{ color: 'text.secondary', fontWeight: 700, letterSpacing: 1 }}>FLUXO RECENTE</Typography>
                <HistoryIcon sx={{ color: 'text.secondary', fontSize: 18 }} />
              </Stack>
              <Stack spacing={2}>
                {recentLogs.map((log, i) => (
                  <Box key={log.id} sx={{
                    display: 'flex',
                    gap: 2,
                    p: 1.5,
                    background: 'rgba(255,255,255,0.02)',
                    borderRadius: 3,
                    border: '1px solid rgba(255,255,255,0.05)',
                    transition: '0.2s',
                    '&:hover': { background: 'rgba(0, 212, 255, 0.05)', borderColor: 'rgba(0, 212, 255, 0.2)' }
                  }}>
                    <Avatar sx={{
                      width: 36,
                      height: 36,
                      fontSize: '0.8rem',
                      bgcolor: log.tipo === 'checkin' ? 'rgba(0,255,136,0.1)' : 'rgba(255,51,102,0.1)',
                      color: log.tipo === 'checkin' ? '#00FF88' : '#FF3366',
                      fontWeight: 800
                    }}>
                      {log.pessoas?.nome?.charAt(0) || 'U'}
                    </Avatar>
                    <Box sx={{ flex: 1 }}>
                      <Typography variant="caption" sx={{ fontWeight: 800, color: '#fff' }}>{log.pessoas?.nome || 'NEXUS OPERADOR'}</Typography>
                      <Typography variant="caption" sx={{ color: 'text.secondary', display: 'flex', alignItems: 'center', gap: 0.5 }}>
                        {new Date(log.created_at).toLocaleTimeString()} • {log.tipo.toUpperCase()} • {log.dispositivos_acesso?.nome || 'Web Dashboard'}
                      </Typography>
                    </Box>
                  </Box>
                ))}
                {recentLogs.length === 0 && (
                  <Typography variant="caption" sx={{ color: 'text.secondary', textAlign: 'center', py: 2 }}>NENHUMA ATIVIDADE REGISTRADA</Typography>
                )}
              </Stack>
            </GlassCard>
          </Stack>
        </Grid>
      </Grid>
    </Box>
  );
};

export default Checkin;
