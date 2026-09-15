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

  const [checkoutFilter, setCheckoutFilter] = useState('');

  const checkoutLogs = (recentLogs || []).filter(l => {
    const isCheckout = l.tipo === 'checkout' || l.metodo === 'checkout';
    if (!isCheckout) return false;
    if (!checkoutFilter) return true;
    const term = checkoutFilter.toLowerCase();
    const p = l.pessoas || {};
    return (
      (p.nome_completo || p.nome || '').toLowerCase().includes(term) ||
      (p.cpf || '').includes(term) ||
      (p.empresas?.nome || '').toLowerCase().includes(term) ||
      (p.numero_pulseira || '').includes(term) ||
      (l.numero_pulseira || '').includes(term)
    );
  });

  return (
    <Box sx={{ 
        p: modoQuiosque ? 2 : 3, 
        minHeight: modoQuiosque ? '100vh' : 'auto',
        display: 'flex', flexDirection: 'column'
    }}>
      
      {/* HEADER SECTION */}
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <PageHeader
            title={modoQuiosque ? "" : "Checkout NZT"}
            subtitle={modoQuiosque ? "" : "Operação de Baixa e Monitoramento de Saídas"}
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
      
      <Grid container spacing={3} sx={{ flex: 1, minHeight: 'calc(100vh - 200px)' }}>
        
        {/* LADO ESQUERDO (4 colunas): Operação de Baixa (Input Pulseira) */}
        <Grid item xs={12} lg={4}>
            <GlassCard sx={{ p: 3, height: '100%', display: 'flex', flexDirection: 'column', position: 'relative' }}>
                <Typography variant="h6" fontWeight={900} color="#FF3366" mb={0.5} sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <LogoutIcon /> BAIXA DE PULSEIRA
                </Typography>
                <Typography variant="caption" sx={{ opacity: 0.7, mb: 3 }}>
                    Bipe com o leitor RFID/Código de barras ou digite o número da pulseira e pressione Enter.
                </Typography>

                {/* FEEDBACK OVERLAY */}
                {checkinResult && (
                    <FeedbackOverlay status={checkinResult}>
                        <Zoom in={!!checkinResult}>
                            <Box sx={{ textAlign: 'center', p: 2 }}>
                                {checkinResult === 'sucesso' ? <CheckoutIcon sx={{ fontSize: 100, color: '#FF3366' }} /> : <WarningIcon sx={{ fontSize: 100, color: '#FFA500' }} />}
                                <Typography variant="h4" fontWeight={900} mt={2}>
                                    {checkinResult === 'sucesso' ? 'SAÍDA LIBERADA' : 'ATENÇÃO'}
                                </Typography>
                                <Typography variant="body1" sx={{ opacity: 0.9, mt: 1 }}>{resultMessage}</Typography>
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
                            startAdornment: <BadgeIcon sx={{ color: '#FF3366', mr: 2, fontSize: 28 }} />,
                            sx: { borderRadius: 4, height: 80, fontSize: '1.8rem', bgcolor: 'rgba(255,255,255,0.03)', textAlign: 'center', fontWeight: 800 }
                        }}
                    />
                    <Stack direction="row" spacing={2} sx={{ mt: 3 }}>
                        <ActionButton fullWidth onClick={() => { performCheckin('pulseira', pulseiraValue); setPulseiraValue(''); }}>
                            <LogoutIcon sx={{ mr: 1 }} /> CONFIRMAR SAÍDA
                        </ActionButton>
                    </Stack>

                    {/* Resumo rápido de status */}
                    <Box sx={{ mt: 4, p: 2.5, bgcolor: 'rgba(255,255,255,0.02)', borderRadius: 3, border: '1px solid rgba(255,255,255,0.05)' }}>
                        <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.5)', textTransform: 'uppercase', letterSpacing: 1, display: 'block', mb: 1 }}>
                            Status da Operação
                        </Typography>
                        <Stack direction="row" justifyContent="space-between" alignItems="center">
                            <Typography variant="body2" color="rgba(255,255,255,0.8)">Sincronização em Tempo Real:</Typography>
                            <Chip label="ONLINE" size="small" sx={{ bgcolor: 'rgba(0, 255, 136, 0.15)', color: '#00FF88', fontWeight: 800, border: '1px solid #00FF88' }} />
                        </Stack>
                        <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mt: 1.5 }}>
                            <Typography variant="body2" color="rgba(255,255,255,0.8)">Saídas computadas nesta sessão:</Typography>
                            <Typography variant="subtitle2" fontWeight={800} color="#FF3366">{checkoutLogs.length}</Typography>
                        </Stack>
                    </Box>
                </Box>
            </GlassCard>
        </Grid>

        {/* LADO DIREITO (8 colunas): MONITORAMENTO EXPANDIDO EM TEMPO REAL */}
        <Grid item xs={12} lg={8}>
            <GlassCard sx={{ p: 3.5, height: '100%', display: 'flex', flexDirection: 'column' }}>
                
                {/* CABEÇALHO DO MONITORAMENTO */}
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 2, mb: 2.5, pb: 2, borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
                    <Box>
                        <Stack direction="row" alignItems="center" spacing={1.5}>
                            <Typography variant="h5" fontWeight={900} color="#fff" sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                <HistoryIcon sx={{ color: '#FF3366', fontSize: 32 }} /> COLABORADORES DESCREDENCIADOS
                            </Typography>
                            <Chip 
                                label="AO VIVO" 
                                size="small" 
                                sx={{ 
                                    bgcolor: 'rgba(255, 51, 102, 0.2)', 
                                    color: '#FF3366', 
                                    fontWeight: 900, 
                                    letterSpacing: 1.5,
                                    border: '1px solid rgba(255, 51, 102, 0.5)',
                                    animation: 'pulse 2s infinite'
                                }} 
                            />
                        </Stack>
                        <Typography variant="body2" sx={{ opacity: 0.7, mt: 0.5 }}>
                            Últimas baixas e saídas registradas com foto, empresa e pulseira.
                        </Typography>
                    </Box>

                    {/* Filtro rápido */}
                    <Box sx={{ width: { xs: '100%', sm: 280 } }}>
                        <TextField 
                            fullWidth
                            size="small"
                            placeholder="Buscar descredenciado..."
                            value={checkoutFilter}
                            onChange={(e) => setCheckoutFilter(e.target.value)}
                            InputProps={{
                                startAdornment: <SearchIcon sx={{ color: 'rgba(255,255,255,0.4)', mr: 1, fontSize: 20 }} />,
                                sx: { bgcolor: 'rgba(0,0,0,0.2)', borderRadius: 2, color: '#fff' }
                            }}
                        />
                    </Box>
                </Box>

                {/* LISTA EXPANDIDA DOS ÚLTIMOS DESCREDENCIADOS */}
                <Box sx={{ flex: 1, overflowY: 'auto', pr: 1 }}>
                    <Stack spacing={2}>
                        {checkoutLogs.map((log, index) => {
                            const pessoa = log.pessoas || {};
                            const nome = pessoa.nome_completo || pessoa.nome || log.pessoa_nome || 'Colaborador';
                            const empresa = pessoa.empresas?.nome || log.empresa_nome || 'Empresa não informada';
                            const funcao = pessoa.funcao || log.funcao || 'Operacional';
                            const pulseira = pessoa.numero_pulseira || log.numero_pulseira || log.extra?.numero_pulseira;
                            const hora = new Date(log.created_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });

                            return (
                                <Fade in key={log.id || index} timeout={400}>
                                    <Box sx={{ 
                                        p: 2.5, 
                                        bgcolor: index === 0 ? 'rgba(255, 51, 102, 0.12)' : 'rgba(255, 255, 255, 0.02)', 
                                        borderRadius: 3.5, 
                                        border: index === 0 ? '2px solid rgba(255, 51, 102, 0.4)' : '1px solid rgba(255, 255, 255, 0.06)',
                                        display: 'flex',
                                        gap: 2.5,
                                        alignItems: 'center',
                                        transition: 'all 0.2s ease',
                                        '&:hover': {
                                            bgcolor: 'rgba(255, 51, 102, 0.08)',
                                            borderColor: 'rgba(255, 51, 102, 0.3)',
                                            transform: 'translateY(-2px)'
                                        }
                                    }}>
                                        {/* FOTO DO COLABORADOR */}
                                        <Avatar 
                                            src={pessoa.foto_url} 
                                            sx={{ 
                                                width: 72, 
                                                height: 72, 
                                                bgcolor: '#FF3366', 
                                                border: '3px solid rgba(255,51,102,0.6)',
                                                fontSize: '1.8rem',
                                                fontWeight: 800
                                            }}
                                        >
                                            {nome[0]}
                                        </Avatar>

                                        {/* INFORMAÇÕES DO COLABORADOR */}
                                        <Box sx={{ flex: 1 }}>
                                            <Stack direction="row" alignItems="center" spacing={1.5}>
                                                <Typography variant="h6" fontWeight={900} color="#fff" sx={{ letterSpacing: 0.5 }}>
                                                    {nome}
                                                </Typography>
                                                {index === 0 && (
                                                    <Chip label="ÚLTIMA SAÍDA" size="small" sx={{ bgcolor: '#FF3366', color: '#fff', fontWeight: 900, fontSize: '0.7rem', height: 22 }} />
                                                )}
                                                <Chip label="DESCREDENCIADO" size="small" variant="outlined" sx={{ borderColor: '#FF3366', color: '#FF3366', fontWeight: 800, fontSize: '0.7rem', height: 22 }} />
                                            </Stack>

                                            <Stack direction="row" spacing={3} mt={1} sx={{ opacity: 0.85, flexWrap: 'wrap', gap: 1 }}>
                                                <Typography variant="body2" sx={{ display: 'flex', alignItems: 'center', gap: 0.8, color: '#fff' }}>
                                                    <BadgeIcon fontSize="small" sx={{ color: '#FF3366' }} /> {funcao}
                                                </Typography>
                                                <Typography variant="body2" sx={{ display: 'flex', alignItems: 'center', gap: 0.8, color: '#fff' }}>
                                                    <CompanyIcon fontSize="small" sx={{ color: '#FF3366' }} /> {empresa}
                                                </Typography>
                                            </Stack>
                                        </Box>

                                        {/* BLOCO DA PULSEIRA E HORÁRIO */}
                                        <Stack direction="row" spacing={2} alignItems="center">
                                            {pulseira && (
                                                <Box sx={{ textAlign: 'center', px: 2, py: 1, bgcolor: 'rgba(0,0,0,0.35)', borderRadius: 2.5, border: '1px solid rgba(255,51,102,0.2)' }}>
                                                    <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.6)', display: 'block', fontSize: '0.65rem', textTransform: 'uppercase' }}>
                                                        Pulseira
                                                    </Typography>
                                                    <Typography variant="subtitle1" fontWeight={900} color="#FF3366">
                                                        #{pulseira}
                                                    </Typography>
                                                </Box>
                                            )}

                                            <Box sx={{ textAlign: 'right', minWidth: 90 }}>
                                                <Typography variant="h6" fontWeight={800} color="#fff">
                                                    {hora}
                                                </Typography>
                                                <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 0.5 }}>
                                                    <TimeIcon sx={{ fontSize: 14 }} /> Horário
                                                </Typography>
                                            </Box>
                                        </Stack>
                                    </Box>
                                </Fade>
                            );
                        })}

                        {checkoutLogs.length === 0 && (
                            <Box sx={{ textAlign: 'center', p: 8, opacity: 0.4 }}>
                                <HistoryIcon sx={{ fontSize: 72, mb: 2, color: '#FF3366' }} />
                                <Typography variant="h6" fontWeight={700}>Aguardando descredenciamentos...</Typography>
                                <Typography variant="body2" sx={{ mt: 1 }}>Conectado em tempo real ao gateway. Assim que uma pulseira for dada baixa, o colaborador aparecerá aqui.</Typography>
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
