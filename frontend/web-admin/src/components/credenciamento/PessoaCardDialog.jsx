import React, { useEffect, useState } from 'react';
import {
  Dialog, DialogContent, Box, Typography, Stack, Grid,
  Chip, IconButton
} from '@mui/material';
import {
  Close as CloseIcon,
  CorporateFare as CompanyIcon,
  Badge as BadgeIcon,
  Fingerprint as CpfIcon,
  AccessTime as TimeIcon,
  Sensors as TerminalIcon,
  Place as AreaIcon,
  ExitToApp as LogoutIcon,
  Login as LoginIcon,
  Phone as PhoneIcon,
  Email as EmailIcon,
  Event as EventIcon,
  MeetingRoom as RoomIcon
} from '@mui/icons-material';
import PessoaFoto from '../common/PessoaFoto';
import { formatLocalDateTime } from '../../utils/dateUtils';
import api from '../../services/api';
import useFecharComVoltar from '../../hooks/useFecharComVoltar';

const PessoaCardDialog = ({
  open,
  onClose,
  log,
  pessoa,
  pessoaProp,
  accentColor = '#00D4FF'
}) => {
  const [detalhesPessoa, setDetalhesPessoa] = useState(null);
  const [_loading, setLoading] = useState(false);
  useFecharComVoltar(open, onClose);

  // Normalização preliminar com dados imediatos do log ou prop (compatível com 'pessoa' e 'pessoaProp')
  const propPessoa = pessoa || pessoaProp;
  const pessoaBase = propPessoa || log?.pessoas || (log?.pessoa_id ? { id: log.pessoa_id, nome: log.pessoa_nome } : null) || {};
  const pessoaId = pessoaBase?.id || log?.pessoa_id;

  useEffect(() => {
    if (!open || !pessoaId) {
      setDetalhesPessoa(null);
      return;
    }

    let isCancelled = false;
    const fetchDetalhes = async () => {
      try {
        setLoading(true);
        const res = await api.get(`/pessoas/${pessoaId}`);
        if (!isCancelled && res.data?.success && res.data?.data) {
          setDetalhesPessoa(res.data.data);
        }
      } catch (err) {
        // Fallback silencioso mantendo os dados que já vieram no log ou card
        console.debug('Usando dados imediatos do participante:', err.message);
      } finally {
        if (!isCancelled) setLoading(false);
      }
    };

    fetchDetalhes();

    return () => {
      isCancelled = true;
    };
  }, [open, pessoaId]);

  if (!open) return null;

  // Unifica dados completos (API prioritária, fallback inteligente para dados imediatos da lista)
  const pessoaDados = { ...pessoaBase, ...(detalhesPessoa || {}) };
  const nome = pessoaDados.nome_completo || pessoaDados.nome || log?.pessoa_nome || 'Participante';
  const cpf = pessoaDados.cpf ? pessoaDados.cpf.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.***.***-$4') : (log?.cpf || 'Não informado');
  const empresa = pessoaDados.empresas?.nome || pessoaDados.empresa_nome || log?.empresa_nome || 'Geral / Não informada';
  const funcao = pessoaDados.funcao || log?.funcao || 'Operacional';
  const fotoUrl = pessoaDados.foto_url || log?.foto_capturada || log?.foto_url;
  const pulseira = pessoaDados.numero_pulseira || log?.numero_pulseira || log?.extra?.numero_pulseira;
  const statusAcesso = pessoaDados.status_acesso || (log?.tipo === 'checkout' ? 'fora' : (log ? 'checkin_feito' : 'cadastrado'));
  const telefone = pessoaDados.telefone || pessoaDados.celular || null;
  const email = pessoaDados.email || null;
  const dataCadastro = pessoaDados.created_at ? formatLocalDateTime(pessoaDados.created_at) : null;
  const areasAutorizadas = pessoaDados.areas_autorizadas || [];

  // Metadados do Registro
  const tipoAcesso = log?.tipo || log?.tipo_acesso || (pessoaDados.horario_checkin ? 'checkin' : null);
  const isCheckout = tipoAcesso === 'checkout';
  const metodoAcesso = log?.metodo || pessoaDados.metodo_checkin || 'Automático';
  const horarioRegistro = log?.created_at
    ? formatLocalDateTime(log.created_at)
    : (pessoaDados.horario_checkin ? formatLocalDateTime(pessoaDados.horario_checkin) : null);
  const dispositivoNome = log?.dispositivo_nome || log?.dispositivo_id || (pessoaDados.horario_checkin ? 'Terminal de Acesso' : 'Terminal Web');
  const areaNome = log?.area_nome || log?.evento_areas?.nome_area || pessoaDados.area_checkin || 'Área Geral';
  const confianca = log?.confianca ? `${log.confianca}%` : null;

  // Definição visual do status
  const isBloqueado = Boolean(pessoaDados.bloqueado);
  const isSaida = isCheckout || statusAcesso === 'checkout_feito' || statusAcesso === 'fora';
  const isPresente = statusAcesso === 'checkin_feito' || (!isCheckout && tipoAcesso === 'checkin');
  const isPendente = statusAcesso === 'pendente';

  let statusLabel = 'Cadastrado';
  let statusColor = '#00D4FF';
  let statusBg = 'rgba(0, 212, 255, 0.15)';

  if (isBloqueado) {
    statusLabel = 'Bloqueado';
    statusColor = '#FF3366';
    statusBg = 'rgba(255, 51, 102, 0.2)';
  } else if (isSaida) {
    statusLabel = 'Saída registrada';
    statusColor = '#FF3366';
    statusBg = 'rgba(255, 51, 102, 0.2)';
  } else if (isPresente) {
    statusLabel = 'Credenciado / No evento';
    statusColor = '#00FF88';
    statusBg = 'rgba(0, 255, 136, 0.15)';
  } else if (isPendente) {
    statusLabel = 'Aguardando Credenciamento';
    statusColor = '#FFB800';
    statusBg = 'rgba(255, 184, 0, 0.15)';
  } else {
    statusLabel = 'Autorizado';
    statusColor = '#00FF88';
    statusBg = 'rgba(0, 255, 136, 0.15)';
  }

  const temRegistroAcesso = Boolean(log || pessoaDados.horario_checkin);

  return (
    <Dialog
      open={open}
      onClose={onClose}
      maxWidth="md"
      fullWidth
      PaperProps={{
        sx: {
          color: '#FFFFFF',
          maxHeight: { sm: '90dvh' },
          overflowY: 'auto',
          '&::-webkit-scrollbar': { width: 6 },
          '&::-webkit-scrollbar-thumb': { bgcolor: `${accentColor}40`, borderRadius: 1.5 }
        }
      }}
    >
      <DialogContent sx={{ p: { xs: 2.5, sm: 4 }, position: 'relative' }}>
        {/* Botão Fechar no Canto */}
        <IconButton
          onClick={onClose}
          sx={{
            position: 'absolute',
            top: 16,
            right: 16,
            color: 'rgba(255,255,255,0.7)',
            bgcolor: 'rgba(255,255,255,0.05)',
            '&:hover': { bgcolor: 'rgba(255,255,255,0.15)', color: '#FFFFFF' }
          }}
        >
          <CloseIcon fontSize="small" />
        </IconButton>

        <Grid container spacing={3.5} alignItems="center">
          {/* COLUNA ESQUERDA: FOTO RETANGULAR E STATUS */}
          <Grid item xs={12} sm={4.5} sx={{ textAlign: 'center' }}>
            <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
              <PessoaFoto
                src={fotoUrl}
                nome={nome}
                width={190}
                borderRadius="18px"
                accentColor={accentColor}
                borderWidth="3px"
                boxShadow={`0 10px 30px rgba(0,0,0,0.7), 0 0 25px ${accentColor}35`}
              />

              <Stack direction="row" spacing={1} mt={2.5} flexWrap="wrap" justifyContent="center" gap={1}>
                <Chip
                  label={statusLabel}
                  size="small"
                  sx={{
                    bgcolor: statusBg,
                    color: statusColor,
                    border: `1px solid ${statusColor}`,
                    fontWeight: 700,
                    letterSpacing: 0.5,
                    height: 26
                  }}
                />

                {pulseira && (
                  <Chip
                    label={`PULSEIRA #${pulseira}`}
                    size="small"
                    sx={{
                      bgcolor: 'rgba(255,255,255,0.08)',
                      color: '#FFFFFF',
                      border: '1px solid rgba(255,255,255,0.2)',
                      fontWeight: 700,
                      height: 26
                    }}
                  />
                )}
              </Stack>
            </Box>
          </Grid>

          {/* COLUNA DIREITA: DADOS DO PARTICIPANTE E ACESSO */}
          <Grid item xs={12} sm={7.5}>
            <Box>
              <Typography variant="overline" sx={{ color: accentColor, fontWeight: 700, letterSpacing: 1.5 }}>
                Cadastro de participante
              </Typography>
              <Typography variant="h4" fontWeight={700} color="#FFFFFF" sx={{ lineHeight: 1.15, mb: 1 }}>
                {nome}
              </Typography>

              <Stack spacing={1.2} mt={2}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.2 }}>
                  <CpfIcon sx={{ color: accentColor, fontSize: 20 }} />
                  <Typography variant="body2" sx={{ color: 'rgba(255,255,255,0.6)' }}>CPF:</Typography>
                  <Typography variant="body2" fontWeight={700} color="#FFFFFF">{cpf}</Typography>
                </Box>

                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.2 }}>
                  <CompanyIcon sx={{ color: accentColor, fontSize: 20 }} />
                  <Typography variant="body2" sx={{ color: 'rgba(255,255,255,0.6)' }}>Empresa:</Typography>
                  <Typography variant="body2" fontWeight={700} color="#FFFFFF">{empresa}</Typography>
                </Box>

                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.2 }}>
                  <BadgeIcon sx={{ color: accentColor, fontSize: 20 }} />
                  <Typography variant="body2" sx={{ color: 'rgba(255,255,255,0.6)' }}>Função:</Typography>
                  <Typography variant="body2" fontWeight={700} color="#FFFFFF">{funcao}</Typography>
                </Box>

                {telefone && (
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.2 }}>
                    <PhoneIcon sx={{ color: accentColor, fontSize: 20 }} />
                    <Typography variant="body2" sx={{ color: 'rgba(255,255,255,0.6)' }}>Telefone:</Typography>
                    <Typography variant="body2" fontWeight={700} color="#FFFFFF">{telefone}</Typography>
                  </Box>
                )}

                {email && (
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.2 }}>
                    <EmailIcon sx={{ color: accentColor, fontSize: 20 }} />
                    <Typography variant="body2" sx={{ color: 'rgba(255,255,255,0.6)' }}>E-mail:</Typography>
                    <Typography variant="body2" fontWeight={700} color="#FFFFFF">{email}</Typography>
                  </Box>
                )}

                {dataCadastro && (
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.2 }}>
                    <EventIcon sx={{ color: accentColor, fontSize: 20 }} />
                    <Typography variant="body2" sx={{ color: 'rgba(255,255,255,0.6)' }}>Cadastrado em:</Typography>
                    <Typography variant="body2" fontWeight={700} color="#FFFFFF">{dataCadastro}</Typography>
                  </Box>
                )}

                {areasAutorizadas && areasAutorizadas.length > 0 && (
                  <Box sx={{ mt: 1 }}>
                    <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.6)', display: 'block', mb: 0.5 }}>
                      Áreas autorizadas:
                    </Typography>
                    <Stack direction="row" spacing={0.8} flexWrap="wrap" gap={0.8}>
                      {areasAutorizadas.map((area) => (
                        <Chip
                          key={area.id || area.nome_area}
                          label={area.nome_area}
                          size="small"
                          sx={{
                            bgcolor: 'rgba(0, 212, 255, 0.08)',
                            color: '#00D4FF',
                            border: '1px solid rgba(0, 212, 255, 0.25)',
                            fontSize: '0.75rem',
                            height: 22
                          }}
                        />
                      ))}
                    </Stack>
                  </Box>
                )}
              </Stack>

              {/* CARD DETALHADO DO ÚLTIMO REGISTRO OU STATUS DE PRESENÇA */}
              {temRegistroAcesso ? (
                <Box
                  sx={{
                    mt: 3,
                    p: 2,
                    bgcolor: 'rgba(255,255,255,0.03)',
                    borderRadius: 1.5,
                    border: '1px solid rgba(255,255,255,0.08)'
                  }}
                >
                  <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.5)', letterSpacing: 1, display: 'block', mb: 1.2, fontWeight: 700 }}>
                    Último acesso registrado
                  </Typography>

                  <Grid container spacing={2}>
                    {horarioRegistro && (
                      <Grid item xs={6}>
                        <Stack direction="row" spacing={1} alignItems="center">
                          <TimeIcon sx={{ color: accentColor, fontSize: 16 }} />
                          <Box>
                            <Typography variant="caption" color="text.secondary" display="block">Horário</Typography>
                            <Typography variant="body2" fontWeight={700}>{horarioRegistro}</Typography>
                          </Box>
                        </Stack>
                      </Grid>
                    )}

                    <Grid item xs={6}>
                      <Stack direction="row" spacing={1} alignItems="center">
                        {isCheckout ? <LogoutIcon sx={{ color: '#FF3366', fontSize: 16 }} /> : <LoginIcon sx={{ color: '#00FF88', fontSize: 16 }} />}
                        <Box>
                          <Typography variant="caption" color="text.secondary" display="block">Operação</Typography>
                          <Typography variant="body2" fontWeight={700} color={isCheckout ? '#FF3366' : '#00FF88'}>
                            {isCheckout ? 'Saída (Checkout)' : 'Entrada (Check-in)'}
                          </Typography>
                        </Box>
                      </Stack>
                    </Grid>

                    <Grid item xs={6}>
                      <Stack direction="row" spacing={1} alignItems="center">
                        <TerminalIcon sx={{ color: accentColor, fontSize: 16 }} />
                        <Box>
                          <Typography variant="caption" color="text.secondary" display="block">Dispositivo / método</Typography>
                          <Typography variant="body2" fontWeight={600} noWrap sx={{ maxWidth: 160 }}>
                            {dispositivoNome} ({metodoAcesso})
                          </Typography>
                        </Box>
                      </Stack>
                    </Grid>

                    <Grid item xs={6}>
                      <Stack direction="row" spacing={1} alignItems="center">
                        <AreaIcon sx={{ color: accentColor, fontSize: 16 }} />
                        <Box>
                          <Typography variant="caption" color="text.secondary" display="block">Área</Typography>
                          <Typography variant="body2" fontWeight={600}>{areaNome}</Typography>
                        </Box>
                      </Stack>
                    </Grid>

                    {confianca && (
                      <Grid item xs={12}>
                        <Typography variant="caption" color="text.secondary">
                          Assertividade Biométrica: <b>{confianca}</b>
                        </Typography>
                      </Grid>
                    )}
                  </Grid>
                </Box>
              ) : (
                <Box
                  sx={{
                    mt: 3,
                    p: 2,
                    bgcolor: 'rgba(0, 212, 255, 0.03)',
                    borderRadius: 1.5,
                    border: '1px dashed rgba(0, 212, 255, 0.2)',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 1.5
                  }}
                >
                  <RoomIcon sx={{ color: accentColor, fontSize: 24, opacity: 0.8 }} />
                  <Box>
                    <Typography variant="caption" sx={{ color: accentColor, fontWeight: 700, display: 'block' }}>
                      Status de presença
                    </Typography>
                    <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.7)' }}>
                      Nenhum registro de acesso hoje • Aguardando primeira entrada na portaria
                    </Typography>
                  </Box>
                </Box>
              )}
            </Box>
          </Grid>
        </Grid>
      </DialogContent>
    </Dialog>
  );
};

export default PessoaCardDialog;
