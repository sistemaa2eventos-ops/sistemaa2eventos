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
      <Grid container spacing={3} sx={{ flex: 1, minHeight: 600 }}>
        
        {/* LADO ESQUERDO: Operação (Input Pulseira) */}
        <Grid item xs={12} md={6}>
            <GlassCard sx={{ p: 4, height: '100%', display: 'flex', flexDirection: 'column', position: 'relative' }}>
                <Typography variant="h5" fontWeight={900} color="#FF3366" mb={1} sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <LogoutIcon /> SAÍDA POR PULSEIRA
                </Typography>
                <Typography variant="body2" sx={{ opacity: 0.7, mb: 4 }}>
                    Realize o checkout bipando ou digitando o número da pulseira.
                </Typography>

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
                            </Box>
                        </Zoom>
                    </FeedbackOverlay>
                )}

                <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
                    <TextField 
                        fullWidth
                        autoFocus={!modoQuiosque}
                        inputRef={rfidInputRef}
                        placeholder="NÚMERO DA PULSEIRA"
                        value={pulseiraValue}
                        onChange={(e) => setPulseiraValue(e.target.value)}
                        onKeyDown={handlePulseiraKeyDown}
                        InputProps={{ 
                            startAdornment: <BadgeIcon sx={{ color: '#FF3366', mr: 2, fontSize: 30 }} />,
                            sx: { borderRadius: 4, height: 90, fontSize: '2rem', bgcolor: 'rgba(255,255,255,0.03)', textAlign: 'center' }
                        }}
                    />
                    <Stack direction="row" spacing={2} sx={{ mt: 4 }}>
                        <ActionButton fullWidth onClick={() => { performCheckin('pulseira', pulseiraValue); setPulseiraValue(''); }}>
                            BAIXAR PULSEIRA
                        </ActionButton>
                    </Stack>
                </Box>
            </GlassCard>
        </Grid>

        {/* LADO DIREITO: Monitoramento em Tempo Real */}
        <Grid item xs={12} md={6}>
            <GlassCard sx={{ p: 4, height: '100%', display: 'flex', flexDirection: 'column' }}>
                <Typography variant="h5" fontWeight={900} color="#fff" mb={1} sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <HistoryIcon sx={{ color: '#FF3366' }} /> MONITORAMENTO DE SAÍDAS
                </Typography>
                <Typography variant="body2" sx={{ opacity: 0.7, mb: 3 }}>
                    Acompanhamento em tempo real dos colaboradores descredenciados.
                </Typography>

                <Box sx={{ flex: 1, overflowY: 'auto', pr: 1 }}>
                    <Stack spacing={2}>
                        {checkoutLogs.map(log => {
                            const pessoa = log.pessoas || {};
                            return (
                                <Fade in key={log.id}>
                                    <Box sx={{ 
                                        p: 3, 
                                        bgcolor: 'rgba(255, 51, 102, 0.05)', 
                                        borderRadius: 3, 
                                        border: '1px solid rgba(255, 51, 102, 0.2)',
                                        display: 'flex',
                                        gap: 3,
                                        alignItems: 'center'
                                    }}>
                                        <Avatar 
                                            src={pessoa.foto_url} 
                                            sx={{ width: 60, height: 60, bgcolor: '#FF3366', border: '2px solid rgba(255,51,102,0.5)' }}
                                        >
                                            {pessoa.nome?.[0]}
                                        </Avatar>
                                        <Box sx={{ flex: 1 }}>
                                            <Typography variant="h6" fontWeight={800} color="#fff">{pessoa.nome_completo || pessoa.nome}</Typography>
                                            <Stack direction="row" spacing={3} mt={1} sx={{ opacity: 0.8 }}>
                                                <Typography variant="body2" sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                                                    <BadgeIcon fontSize="small" sx={{ color: '#FF3366' }} /> {pessoa.funcao || 'N/A'}
                                                </Typography>
                                                <Typography variant="body2" sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                                                    <CompanyIcon fontSize="small" sx={{ color: '#FF3366' }} /> {pessoa.empresas?.nome || 'N/A'}
                                                </Typography>
                                            </Stack>
                                            <Stack direction="row" spacing={3} mt={1}>
                                                <Typography variant="body2" color="text.secondary" sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                                                    <TimeIcon fontSize="small" /> Checkout: {new Date(log.created_at).toLocaleTimeString()}
                                                </Typography>
                                            </Stack>
                                        </Box>
                                        {pessoa.numero_pulseira && (
                                            <Box sx={{ textAlign: 'center', p: 1, bgcolor: 'rgba(0,0,0,0.3)', borderRadius: 2 }}>
                                                <Typography variant="caption" sx={{ opacity: 0.6 }}>Pulseira</Typography>
                                                <Typography variant="h6" fontWeight={900} color="#FF3366">{pessoa.numero_pulseira}</Typography>
                                            </Box>
                                        )}
                                    </Box>
                                </Fade>
                            );
                        })}
                        {checkoutLogs.length === 0 && (
                            <Box sx={{ textAlign: 'center', p: 5, opacity: 0.3 }}>
                                <HistoryIcon sx={{ fontSize: 60, mb: 2 }} />
                                <Typography>Nenhuma saída registrada recentemente.</Typography>
                            </Box>
                        )}
                    </Stack>
                </Box>
            </GlassCard>
        </Grid>
      </Grid>
    </Box>
  );
};

export default Checkout;
