import React, { useEffect, useState } from 'react';
import { Html5Qrcode } from "html5-qrcode";
import {
  Box, Typography, Grid, TextField,
  List, ListItemText,
  ListItemButton, Chip, Zoom
} from '@mui/material';
import AreaSelector from '../components/common/AreaSelector';
import {
  QrCodeScanner as ScannerIcon, 
  CheckCircle as SuccessIcon, Cancel as ErrorIcon, Search as SearchIcon,
  AutoMode as AutoIcon, Fullscreen as KioskIcon,
  FullscreenExit as ExitKioskIcon,
  Timer as TimeIcon, Badge as BadgeIcon,
  EventAvailable as EventIcon
} from '@mui/icons-material';
import { styled } from '@mui/material/styles';

import PageHeader from '../components/common/PageHeader';
import GlassCard from '../components/common/GlassCard';
import NeonButton from '../components/common/NeonButton';
import UniversalPulseiraInput from '../components/common/UniversalPulseiraInput';
import EstacaoFacialSelector from '../components/common/EstacaoFacialSelector';
import ModalCredenciamento from '../components/credenciamento/ModalCredenciamento';
import PessoaFoto from '../components/common/PessoaFoto';
import PessoaCardDialog from '../components/credenciamento/PessoaCardDialog';
import RecentAccessList from '../components/credenciamento/RecentAccessList';
import { useCheckin } from '../hooks/useCheckin';
import { useSyncedClock } from '../hooks/useSyncedClock';

const FeedbackOverlay = styled(Box, { shouldForwardProp: (p) => p !== 'status' })(({ status }) => ({
    position: 'absolute', top: 0, left: 0, width: '100%', height: '100%',
    background: status === 'sucesso' ? 'rgba(0,255,136,0.15)' : 'rgba(255,51,102,0.15)',
    zIndex: 90, display: 'flex', flexDirection: 'column', alignItems: 'center', 
    justifyContent: 'center', borderRadius: 12, border: status === 'sucesso' ? '4px solid #00FF88' : '4px solid #FF3366',
    backdropFilter: 'blur(8px)', animation: 'fadeIn 0.3s cubic-bezier(0.4, 0, 0.2, 1)'
}));

const Checkin = () => {
  const {
    selectedPessoa, setSelectedPessoa, activeScanner, setActiveScanner,
    checkinResult, resultMessage, loading, manualSaving,
    modoQuiosque, toggleQuiosque,
    searchQuery, handleSearch, searchResults,
    recentLogs, realtimeStats, offlineCount,
    areaId, changeAreaId, eventAreas, pulseiraTypes,
    performCheckin,
    executarLeituraRapida,
    handleLinkPulseiraAndCheckin,
    // Vínculo Facial (Fase 1)
    sessaoAtiva,
    dispositivosDisponiveis,
    loadingSessao,
    vincularLeitor,
    desvincularLeitor,
    carregarDispositivosDisponiveis
  } = useCheckin(undefined, { logsTipo: 'checkin' });

  const { currentTime, currentDate, timezoneLabel } = useSyncedClock();

  const [cardLog, setCardLog] = useState(null);
  const [barcodeValue, setBarcodeValue] = useState('');

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

  return (
    <Box sx={{ 
        p: modoQuiosque ? 2 : { xs: 1.5, sm: 2.5, md: 3 }, 
        maxWidth: '100%',
        overflowX: 'hidden',
        minHeight: modoQuiosque ? '100vh' : 'auto',
        display: 'flex', flexDirection: 'column'
    }}>
      
      {/* HEADER SECTION */}
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <PageHeader
            title={modoQuiosque ? "" : "Check-in"}
            subtitle={modoQuiosque ? "" : `Operação de Entrada e Identificação • ${currentDate} ${currentTime} (${timezoneLabel})`}
            icon={modoQuiosque ? null : <ScannerIcon sx={{ fontSize: 40, color: '#00D4FF' }} />}
            sx={{ m: 0, p: 0 }}
        />
        
        {modoQuiosque && (
            <Box sx={{ position: 'absolute', top: 20, left: '50%', transform: 'translateX(-50%)', opacity: 0.8, textAlign: 'center' }}>
                <Typography variant="h4" fontWeight={700} color="#00D4FF" letterSpacing={4}>
                    NZT <BadgeIcon /> ACCESS
                </Typography>
                <Typography variant="caption" color="rgba(255,255,255,0.6)" sx={{ fontFamily: '"Inter", sans-serif' }}>
                    {currentTime} • {timezoneLabel}
                </Typography>
            </Box>
        )}

        <NeonButton 
            onClick={toggleQuiosque} 
            color={modoQuiosque ? "error" : "primary"}
            sx={{ px: 3, py: 1.5, borderRadius: 1.5 }}
        >
            {modoQuiosque ? <ExitKioskIcon sx={{ mr: 1 }} /> : <KioskIcon sx={{ mr: 1 }} />}
            {modoQuiosque ? "Sair do quiosque" : "Modo quiosque"}
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
      <Grid container spacing={3} sx={{ flex: 1, minHeight: 'calc(100vh - 200px)' }}>
        
        {/* IDENTIFICAÇÃO E ENTRADA (Lado Esquerdo - 4 colunas) */}
        <Grid item xs={12} lg={4}>
            <GlassCard sx={{ p: 3, height: '100%', display: 'flex', flexDirection: 'column' }}>
                {/* 1. LEITOR DE CÓDIGO DE BARRAS / CPF - ENTRADA DIRETA SEM PULSEIRA */}
                <Box sx={{ mb: 2.5 }}>
                    <Typography variant="h6" fontWeight={700} color="#00FF88" mb={0.5} sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        <ScannerIcon /> Entrada direta (leitor / CPF)
                    </Typography>
                    <Typography variant="caption" sx={{ opacity: 0.7, mb: 1.5, display: 'block' }}>
                        Bipe com a pistola ou digite o CPF para autorizar entrada imediata sem pulseira.
                    </Typography>

                    <UniversalPulseiraInput
                        value={barcodeValue}
                        onChange={setBarcodeValue}
                        accentColor="#00FF88"
                        label="LEITOR DE CÓDIGO DE BARRAS / CPF"
                        placeholder="Bipe o crachá ou digite o CPF"
                        helperText="Pressione Enter ↵ para liberar a entrada imediatamente"
                        onConfirm={(val) => {
                            const cod = (val || barcodeValue || '').trim();
                            if (cod) {
                                executarLeituraRapida(cod, 'checkin', 'barcode');
                                setBarcodeValue('');
                            }
                        }}
                        loading={loading}
                        autoFocus={!modoQuiosque}
                    />
                </Box>

                <Box sx={{ display: 'flex', alignItems: 'center', my: 1.5 }}>
                    <Box sx={{ flex: 1, height: '1px', bgcolor: 'rgba(255,255,255,0.1)' }} />
                    <Typography variant="caption" sx={{ px: 1.5, opacity: 0.5, fontWeight: 700, letterSpacing: 1 }}>
                        Ou localizar no sistema
                    </Typography>
                    <Box sx={{ flex: 1, height: '1px', bgcolor: 'rgba(255,255,255,0.1)' }} />
                </Box>

                {/* 2. BUSCA POR NOME / CPF PARA CREDENCIAMENTO */}
                <Typography variant="subtitle2" fontWeight={700} color="#00D4FF" mb={0.5} sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <SearchIcon fontSize="small" /> Busca manual & pulseira
                </Typography>
                <Typography variant="caption" sx={{ opacity: 0.7, mb: 1.5 }}>
                    Localize para abrir o modal de dados ou vincular pulseira física se desejar.
                </Typography>

                <TextField
                    fullWidth
                    placeholder="Buscar por nome ou CPF"
                    value={searchQuery}
                    onChange={(e) => handleSearch(e.target.value)}
                    InputProps={{ 
                        startAdornment: <SearchIcon sx={{ color: 'text.secondary', mr: 1 }} />,
                        sx: { borderRadius: 1.5, height: 50, fontSize: '1rem', bgcolor: 'rgba(255,255,255,0.03)' }
                    }}
                />

                <Box sx={{ mt: 2, flex: 1, overflow: 'auto', minHeight: 260 }}>
                    {searchResults.length > 0 ? (
                        <List disablePadding>
                            {searchResults.map(p => (
                                <ListItemButton
                                    key={p.id}
                                    onClick={() => setSelectedPessoa(p)}
                                    sx={{ 
                                        borderRadius: 1.5, 
                                        mb: 1.2, 
                                        p: 1.5,
                                        border: '1px solid rgba(255,255,255,0.06)',
                                        bgcolor: 'rgba(255,255,255,0.02)',
                                        '&:hover': {
                                            bgcolor: 'rgba(0, 212, 255, 0.08)',
                                            borderColor: 'rgba(0, 212, 255, 0.4)'
                                        }
                                    }}
                                >
                                    <Box sx={{ mr: 2 }}>
                                        <PessoaFoto
                                            src={p.foto_url}
                                            nome={p.nome}
                                            width={48}
                                            borderRadius="8px"
                                            accentColor="#00D4FF"
                                        />
                                    </Box>
                                    <ListItemText 
                                        primary={p.nome} 
                                        secondary={p.cpf || 'Sem CPF'}
                                        primaryTypographyProps={{ fontWeight: 700, fontSize: '1rem' }}
                                        secondaryTypographyProps={{ fontSize: '0.8125rem', opacity: 0.7 }}
                                    />
                                    {p.empresa_nome && (
                                        <Chip 
                                            label={p.empresa_nome} 
                                            size="small" 
                                            sx={{ maxWidth: 120, fontSize: '0.75rem' }} 
                                        />
                                    )}
                                </ListItemButton>
                            ))}
                        </List>
                    ) : (
                        searchQuery.length >= 3 && !loading && (
                            <Typography variant="caption" sx={{ display: 'block', textAlign: 'center', opacity: 0.5, mt: 4 }}>
                                Nenhum participante encontrado para &quot;{searchQuery}&quot;.
                            </Typography>
                        )
                    )}
                </Box>
            </GlassCard>
        </Grid>

        {/* MONITORAMENTO EM TEMPO REAL (Lado Direito - 8 colunas) */}
        <Grid item xs={12} lg={8}>
            <GlassCard sx={{ p: 3.5, height: '100%', display: 'flex', flexDirection: 'column' }}>
                <RecentAccessList
                    logs={recentLogs}
                    title="Colaboradores credenciados"
                    subtitle="Últimas entradas registradas com foto, empresa e pulseira."
                    accentColor="#00D4FF"
                    badgeLabel="CREDENCIADO"
                    firstLabel="ÚLTIMA ENTRADA"
                    emptyTitle="Aguardando credenciamentos..."
                    emptySubtitle="Conectado em tempo real ao gateway. Assim que uma entrada for realizada, o colaborador aparecerá aqui."
                    onSelect={(log) => setCardLog(log)}
                />
            </GlassCard>
        </Grid>
      </Grid>

      {/* FEEDBACK OVERLAY GLOBAL */}
      {checkinResult && (
          <FeedbackOverlay status={checkinResult}>
              <Zoom in={!!checkinResult}>
                  <Box sx={{ textAlign: 'center' }}>
                      {checkinResult === 'sucesso' ? <SuccessIcon sx={{ fontSize: 130, color: '#00FF88' }} /> : <ErrorIcon sx={{ fontSize: 130, color: '#FF3366' }} />}
                      <Typography variant="h3" fontWeight={700} mt={2}>
                          {checkinResult === 'sucesso' ? 'LIBERADO' : 'NEGADO'}
                      </Typography>
                      <Typography variant="h6" sx={{ opacity: 0.8 }}>{resultMessage}</Typography>
                      {checkinResult === 'sucesso' && (
                          <Typography variant="h5" sx={{ mt: 2, opacity: 0.6, fontFamily: '"Inter", sans-serif', letterSpacing: 1.5 }}>
                              {currentTime} • {timezoneLabel}
                          </Typography>
                      )}
                  </Box>
              </Zoom>
          </FeedbackOverlay>
      )}

      {/* MODAL DE CREDENCIAMENTO E ACESSO RÁPIDO */}
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

      {/* DIALOG DETALHADO DO CARD DO PARTICIPANTE */}
      <PessoaCardDialog
          open={!!cardLog}
          log={cardLog}
          onClose={() => setCardLog(null)}
          accentColor="#00D4FF"
      />

      {/* STATS SECTION (Hidden on Kiosk) */}
      {!modoQuiosque && (
        <Box sx={{ mt: 3 }}>
            <Grid container spacing={3}>
                <Grid item xs={6} md={4}>
                    <GlassCard sx={{ p: 2, display: 'flex', alignItems: 'center', gap: 2 }}>
                        <AutoIcon color="primary" />
                        <Box>
                            <Typography variant="caption" color="text.secondary">PRESENTES</Typography>
                            <Typography variant="h5" fontWeight={700}>{realtimeStats?.presentes || 0}</Typography>
                        </Box>
                    </GlassCard>
                </Grid>
                <Grid item xs={6} md={4}>
                    <GlassCard sx={{ p: 2, display: 'flex', alignItems: 'center', gap: 2 }}>
                         <EventIcon color="secondary" />
                        <Box>
                            <Typography variant="caption" color="text.secondary">OFFLINE PENDENTES</Typography>
                            <Typography variant="h5" fontWeight={700} color={offlineCount > 0 ? "warning.main" : "inherit"}>{offlineCount}</Typography>
                        </Box>
                    </GlassCard>
                </Grid>
                <Grid item xs={12} md={4}>
                    <GlassCard sx={{ p: 2, display: 'flex', alignItems: 'center', gap: 2 }}>
                        <TimeIcon sx={{ color: '#00D4FF' }} />
                        <Box>
                            <Typography variant="caption" color="text.secondary">HORÁRIO OFICIAL ({timezoneLabel})</Typography>
                            <Typography variant="h5" fontWeight={700} color="#00D4FF" sx={{ fontFamily: '"Inter", sans-serif', letterSpacing: 1.5 }}>
                                {currentTime}
                            </Typography>
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
