import React, { useState, useMemo, useCallback } from 'react';
import {
  Box, Typography, Grid,
  List, ListItem, ListItemText,
  ListItemButton, Zoom, Tooltip, LinearProgress
} from '@mui/material';
import {
  QrCodeScanner as ScannerIcon,
  CheckCircle as SuccessIcon, Cancel as ErrorIcon
} from '@mui/icons-material';
import { styled } from '@mui/material/styles';

import GlassCard from '../components/common/GlassCard';
import LeitorQrCamera from '../components/common/LeitorQrCameraSobDemanda';
import UniversalPulseiraInput from '../components/common/UniversalPulseiraInput';
import CabecalhoOperacao, { BotaoJanelaRegistros } from '../components/credenciamento/CabecalhoOperacao';
import ModalCredenciamento from '../components/credenciamento/ModalCredenciamento';
import PessoaFoto from '../components/common/PessoaFoto';
import PessoaCardDialog from '../components/credenciamento/PessoaCardDialog';
import PreviewEtiquetaDialog from '../components/credenciamento/PreviewEtiquetaDialog';
import RecentAccessList from '../components/credenciamento/RecentAccessList';
import { useCheckin } from '../hooks/useCheckin';
import { useAuth } from '../contexts/AuthContext';
import { carregarConfigEtiqueta } from '../services/etiquetaService';
import CorrigirTurnoDialog from '../components/checkin/CorrigirTurnoDialog';
import AvisoEntradaBloqueada from '../components/checkin/AvisoEntradaBloqueada';
import AcoesPulseiraCheckin from '../components/checkin/AcoesPulseiraCheckin';
import RecusadosSincronizacao from '../components/checkin/RecusadosSincronizacao';
import PassagensRecusadas from '../components/checkin/PassagensRecusadas';
import RelogioSincronizado from '../components/common/RelogioSincronizado';

const FeedbackOverlay = styled(Box, { shouldForwardProp: (p) => p !== 'status' })(({ status }) => ({
    position: 'absolute', top: 0, left: 0, width: '100%', height: '100%',
    background: status === 'sucesso' ? 'rgba(0,255,136,0.15)' : 'rgba(255,51,102,0.15)',
    zIndex: 90, display: 'flex', flexDirection: 'column', alignItems: 'center', 
    justifyContent: 'center', borderRadius: 12, border: status === 'sucesso' ? '4px solid #00FF88' : '4px solid #FF3366',
    backdropFilter: 'blur(8px)', animation: 'fadeIn 0.3s cubic-bezier(0.4, 0, 0.2, 1)'
}));

// Quem pode liberar a reentrada de quem saiu da área que controla entrada (o backend confere de novo)
const PERFIS_LIBERAM_REENTRADA = ['admin_master', 'master', 'admin', 'supervisor', 'operador'];

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
    searchQuery, handleSearch, searchResults, searchLoading,
    recentLogs, realtimeStats, offlineCount,
    areaId, changeAreaId, eventAreas, pulseiraTypes,
    performCheckin,
    abrirConferenciaPorCodigo,
    handleLinkPulseiraAndCheckin,
    eventoId,
    // Vínculo Facial (Fase 1)
    sessaoAtiva,
    dispositivosDisponiveis,
    camerasDisponiveis,
    loadingSessao,
    vincularLeitor,
    desvincularLeitor,
    carregarDispositivosDisponiveis,
    turnoAnterior, confirmarTurnoAnterior, cancelarTurnoAnterior,
    // Entrada bloqueada numa área que controla entrada (409 ENTRADA_BLOQUEADA)
    bloqueioEntrada, liberarReentrada, liberandoReentrada, registrarSaidaFicha, cancelarBloqueioEntrada,
  } = useCheckin(undefined, { logsTipo: 'checkin' });
  const { user } = useAuth();
  const podeLiberarReentrada = PERFIS_LIBERAM_REENTRADA.includes(user?.nivel_acesso);


  const [cardLog, setCardLog] = useState(null);
  // Estáveis entre renderizações: a lista (memo) não redesenha as 50 linhas à toa
  const abrirCardLog = useCallback((log) => setCardLog(log), []);
  const acoesLista = useMemo(() => <BotaoJanelaRegistros tipo="checkin" cor="#00D4FF" />, []);
  const [barcodeValue, setBarcodeValue] = useState('');
  const [ultimoCodigoLido, setUltimoCodigoLido] = useState('');
  const [lendoCamera, setLendoCamera] = useState(false);

  // Regra decidida: código (QR, código de barras, câmera, ou CPF/número digitado + Enter) neste campo só
  // LOCALIZA a pessoa e abre a janela de conferência. A entrada é registrada dentro da janela.
  const processarCheckinCodigo = (codigoBruto) => {
    const cod = String(codigoBruto || '').trim();
    if (!cod) return;
    setBarcodeValue(''); // campo vazio: o próximo bipe não gruda no anterior
    setUltimoCodigoLido(cod); // o código lido aparece no badge "Código lido"
    handleSearch('');
    abrirConferenciaPorCodigo(cod);
  };

  // Enter/OK no campo. Texto com letras digitado é nome: só mostra a lista para escolher a pessoa.
  // Código ou CPF digitado + Enter: localiza e abre a janela de conferência.
  const confirmarCampo = (val, origem) => {
    const texto = String(val || '').trim();
    if (!texto) return undefined;
    if (origem !== 'barcode' && origem !== 'camera' && /[A-Za-zÀ-ÿ]/.test(texto)) {
      const buscaDesteTexto = !searchLoading && searchQuery.trim() === texto;
      if (buscaDesteTexto && searchResults.length === 1) {
        setSelectedPessoa(searchResults[0]);
      } else if (searchQuery.trim() !== texto) {
        handleSearch(texto);
      }
      setBarcodeValue('');
      return undefined;
    }
    return processarCheckinCodigo(texto, origem);
  };

  // Controle de Impressão de Etiqueta / Cartão PVC no Check-in
  const [imprimirAtivo, setImprimirAtivo] = useState(() => {
    return localStorage.getItem('nzt_imprimir_checkin') === 'true';
  });
  const [previewEtiquetaPessoaId, setPreviewEtiquetaPessoaId] = useState(null);

  const handleToggleImprimir = (checked) => {
    setImprimirAtivo(checked);
    localStorage.setItem('nzt_imprimir_checkin', checked ? 'true' : 'false');
  };

  // Confirmação de credenciamento do modal (Fase 2)
  const handleConfirmarCredenciamento = async ({ pessoa_id, numero_pulseira, tipo_pulseira_id }) => {
    if (manualSaving || loading || !pessoa_id) return;
    let resultado = null;
    if (tipo_pulseira_id && numero_pulseira) {
      resultado = await handleLinkPulseiraAndCheckin(pessoa_id, tipo_pulseira_id, numero_pulseira);
    } else if (numero_pulseira) {
      resultado = await performCheckin('pulseira', numero_pulseira, pessoa_id);
    } else {
      resultado = await performCheckin('manual', null, pessoa_id);
    }

    // Etiqueta sai uma vez só: quando o evento imprime sozinho no check-in, o hook já imprimiu
    // (imprimirSeEntrada); a prévia só abre se a impressão do evento estiver desligada.
    // Vínculo de pulseira que falhou (false) não abre prévia.
    if (imprimirAtivo && resultado !== false) {
      const { imprimir } = await carregarConfigEtiqueta(eventoId).catch(() => ({ imprimir: false }));
      if (!imprimir) setPreviewEtiquetaPessoaId(pessoa_id);
    }
    return resultado;
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
          imprimirAtivo={imprimirAtivo}
          onToggleImprimir={handleToggleImprimir}
      />

      {/* Entrada pelo rosto bloqueada (área de portão): aviso sem abrir a ficha */}
      {!selectedPessoa && bloqueioEntrada && (
          <AvisoEntradaBloqueada
              bloqueio={bloqueioEntrada}
              podeLiberar={podeLiberarReentrada}
              liberando={liberandoReentrada}
              onLiberar={liberarReentrada}
              onFechar={cancelarBloqueioEntrada}
          />
      )}

      <Grid container spacing={{ xs: 1.5, sm: 2 }} sx={{ flex: 1, minHeight: 0 }}>

        {/* OPERAÇÃO: campo único unificado (leitor QR/barras, pulseira, CPF e busca por nome) */}
        <Grid item xs={12} lg={4} sx={{ height: { lg: '100%' } }}>
            <GlassCard sx={{ p: { xs: 1.75, sm: 2.5 }, height: '100%', display: 'flex', flexDirection: 'column', minHeight: 0 }}>
                <UniversalPulseiraInput
                    value={barcodeValue}
                    onChange={(val) => {
                        setBarcodeValue(val);
                        handleSearch(val);
                    }}
                    onClear={() => {
                        setBarcodeValue('');
                        handleSearch('');
                    }}
                    accentColor="#00FF88"
                    label="Leitor, CPF ou nome"
                    placeholder="Bipe QR/barras, digite o CPF ou o nome..."
                    helperText="Bipe ou câmera: check-in automático • Digitação: Enter ou OK • Nome: escolha na lista"
                    pulseiraTypes={pulseiraTypes}
                    ultimoCodigoLido={ultimoCodigoLido}
                    onConfirm={confirmarCampo}
                    // Só o loading da ação: a busca por nome não pode travar o campo no meio de um bipe
                    loading={loading}
                    autoFocus={!modoQuiosque}
                    onAbrirCamera={() => setLendoCamera(true)}
                />
                {/* Busca por nome em andamento: barra fina com altura fixa (nada pula) */}
                <Box sx={{ height: 3, mt: 0.75 }} aria-live="polite">
                    {searchLoading && <LinearProgress aria-label="Buscando" sx={{ height: 3, borderRadius: 2, bgcolor: 'rgba(0,255,136,0.12)', '& .MuiLinearProgress-bar': { bgcolor: '#00FF88' } }} />}
                </Box>

                <Box sx={{ mt: 1.5, flex: 1, overflowY: 'auto', minHeight: { xs: searchResults.length > 0 ? 180 : 0, lg: 0 }, maxHeight: { xs: 280, lg: 'none' } }}>
                    {searchResults.length > 0 ? (
                        <List disablePadding>
                            {searchResults.map(p => (
                                <ListItem
                                    key={p.id}
                                    disablePadding
                                    sx={{ mb: 1, pr: p.numero_pulseira ? 5 : 0 }}
                                    secondaryAction={p.numero_pulseira
                                        ? <AcoesPulseiraCheckin pessoa={{ id: p.id, nome: p.nome, numero_pulseira: p.numero_pulseira }} onAtualizado={() => handleSearch(searchQuery)} />
                                        : null}
                                >
                                <ListItemButton
                                    onClick={() => {
                                        setSelectedPessoa(p);
                                        setBarcodeValue('');
                                    }}
                                    sx={{
                                        borderRadius: 1.5,
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
                                            pessoaId={p.id}
                                            nome={p.nome}
                                            width={40}
                                            borderRadius="8px"
                                            accentColor="#00D4FF"
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
                    ) : (
                        searchQuery.trim().length >= 2 && !searchLoading && (
                            <Typography variant="body2" sx={{ textAlign: 'center', opacity: 0.6, my: 2 }}>
                                Ninguém encontrado para &quot;{searchQuery}&quot;.
                            </Typography>
                        )
                    )}
                </Box>

                {/* Passagens que o servidor recusou (pendentes neste evento): somem quando resolvidas */}
                <PassagensRecusadas eventoId={eventoId} />

                {/* Acessos feitos sem internet que o servidor recusou: ficam até o operador dispensar */}
                <RecusadosSincronizacao />

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
                    acoes={acoesLista}
                    onSelect={abrirCardLog}
                />
            </GlassCard>
        </Grid>
      </Grid>

      {/* Saída de um dia anterior: confirmar o horário */}
      <CorrigirTurnoDialog turno={turnoAnterior} onConfirmar={confirmarTurnoAnterior} onCancelar={cancelarTurnoAnterior} />

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
                              <RelogioSincronizado formato="hora" />
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
          bloqueioEntrada={selectedPessoa ? bloqueioEntrada : null}
          onLiberarReentrada={liberarReentrada}
          liberandoReentrada={liberandoReentrada}
          podeLiberarReentrada={podeLiberarReentrada}
          onRegistrarSaida={registrarSaidaFicha}
      />

      <LeitorQrCamera
          open={lendoCamera}
          onClose={() => setLendoCamera(false)}
          titulo="Entrada pela câmera"
          instrucao="Aponte a câmera para o QR Code ou código de barras da pulseira ou do crachá — o check-in será concluído automaticamente."
          onLeitura={(cod) => {
              setLendoCamera(false);
              processarCheckinCodigo(cod, 'camera');
          }}
      />

      {/* MODAL DE PRÉ-VISUALIZAÇÃO DA ETIQUETA / CARTÃO */}
      <PreviewEtiquetaDialog
          open={!!previewEtiquetaPessoaId}
          pessoaId={previewEtiquetaPessoaId}
          eventoId={eventoId}
          onClose={() => setPreviewEtiquetaPessoaId(null)}
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
