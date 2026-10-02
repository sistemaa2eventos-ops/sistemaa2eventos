import React, { useEffect, useState } from 'react';
import { Html5Qrcode } from "html5-qrcode";
import {
  Box, Typography, Grid, Stack, IconButton, TextField,
  Avatar, CircularProgress, List, ListItemText,
  ListItemButton, Chip, Fade, Zoom, Dialog, DialogTitle,
  DialogContent, DialogActions, Select, MenuItem, FormControl, InputLabel
} from '@mui/material';
import AreaSelector from '../components/common/AreaSelector';
import AuthorizedAreasChips from '../components/common/AuthorizedAreasChips';
import {
  QrCodeScanner as ScannerIcon, 
  CheckCircle as SuccessIcon, Cancel as ErrorIcon, Search as SearchIcon,
  Login as LoginIcon, Logout as LogoutIcon,
  AutoMode as AutoIcon, Fullscreen as KioskIcon,
  FullscreenExit as ExitKioskIcon, Close as CloseIcon,
  Timer as TimeIcon, Badge as BadgeIcon, CorporateFare as CompanyIcon,
  EventAvailable as EventIcon
} from '@mui/icons-material';
import { styled } from '@mui/material/styles';

import PageHeader from '../components/common/PageHeader';
import GlassCard from '../components/common/GlassCard';
import NeonButton from '../components/common/NeonButton';
import EstacaoFacialSelector from '../components/common/EstacaoFacialSelector';
import ModalCredenciamento from '../components/credenciamento/ModalCredenciamento';
import { useCheckin } from '../hooks/useCheckin';

const ActionButton = styled(NeonButton)(({ theme }) => ({
    height: 80,
    fontSize: '1.1rem',
    fontWeight: 800,
    borderRadius: 20
}));

const CameraOverlay = styled(Box)({
    position: 'absolute', top: 0, left: 0, width: '100%', height: '100%',
    background: 'rgba(0,0,0,0.9)', zIndex: 100, display: 'flex', 
    flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
    borderRadius: 24, overflow: 'hidden'
});

const FeedbackOverlay = styled(Box, { shouldForwardProp: (p) => p !== 'status' })(({ status }) => ({
    position: 'absolute', top: 0, left: 0, width: '100%', height: '100%',
    background: status === 'sucesso' ? 'rgba(0,255,136,0.15)' : 'rgba(255,51,102,0.15)',
    zIndex: 90, display: 'flex', flexDirection: 'column', alignItems: 'center', 
    justifyContent: 'center', borderRadius: 24, border: status === 'sucesso' ? '4px solid #00FF88' : '4px solid #FF3366',
    backdropFilter: 'blur(8px)', animation: 'fadeIn 0.3s cubic-bezier(0.4, 0, 0.2, 1)'
}));

const Checkin = () => {
  const {
    selectedPessoa, setSelectedPessoa, activeScanner, setActiveScanner,
    checkinResult, resultMessage, loading, manualSaving,
    operationMode, changeOperationMode, modoQuiosque, toggleQuiosque,
    searchQuery, handleSearch, searchResults,
    rfidInputRef, recentLogs, realtimeStats, offlineCount,
    areaId, changeAreaId, eventAreas, pulseiraTypes,
    consultarPulseiraAPI,
    performCheckin,
    handleLinkPulseiraAndCheckin,
    // Vínculo Facial (Fase 1)
    sessaoAtiva,
    dispositivosDisponiveis,
    loadingSessao,
    vincularLeitor,
    desvincularLeitor,
    carregarDispositivosDisponiveis
  } = useCheckin();

  const [pulseiraValue, setPulseiraValue] = useState('');
  const [showPulseiraInput, setShowPulseiraInput] = useState(false);

  // Confirmação de credenciamento do modal (Fase 2)
  const handleConfirmarCredenciamento = ({ pessoa_id, numero_pulseira, tipo_pulseira_id }) => {
    if (manualSaving || loading || !pessoa_id) return;
    if (tipo_pulseira_id && numero_pulseira) {
      handleLinkPulseiraAndCheckin(pessoa_id, tipo_pulseira_id, numero_pulseira);
    } else if (numero_pulseira) {
      performCheckin('pulseira', numero_pulseira, pessoa_id);
    } else {
      performCheckin('manual', null, pessoa_id);
    }
  };

  // QR Scanner Lifecycle
  useEffect(() => {
    let html5QrCode;
    if (activeScanner) {
      const startScanner = async () => {
        try {
          html5QrCode = new Html5Qrcode("reader-quiosque");
          await html5QrCode.start(
            { facingMode: "user" },
            { fps: 10, qrbox: { width: 250, height: 250 } },
            async (decodedText) => {
              await html5QrCode.stop();
              setActiveScanner(false);
              performCheckin('qrcode', decodedText);
            },
            () => {}
          );
        } catch (err) {
          console.error("Scanner fail:", err);
          setActiveScanner(false);
        }
      };
      setTimeout(startScanner, 100);
    }
    return () => { if (html5QrCode?.isScanning) html5QrCode.stop(); };
  }, [activeScanner, performCheckin, setActiveScanner]);

  // Auto-focus Pulseira
  useEffect(() => {
    if (showPulseiraInput && rfidInputRef.current) {
        rfidInputRef.current.focus();
    }
  }, [showPulseiraInput, rfidInputRef]);

  const handlePulseiraKeyDown = (e) => {
    if (e.key === 'Enter') {
        performCheckin('pulseira', pulseiraValue);
        setPulseiraValue('');
        setShowPulseiraInput(false);
    }
  };

  const hojeLiteral = new Date().toISOString().split('T')[0];

  return (
    <Box sx={{ 
        p: modoQuiosque ? 2 : 4, 
        minHeight: modoQuiosque ? '100vh' : 'auto',
        display: 'flex', flexDirection: 'column'
    }}>
      
      {/* HEADER SECTION */}
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 4 }}>
        <PageHeader
            title={modoQuiosque ? "" : "Check-in NZT"}
            subtitle={modoQuiosque ? "" : "Operação de Identificação e Controle"}
            icon={modoQuiosque ? null : <ScannerIcon sx={{ fontSize: 40, color: '#00D4FF' }} />}
            sx={{ m: 0, p: 0 }}
        />
        
        {modoQuiosque && (
            <Box sx={{ position: 'absolute', top: 20, left: '50%', transform: 'translateX(-50%)', opacity: 0.8 }}>
                <Typography variant="h4" fontWeight={900} color="#00D4FF" letterSpacing={4}>
                    NZT <BadgeIcon /> ACCESS
                </Typography>
            </Box>
        )}

        <NeonButton 
            onClick={toggleQuiosque} 
            color={modoQuiosque ? "error" : "primary"}
            sx={{ px: 3, py: 1.5, borderRadius: 3 }}
        >
            {modoQuiosque ? <ExitKioskIcon sx={{ mr: 1 }} /> : <KioskIcon sx={{ mr: 1 }} />}
            {modoQuiosque ? "SAIR DO QUIOSQUE" : "MODO QUIOSQUE"}
        </NeonButton>
      </Box>

      {/* 📡 Seletor e Status da Estação / Leitor Facial (Fase 1) */}
      {!modoQuiosque && (
          <EstacaoFacialSelector
              sessaoAtiva={sessaoAtiva}
              dispositivos={dispositivosDisponiveis}
              loading={loadingSessao}
              onVincular={vincularLeitor}
              onDesvincular={desvincularLeitor}
              onRecarregar={carregarDispositivosDisponiveis}
          />
      )}

      <AreaSelector areas={eventAreas} value={areaId} onChange={changeAreaId} accentColor="#00D4FF" />

      {/* MAIN CONTENT AREA */}
      <Grid container spacing={3} justifyContent={modoQuiosque ? 'center' : 'flex-start'}>
        
        {/* BUSCA (Esquerda no Normal, Superior no Quiosque) */}
        <Grid item xs={12} md={modoQuiosque ? 10 : 4} lg={modoQuiosque ? 8 : 4}>
            <GlassCard sx={{ p: 3, height: modoQuiosque ? 'auto' : 'calc(100vh - 200px)', display: 'flex', flexDirection: 'column' }}>
                <Typography variant="subtitle2" fontWeight={800} color="#00D4FF" mb={2}>ATENDIMENTO</Typography>
                <TextField
                    fullWidth
                    autoFocus={!modoQuiosque}
                    placeholder="BUSCAR NOME OU CPF..."
                    value={searchQuery}
                    onChange={(e) => handleSearch(e.target.value)}
                    InputProps={{ 
                        startAdornment: <SearchIcon sx={{ color: 'text.secondary', mr: 1 }} />,
                        sx: { borderRadius: 4, height: 60, fontSize: '1.2rem', bgcolor: 'rgba(255,255,255,0.03)' }
                    }}
                />

                <Box sx={{ mt: 2, flex: 1, overflow: 'auto' }}>
                    {searchResults.length > 0 ? (
                        <List>
                            {searchResults.map(p => (
                                <ListItemButton
                                    key={p.id}
                                    onClick={() => setSelectedPessoa(p)}
                                    sx={{ borderRadius: 3, mb: 1, border: '1px solid rgba(255,255,255,0.05)' }}
                                >
                                    <Avatar src={p.foto_url} sx={{ width: 45, height: 45, mr: 2, bgcolor: '#00D4FF' }}>{p.nome[0]}</Avatar>
                                    <ListItemText 
                                        primary={p.nome} 
                                        secondary={p.cpf || 'Sem CPF'}
                                        primaryTypographyProps={{ fontWeight: 700 }}
                                    />
                                </ListItemButton>
                            ))}
                        </List>
                    ) : (
                        searchQuery.length >= 3 && !loading && (
                            <Typography variant="caption" sx={{ display: 'block', textAlign: 'center', opacity: 0.5, mt: 4 }}>
                                Nenhum resultado encontrado.
                            </Typography>
                        )
                    )}
                </Box>

                {!modoQuiosque && (
                    <Box sx={{ pt: 2, borderTop: '1px solid rgba(255,255,255,0.05)' }}>
                        <Typography variant="caption" color="text.secondary">ÚLTIMOS LOGS</Typography>
                        <Stack spacing={1} mt={1}>
                            {recentLogs.slice(0, 3).map(log => (
                                <Typography key={log.id} variant="caption" noWrap sx={{ opacity: 0.6 }}>
                                    {log.pessoa_nome || log.pessoas?.nome_completo || log.pessoas?.nome || 'Pessoa'}: {log.tipo?.toUpperCase() || log.tipo_acesso?.toUpperCase()}
                                </Typography>
                            ))}
                        </Stack>
                    </Box>
                )}
            </GlassCard>
        </Grid>

        {/* CARD E AÇÕES (Direita no Normal, Inferior no Quiosque) */}
        <Grid item xs={12} md={modoQuiosque ? 10 : 8} lg={modoQuiosque ? 8 : 8}>
            <Box sx={{ position: 'relative', height: '100%', minHeight: 600 }}>
                {!selectedPessoa && (
                    <GlassCard sx={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <Stack alignItems="center" spacing={2} sx={{ opacity: 0.1 }}>
                            <BadgeIcon sx={{ fontSize: 180 }} />
                            <Typography variant="h5" fontWeight={700}>BUSQUE UM PARTICIPANTE PARA INICIAR</Typography>
                        </Stack>
                    </GlassCard>
                )}
                {/* FEEDBACK OVERLAY GLOBAL */}
                {checkinResult && (
                    <FeedbackOverlay status={checkinResult}>
                        <Zoom in={!!checkinResult}>
                            <Box sx={{ textAlign: 'center' }}>
                                {checkinResult === 'sucesso' ? <SuccessIcon sx={{ fontSize: 130, color: '#00FF88' }} /> : <ErrorIcon sx={{ fontSize: 130, color: '#FF3366' }} />}
                                <Typography variant="h3" fontWeight={900} mt={2}>
                                    {checkinResult === 'sucesso' ? 'LIBERADO' : 'NEGADO'}
                                </Typography>
                                <Typography variant="h6" sx={{ opacity: 0.8 }}>{resultMessage}</Typography>
                                {checkinResult === 'sucesso' && (
                                    <Typography variant="h5" sx={{ mt: 2, opacity: 0.5 }}>
                                        {new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                                    </Typography>
                                )}
                            </Box>
                        </Zoom>
                    </FeedbackOverlay>
                )}

                {/* MODAL DE CREDENCIAMENTO E ACESSO RÁPIDO (Fase 2) */}
                <ModalCredenciamento
                    open={!!selectedPessoa}
                    pessoa={selectedPessoa}
                    onClose={() => setSelectedPessoa(null)}
                    onConfirmar={handleConfirmarCredenciamento}
                    pulseiraTypes={pulseiraTypes}
                    eventAreas={eventAreas}
                    loading={manualSaving || loading}
                    onOpenQrScanner={() => setActiveScanner(true)}
                />

            </Box>
        </Grid>
      </Grid>

      {/* STATS SECTION (Hidden on Kiosk) */}
      {!modoQuiosque && (
        <Box sx={{ mt: 4 }}>
            <Grid container spacing={3}>
                <Grid item xs={6} md={3}>
                    <GlassCard sx={{ p: 2, display: 'flex', alignItems: 'center', gap: 2 }}>
                        <AutoIcon color="primary" />
                        <Box>
                            <Typography variant="caption" color="text.secondary">PRESENTES</Typography>
                            <Typography variant="h5" fontWeight={900}>{realtimeStats?.presentes || 0}</Typography>
                        </Box>
                    </GlassCard>
                </Grid>
                <Grid item xs={6} md={3}>
                    <GlassCard sx={{ p: 2, display: 'flex', alignItems: 'center', gap: 2 }}>
                         <EventIcon color="secondary" />
                        <Box>
                            <Typography variant="caption" color="text.secondary">OFFLINE PENDENTES</Typography>
                            <Typography variant="h5" fontWeight={900} color={offlineCount > 0 ? "warning.main" : "inherit"}>{offlineCount}</Typography>
                        </Box>
                    </GlassCard>
                </Grid>
            </Grid>
        </Box>
      )}
    </Box>
  );
};

export default Checkin;
