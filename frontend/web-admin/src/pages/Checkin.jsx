import React, { useState } from 'react';
import {
  Box, Typography, Grid, TextField,
  List, ListItemText,
  ListItemButton, Zoom, Tooltip
} from '@mui/material';
import {
  QrCodeScanner as ScannerIcon,
  CheckCircle as SuccessIcon, Cancel as ErrorIcon, Search as SearchIcon
} from '@mui/icons-material';
import { styled } from '@mui/material/styles';

import GlassCard from '../components/common/GlassCard';
import LeitorQrCamera from '../components/common/LeitorQrCamera';
import UniversalPulseiraInput from '../components/common/UniversalPulseiraInput';
import CabecalhoOperacao, { BotaoJanelaRegistros } from '../components/credenciamento/CabecalhoOperacao';
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

const NumeroTurno = ({ rotulo, valor, cor, dica }) => {
  const conteudo = (
    <Box sx={{ flex: 1, px: 1.5, py: 1, borderRadius: 1.5, bgcolor: 'rgba(255,255,255,0.03)' }}>
      <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.6)', display: 'block' }}>{rotulo}</Typography>
      <Typography variant="h6" fontWeight={700} sx={{ color: cor, fontVariantNumeric: 'tabular-nums' }}>{valor}</Typography>
    </Box>
  );
  return dica ? <Tooltip title={dica}>{conteudo}</Tooltip> : conteudo;
};

const Checkin = () => {
  const {
    selectedPessoa, setSelectedPessoa,
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
  const [lendoCamera, setLendoCamera] = useState(false);

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

  return (
    <Box sx={{
        p: modoQuiosque ? 2 : { xs: 1.5, sm: 2, md: 2.5 },
        maxWidth: '100%',
        overflowX: 'hidden',
        // No desktop a tela cabe na janela: só as listas rolam
        height: { lg: '100dvh' },
        minHeight: modoQuiosque ? '100dvh' : 'auto',
        display: 'flex', flexDirection: 'column',
        position: 'relative'
    }}>
      <CabecalhoOperacao
          titulo="Check-in"
          icone={<ScannerIcon />}
          cor="#00D4FF"
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

        {/* OPERAÇÃO: leitor, busca e números do turno */}
        <Grid item xs={12} lg={4} sx={{ height: { lg: '100%' } }}>
            <GlassCard sx={{ p: { xs: 1.75, sm: 2.5 }, height: '100%', display: 'flex', flexDirection: 'column', minHeight: 0 }}>
                <UniversalPulseiraInput
                    value={barcodeValue}
                    onChange={setBarcodeValue}
                    accentColor="#00FF88"
                    label="Leitor ou CPF"
                    placeholder="Bipe, digite o CPF ou toque no ícone"
                    helperText="Enter libera a entrada na hora, sem pulseira"
                    onConfirm={(val) => {
                        const cod = (val || barcodeValue || '').trim();
                        if (cod) {
                            executarLeituraRapida(cod, 'checkin', 'barcode');
                            setBarcodeValue('');
                        }
                    }}
                    loading={loading}
                    autoFocus={!modoQuiosque}
                    onAbrirCamera={() => setLendoCamera(true)}
                />


                <Box sx={{ display: 'flex', alignItems: 'center', my: { xs: 1.5, sm: 2 } }}>
                    <Box sx={{ flex: 1, height: '1px', bgcolor: 'rgba(255,255,255,0.1)' }} />
                    <Typography variant="caption" sx={{ px: 1.25, color: 'rgba(255,255,255,0.55)', textAlign: 'center' }}>
                        ou procure pelo nome para vincular pulseira
                    </Typography>
                    <Box sx={{ flex: 1, height: '1px', bgcolor: 'rgba(255,255,255,0.1)' }} />
                </Box>

                <TextField
                    fullWidth
                    placeholder="Nome ou CPF (mínimo 3 letras)"
                    value={searchQuery}
                    onChange={(e) => handleSearch(e.target.value)}
                    inputProps={{ 'aria-label': 'Procurar participante por nome ou CPF' }}
                    InputProps={{
                        startAdornment: <SearchIcon sx={{ color: 'text.secondary', mr: 1 }} />,
                        sx: { borderRadius: 1.5, height: { xs: 44, sm: 48 }, fontSize: '1rem', bgcolor: 'rgba(255,255,255,0.03)' }
                    }}
                />

                <Box sx={{ mt: 1.5, flex: 1, overflowY: 'auto', minHeight: { xs: searchResults.length > 0 ? 180 : 0, lg: 0 }, maxHeight: { xs: 280, lg: 'none' } }}>
                    {searchResults.length > 0 ? (
                        <List disablePadding>
                            {searchResults.map(p => (
                                <ListItemButton
                                    key={p.id}
                                    onClick={() => setSelectedPessoa(p)}
                                    sx={{
                                        borderRadius: 1.5,
                                        mb: 1,
                                        p: 1.15,
                                        border: '1px solid rgba(255,255,255,0.06)',
                                        bgcolor: 'rgba(255,255,255,0.02)',
                                        '&:hover': {
                                            bgcolor: 'rgba(0, 212, 255, 0.08)',
                                            borderColor: 'rgba(0, 212, 255, 0.4)'
                                        }
                                    }}
                                >
                                    <Box sx={{ mr: 1.5 }}>
                                        <PessoaFoto
                                            src={p.foto_url}
                                            nome={p.nome}
                                            width={40}
                                            borderRadius="8px"
                                            accentColor="#00D4FF"
                                        />
                                    </Box>
                                    <ListItemText
                                        primary={p.nome}
                                        secondary={[p.cpf || 'Sem CPF', p.empresa_nome].filter(Boolean).join(' – ')}
                                        primaryTypographyProps={{ fontWeight: 700, fontSize: '0.9rem', noWrap: true }}
                                        secondaryTypographyProps={{ fontSize: '0.78rem', noWrap: true }}
                                    />
                                </ListItemButton>
                            ))}
                        </List>
                    ) : (
                        searchQuery.length >= 3 && !loading && (
                            <Typography variant="body2" sx={{ textAlign: 'center', opacity: 0.6, my: 2 }}>
                                Ninguém encontrado para &quot;{searchQuery}&quot;.
                            </Typography>
                        )
                    )}
                </Box>

                {/* Números do turno */}
                {!modoQuiosque && (
                    <Box sx={{ display: 'flex', gap: 1, mt: 1.5, pt: 1.5, borderTop: '1px solid rgba(255,255,255,0.08)' }}>
                        <NumeroTurno rotulo="Presentes" valor={realtimeStats?.presentes || 0} cor="#00D4FF" />
                        <NumeroTurno
                            rotulo="Aguardando envio"
                            valor={offlineCount}
                            cor={offlineCount > 0 ? '#FFB800' : 'rgba(255,255,255,0.85)'}
                            dica="Acessos feitos sem internet que ainda serão enviados"
                        />
                    </Box>
                )}
            </GlassCard>
        </Grid>

        {/* REGISTROS EM TEMPO REAL */}
        <Grid item xs={12} lg={8} sx={{ height: { xs: 'auto', lg: '100%' }, minHeight: { xs: 360, lg: 0 } }}>
            <GlassCard sx={{ p: { xs: 1.75, sm: 2.5 }, height: '100%', maxHeight: { xs: 520, lg: 'none' }, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
                <RecentAccessList
                    logs={recentLogs}
                    title="Entradas"
                    accentColor="#00D4FF"
                    badgeLabel="Entrada"
                    firstLabel="Última entrada"
                    emptyTitle="Nenhuma entrada registrada ainda"
                    emptySubtitle="Cada entrada aparece aqui na hora, com foto, empresa e pulseira."
                    acoes={<BotaoJanelaRegistros tipo="checkin" cor="#00D4FF" />}
                    onSelect={(log) => setCardLog(log)}
                />
            </GlassCard>
        </Grid>
      </Grid>

      {/* FEEDBACK OVERLAY GLOBAL */}
      {checkinResult && (
          <FeedbackOverlay status={checkinResult}>
              <Zoom in={!!checkinResult}>
                  <Box sx={{ textAlign: 'center', p: 2 }}>
                      {checkinResult === 'sucesso' ? <SuccessIcon sx={{ fontSize: { xs: 84, sm: 130 }, color: '#00FF88' }} /> : <ErrorIcon sx={{ fontSize: { xs: 84, sm: 130 }, color: '#FF3366' }} />}
                      <Typography fontWeight={700} mt={2} sx={{ fontSize: { xs: '1.65rem', sm: '2.5rem' } }}>
                          {checkinResult === 'sucesso' ? 'Entrada liberada' : 'Entrada negada'}
                      </Typography>
                      <Typography variant="h6" sx={{ opacity: 0.85, fontSize: { xs: '1rem', sm: '1.25rem' } }}>{resultMessage}</Typography>
                      {checkinResult === 'sucesso' && (
                          <Typography variant="h6" sx={{ mt: 1.5, opacity: 0.6, fontFamily: '"Inter", sans-serif', letterSpacing: 1.5 }}>
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
          permitirCamera
      />

      <LeitorQrCamera
          open={lendoCamera}
          onClose={() => setLendoCamera(false)}
          titulo="Entrada pela câmera"
          onLeitura={(cod) => executarLeituraRapida(cod, 'checkin', 'qrcode')}
      />

      {/* DIALOG DETALHADO DO CARD DO PARTICIPANTE */}
      <PessoaCardDialog
          open={!!cardLog}
          log={cardLog}
          onClose={() => setCardLog(null)}
          accentColor="#00D4FF"
      />

    </Box>
  );
};

export default Checkin;
