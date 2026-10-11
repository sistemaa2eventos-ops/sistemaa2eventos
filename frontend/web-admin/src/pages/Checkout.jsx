import React, { useEffect, useState } from 'react';
import { Html5Qrcode } from "html5-qrcode";
import {
  Box, Typography, Grid, Stack,
  Chip, Zoom, Divider
} from '@mui/material';
import AreaSelector from '../components/common/AreaSelector';
import {
  Logout as LogoutIcon, ExitToApp as CheckoutIcon,
  Fullscreen as KioskIcon, FullscreenExit as ExitKioskIcon,
  Badge as BadgeIcon, Warning as WarningIcon,
  Schedule as ClockIcon, Public as GlobeIcon
} from '@mui/icons-material';
import { styled } from '@mui/material/styles';

import PageHeader from '../components/common/PageHeader';
import GlassCard from '../components/common/GlassCard';
import NeonButton from '../components/common/NeonButton';
import UniversalPulseiraInput from '../components/common/UniversalPulseiraInput';
import EstacaoFacialSelector from '../components/common/EstacaoFacialSelector';
import PessoaCardDialog from '../components/credenciamento/PessoaCardDialog';
import RecentAccessList from '../components/credenciamento/RecentAccessList';
import { useCheckin } from '../hooks/useCheckin';
import { useSyncedClock } from '../hooks/useSyncedClock';

const playCheckoutSound = (type) => {
    try {
        const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc.connect(gain);
        gain.connect(audioCtx.destination);
        if (type === 'sucesso') {
            osc.frequency.setValueAtTime(440, audioCtx.currentTime); // A4
            osc.frequency.setValueAtTime(659.25, audioCtx.currentTime + 0.1); // E5
            gain.gain.setValueAtTime(0.15, audioCtx.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.3);
            osc.start();
            osc.stop(audioCtx.currentTime + 0.3);
        } else {
            osc.type = 'sawtooth';
            osc.frequency.setValueAtTime(160, audioCtx.currentTime);
            gain.gain.setValueAtTime(0.2, audioCtx.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.35);
            osc.start();
            osc.stop(audioCtx.currentTime + 0.35);
        }
    } catch (_) {
        // Ignora erros de áudio caso o navegador bloqueie autoplay
    }
};

const ActionButton = styled(NeonButton)(() => ({
    height: 64,
    fontSize: '1rem',
    fontWeight: 700,
    borderRadius: 12,
    borderColor: '#FF3366',
    color: '#FF3366',
    '&:hover': {
        boxShadow: '0 0 20px rgba(255, 51, 102, 0.3)',
        borderColor: '#FF3366',
        color: '#FF3366'
    }
}));

const FeedbackOverlay = styled(Box, { shouldForwardProp: (p) => p !== 'status' })(({ status }) => ({
    position: 'absolute', top: 0, left: 0, width: '100%', height: '100%',
    background: status === 'sucesso' ? 'rgba(255,51,102,0.15)' : 'rgba(255,165,0,0.15)',
    zIndex: 90, display: 'flex', flexDirection: 'column', alignItems: 'center', 
    justifyContent: 'center', borderRadius: 12, border: status === 'sucesso' ? '4px solid #FF3366' : '4px solid #FFB800',
    backdropFilter: 'blur(8px)', animation: 'fadeIn 0.3s cubic-bezier(0.4, 0, 0.2, 1)'
}));

const SCANNER_ID = 'checkout-scanner-nzt';

const Checkout = () => {
  const {
    activeScanner, setActiveScanner,
    checkinResult, resultMessage, loading,
    modoQuiosque, toggleQuiosque,
    recentLogs,
    areaId, changeAreaId, eventAreas,
    performCheckin,
    executarLeituraRapida,
    // Vínculo Facial
    sessaoAtiva,
    dispositivosDisponiveis,
    loadingSessao,
    vincularLeitor,
    desvincularLeitor,
    carregarDispositivosDisponiveis
  } = useCheckin('checkout', { logsTipo: 'checkout' });

  const { currentTime, currentDate, timezoneLabel, isSynced } = useSyncedClock();

  const [cardLog, setCardLog] = useState(null);
  const [pulseiraValue, setPulseiraValue] = useState('');

  useEffect(() => {
    if (checkinResult === 'sucesso') {
      playCheckoutSound('sucesso');
    } else if (checkinResult === 'atencao' || checkinResult === 'erro') {
      playCheckoutSound('erro');
    }
  }, [checkinResult]);

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
        } catch (_) {
          setActiveScanner(false);
        }
      };
      setTimeout(startScanner, 100);
    }
    return () => { if (html5QrCode?.isScanning) html5QrCode.stop(); };
  }, [activeScanner, performCheckin, setActiveScanner]);

  const checkoutLogs = (recentLogs || []).filter(l => {
    return l.tipo === 'checkout' || l.metodo === 'checkout';
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
            title={modoQuiosque ? "" : "Check-out"}
            subtitle={modoQuiosque ? "" : `Operação de Baixa e Monitoramento • ${currentDate} ${currentTime} (${timezoneLabel})`}
            icon={modoQuiosque ? null : <LogoutIcon sx={{ fontSize: 40, color: '#FF3366' }} />}
            sx={{ m: 0, p: 0 }}
        />
        
        {modoQuiosque && (
            <Box sx={{ position: 'absolute', top: 20, left: '50%', transform: 'translateX(-50%)', opacity: 0.8, textAlign: 'center' }}>
                <Typography variant="h4" fontWeight={700} color="#FF3366" letterSpacing={4}>
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
            sx={{ 
                px: 3, py: 1.5, borderRadius: 1.5,
                borderColor: modoQuiosque ? '#FF3366' : 'primary.main',
                color: modoQuiosque ? '#FF3366' : 'primary.main',
            }}
        >
            {modoQuiosque ? <ExitKioskIcon sx={{ mr: 1 }} /> : <KioskIcon sx={{ mr: 1 }} />}
            {modoQuiosque ? "Sair do quiosque" : "Modo quiosque"}
        </NeonButton>
      </Box>

      {/* 📡 Seletor e Status da Estação / Leitor Facial para Checkout */}
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

      <AreaSelector areas={eventAreas} value={areaId} onChange={changeAreaId} accentColor="#FF3366" />
      
      {/* MAIN CONTENT AREA */}
      <Grid container spacing={3} sx={{ flex: 1, minHeight: 'calc(100vh - 200px)' }}>
        
        {/* LADO ESQUERDO (4 colunas): Operação de Baixa com Espaçamento Limpo */}
        <Grid item xs={12} lg={4}>
            <GlassCard sx={{ p: 3.5, height: '100%', display: 'flex', flexDirection: 'column', position: 'relative' }}>
                {/* Título e Instruções com espaçamento harmonioso */}
                <Box sx={{ mb: 3 }}>
                    <Typography variant="h6" fontWeight={700} color="#FF3366" sx={{ display: 'flex', alignItems: 'center', gap: 1, letterSpacing: 0.5 }}>
                        <LogoutIcon /> Baixa de acesso / saída
                    </Typography>
                    <Typography variant="body2" sx={{ color: 'rgba(255,255,255,0.65)', mt: 0.8, fontSize: '0.875rem' }}>
                        Bipe com a pistola de código de barras, CPF, pulseira ou utilize o leitor facial vinculado.
                    </Typography>
                </Box>

                <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 3 }}>
                    {/* Campo de Leitura com rótulo separado e livre de sobreposições */}
                    <UniversalPulseiraInput 
                        value={pulseiraValue}
                        onChange={setPulseiraValue}
                        accentColor="#FF3366"
                        label="LEITOR DE CÓDIGO DE BARRAS / CPF / PULSEIRA"
                        placeholder="Bipe a pulseira ou digite o código"
                        helperText="Pressione Enter ↵ para registrar a baixa imediatamente"
                        onConfirm={(val) => {
                            const cod = (val || pulseiraValue || '').trim();
                            if (cod) {
                                executarLeituraRapida(cod, 'checkout', 'barcode');
                                setPulseiraValue('');
                            }
                        }}
                        loading={loading}
                        autoFocus={!modoQuiosque}
                    />

                    <ActionButton fullWidth onClick={() => { 
                        const cod = (pulseiraValue || '').trim();
                        if (cod) {
                            executarLeituraRapida(cod, 'checkout', 'barcode'); 
                            setPulseiraValue('');
                        }
                    }} disabled={loading}>
                        <LogoutIcon sx={{ mr: 1 }} /> CONFIRMAR SAÍDA (ENTER)
                    </ActionButton>

                    {/* Resumo de status com relógio atômico sincronizado por geolocalização */}
                    <Box sx={{ mt: 1, p: 2.2, bgcolor: 'rgba(255,255,255,0.02)', borderRadius: 1.5, border: '1px solid rgba(255,255,255,0.06)' }}>
                        <Stack direction="row" justifyContent="space-between" alignItems="center" mb={1.2}>
                            <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.5)', textTransform: 'uppercase', letterSpacing: 1 }}>
                                Sincronização do Sistema
                            </Typography>
                            <Chip 
                                icon={<GlobeIcon sx={{ fontSize: '13px !important', color: '#00FF88 !important' }} />}
                                label={isSynced ? "SINCRONIZADO" : "ONLINE"} 
                                size="small" 
                                sx={{ bgcolor: 'rgba(0, 255, 136, 0.15)', color: '#00FF88', fontWeight: 700, fontSize: '0.75rem', height: 20, border: '1px solid #00FF88' }} 
                            />
                        </Stack>

                        <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mt: 1 }}>
                            <Typography variant="body2" color="rgba(255,255,255,0.75)" sx={{ display: 'flex', alignItems: 'center', gap: 0.8 }}>
                                <ClockIcon sx={{ fontSize: 16, color: '#00D4FF' }} /> Horário Oficial:
                            </Typography>
                            <Typography variant="subtitle2" fontWeight={700} color="#00D4FF" sx={{ fontFamily: '"Inter", sans-serif', letterSpacing: 1.5, fontSize: '1rem' }}>
                                {currentTime}
                            </Typography>
                        </Stack>

                        <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mt: 0.8 }}>
                            <Typography variant="caption" color="rgba(255,255,255,0.5)">Fuso do Operador:</Typography>
                            <Typography variant="caption" fontWeight={700} color="rgba(255,255,255,0.8)">
                                {timezoneLabel}
                            </Typography>
                        </Stack>

                        <Divider sx={{ my: 1.2, borderColor: 'rgba(255,255,255,0.06)' }} />

                        <Stack direction="row" justifyContent="space-between" alignItems="center">
                            <Typography variant="body2" color="rgba(255,255,255,0.75)">Saídas nesta sessão:</Typography>
                            <Typography variant="subtitle2" fontWeight={700} color="#FF3366">{checkoutLogs.length}</Typography>
                        </Stack>
                    </Box>
                </Box>
            </GlassCard>
        </Grid>

        {/* LADO DIREITO (8 colunas): MONITORAMENTO EXPANDIDO EM TEMPO REAL */}
        <Grid item xs={12} lg={8}>
            <GlassCard sx={{ p: 3.5, height: '100%', display: 'flex', flexDirection: 'column' }}>
                <RecentAccessList
                    logs={checkoutLogs}
                    title="Saídas registradas"
                    subtitle="Últimas baixas e saídas registradas com foto, empresa e pulseira."
                    accentColor="#FF3366"
                    badgeLabel="DESCREDENCIADO"
                    firstLabel="ÚLTIMA SAÍDA"
                    emptyTitle="Aguardando descredenciamentos..."
                    emptySubtitle="Conectado em tempo real ao gateway. Assim que uma pulseira for dada baixa, o colaborador aparecerá aqui."
                    onSelect={(log) => setCardLog(log)}
                />
            </GlassCard>
        </Grid>
      </Grid>

      {/* FEEDBACK OVERLAY */}
      {checkinResult && (
          <FeedbackOverlay status={checkinResult}>
              <Zoom in={!!checkinResult}>
                  <Box sx={{ textAlign: 'center', p: 2 }}>
                      {checkinResult === 'sucesso' ? <CheckoutIcon sx={{ fontSize: 100, color: '#FF3366' }} /> : <WarningIcon sx={{ fontSize: 100, color: '#FFB800' }} />}
                      <Typography variant="h4" fontWeight={700} mt={2}>
                          {checkinResult === 'sucesso' ? 'SAÍDA LIBERADA' : 'ATENÇÃO'}
                      </Typography>
                      <Typography variant="body1" sx={{ opacity: 0.9, mt: 1 }}>{resultMessage}</Typography>
                      {checkinResult === 'sucesso' && (
                          <Typography variant="h5" sx={{ mt: 2, opacity: 0.6, fontFamily: '"Inter", sans-serif', letterSpacing: 1.5 }}>
                              {currentTime} • {timezoneLabel}
                          </Typography>
                      )}
                  </Box>
              </Zoom>
          </FeedbackOverlay>
      )}

      {/* DIALOG DETALHADO DO CARD DO PARTICIPANTE */}
      <PessoaCardDialog
          open={!!cardLog}
          log={cardLog}
          onClose={() => setCardLog(null)}
          accentColor="#FF3366"
      />
    </Box>
  );
};

export default Checkout;
