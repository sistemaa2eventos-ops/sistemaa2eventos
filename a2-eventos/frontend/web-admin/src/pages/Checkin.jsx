import React, { useEffect, useState } from 'react';
import { Html5Qrcode } from "html5-qrcode";
import {
  Box, Typography, Grid, Stack, IconButton, TextField, 
  Avatar, CircularProgress, List, ListItemText,
  ListItemButton, Chip, Fade, Zoom,
  FormControl, Select, MenuItem
} from '@mui/material';
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
    areaId, changeAreaId, eventAreas,
    performCheckin
  } = useCheckin();

  const [pulseiraValue, setPulseiraValue] = useState('');
  const [showPulseiraInput, setShowPulseiraInput] = useState(false);

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

      {/* SELETOR DE ÁREA (Portaria) */}
      {eventAreas.length > 0 && (
        <Box sx={{ mb: 3, display: 'flex', alignItems: 'center', gap: 2 }}>
          <Typography variant="caption" fontWeight={700} color="text.secondary" sx={{ whiteSpace: 'nowrap' }}>
            📍 PORTARIA / ÁREA:
          </Typography>
          <FormControl size="small" sx={{ minWidth: 250 }}>
            <Select
              value={areaId || ''}
              onChange={(e) => changeAreaId(e.target.value || null)}
              displayEmpty
              sx={{
                borderRadius: 3,
                bgcolor: 'rgba(0,212,255,0.05)',
                border: '1px solid rgba(0,212,255,0.2)',
                '& .MuiSelect-select': { py: 1 }
              }}
            >
              <MenuItem value=""><em>Todas as áreas (global)</em></MenuItem>
              {eventAreas.map(area => (
                <MenuItem key={area.id} value={area.id}>
                  {area.nome_area}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
          {areaId && (
            <Chip
              label={eventAreas.find(a => a.id === areaId)?.nome_area || 'Área selecionada'}
              color="info"
              size="small"
              onDelete={() => changeAreaId(null)}
              sx={{ fontWeight: 700 }}
            />
          )}
        </Box>
      )}

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
                {selectedPessoa ? (
                    <Fade in={!!selectedPessoa}>
                        <GlassCard sx={{ p: modoQuiosque ? 5 : 4, height: '100%', display: 'flex', flexDirection: 'column', position: 'relative' }}>
                            {/* FEEDBACK OVERLAY */}
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

                            {/* SCANNER OVERLAY */}
                            {activeScanner && (
                                <CameraOverlay>
                                    <Typography variant="h6" mb={2}>Scanner Ativo</Typography>
                                    <Box id="reader-quiosque" sx={{ width: 320, height: 320, borderRadius: 4, overflow: 'hidden', border: '2px solid #00D4FF' }} />
                                    <NeonButton onClick={() => setActiveScanner(false)} color="error" sx={{ mt: 3 }}>CANCELAR</NeonButton>
                                </CameraOverlay>
                            )}

                            {/* PULSEIRA INPUT OVERLAY */}
                            {showPulseiraInput && (
                                <CameraOverlay>
                                    <Typography variant="h6" mb={2}>LEITURA DE PULSEIRA / QR</Typography>
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
                                        <NeonButton onClick={() => setShowPulseiraInput(false)} color="error">VOLTAR</NeonButton>
                                    </Stack>
                                </CameraOverlay>
                            )}

                            <Grid container spacing={4} sx={{ flex: 1 }}>
                                <Grid item xs={12} sm={modoQuiosque ? 4 : 3} sx={{ textAlign: 'center' }}>
                                    <Avatar 
                                        src={selectedPessoa.foto_url} 
                                        sx={{ 
                                            width: 160, height: 160, mx: 'auto', mb: 2, 
                                            bgcolor: '#00D4FF', fontSize: '3rem',
                                            border: '4px solid rgba(0,212,255,0.2)',
                                            boxShadow: '0 0 30px rgba(0,212,255,0.2)'
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
                                            <BadgeIcon sx={{ color: '#00D4FF' }} /> {selectedPessoa.cpf || 'Sem CPF'}
                                        </Typography>
                                        <Typography variant="body1" sx={{ display: 'flex', alignItems: 'center', gap: 1, opacity: 0.8 }}>
                                            <CompanyIcon sx={{ color: '#00D4FF' }} /> {selectedPessoa.empresas?.nome || 'Pessoa Física'}
                                        </Typography>
                                        <Typography variant="body1" sx={{ display: 'flex', alignItems: 'center', gap: 1, opacity: 0.8 }}>
                                            <BadgeIcon sx={{ color: '#00D4FF' }} /> {selectedPessoa.funcao || 'Participante'}
                                        </Typography>
                                        {/* Informações da Pulseira */}
                                        {selectedPessoa.pulseira_info && (
                                            <Box sx={{ mt: 2, p: 2, borderRadius: 2, bgcolor: 'rgba(0,0,0,0.3)', border: `1px solid ${selectedPessoa.pulseira_info.cor_hex}40` }}>
                                                <Stack direction="row" alignItems="center" spacing={2}>
                                                    <Box sx={{ 
                                                        width: 24, 
                                                        height: 24, 
                                                        borderRadius: '50%', 
                                                        bgcolor: selectedPessoa.pulseira_info.cor_hex,
                                                        boxShadow: `0 0 10px ${selectedPessoa.pulseira_info.cor_hex}80`
                                                    }} />
                                                    <Box>
                                                        <Typography variant="body2" fontWeight={800} sx={{ color: selectedPessoa.pulseira_info.cor_hex }}>
                                                            {selectedPessoa.pulseira_info.nome_tipo?.toUpperCase()}
                                                        </Typography>
                                                        {selectedPessoa.pulseira_info.areas_permitidas?.length > 0 && (
                                                            <Stack direction="row" spacing={0.5} flexWrap="wrap" sx={{ mt: 0.5 }}>
                                                                {selectedPessoa.pulseira_info.areas_permitidas.map((area, idx) => (
                                                                    <Chip 
                                                                        key={idx}
                                                                        label={area.nome_area}
                                                                        size="small"
                                                                        sx={{ 
                                                                            height: 18, 
                                                                            fontSize: '0.6rem',
                                                                            bgcolor: 'rgba(255,255,255,0.1)',
                                                                            color: '#fff'
                                                                        }}
                                                                    />
                                                                ))}
                                                            </Stack>
                                                        )}
                                                    </Box>
                                                </Stack>
                                            </Box>
                                        )}
                                    </Stack>

                                    {/* Áreas autorizadas (enriquecido via handleSelectPessoa) */}
                                    {selectedPessoa.areas_info?.length > 0 && !selectedPessoa.pulseira_info && (
                                        <Box sx={{ mt: 2, p: 1.5, borderRadius: 2, bgcolor: 'rgba(0,212,255,0.05)', border: '1px solid rgba(0,212,255,0.15)' }}>
                                            <Typography variant="caption" color="text.secondary" sx={{ mb: 0.5, display: 'block' }}>
                                                🔑 ÁREAS AUTORIZADAS
                                            </Typography>
                                            <Stack direction="row" spacing={0.5} flexWrap="wrap">
                                                {selectedPessoa.areas_info.map((area, idx) => (
                                                    <Chip
                                                        key={idx}
                                                        label={area.nome_area}
                                                        size="small"
                                                        sx={{
                                                            height: 22,
                                                            fontSize: '0.7rem',
                                                            fontWeight: 700,
                                                            bgcolor: 'rgba(0,212,255,0.1)',
                                                            color: '#00D4FF',
                                                            border: '1px solid rgba(0,212,255,0.3)'
                                                        }}
                                                    />
                                                ))}
                                            </Stack>
                                        </Box>
                                    )}

                                    <Box sx={{ mt: 4, p: 2, bgcolor: 'rgba(255,255,255,0.02)', borderRadius: 3 }}>
                                        <Typography variant="caption" color="text.secondary" sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
                                            <EventIcon sx={{ fontSize: 16 }} /> DIAS DE ACESSO
                                        </Typography>
                                        <Stack direction="row" spacing={1} flexWrap="wrap">
                                            {(selectedPessoa.dias_acesso || selectedPessoa.dias_trabalho || []).map(dia => {
                                                const isHoje = dia === hojeLiteral;
                                                return (
                                                    <Chip 
                                                        key={dia} 
                                                        label={new Date(dia + 'T00:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })}
                                                        size="small"
                                                        sx={{ 
                                                            bgcolor: isHoje ? 'rgba(0,255,136,0.1)' : 'rgba(255,255,255,0.05)',
                                                            color: isHoje ? '#00FF88' : '#fff',
                                                            border: isHoje ? '1px solid #00FF88' : '1px solid rgba(255,255,255,0.1)',
                                                            fontWeight: isHoje ? 900 : 400
                                                        }}
                                                    />
                                                );
                                            })}
                                        </Stack>
                                    </Box>
                                </Grid>
                            </Grid>

                            {/* ACTIONS FOOTER */}
                            <Box sx={{ mt: 4, pt: 3, borderTop: '1px solid rgba(255,255,255,0.05)' }}>
                                <Grid container spacing={2}>
                                    <Grid item xs={12} md={4}>
                                        <ActionButton fullWidth onClick={() => performCheckin('manual')} disabled={manualSaving || loading}>
                                            <LoginIcon sx={{ mr: 1, fontSize: 30 }} /> CHECK-IN MANUAL
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
                            <BadgeIcon sx={{ fontSize: 180 }} />
                            <Typography variant="h5" fontWeight={700}>BUSQUE UM PARTICIPANTE PARA INICIAR</Typography>
                        </Stack>
                    </GlassCard>
                )}
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
