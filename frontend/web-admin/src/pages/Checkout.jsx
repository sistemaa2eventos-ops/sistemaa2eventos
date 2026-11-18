import React, { useEffect, useState, useMemo, useCallback } from 'react';
import {
  Box, Typography, Grid, Stack, Button, Zoom, Tooltip,
  List, ListItem, ListItemButton, ListItemText, LinearProgress
} from '@mui/material';
import {
  Logout as LogoutIcon, ExitToApp as CheckoutIcon,
  Warning as WarningIcon
} from '@mui/icons-material';
import { styled } from '@mui/material/styles';

import GlassCard from '../components/common/GlassCard';
import LeitorQrCamera from '../components/common/LeitorQrCameraSobDemanda';
import UniversalPulseiraInput from '../components/common/UniversalPulseiraInput';
import PessoaFoto from '../components/common/PessoaFoto';
import PessoaCardDialog from '../components/credenciamento/PessoaCardDialog';
import RecentAccessList from '../components/credenciamento/RecentAccessList';
import CabecalhoOperacao, { BotaoJanelaRegistros } from '../components/credenciamento/CabecalhoOperacao';
import { useCheckin } from '../hooks/useCheckin';
import CorrigirTurnoDialog from '../components/checkin/CorrigirTurnoDialog';
import ConferenciaSaidaDialog from '../components/checkin/ConferenciaSaidaDialog';
import { funcao, tom } from '../styles/tokens';

// Saída tem cor própria; vermelho fica só para acesso negado
const COR = funcao.saida;
import RelogioSincronizado from '../components/common/RelogioSincronizado';
import { obterAudioContext } from '../utils/alertSound';

const playCheckoutSound = (type) => {
    try {
        const audioCtx = obterAudioContext();
        if (!audioCtx) return;
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
    searchQuery, handleSearch, searchResults, searchLoading,
    recentLogs,
    areaId, changeAreaId, eventAreas, pulseiraTypes,
    selectedPessoa, setSelectedPessoa,
    abrirConferenciaPorCodigo, performCheckin, manualSaving,
    // Vínculo Facial
    sessaoAtiva,
    dispositivosDisponiveis,
    camerasDisponiveis,
    loadingSessao,
    vincularLeitor,
    desvincularLeitor,
    carregarDispositivosDisponiveis,
    turnoAnterior, confirmarTurnoAnterior, cancelarTurnoAnterior,
  } = useCheckin('checkout', { logsTipo: 'checkout' });


  const [cardLog, setCardLog] = useState(null);
  // Estáveis entre renderizações: a lista (memo) não redesenha as linhas à toa
  const abrirCardLog = useCallback((log) => setCardLog(log), []);
  const acoesLista = useMemo(() => <BotaoJanelaRegistros tipo="checkout" cor={COR} />, []);
  const [pulseiraValue, setPulseiraValue] = useState('');
  const [ultimoCodigoLido, setUltimoCodigoLido] = useState('');
  const [lendoCamera, setLendoCamera] = useState(false);

  useEffect(() => {
    if (checkinResult === 'sucesso') {
      playCheckoutSound('sucesso');
    } else if (checkinResult === 'atencao' || checkinResult === 'erro') {
      playCheckoutSound('erro');
    }
  }, [checkinResult]);

  const checkoutLogs = useMemo(() => (recentLogs || []).filter(l => {
    return l.tipo === 'checkout' || l.metodo === 'checkout';
  }), [recentLogs]);

  // Janela de conferência da saída: guarda a pessoa até o operador fechar. O hook limpa selectedPessoa
  // sozinho depois de cada ação, e isso não pode derrubar a janela no meio de uma leitura.
  const [pessoaJanela, setPessoaJanela] = useState(null);
  useEffect(() => { if (selectedPessoa) setPessoaJanela(selectedPessoa); }, [selectedPessoa]);
  const fecharJanela = () => {
    setPessoaJanela(null);
    setSelectedPessoa(null);
  };

  // A saída é registrada pela janela: pela pulseira lida (o servidor usa esse número) ou por CPF/QR desta pessoa
  const registrarSaidaNaJanela = ({ pessoa, via, codigo }) => (
    via === 'pulseira'
      ? performCheckin('pulseira', codigo, pessoa.id)
      : performCheckin('manual', null, pessoa.id)
  );

  // Código (QR, barras, câmera, CPF ou nº da pulseira + Enter/OK) só localiza a pessoa e abre a janela de
  // conferência. A saída é registrada dentro da janela, pela leitura da pulseira. Igual ao Check-in.
  const processarCodigo = (codigoBruto) => {
    const cod = String(codigoBruto || '').trim();
    if (!cod) return undefined;
    setPulseiraValue(''); // campo vazio: o próximo bipe não gruda no anterior
    setUltimoCodigoLido(cod); // o código aparece só no aviso "Código lido"
    handleSearch('');
    return abrirConferenciaPorCodigo(cod);
  };

  // Enter/OK: código abre a conferência. Texto com letras é nome: nunca abre sozinho; só mostra a lista.
  const confirmarCampo = (val, origem) => {
    const texto = String(val || '').trim();
    if (!texto) return undefined;
    if (origem !== 'barcode' && /[A-Za-zÀ-ÿ]/.test(texto)) {
      if (searchQuery.trim() !== texto) handleSearch(texto);
      setPulseiraValue('');
      return undefined;
    }
    return processarCodigo(texto);
  };

  return (
    <Box sx={{
        p: modoQuiosque ? 2 : { xs: 1.5, sm: 2, md: 2.5 },
        maxWidth: '100%',
        overflowX: 'hidden',
        // No desktop a tela cabe na janela: só a lista rola
        height: { lg: '100dvh' },
        minHeight: modoQuiosque ? '100dvh' : 'auto',
        display: 'flex', flexDirection: 'column',
        position: 'relative'
    }}>
      <CabecalhoOperacao
          titulo="Check-out"
          icone={<LogoutIcon />}
          cor={COR}
          dataHora={<RelogioSincronizado />}
          estacao={{
              sessaoAtiva,
              dispositivos: dispositivosDisponiveis,
              cameras: camerasDisponiveis,
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

        {/* BAIXA: campo único unificado (leitor QR/barras, pulseira, CPF e busca por nome) */}
        <Grid item xs={12} lg={4} sx={{ height: { lg: '100%' } }}>
            <GlassCard sx={{ p: { xs: 1.75, sm: 2.5 }, height: '100%', display: 'flex', flexDirection: 'column', gap: { xs: 1.5, sm: 2 }, minHeight: 0 }}>
                <UniversalPulseiraInput
                    value={pulseiraValue}
                    onChange={(val) => {
                        setPulseiraValue(val);
                        handleSearch(val);
                    }}
                    onClear={() => {
                        setPulseiraValue('');
                        handleSearch('');
                    }}
                    accentColor={COR}
                    label="Leitor, pulseira, CPF ou nome"
                    placeholder="Bipe QR/barras, digite nº da pulseira, CPF ou nome..."
                    helperText="Bipe ou câmera: abre a conferência • Digitação: Enter ou OK • Nome: escolha na lista"
                    pulseiraTypes={pulseiraTypes}
                    ultimoCodigoLido={ultimoCodigoLido}
                    onConfirm={confirmarCampo}
                    // Só o loading da ação: a busca por nome não pode travar o campo no meio de um bipe
                    loading={loading}
                    // Com a janela aberta o foco fica nela: um bipe não pode cair neste campo por trás
                    autoFocus={!modoQuiosque && !pessoaJanela}
                    onAbrirCamera={() => setLendoCamera(true)}
                />
                {/* Busca por nome em andamento: barra fina com altura fixa (nada pula) */}
                <Box sx={{ height: 3, mt: { xs: -0.75, sm: -1 } }} aria-live="polite">
                    {searchLoading && <LinearProgress aria-label="Buscando" sx={{ height: 3, borderRadius: 2, bgcolor: tom(COR, 0.12), '& .MuiLinearProgress-bar': { bgcolor: COR } }} />}
                </Box>

                {searchResults.length > 0 && (
                    <Box sx={{ flex: 1, overflowY: 'auto', minHeight: 160, maxHeight: { xs: 260, lg: 'none' } }}>
                        <List disablePadding>
                            {searchResults.map(p => (
                                <ListItem key={p.id} disablePadding sx={{ mb: 1 }}>
                                    <ListItemButton
                                        onClick={() => setSelectedPessoa(p)} // abre a conferência, como no Check-in
                                        sx={{
                                            borderRadius: 1.5,
                                            p: 1.15,
                                            border: '1px solid rgba(255,255,255,0.06)',
                                            bgcolor: 'rgba(255,255,255,0.02)',
                                            '&:hover': {
                                                bgcolor: tom(COR, 0.12),
                                                borderColor: tom(COR, 0.45)
                                            }
                                        }}
                                    >
                                        <Box sx={{ mr: 1.5 }}>
                                            <PessoaFoto
                                                src={p.foto_url}
                                                pessoaId={p.id}
                                                nome={p.nome}
                                                width={40}
                                                borderRadius="8px"
                                                accentColor={COR}
                                            />
                                        </Box>
                                        <ListItemText
                                            primary={p.nome}
                                            secondary={[p.cpf || 'Sem CPF', p.numero_pulseira ? `Pulseira ${p.numero_pulseira}` : null, p.empresa_nome || p.empresas?.nome].filter(Boolean).join(' – ')}
                                            primaryTypographyProps={{ fontWeight: 700, fontSize: '0.9rem', noWrap: true }}
                                            secondaryTypographyProps={{ fontSize: '0.78rem', noWrap: true }}
                                        />
                                    </ListItemButton>
                                </ListItem>
                            ))}
                        </List>
                    </Box>
                )}

                <BotaoSaida fullWidth startIcon={<LogoutIcon />} onClick={() => confirmarCampo(pulseiraValue, 'manual')} disabled={loading || !pulseiraValue.trim()}>
                    Abrir conferência
                </BotaoSaida>

                <Stack spacing={0.75} sx={{ mt: 'auto', pt: 1.25, borderTop: '1px solid rgba(255,255,255,0.08)' }}>
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
                    acoes={acoesLista}
                    onSelect={abrirCardLog}
                />
            </GlassCard>
        </Grid>
      </Grid>

      {/* Saída de um dia anterior: confirmar o horário */}
      <CorrigirTurnoDialog turno={turnoAnterior} onConfirmar={confirmarTurnoAnterior} onCancelar={cancelarTurnoAnterior} />

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
                              <RelogioSincronizado formato="hora" />
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
          instrucao="Aponte a câmera para o QR Code ou código de barras da pulseira ou do crachá — a saída será registrada automaticamente."
          onLeitura={(cod) => {
              setLendoCamera(false);
              processarCodigo(cod);
          }}
      />

      {/* CONFERÊNCIA DA SAÍDA: a saída é registrada aqui, pela pulseira desta pessoa */}
      <ConferenciaSaidaDialog
          open={!!pessoaJanela}
          pessoa={pessoaJanela}
          onClose={fecharJanela}
          onRegistrar={registrarSaidaNaJanela}
          ocupado={manualSaving}
          accentColor={COR}
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
