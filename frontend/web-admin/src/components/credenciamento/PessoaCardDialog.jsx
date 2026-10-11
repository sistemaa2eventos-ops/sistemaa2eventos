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
  Login as LoginIcon
} from '@mui/icons-material';
import PessoaFoto from '../common/PessoaFoto';
import { formatLocalDateTime } from '../../utils/dateUtils';
import api from '../../services/api';

const PessoaCardDialog = ({
  open,
  onClose,
  log,
  pessoaProp,
  accentColor = '#00D4FF'
}) => {
  const [detalhesPessoa, setDetalhesPessoa] = useState(null);
  const [_loading, setLoading] = useState(false);

  // Normalização preliminar com dados imediatos do log ou prop
  const pessoaBase = pessoaProp || log?.pessoas || (log?.pessoa_id ? { id: log.pessoa_id, nome: log.pessoa_nome } : null) || {};
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
        // Fallback silencioso mantendo os dados que já vieram no log
        console.debug('Usando dados em cache do log para exibição rápida:', err.message);
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

  // Unifica dados completos (API prioritária, fallback para log)
  const pessoa = detalhesPessoa || pessoaBase;
  const nome = pessoa.nome_completo || pessoa.nome || log?.pessoa_nome || 'Participante';
  const cpf = pessoa.cpf ? pessoa.cpf.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.***.***-$4') : (log?.cpf || 'Não informado');
  const empresa = pessoa.empresas?.nome || pessoa.empresa_nome || log?.empresa_nome || 'Geral / Não informada';
  const funcao = pessoa.funcao || log?.funcao || 'Operacional';
  const fotoUrl = pessoa.foto_url || log?.foto_capturada || log?.foto_url;
  const pulseira = pessoa.numero_pulseira || log?.numero_pulseira || log?.extra?.numero_pulseira;
  const statusAcesso = pessoa.status_acesso || (log?.tipo === 'checkout' ? 'fora' : 'checkin_feito');

  // Metadados do Registro
  const tipoAcesso = log?.tipo || log?.tipo_acesso || 'checkin';
  const isCheckout = tipoAcesso === 'checkout';
  const metodoAcesso = log?.metodo || 'Automático';
  const horarioRegistro = log?.created_at ? formatLocalDateTime(log.created_at) : null;
  const dispositivoNome = log?.dispositivo_nome || log?.dispositivo_id || 'Terminal Web';
  const areaNome = log?.area_nome || log?.evento_areas?.nome_area || 'Área Geral';
  const confianca = log?.confianca ? `${log.confianca}%` : null;

  return (
    <Dialog
      open={open}
      onClose={onClose}
      maxWidth="md"
      fullWidth
      PaperProps={{
        sx: {
          bgcolor: 'rgba(15, 23, 42, 0.95)',
          backdropFilter: 'blur(24px)',
          borderRadius: { xs: 3, sm: 4 },
          border: `1px solid ${accentColor}40`,
          boxShadow: `0 20px 50px rgba(0, 0, 0, 0.8), 0 0 30px ${accentColor}25`,
          color: '#FFFFFF',
          maxHeight: '90vh',
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

              <Stack direction="row" spacing={1} mt={2.5} flexWrap="wrap" justifyContent="center">
                <Chip
                  label={isCheckout ? 'Saída registrada' : (statusAcesso === 'checkin_feito' ? 'Credenciado' : 'AUTORIZADO')}
                  size="small"
                  sx={{
                    bgcolor: isCheckout ? 'rgba(255, 51, 102, 0.2)' : 'rgba(0, 255, 136, 0.15)',
                    color: isCheckout ? '#FF3366' : '#00FF88',
                    border: `1px solid ${isCheckout ? '#FF3366' : '#00FF88'}`,
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

          {/* COLUNA DIREITA: DADOS DO PARTICIPANTE E LOG */}
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
              </Stack>

              {/* CARD DETALHADO DO ÚLTIMO REGISTRO */}
              {log && (
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
                    Último Acesso Registrado
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
                          <Typography variant="caption" color="text.secondary" display="block">Dispositivo / Método</Typography>
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
              )}
            </Box>
          </Grid>
        </Grid>
      </DialogContent>
    </Dialog>
  );
};

export default PessoaCardDialog;
