import React, { useEffect, useState } from 'react';
import {
    Dialog, DialogContent, Box, Typography, Stack, Grid,
    Chip, IconButton, Divider, Button,
    useTheme, useMediaQuery
} from '@mui/material';
import {
    Close as CloseIcon,
    CorporateFare as CompanyIcon,
    Badge as BadgeIcon,
    Fingerprint as CpfIcon,
    AccessTime as TimeIcon,
    Place as AreaIcon,
    CheckCircle as SuccessIcon,
    Cancel as BlockIcon,
    Sensors as PulseiraIcon,
    Phone as PhoneIcon,
    WarningAmber as WarningIcon,
    MeetingRoom as PortariaIcon
} from '@mui/icons-material';
import PessoaFoto from '../common/PessoaFoto';
import api from '../../services/api';

/**
 * Modal exclusivo para fiscais de portaria e controladores de acesso interno.
 * Exibe os dados da pessoa, horário de check-in, status de acesso,
 * número da pulseira e áreas autorizadas.
 */
const FiscalizacaoPessoaModal = ({
    open,
    onClose,
    pessoa,
    areaFiscalizada = null
}) => {
    const theme = useTheme();
    const isMobile = useMediaQuery(theme.breakpoints.down('sm'));
    const [detalhesCompletos, setDetalhesCompletos] = useState(null);
    const [_loading, setLoading] = useState(false);

    const pessoaId = pessoa?.id;

    useEffect(() => {
        if (!open || !pessoaId) {
            setDetalhesCompletos(null);
            return;
        }

        let cancelado = false;
        const fetchDetalhes = async () => {
            try {
                setLoading(true);
                const res = await api.get(`/pessoas/${pessoaId}`);
                if (!cancelado && res.data?.data) {
                    setDetalhesCompletos(res.data.data);
                }
            } catch (err) {
                // Mantém os dados que já vieram no payload da fiscalização
                console.debug('Usando dados diretos da fiscalização:', err.message);
            } finally {
                if (!cancelado) setLoading(false);
            }
        };

        fetchDetalhes();

        return () => {
            cancelado = true;
        };
    }, [open, pessoaId]);

    if (!open || !pessoa) return null;

    // Combina dados do payload da fiscalização com os detalhes da API
    const dados = detalhesCompletos || pessoa;

    const nome = dados.nome_completo || dados.nome || 'Participante';
    const fotoUrl = dados.foto_url;
    const funcao = dados.funcao || 'Participante';
    const empresa = dados.empresas?.nome || dados.empresa_nome || 'Pessoa Física / Não Informada';
    const pulseira = dados.numero_pulseira || 'Sem pulseira vinculada';
    const telefone = dados.telefone || null;

    // Formatação do CPF
    const rawCpf = (dados.cpf || '').replace(/\D/g, '');
    const cpfFormatado = rawCpf.length === 11
        ? `${rawCpf.slice(0, 3)}.${rawCpf.slice(3, 6)}.${rawCpf.slice(6, 9)}-${rawCpf.slice(9, 11)}`
        : (dados.cpf || 'Não informado');

    // Horário e Local de Check-in
    const horarioCheckin = dados.horario_checkin || null;
    const areaCheckin = dados.area_checkin || 'Portaria Principal';
    const metodoCheckin = dados.metodo_checkin || 'Scanner / RFID';

    const formatarDataHora = (isoStr) => {
        if (!isoStr) return null;
        try {
            const d = new Date(isoStr);
            return d.toLocaleTimeString('pt-BR', {
                hour: '2-digit',
                minute: '2-digit',
                second: '2-digit',
                day: '2-digit',
                month: '2-digit'
            });
        } catch {
            return isoStr;
        }
    };

    // Status do Acesso
    const isBloqueado = Boolean(dados.bloqueado);
    const motivoBloqueio = dados.motivo_bloqueio;
    const statusAcessoRaw = dados.status_acesso || '';
    const fezCheckin = statusAcessoRaw === 'checkin_feito' || statusAcessoRaw === 'presente' || Boolean(horarioCheckin);

    // Áreas Autorizadas
    const areasAutorizadas = dados.areas_autorizadas || dados.areas_permitidas || [];
    const areaAtualId = areaFiscalizada?.id;
    const temPermissaoAreaAtual = areaAtualId
        ? areasAutorizadas.some(a => (a.id === areaAtualId || a.area_id === areaAtualId))
        : true;

    // Cores de feedback
    const corTema = isBloqueado ? '#FF3366' : (!temPermissaoAreaAtual ? '#FFB800' : '#00FF88');

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
                    '&::-webkit-scrollbar': { width: '6px' },
                    '&::-webkit-scrollbar-thumb': { bgcolor: `${corTema}55`, borderRadius: '10px' }
                    }
            }}
        >
            <DialogContent sx={{ p: { xs: 2.5, sm: 4 }, position: 'relative' }}>
                {/* Botão Fechar */}
                <IconButton
                    onClick={onClose}
                    sx={{
                        position: 'absolute',
                        top: 16,
                        right: 16,
                        color: 'rgba(255,255,255,0.7)',
                        bgcolor: 'rgba(255,255,255,0.06)',
                        '&:hover': { bgcolor: 'rgba(255,255,255,0.18)', color: '#FFFFFF' }
                    }}
                >
                    <CloseIcon fontSize="small" />
                </IconButton>

                {/* Cabeçalho do Modal para Portarias & Controle Interno */}
                <Box sx={{ mb: 3 }}>
                    <Typography
                        variant="caption"
                        sx={{
                            color: '#00D4FF',
                            fontWeight: 700,
                            letterSpacing: '1.5px',
                            display: 'flex',
                            alignItems: 'center',
                            gap: 1
                        }}
                    >
                        <PortariaIcon sx={{ fontSize: 18 }} />
                        Ficha do participante
                    </Typography>
                </Box>

                <Grid container spacing={{ xs: 2.5, sm: 3.5 }} alignItems="flex-start">
                    {/* COLUNA ESQUERDA: FOTO, STATUS DE ACESSO E PULSEIRA */}
                    <Grid item xs={12} sm={4.5} sx={{ textAlign: 'center' }}>
                        <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                            <PessoaFoto
                                src={fotoUrl}
                                nome={nome}
                                width={isMobile ? 130 : 180}
                                borderRadius="16px"
                                accentColor={corTema}
                                borderWidth="3px"
                                boxShadow={`0 12px 35px rgba(0,0,0,0.8), 0 0 25px ${corTema}40`}
                            />

                            {/* STATUS DE ACESSO */}
                            <Box sx={{ mt: 2.5, width: '100%' }}>
                                {isBloqueado ? (
                                    <Box
                                        sx={{
                                            p: 1.5,
                                            borderRadius: 1.5,
                                            bgcolor: 'rgba(255, 51, 102, 0.15)',
                                            border: '1px solid #FF3366',
                                            display: 'flex',
                                            alignItems: 'center',
                                            justifyContent: 'center',
                                            gap: 1
                                        }}
                                    >
                                        <BlockIcon sx={{ color: '#FF3366', fontSize: 22 }} />
                                        <Box sx={{ textAlign: 'left' }}>
                                            <Typography variant="body2" sx={{ color: '#FF3366', fontWeight: 700, lineHeight: 1.1 }}>
                                                Acesso bloqueado
                                            </Typography>
                                            {motivoBloqueio && (
                                                <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.7)', fontSize: '0.75rem' }}>
                                                    {motivoBloqueio}
                                                </Typography>
                                            )}
                                        </Box>
                                    </Box>
                                ) : !temPermissaoAreaAtual && areaFiscalizada ? (
                                    <Box
                                        sx={{
                                            p: 1.5,
                                            borderRadius: 1.5,
                                            bgcolor: 'rgba(255, 184, 0, 0.15)',
                                            border: '1px solid #FFB800',
                                            display: 'flex',
                                            alignItems: 'center',
                                            justifyContent: 'center',
                                            gap: 1
                                        }}
                                    >
                                        <WarningIcon sx={{ color: '#FFB800', fontSize: 22 }} />
                                        <Box sx={{ textAlign: 'left' }}>
                                            <Typography variant="body2" sx={{ color: '#FFB800', fontWeight: 700, lineHeight: 1.1 }}>
                                                Área restrita
                                            </Typography>
                                            <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.7)', fontSize: '0.75rem' }}>
                                                Não autorizado para {areaFiscalizada.nome_area}
                                            </Typography>
                                        </Box>
                                    </Box>
                                ) : (
                                    <Box
                                        sx={{
                                            p: 1.5,
                                            borderRadius: 1.5,
                                            bgcolor: 'rgba(0, 255, 136, 0.15)',
                                            border: '1px solid #00FF88',
                                            display: 'flex',
                                            alignItems: 'center',
                                            justifyContent: 'center',
                                            gap: 1
                                        }}
                                    >
                                        <SuccessIcon sx={{ color: '#00FF88', fontSize: 22 }} />
                                        <Typography variant="body2" sx={{ color: '#00FF88', fontWeight: 700, letterSpacing: '0.5px' }}>
                                            Acesso liberado
                                        </Typography>
                                    </Box>
                                )}
                            </Box>

                            {/* NÚMERO DA PULSEIRA / RFID */}
                            <Box
                                sx={{
                                    mt: 2,
                                    width: '100%',
                                    p: 1.5,
                                    borderRadius: 1.5,
                                    bgcolor: 'rgba(0, 212, 255, 0.08)',
                                    border: '1px solid rgba(0, 212, 255, 0.25)',
                                    textAlign: 'center'
                                }}
                            >
                                <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.6)', fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 0.8 }}>
                                    <PulseiraIcon sx={{ fontSize: 16, color: '#00D4FF' }} />
                                    Número da pulseira / RFID
                                </Typography>
                                <Typography
                                    variant="h6"
                                    sx={{
                                        color: '#00D4FF',
                                        fontWeight: 700,
                                        fontFamily: '"Inter", sans-serif',
                                        letterSpacing: '1px',
                                        mt: 0.5
                                    }}
                                >
                                    {pulseira}
                                </Typography>
                            </Box>
                        </Box>
                    </Grid>

                    {/* COLUNA DIREITA: DADOS DA PESSOA, CHECK-IN E ÁREAS AUTORIZADAS */}
                    <Grid item xs={12} sm={7.5}>
                        {/* Nome do Participante */}
                        <Typography variant="h4" sx={{ fontWeight: 700, color: '#FFFFFF', fontFamily: '"Space Grotesk", sans-serif', lineHeight: 1.2, mb: 1 }}>
                            {nome}
                        </Typography>

                        {/* Chips Rápidos */}
                        <Stack direction="row" spacing={1} flexWrap="wrap" sx={{ gap: 1, mb: 2.5 }}>
                            <Chip
                                icon={<BadgeIcon sx={{ fontSize: 16, color: '#FFFFFF !important' }} />}
                                label={funcao}
                                sx={{ bgcolor: 'rgba(255,255,255,0.08)', color: '#FFFFFF', fontWeight: 700 }}
                            />
                            <Chip
                                icon={<CompanyIcon sx={{ fontSize: 16, color: '#00D4FF !important' }} />}
                                label={empresa}
                                sx={{ bgcolor: 'rgba(0,212,255,0.08)', color: '#00D4FF', border: '1px solid rgba(0,212,255,0.2)', fontWeight: 700 }}
                            />
                        </Stack>

                        <Divider sx={{ borderColor: 'rgba(255,255,255,0.08)', mb: 2.5 }} />

                        {/* 1. DADOS DA PESSOA */}
                        <Box sx={{ mb: 2.5 }}>
                            <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.5)', fontWeight: 700, letterSpacing: '1px', display: 'block', mb: 1.2 }}>
                                Dados cadastrais
                            </Typography>
                            <Grid container spacing={2}>
                                <Grid item xs={6}>
                                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                        <CpfIcon sx={{ color: '#00D4FF', fontSize: 18 }} />
                                        <Box>
                                            <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.5)', display: 'block' }}>CPF / Documento</Typography>
                                            <Typography variant="body2" sx={{ color: '#FFFFFF', fontWeight: 700, fontFamily: '"Inter", sans-serif' }}>
                                                {cpfFormatado}
                                            </Typography>
                                        </Box>
                                    </Box>
                                </Grid>
                                {telefone && (
                                    <Grid item xs={6}>
                                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                            <PhoneIcon sx={{ color: '#00D4FF', fontSize: 18 }} />
                                            <Box>
                                                <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.5)', display: 'block' }}>Telefone</Typography>
                                                <Typography variant="body2" sx={{ color: '#FFFFFF', fontWeight: 700 }}>
                                                    {telefone}
                                                </Typography>
                                            </Box>
                                        </Box>
                                    </Grid>
                                )}
                            </Grid>
                        </Box>

                        {/* 2. HORÁRIO DE CHECK-IN */}
                        <Box
                            sx={{
                                p: 2,
                                mb: 2.5,
                                borderRadius: 1.5,
                                bgcolor: fezCheckin ? 'rgba(0, 255, 136, 0.05)' : 'rgba(255, 184, 0, 0.05)',
                                border: '1px solid',
                                borderColor: fezCheckin ? 'rgba(0, 255, 136, 0.2)' : 'rgba(255, 184, 0, 0.2)'
                            }}
                        >
                            <Typography variant="caption" sx={{ color: fezCheckin ? '#00FF88' : '#FFB800', fontWeight: 700, letterSpacing: '0.8px', display: 'flex', alignItems: 'center', gap: 0.8, mb: 1 }}>
                                <TimeIcon sx={{ fontSize: 18 }} />
                                Horário de check-in no evento
                            </Typography>

                            {fezCheckin ? (
                                <Grid container spacing={2} alignItems="center">
                                    <Grid item xs={6}>
                                        <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.5)', display: 'block' }}>Data & hora de entrada</Typography>
                                        <Typography variant="body1" sx={{ color: '#00FF88', fontWeight: 700, fontFamily: '"Inter", sans-serif' }}>
                                            {formatarDataHora(horarioCheckin) || 'Check-in Realizado'}
                                        </Typography>
                                    </Grid>
                                    <Grid item xs={6}>
                                        <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.5)', display: 'block' }}>Local de acesso</Typography>
                                        <Typography variant="body2" sx={{ color: '#FFFFFF', fontWeight: 700 }}>
                                            {areaCheckin} ({metodoCheckin})
                                        </Typography>
                                    </Grid>
                                </Grid>
                            ) : (
                                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                    <Typography variant="body2" sx={{ color: '#FFB800', fontWeight: 700 }}>
                                        Ainda não realizou check-in na portaria do evento.
                                    </Typography>
                                </Box>
                            )}
                        </Box>

                        {/* 3. ÁREAS AUTORIZADAS */}
                        <Box>
                            <Typography
                                variant="caption"
                                sx={{
                                    color: '#00D4FF',
                                    fontWeight: 700,
                                    letterSpacing: '1px',
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: 0.8,
                                    mb: 1.2
                                }}
                            >
                                <AreaIcon sx={{ fontSize: 18 }} />
                                ÁREAS AUTORIZADAS PARA ESTA CREDENCIAL ({areasAutorizadas.length})
                            </Typography>

                            {areasAutorizadas.length === 0 ? (
                                <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.5)' }}>
                                    Nenhuma área específica cadastrada (acesso geral básico).
                                </Typography>
                            ) : (
                                <Stack direction="row" spacing={1} flexWrap="wrap" sx={{ gap: 1 }}>
                                    {areasAutorizadas.map((area, idx) => {
                                        const areaId = area.id || area.area_id;
                                        const nomeArea = area.nome_area || area.nome || (typeof area === 'string' ? area : 'Área');
                                        const isPostoAtual = areaAtualId && areaId === areaAtualId;

                                        return (
                                            <Chip
                                                key={idx}
                                                label={isPostoAtual ? `★ ${nomeArea} (POSTO ATUAL)` : nomeArea}
                                                size="small"
                                                sx={{
                                                    bgcolor: isPostoAtual ? 'rgba(0, 255, 136, 0.25)' : 'rgba(255,255,255,0.06)',
                                                    color: isPostoAtual ? '#00FF88' : '#FFFFFF',
                                                    border: isPostoAtual ? '1.5px solid #00FF88' : '1px solid rgba(255,255,255,0.15)',
                                                    fontWeight: isPostoAtual ? 900 : 600,
                                                    fontSize: '0.75rem',
                                                    py: 1.8
                                                }}
                                            />
                                        );
                                    })}
                                </Stack>
                            )}
                        </Box>
                    </Grid>
                </Grid>

                {/* Rodapé com botão de fechar */}
                <Box sx={{ mt: 3, pt: 2, borderTop: '1px solid rgba(255,255,255,0.08)', display: 'flex', justifyContent: 'flex-end' }}>
                    <Button
                        variant="outlined"
                        onClick={onClose}
                        sx={{
                            height: 38,
                            minHeight: 38,
                            color: '#FFFFFF',
                            borderColor: 'rgba(255,255,255,0.2)',
                            fontWeight: 700,
                            borderRadius: '8px',
                            fontSize: '0.8125rem',
                            px: 3,
                            '&:hover': { bgcolor: 'rgba(255,255,255,0.08)', borderColor: '#FFFFFF' }
                        }}
                    >
                        Fechar ficha
                    </Button>
                </Box>
            </DialogContent>
        </Dialog>
    );
};

export default FiscalizacaoPessoaModal;
