import React, { useState } from 'react';
import { Box, Typography, Grid, Chip, CircularProgress, IconButton } from '@mui/material';
import PlayCircleOutlineIcon from '@mui/icons-material/PlayCircleOutline';
import AccessTimeIcon from '@mui/icons-material/AccessTime';
import WarningAmberIcon from '@mui/icons-material/WarningAmber';
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline';
import SettingsSuggestIcon from '@mui/icons-material/SettingsSuggest';
import { useSnackbar } from 'notistack';
import api from '../../services/api';

import PageHeader from '../../components/common/PageHeader';
import GlassCard from '../../components/common/GlassCard';
import NeonButton from '../../components/common/NeonButton';

const ConfigCron = () => {
    const { enqueueSnackbar } = useSnackbar();
    const [isRunningFechamento, setIsRunningFechamento] = useState(false);

    const handleDispararFechamento = async () => {
        if (!window.confirm("Atenção! Esta ação forçará o Checkout de TODOS os participantes que ainda constam como 'Dentro do Evento' / 'Checkin Feito'. Isso conclui o turno de hoje. Deseja prosseguir?")) {
            return;
        }

        setIsRunningFechamento(true);
        try {
            const { data } = await api.post('/eventos/reset/manual');
            enqueueSnackbar(data.message || 'Turno fechado com sucesso.', { variant: 'success' });
        } catch (error) {
            console.error("Erro ao disparar fechamento manual", error);
            enqueueSnackbar(error.response?.data?.error || 'Erro interno ao processar CRON.', { variant: 'error' });
        } finally {
            setIsRunningFechamento(false);
        }
    };

    return (
        <Box sx={{ p: { xs: 2, md: 4 } }}>
            <PageHeader
                title="Sistema & Automação (CRON)"
                subtitle="Painel de visualização e manipulação manual dos Jobs em segundo plano que regem as políticas temporais do evento."
                breadcrumbs={[{ text: 'Sistema' }, { text: 'Configurações' }, { text: 'Automação' }]}
            />

            <Grid container spacing={4} sx={{ mt: 1 }}>

                {/* Fechamento Diário */}
                <Grid item xs={12} lg={6}>
                    <GlassCard sx={{ p: 4, height: '100%', display: 'flex', flexDirection: 'column', position: 'relative', overflow: 'hidden' }}>
                        <Box sx={{ position: 'absolute', top: 10, right: 10, opacity: 0.05 }}>
                            <AccessTimeIcon sx={{ fontSize: 140, color: '#fff' }} />
                        </Box>

                        <Box sx={{ mb: 3, position: 'relative', zIndex: 1 }}>
                            <Typography variant="h6" sx={{ fontWeight: 800, color: '#fff', display: 'flex', alignItems: 'center', gap: 1 }}>
                                Fechamento de Turno Diário
                            </Typography>
                            <Box sx={{ display: 'flex', gap: 1, mt: 1 }}>
                                <Chip label="0 3 * * *" size="small" sx={{ bgcolor: 'rgba(0,212,255,0.1)', color: '#00D4FF', fontFamily: 'monospace', fontWeight: 'bold' }} />
                                <Chip label="Diário às 03:00am" size="small" sx={{ bgcolor: 'rgba(0,255,100,0.1)', color: '#00FF66', fontWeight: 'bold' }} />
                            </Box>
                        </Box>

                        <Typography variant="body2" sx={{ color: 'text.secondary', mb: 4, flexGrow: 1, position: 'relative', zIndex: 1, lineHeight: 1.7 }}>
                            Esta rotina varre o banco de dados em busca de participantes que efetuaram Check-in mas não realizaram o Check-out no mesmo dia. Ela força a transição do status para evitar catracas travadas por "Dupla Entrada" no dia seguinte.
                        </Typography>

                        <Box sx={{ position: 'relative', zIndex: 1 }}>
                            <NeonButton
                                onClick={handleDispararFechamento}
                                disabled={isRunningFechamento}
                                startIcon={isRunningFechamento ? <CircularProgress size={20} color="inherit" /> : <PlayCircleOutlineIcon />}
                                fullWidth
                            >
                                {isRunningFechamento ? 'PROCESSANDO (AGUARDE)...' : 'FORÇAR FECHAMENTO AGORA'}
                            </NeonButton>
                        </Box>
                    </GlassCard>
                </Grid>

                {/* Auto Check-out Global */}
                <Grid item xs={12} lg={6}>
                    <GlassCard sx={{ p: 4, height: '100%', display: 'flex', flexDirection: 'column', position: 'relative', overflow: 'hidden' }}>
                        <Box sx={{ position: 'absolute', top: 10, right: 10, opacity: 0.05 }}>
                            <SettingsSuggestIcon sx={{ fontSize: 140, color: '#fff' }} />
                        </Box>

                        <Box sx={{ mb: 3, position: 'relative', zIndex: 1 }}>
                            <Typography variant="h6" sx={{ fontWeight: 800, color: '#fff', display: 'flex', alignItems: 'center', gap: 1 }}>
                                Analisador de Auto Check-out
                            </Typography>
                            <Box sx={{ display: 'flex', gap: 1, mt: 1 }}>
                                <Chip label="*/5 * * * *" size="small" sx={{ bgcolor: 'rgba(0,212,255,0.1)', color: '#00D4FF', fontFamily: 'monospace', fontWeight: 'bold' }} />
                                <Chip label="A cada 5 minutos" size="small" sx={{ bgcolor: 'rgba(255,180,0,0.1)', color: '#FFB400', fontWeight: 'bold' }} />
                            </Box>
                        </Box>

                        <Typography variant="body2" sx={{ color: 'text.secondary', mb: 4, flexGrow: 1, position: 'relative', zIndex: 1, lineHeight: 1.7 }}>
                            Processo em loop constante pelo Node.js. Ele verifica se a trava global de "Timeout de Área" está configurada no banco SQL Server. Se ativada, derruba credenciais (Auto Checkout) de pessoas cujo tempo de permanência ultrapassou a cota horária limite.
                        </Typography>

                        <Box sx={{ p: 2, bgcolor: 'rgba(255,180,0,0.05)', border: '1px solid rgba(255,180,0,0.2)', borderRadius: 2, display: 'flex', alignItems: 'center', gap: 1, position: 'relative', zIndex: 1 }}>
                            <AccessTimeIcon sx={{ color: '#FFB400', fontSize: 20 }} />
                            <Typography variant="caption" sx={{ color: '#FFB400', fontWeight: 700 }}>
                                STATUS: OPERANDO SILENCIOSAMENTE NO BACKEND
                            </Typography>
                        </Box>
                    </GlassCard>
                </Grid>

                {/* Revogação de Documentos ECM */}
                <Grid item xs={12}>
                    <GlassCard sx={{ p: 4, position: 'relative', overflow: 'hidden' }}>
                        <Box sx={{ position: 'absolute', top: -30, right: 20, opacity: 0.03 }}>
                            <WarningAmberIcon sx={{ fontSize: 250, color: '#fff' }} />
                        </Box>

                        <Box sx={{ mb: 3, position: 'relative', zIndex: 1 }}>
                            <Typography variant="h6" sx={{ fontWeight: 800, color: '#fff', display: 'flex', alignItems: 'center', gap: 1 }}>
                                Auditoria ECM (Arquivamento Vencido)
                            </Typography>
                            <Box sx={{ display: 'flex', gap: 1, mt: 1 }}>
                                <Chip label="0 4 * * *" size="small" sx={{ bgcolor: 'rgba(0,212,255,0.1)', color: '#00D4FF', fontFamily: 'monospace', fontWeight: 'bold' }} />
                                <Chip label="Diário às 04:00am" size="small" sx={{ bgcolor: 'rgba(0,255,100,0.1)', color: '#00FF66', fontWeight: 'bold' }} />
                            </Box>
                        </Box>

                        <Typography variant="body2" sx={{ color: 'text.secondary', mb: 4, maxWidth: '80%', position: 'relative', zIndex: 1, lineHeight: 1.7 }}>
                            Este CRON noturno varre a base de dados de documentos (`pessoa_documentos`) avaliando NRs e ASOs. Qualquer documento que atingir a data estipulada em `data_validade` terá seu status revogado (`vencido`). Consequentemente, as catracas irão bloquear o indivíduo que tiver documentação vital de segurança pendente.
                        </Typography>

                        <Box sx={{ display: 'inline-flex', p: 1.5, px: 2, bgcolor: 'rgba(0,212,255,0.05)', border: '1px solid rgba(0,212,255,0.2)', borderRadius: 2, alignItems: 'center', gap: 1, position: 'relative', zIndex: 1 }}>
                            <CheckCircleOutlineIcon sx={{ color: '#00D4FF', fontSize: 20 }} />
                            <Typography variant="caption" sx={{ color: '#00D4FF', fontWeight: 700 }}>
                                FUNÇÃO GERENCIADA VIA PROCEDURE NATIVA (POSTGRESQL) E AGENDADA PELO NODE.
                            </Typography>
                        </Box>
                    </GlassCard>
                </Grid>

            </Grid>
        </Box>
    );
};

export default ConfigCron;
