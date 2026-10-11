import React, { useEffect, useState } from 'react';
import { Html5Qrcode } from "html5-qrcode";
import {
  Box, Typography, Grid, Stack, Button, Zoom, Tooltip
} from '@mui/material';
import {
  Logout as LogoutIcon, ExitToApp as CheckoutIcon,
  Warning as WarningIcon
} from '@mui/icons-material';
import { styled } from '@mui/material/styles';

import GlassCard from '../components/common/GlassCard';
import UniversalPulseiraInput from '../components/common/UniversalPulseiraInput';
import PessoaCardDialog from '../components/credenciamento/PessoaCardDialog';
import RecentAccessList from '../components/credenciamento/RecentAccessList';
import CabecalhoOperacao, { BotaoJanelaRegistros } from '../components/credenciamento/CabecalhoOperacao';
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

const BotaoSaida = styled(Button)(() => ({
    height: 52,
    fontSize: '1rem',
    fontWeight: 700,
    textTransform: 'none',
    borderRadius: 10,
    background: '#FF3366',
    color: '#FFFFFF',
    boxShadow: 'none',
    '&:hover': { background: '#FF3366', filter: 'brightness(1.1)', boxShadow: 'none' },
    '&:focus-visible': { outline: '2px solid #FF3366', outlineOffset: 2 },
    '&.Mui-disabled': { background: 'rgba(255,51,102,0.35)', color: 'rgba(255,255,255,0.7)' }
}));

const LinhaResumo = ({ rotulo, valor, cor = 'rgba(255,255,255,0.9)', dica }) => {
    const linha = (
        <Stack direction="row" justifyContent="space-between" alignItems="baseline">
            <Typography variant="body2" sx={{ color: 'rgba(255,255,255,0.6)' }}>{rotulo}</Typography>
            <Typography variant="subtitle1" fontWeight={700} sx={{ color: cor, fontVariantNumeric: 'tabular-nums' }}>{valor}</Typography>
        </Stack>
    );
    return dica ? <Tooltip title={dica} placement="left">{linha}</Tooltip> : linha;
};

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

  const registrarSaida = (valor) => {
    const cod = (valor || pulseiraValue || '').trim();
    if (cod) {
      executarLeituraRapida(cod, 'checkout', 'barcode');
      setPulseiraValue('');
    }
  };

  return (
    <Box sx={{
        p: modoQuiosque ? 2 : { xs: 1.5, sm: 2, md: 2.5 },
        maxWidth: '100%',
        overflowX: 'hidden',
        // No desktop a tela cabe na janela: só a lista rola
        height: { lg: '100vh' },
        minHeight: modoQuiosque ? '100vh' : 'auto',
        display: 'flex', flexDirection: 'column',
        position: 'relative'
    }}>
      <CabecalhoOperacao
          titulo="Check-out"
          icone={<LogoutIcon />}
          cor="#FF3366"
          dataHora={`${currentDate} ${currentTime} (${timezoneLabel})`}
          estacao={{
              sessaoAtiva,
              dispositivos: dispositivosDisponiveis,
              loading: loadingSessao,
              onVincular: vincularLeitor,
              onDesvincular: desvincularLeitor,
              onRecarregar: carregarDispositivosDisponiveis
          }}
          areas={eventAreas}
          areaId={areaId}
          onAreaChange={changeAreaId}
          modoQuiosque={modoQuiosque}
          onToggleQuiosque={toggleQuiosque}
      />

      <Grid container spacing={2} sx={{ flex: 1, minHeight: 0 }}>

        {/* BAIXA: leitor, confirmação e resumo juntos no topo */}
        <Grid item xs={12} lg={4}>
            <GlassCard sx={{ p: 2.5, display: 'flex', flexDirection: 'column', gap: 2 }}>
                <UniversalPulseiraInput
                    value={pulseiraValue}
                    onChange={setPulseiraValue}
                    accentColor="#FF3366"
                    label="Leitor, CPF ou pulseira"
                    placeholder="Bipe a pulseira ou digite o código"
                    helperText="Enter registra a saída na hora"
                    onConfirm={(val) => registrarSaida(val)}
                    loading={loading}
                    autoFocus={!modoQuiosque}
                />

                <BotaoSaida fullWidth startIcon={<LogoutIcon />} onClick={() => registrarSaida()} disabled={loading || !pulseiraValue.trim()}>
                    Registrar saída
                </BotaoSaida>

                <Stack spacing={0.75} sx={{ pt: 1.5, borderTop: '1px solid rgba(255,255,255,0.08)' }}>
                    <LinhaResumo rotulo="Saídas nesta tela" valor={checkoutLogs.length} cor="#FF3366" />
                    <LinhaResumo
                        rotulo="Horário oficial"
                        valor={`${currentTime} ${timezoneLabel}`}
                        cor={isSynced ? '#00FF88' : 'rgba(255,255,255,0.9)'}
                        dica={isSynced ? 'Relógio sincronizado com o servidor' : 'Relógio do computador (sem sincronizar com o servidor)'}
                    />
                </Stack>
            </GlassCard>
        </Grid>

        {/* SAÍDAS EM TEMPO REAL */}
        <Grid item xs={12} lg={8} sx={{ height: { xs: '75vh', lg: '100%' } }}>
            <GlassCard sx={{ p: 2.5, height: '100%', display: 'flex', flexDirection: 'column', minHeight: 0 }}>
                <RecentAccessList
                    logs={checkoutLogs}
                    title="Saídas"
                    accentColor="#FF3366"
                    badgeLabel="Saída"
                    firstLabel="Última saída"
                    emptyTitle="Nenhuma saída registrada ainda"
                    emptySubtitle="Cada saída aparece aqui na hora, com foto, empresa e pulseira."
                    acoes={<BotaoJanelaRegistros tipo="checkout" cor="#FF3366" />}
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
