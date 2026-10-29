import React, { useEffect, useState } from 'react';
import {
  Box, Typography, Grid, Stack, Button, Zoom, Tooltip
} from '@mui/material';
import {
  Logout as LogoutIcon, ExitToApp as CheckoutIcon,
  Warning as WarningIcon, PhotoCamera as CameraIcon
} from '@mui/icons-material';
import { styled } from '@mui/material/styles';

import GlassCard from '../components/common/GlassCard';
import LeitorQrCamera from '../components/common/LeitorQrCamera';
import UniversalPulseiraInput from '../components/common/UniversalPulseiraInput';
import PessoaCardDialog from '../components/credenciamento/PessoaCardDialog';
import RecentAccessList from '../components/credenciamento/RecentAccessList';
import CabecalhoOperacao, { BotaoJanelaRegistros } from '../components/credenciamento/CabecalhoOperacao';
import { useCheckin } from '../hooks/useCheckin';
import { funcao, tom } from '../styles/tokens';

// Saída tem cor própria; vermelho fica só para acesso negado
const COR = funcao.saida;
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

const BotaoSaida = styled(Button)(({ theme }) => ({
    height: 50,
    fontSize: '1rem',
    fontWeight: 700,
    textTransform: 'none',
    borderRadius: 10,
    background: COR,
    color: '#000000',
    boxShadow: 'none',
    [theme.breakpoints.down('sm')]: {
        height: 46,
        fontSize: '0.9375rem'
    },
    '&:hover': { background: COR, filter: 'brightness(1.1)', boxShadow: 'none' },
    '&:focus-visible': { outline: `2px solid ${COR}`, outlineOffset: 2 },
    '&.Mui-disabled': { background: tom(COR, 0.3), color: 'rgba(255,255,255,0.7)' }
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
    background: status === 'sucesso' ? tom(COR, 0.15) : tom(funcao.negado, 0.15),
    zIndex: 90, display: 'flex', flexDirection: 'column', alignItems: 'center', 
    justifyContent: 'center', borderRadius: 12, border: `4px solid ${status === 'sucesso' ? COR : funcao.negado}`,
    backdropFilter: 'blur(8px)', animation: 'fadeIn 0.3s cubic-bezier(0.4, 0, 0.2, 1)'
}));

const Checkout = () => {
  const {
    checkinResult, resultMessage, loading,
    modoQuiosque, toggleQuiosque,
    recentLogs,
    areaId, changeAreaId, eventAreas,
    executarLeituraRapida,
    // Vínculo Facial
    sessaoAtiva,
    dispositivosDisponiveis,
    loadingSessao,
    vincularLeitor,
    desvincularLeitor,
    carregarDispositivosDisponiveis
  } = useCheckin('checkout', { logsTipo: 'checkout' });

  const { currentTime, currentDate, timezoneLabel } = useSyncedClock();

  const [cardLog, setCardLog] = useState(null);
  const [pulseiraValue, setPulseiraValue] = useState('');
  const [lendoCamera, setLendoCamera] = useState(false);

  useEffect(() => {
    if (checkinResult === 'sucesso') {
      playCheckoutSound('sucesso');
    } else if (checkinResult === 'atencao' || checkinResult === 'erro') {
      playCheckoutSound('erro');
    }
  }, [checkinResult]);

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
        minHeight: modoQuiosque ? '100dvh' : 'auto',
        display: 'flex', flexDirection: 'column',
        position: 'relative'
    }}>
      <CabecalhoOperacao
          titulo="Check-out"
          icone={<LogoutIcon />}
          cor={COR}
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

      <Grid container spacing={{ xs: 1.5, sm: 2 }} sx={{ flex: 1, minHeight: 0 }}>

        {/* BAIXA: leitor, confirmação e resumo juntos no topo */}
        <Grid item xs={12} lg={4}>
            <GlassCard sx={{ p: { xs: 1.75, sm: 2.5 }, display: 'flex', flexDirection: 'column', gap: { xs: 1.5, sm: 2 } }}>
                <UniversalPulseiraInput
                    value={pulseiraValue}
                    onChange={setPulseiraValue}
                    accentColor={COR}
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

                {/* Sem leitor USB (celular/tablet): a câmera do aparelho lê o QR ou código de barras */}
                <Button
                    fullWidth
                    variant="outlined"
                    startIcon={<CameraIcon />}
                    onClick={() => setLendoCamera(true)}
                    disabled={loading}
                    sx={{ minHeight: 44, textTransform: 'none', fontWeight: 600, borderColor: tom(COR, 0.4), color: COR }}
                >
                    Ler pela câmera
                </Button>

                <Stack spacing={0.75} sx={{ pt: 1.25, borderTop: '1px solid rgba(255,255,255,0.08)' }}>
                    <LinhaResumo rotulo="Saídas registradas" valor={checkoutLogs.length} cor={COR} />
                </Stack>
            </GlassCard>
        </Grid>

        {/* SAÍDAS EM TEMPO REAL */}
        <Grid item xs={12} lg={8} sx={{ height: { xs: 'auto', lg: '100%' }, minHeight: { xs: 360, lg: 0 } }}>
            <GlassCard sx={{ p: { xs: 1.75, sm: 2.5 }, height: '100%', maxHeight: { xs: 520, lg: 'none' }, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
                <RecentAccessList
                    logs={checkoutLogs}
                    title="Saídas"
                    accentColor={COR}
                    badgeLabel="Saída"
                    firstLabel="Última saída"
                    emptyTitle="Nenhuma saída registrada ainda"
                    emptySubtitle="Cada saída aparece aqui na hora, com foto, empresa e pulseira."
                    acoes={<BotaoJanelaRegistros tipo="checkout" cor={COR} />}
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
                      {checkinResult === 'sucesso' ? <CheckoutIcon sx={{ fontSize: { xs: 76, sm: 100 }, color: COR }} /> : <WarningIcon sx={{ fontSize: { xs: 76, sm: 100 }, color: funcao.negado }} />}
                      <Typography fontWeight={700} mt={2} sx={{ fontSize: { xs: '1.5rem', sm: '2.125rem' } }}>
                          {checkinResult === 'sucesso' ? 'Saída registrada' : 'Saída negada'}
                      </Typography>
                      <Typography variant="body1" sx={{ opacity: 0.9, mt: 1 }}>{resultMessage}</Typography>
                      {checkinResult === 'sucesso' && (
                          <Typography variant="h6" sx={{ mt: 1.5, opacity: 0.6, fontFamily: '"Inter", sans-serif', letterSpacing: 1.5 }}>
                              {currentTime} • {timezoneLabel}
                          </Typography>
                      )}
                  </Box>
              </Zoom>
          </FeedbackOverlay>
      )}

      <LeitorQrCamera
          open={lendoCamera}
          onClose={() => setLendoCamera(false)}
          titulo="Saída pela câmera"
          onLeitura={(cod) => executarLeituraRapida(cod, 'checkout', 'qrcode')}
      />

      {/* DIALOG DETALHADO DO CARD DO PARTICIPANTE */}
      <PessoaCardDialog
          open={!!cardLog}
          log={cardLog}
          onClose={() => setCardLog(null)}
          accentColor={COR}
      />
    </Box>
  );
};

export default Checkout;
