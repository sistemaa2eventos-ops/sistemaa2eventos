import React, { useEffect, useState, useCallback } from 'react';
import { Html5Qrcode } from "html5-qrcode";
import {
  Box, Typography, Grid, Stack, TextField,
  Avatar, CircularProgress, List, ListItemText,
  ListItemButton, Chip, Fade, Zoom
} from '@mui/material';
import AreaSelector from '../components/common/AreaSelector';
import AuthorizedAreasChips from '../components/common/AuthorizedAreasChips';
import {
  QrCodeScanner as ScannerIcon, 
  CheckCircle as SuccessIcon, Cancel as ErrorIcon, Search as SearchIcon,
  Logout as LogoutIcon, ExitToApp as CheckoutIcon,
  Fullscreen as KioskIcon, FullscreenExit as ExitKioskIcon,
  Timer as TimeIcon, Badge as BadgeIcon, CorporateFare as CompanyIcon,
  History as HistoryIcon, Warning as WarningIcon
} from '@mui/icons-material';
import { styled } from '@mui/material/styles';

import PageHeader from '../components/common/PageHeader';
import GlassCard from '../components/common/GlassCard';
import NeonButton from '../components/common/NeonButton';
import { useCheckin } from '../hooks/useCheckin';
import api from '../services/api';

const ActionButton = styled(NeonButton)(({ theme }) => ({
    height: 80,
    fontSize: '1.1rem',
    fontWeight: 800,
    borderRadius: 20,
    borderColor: '#FF3366',
    color: '#FF3366',
    '&:hover': {
        boxShadow: '0 0 20px rgba(255, 51, 102, 0.3)',
        borderColor: '#FF0044',
        color: '#FF0044'
    }
}));

const CameraOverlay = styled(Box)({
    position: 'absolute', top: 0, left: 0, width: '100%', height: '100%',
    background: 'rgba(0,0,0,0.9)', zIndex: 100, display: 'flex', 
    flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
    borderRadius: 24, overflow: 'hidden'
});

const FeedbackOverlay = styled(Box, { shouldForwardProp: (p) => p !== 'status' })(({ status }) => ({
    position: 'absolute', top: 0, left: 0, width: '100%', height: '100%',
    background: status === 'sucesso' ? 'rgba(255,51,102,0.15)' : 'rgba(255,165,0,0.15)',
    zIndex: 90, display: 'flex', flexDirection: 'column', alignItems: 'center', 
    justifyContent: 'center', borderRadius: 24, border: status === 'sucesso' ? '4px solid #FF3366' : '4px solid #FFA500',
    backdropFilter: 'blur(8px)', animation: 'fadeIn 0.3s cubic-bezier(0.4, 0, 0.2, 1)'
}));

const Checkout = () => {
  const {
    selectedPessoa, setSelectedPessoa, activeScanner, setActiveScanner,
    checkinResult, resultMessage, loading, manualSaving,
    operationMode, changeOperationMode, modoQuiosque, toggleQuiosque,
    searchQuery, handleSearch, searchResults,
    rfidInputRef, recentLogs,
    areaId, changeAreaId, eventAreas,
    performCheckin, eventoId
  } = useCheckin('checkout');

  const [pulseiraValue, setPulseiraValue] = useState('');
  const [showPulseiraInput, setShowPulseiraInput] = useState(false);
  const [permanencia, setPermanencia] = useState(null);
  const [entradaAtiva, setEntradaAtiva] = useState(null);

  const SCANNER_ID = `checkout-scanner-nzt`;

  // Busca o último check-in da pessoa para calcular tempo de permanência
  const fetchUltimoCheckin = useCallback(async (pessoaId) => {
    if (!pessoaId || !eventoId) return;
    try {
        const response = await api.get('/access/logs', {
            params: { evento_id: eventoId, pessoa_id: pessoaId, tipo: 'checkin', limit: 1 }
        });
        const logs = response.data?.data || [];
        setEntradaAtiva(logs.length > 0 ? logs[0].created_at : null);
    } catch {
        setEntradaAtiva(null);
    }
  }, [eventoId]);

  useEffect(() => {
    if (selectedPessoa?.id) {
        fetchUltimoCheckin(selectedPessoa.id);
    } else {
        setEntradaAtiva(null);
        setPermanencia(null);
    }
  }, [selectedPessoa, fetchUltimoCheckin]);

  // Contador de permanência
  useEffect(() => {
    if (!entradaAtiva) {
        setPermanencia(null);
        return;
    }

    const atualizar = () => {
        const diff = Date.now() - new Date(entradaAtiva).getTime();
        const horas = Math.floor(diff / 3600000);
        const minutos = Math.floor((diff % 3600000) / 60000);
        setPermanencia(`${horas}h ${minutos}m`);
    };

    atualizar();
    const interval = setInterval(atualizar, 60000);
    return () => clearInterval(interval);
  }, [entradaAtiva]);

  // QR Scanner Lifecycle
  useEffect(() => {
    let html5QrCode;
    if (activeScanner) {
      const startScanner = async () => {
        try {
          html5QrCode = new Html5Qrcode(SCANNER_ID);
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

  const checkoutLogs = recentLogs.filter(l => l.tipo === 'checkout');

  return (
    <Box sx={{ 
        p: modoQuiosque ? 2 : 4, 
        minHeight: modoQuiosque ? '100vh' : 'auto',
        display: 'flex', flexDirection: 'column'
    }}>
      
      {/* HEADER SECTION */}
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 4 }}>
        <PageHeader
            title={modoQuiosque ? "" : "Checkout NZT"}
            subtitle={modoQuiosque ? "" : "Operação de Baixa e Saída"}
            icon={modoQuiosque ? null : <LogoutIcon sx={{ fontSize: 40, color: '#FF3366' }} />}
            sx={{ m: 0, p: 0 }}
        />
        
        {modoQuiosque && (
            <Box sx={{ position: 'absolute', top: 20, left: '50%', transform: 'translateX(-50%)', opacity: 0.8 }}>
                <Typography variant="h4" fontWeight={900} color="#FF3366" letterSpacing={4}>
                    NZT <BadgeIcon /> ACCESS
                </Typography>
            </Box>
        )}

        <NeonButton 
            onClick={toggleQuiosque} 
            color={modoQuiosque ? "error" : "primary"}
            sx={{ 
                px: 3, py: 1.5, borderRadius: 3,
                borderColor: modoQuiosque ? '#FF3366' : 'primary.main',
                color: modoQuiosque ? '#FF3366' : 'primary.main',
            }}
        >
            {modoQuiosque ? <ExitKioskIcon sx={{ mr: 1 }} /> : <KioskIcon sx={{ mr: 1 }} />}
            {modoQuiosque ? "SAIR DO QUIOSQUE" : "MODO QUIOSQUE"}
        </NeonButton>
      </Box>

      <AreaSelector areas={eventAreas} value={areaId} onChange={changeAreaId} accentColor="#FF3366" />
      <Grid container spacing={3} justifyContent={modoQuiosque ? 'center' : 'flex-start'}>
        
        {/* BUSCA (Esquerda no Normal, Superior no Quiosque) */}
        <Grid item xs={12} md={modoQuiosque ? 10 : 4} lg={modoQuiosque ? 8 : 4}>
            <GlassCard sx={{ p: 3, height: modoQuiosque ? 'auto' : 'calc(100vh - 200px)', display: 'flex', flexDirection: 'column' }}>
                <Typography variant="subtitle2" fontWeight={800} color="#FF3366" mb={2}>PORTARIA / SAÍDA</Typography>
                <TextField
                    fullWidth
                    autoFocus={!modoQuiosque}
                    placeholder="BUSCAR NOME OU CPF PARA SAÍDA..."
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
                                    <Avatar src={p.foto_url} sx={{ width: 45, height: 45, mr: 2, bgcolor: '#FF3366' }}>{p.nome[0]}</Avatar>
                                    <ListItemText 
                                        primary={p.nome} 
                                        secondary={p.cpf || 'Sem CPF'}
                                        primaryTypographyProps={{ fontWeight: 700 }}
                                    />
                                    <Chip label={p.status_acesso === 'checkin_feito' ? 'DENTRO' : 'FORA'} size="small" variant="outlined" sx={{ opacity: 0.6 }} />
                                </ListItemButton>
                            ))}
                        </List>
                    ) : (
                        searchQuery.length >= 3 && !loading && (
                            <Typography variant="caption" sx={{ display: 'block', textAlign: 'center', opacity: 0.5, mt: 4 }}>
                                Nenhum participante encontrado.
                            </Typography>
                        )
                    )}
                </Box>

                {!modoQuiosque && (
                    <Box sx={{ pt: 2, borderTop: '1px solid rgba(255,255,255,0.05)' }}>
                        <Typography variant="subtitle2" fontWeight={800} color="#FF3366" sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
                           <HistoryIcon sx={{ fontSize: 18 }} /> ÚLTIMOS CHECKOUTS
                        </Typography>
                        <Stack spacing={1} sx={{ maxHeight: 200, overflow: 'auto' }}>
                            {checkoutLogs.map(log => (
                                <Box key={log.id} sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', p: 1, bgcolor: 'rgba(255,255,255,0.02)', borderRadius: 2 }}>
                                    <Typography variant="caption" fontWeight={700} noWrap sx={{ maxWidth: '140px' }}>
                                        {log.pessoa_nome || log.pessoas?.nome}
                                    </Typography>
                                    <Typography variant="caption" color="text.secondary">
                                        {new Date(log.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                    </Typography>
                                </Box>
                            ))}
                            {checkoutLogs.length === 0 && <Typography variant="caption" sx={{ opacity: 0.3, textAlign: 'center' }}>Sem registros recentes</Typography>}
                        </Stack>
                    </Box>
                )}
            </GlassCard>
        </Grid>

        {/* CARD E AÇÕES (Direita no Normal, Inferior no Quiosque) */}
        <Grid item xs={12} md={modoQuiosque ? 10 : 8} lg={modoQuiosque ? 8 : 8}>
            <Box sx={{ position: 'relative', height: '100%', minHeight: 600 }}>
                {selectedPessoa ? (
                    <Fade in={!!selectedPessoa}>
                        <GlassCard sx={{ p: modoQuiosque ? 5 : 4, height: '100%', display: 'flex', flexDirection: 'column', position: 'relative' }}>
                            {/* FEEDBACK OVERLAY */}
                            {checkinResult && (
                                <FeedbackOverlay status={checkinResult}>
                                    <Zoom in={!!checkinResult}>
                                        <Box sx={{ textAlign: 'center' }}>
                                            {checkinResult === 'sucesso' ? <CheckoutIcon sx={{ fontSize: 130, color: '#FF3366' }} /> : <WarningIcon sx={{ fontSize: 130, color: '#FFA500' }} />}
                                            <Typography variant="h3" fontWeight={900} mt={2}>
                                                {checkinResult === 'sucesso' ? 'CHECKOUT REALIZADO' : 'ATENÇÃO'}
                                            </Typography>
                                            <Typography variant="h6" sx={{ opacity: 0.8 }}>{resultMessage}</Typography>
                                            {checkinResult === 'sucesso' && (
                                                <Stack spacing={1} sx={{ mt: 3 }}>
                                                    <Typography variant="h5" sx={{ opacity: 0.7 }}>
                                                        {new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                                                    </Typography>
                                                    {permanencia && (
                                                        <Typography variant="h6" color="#FF3366" fontWeight={800}>
                                                            Permanência: {permanencia}
                                                        </Typography>
                                                    )}
                                                </Stack>
                                            )}
                                        </Box>
                                    </Zoom>
                                </FeedbackOverlay>
                            )}

                            {/* SCANNER OVERLAY */}
                            {activeScanner && (
                                <CameraOverlay>
                                    <Typography variant="h6" mb={2} color="#FF3366" fontWeight={800}>SCANNER DE SAÍDA ATIVO</Typography>
                                    <Box id={SCANNER_ID} sx={{ width: 320, height: 320, borderRadius: 4, overflow: 'hidden', border: '2px solid #FF3366' }} />
                                    <NeonButton onClick={() => setActiveScanner(false)} color="error" sx={{ mt: 3 }}>CANCELAR</NeonButton>
                                </CameraOverlay>
                            )}

                            {/* PULSEIRA INPUT OVERLAY */}
                            {showPulseiraInput && (
                                <CameraOverlay>
                                    <Typography variant="h6" mb={2} color="#FF3366" fontWeight={800}>LEITURA DE PULSEIRA / QR CODE (SAÍDA)</Typography>
                                    <TextField 
                                        inputRef={rfidInputRef}
                                        placeholder="AGUARDANDO LEITURA..."
                                        value={pulseiraValue}
                                        onChange={(e) => setPulseiraValue(e.target.value)}
                                        onKeyDown={handlePulseiraKeyDown}
                                        sx={{ width: 400, '& .MuiOutlinedInput-root': { borderRadius: 4, height: 70, fontSize: '1.5rem', textAlign: 'center' } }}
                                    />
                                    <Stack direction="row" spacing={2} sx={{ mt: 4 }}>
                                        <NeonButton onClick={() => { performCheckin('pulseira', pulseiraValue); setPulseiraValue(''); setShowPulseiraInput(false); }}>CONFIRMAR MANUAL</NeonButton>
                                        <NeonButton onClick={() => setShowPulseiraInput(false)} color="error" sx={{ borderColor: '#FF3366', color: '#FF3366' }}>VOLTAR</NeonButton>
                                    </Stack>
                                </CameraOverlay>
                            )}

                            <Grid container spacing={4} sx={{ flex: 1 }}>
                                <Grid item xs={12} sm={modoQuiosque ? 4 : 3} sx={{ textAlign: 'center' }}>
                                    <Avatar 
                                        src={selectedPessoa.foto_url} 
                                        sx={{ 
                                            width: 160, height: 160, mx: 'auto', mb: 2, 
                                            bgcolor: '#FF3366', fontSize: '3rem',
                                            border: '4px solid rgba(255, 51, 102, 0.2)',
                                            boxShadow: '0 0 30px rgba(255, 51, 102, 0.2)'
                                        }}
                                    >
                                        {selectedPessoa.nome?.[0]}
                                    </Avatar>
                                    <Chip 
                                        label={selectedPessoa.status_acesso === 'checkin_feito' ? 'DENTRO' : 'FORA'} 
                                        color={selectedPessoa.status_acesso === 'checkin_feito' ? 'success' : 'default'} 
                                        variant="outlined" 
                                        sx={{ fontWeight: 800 }}
                                    />
                                </Grid>
                                
                                <Grid item xs={12} sm={modoQuiosque ? 8 : 9}>
                                    <Typography variant="h4" fontWeight={900} color="#fff">{selectedPessoa.nome}</Typography>
                                    <Stack spacing={1} mt={2}>
                                        <Typography variant="body1" sx={{ display: 'flex', alignItems: 'center', gap: 1, opacity: 0.8 }}>
                                            <BadgeIcon sx={{ color: '#FF3366' }} /> {selectedPessoa.cpf || 'Sem CPF'}
                                        </Typography>
                                        <Typography variant="body1" sx={{ display: 'flex', alignItems: 'center', gap: 1, opacity: 0.8 }}>
                                            <CompanyIcon sx={{ color: '#FF3366' }} /> {selectedPessoa.empresas?.nome || 'Pessoa Física'}
                                        </Typography>
                                        
                                        {entradaAtiva ? (
                                            <Typography variant="h6" color="#FF3366" sx={{ display: 'flex', alignItems: 'center', gap: 1, mt: 2, fontWeight: 800 }}>
                                                <TimeIcon /> ⏱ Tempo no local: {permanencia || <CircularProgress size={16} />}
                                            </Typography>
                                        ) : (
                                            <Typography variant="body2" color="#FFA500" sx={{ display: 'flex', alignItems: 'center', gap: 1, mt: 2, fontWeight: 800 }}>
                                                <WarningIcon sx={{ fontSize: 16 }} /> Sem registro de entrada ativo
                                            </Typography>
                                        )}
                                    </Stack>

                                    <AuthorizedAreasChips pessoa={selectedPessoa} accentColor="#FF3366" />

                                    <Box sx={{ mt: 3, p: 2, bgcolor: 'rgba(255,255,255,0.02)', borderRadius: 3 }}>
                                        <Typography variant="caption" color="text.secondary">ÚLTIMA ATIVIDADE</Typography>
                                        <Typography variant="body2" sx={{ opacity: 0.6 }}>
                                            Status consolidado via Terminal NZT.
                                        </Typography>
                                    </Box>
                                </Grid>
                            </Grid>

                            {/* ACTIONS FOOTER */}
                            <Box sx={{ mt: 4, pt: 3, borderTop: '1px solid rgba(255,255,255,0.05)' }}>
                                <Grid container spacing={2}>
                                    <Grid item xs={12} md={4}>
                                        <ActionButton fullWidth onClick={() => performCheckin('manual')} disabled={manualSaving || loading}>
                                            <CheckoutIcon sx={{ mr: 1, fontSize: 30 }} /> REALIZAR CHECKOUT
                                            {manualSaving && <CircularProgress size={20} sx={{ ml: 2 }} />}
                                        </ActionButton>
                                    </Grid>
                                    <Grid item xs={12} md={4}>
                                        <ActionButton fullWidth variant="outlined" onClick={() => setActiveScanner(true)} disabled={manualSaving || loading}>
                                            <ScannerIcon sx={{ mr: 1, fontSize: 30 }} /> QR CODE
                                        </ActionButton>
                                    </Grid>
                                    <Grid item xs={12} md={4}>
                                        <ActionButton fullWidth variant="outlined" onClick={() => setShowPulseiraInput(true)} disabled={manualSaving || loading}>
                                            <BadgeIcon sx={{ mr: 1, fontSize: 30 }} /> PULSEIRA / BARCODE
                                        </ActionButton>
                                    </Grid>
                                </Grid>
                            </Box>
                        </GlassCard>
                    </Fade>
                ) : (
                    <GlassCard sx={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <Stack alignItems="center" spacing={2} sx={{ opacity: 0.1 }}>
                            <LogoutIcon sx={{ fontSize: 180, color: '#FF3366' }} />
                            <Typography variant="h5" fontWeight={700}>BUSQUE UM PARTICIPANTE PARA SAÍDA</Typography>
                        </Stack>
                    </GlassCard>
                )}
            </Box>
        </Grid>
      </Grid>
    </Box>
  );
};

export default Checkout;
