import React from 'react';
import {
    Grid, Typography, Box, CircularProgress, Stack, IconButton, Chip
} from '@mui/material';
import {
    Business as BusinessIcon, People as PeopleIcon, Login as LoginIcon,
    Logout as LogoutIcon, Refresh as RefreshIcon,
    Event as EventIcon, Autorenew as AutorenewIcon,
    Devices as DevicesIcon, Groups as GroupsIcon, Block as BlockIcon,
    Security as SecurityIcon
} from '@mui/icons-material';
import { useNavigate } from 'react-router-dom';

import GlassCard from '../components/common/GlassCard';
import KpiCard from '../components/common/KpiCard';
import { cores, funcao } from '../styles/tokens';
import PageHeader from '../components/common/PageHeader';
import RecentAdditions from '../components/dashboard/RecentAdditions';
import EmpresasMetricasCard from '../components/dashboard/EmpresasMetricasCard';
import TerminaisListaCard from '../components/dashboard/TerminaisListaCard';
import NeonButton from '../components/common/NeonButton';
import { useDashboard } from '../hooks/useDashboard';
import { useConfirmacao } from '../contexts/ConfirmacaoContext';

/**
 * Dashboard: Painel Central de Controle Operacional & Telemetria A2 Eventos.
 * Estrutura Harmônica:
 * 1. Topo: Header Limpo com Leitores Online e Ações Rápidas Padronizadas.
 * 2. Telemetria Operacional em Tempo Real: 5 mini-cards compactos responsivos.
 * 3. Base Estrutural: 2 Cards integrados de Empresas e Participantes cadastrados.
 * 4. Bloco Central: Empresas & Fluxo ao lado de Terminais e equipamentos.
 * 5. Base: Últimos participantes cadastrados.
 */
const Dashboard = () => {
    const confirmar = useConfirmacao();
    const navigate = useNavigate();
    const {
        stats, empresasMetricas, terminaisLista, recentPessoas,
        loading, refreshing, resetting, eventoId, refresh, handleDailyReset
    } = useDashboard();

    const confirmDailyReset = async () => {
        const ok = await confirmar({
            titulo: 'Reset diário',
            mensagem: 'Quem não estiver no evento passa a "ausente" e começa um novo dia de operação. Continuar?',
            textoConfirmar: 'Fazer reset'
        });
        if (ok) handleDailyReset();
    };

    if (!eventoId) {
        return (
            <Box sx={{ p: { xs: 2, md: 3 }, textAlign: 'center', mt: 10 }}>
                <EventIcon sx={{ fontSize: 60, opacity: 0.2, mb: 2 }} />
                <Typography variant="h5" fontWeight={700}>Nenhum evento ativo selecionado</Typography>
                <Typography variant="body2" sx={{ mb: 3 }} color="text.secondary">Selecione um Evento no menu lateral para visualizar a telemetria.</Typography>
                <NeonButton onClick={() => navigate('/eventos')}>Ir para eventos</NeonButton>
            </Box>
        );
    }

    if (loading) {
        return (
            <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '60dvh' }}>
                <CircularProgress sx={{ color: '#00D4FF' }} />
            </Box>
        );
    }

    return (
        <Box sx={{ p: { xs: 1.5, sm: 2.5, md: 3 }, maxWidth: '100%', overflowX: 'hidden' }}>
            {/* Header da Página com Ações Rápidas Padronizadas */}
            <Box sx={{
                display: 'flex',
                flexDirection: { xs: 'column', md: 'row' },
                gap: { xs: 1.5, md: 2 },
                justifyContent: 'space-between',
                alignItems: { xs: 'flex-start', md: 'center' },
                mb: { xs: 2, sm: 2.5, md: 3 }
            }}>
                <PageHeader 
                    title="Painel operacional" 
                    subtitle="Monitoramento em tempo real de ocupação, participantes, empresas e equipamentos do evento." 
                    sx={{ mb: 0 }}
                />

                <Stack 
                    direction="row" 
                    spacing={1.2} 
                    alignItems="center" 
                    flexWrap="wrap" 
                    sx={{ 
                        width: { xs: '100%', sm: 'auto' },
                        justifyContent: { xs: 'flex-start', sm: 'flex-end' }
                    }}
                >
                    {/* Leitores Online */}
                    <Chip 
                        icon={<DevicesIcon sx={{ fontSize: 16, color: '#00FF88 !important' }} />}
                        label={`${stats.dispositivos_online || 0} ${(stats.dispositivos_online || 0) === 1 ? 'leitor online' : 'leitores online'}`} 
                        sx={{
                            fontFamily: '"Inter", sans-serif',
                            fontWeight: 700,
                            height: 38,
                            borderRadius: '10px',
                            bgcolor: 'rgba(0, 255, 136, 0.1)',
                            color: '#00FF88',
                            border: '1px solid rgba(0, 255, 136, 0.3)',
                            fontSize: '0.75rem'
                        }} 
                    />

                    {/* Reset Diário */}
                    <NeonButton 
                        startIcon={<AutorenewIcon sx={{ fontSize: 17 }} />} 
                        onClick={confirmDailyReset} 
                        disabled={resetting}
                        neonColor={funcao.alerta}
                    >
                        {resetting ? 'Zerando o dia...' : 'Reset diário'}
                    </NeonButton>

                    {/* Refresh */}
                    <IconButton
                        onClick={refresh}
                        title="Atualizar dados"
                        sx={{
                            color: '#00D4FF',
                            bgcolor: 'rgba(0, 212, 255, 0.08)',
                            border: '1px solid rgba(0, 212, 255, 0.25)',
                            borderRadius: '10px',
                            height: 38,
                            width: 38,
                            transition: 'all 0.2s ease',
                            '&:hover': {
                                bgcolor: 'rgba(0, 212, 255, 0.18)',
                                borderColor: '#00D4FF'
                            },
                            animation: refreshing ? 'spin 1.5s linear infinite' : 'none',
                            '@keyframes spin': {
                                '0%': { transform: 'rotate(0deg)' },
                                '100%': { transform: 'rotate(360deg)' }
                            }
                        }}
                    >
                        <RefreshIcon fontSize="small" />
                    </IconButton>
                </Stack>
            </Box>

            {/* 1. INDICADORES DO DIA + BASE CADASTRAL */}
            <Grid container spacing={2} sx={{ mb: 3 }}>
                <Grid item xs={6} sm={4} md={2.4}>
                    <KpiCard
                        titulo="Presentes agora"
                        valor={stats.presentes || 0}
                        icone={<GroupsIcon />}
                        cor={cores.primaria}
                        progresso={stats.capacidade ? ((stats.presentes || 0) / stats.capacidade) * 100 : undefined}
                        rodape={stats.capacidade ? `${Math.round(((stats.presentes || 0) / stats.capacidade) * 100)}% de ${stats.capacidade}` : 'Capacidade não definida'}
                    />
                </Grid>
                <Grid item xs={6} sm={4} md={2.4}>
                    <KpiCard titulo="Entradas hoje" valor={stats.checkins_hoje || 0} icone={<LoginIcon />} cor={cores.sucesso} />
                </Grid>
                <Grid item xs={6} sm={4} md={2.4}>
                    <KpiCard titulo="Saídas hoje" valor={stats.checkouts_hoje || 0} icone={<LogoutIcon />} cor={cores.saida} />
                </Grid>
                <Grid item xs={6} sm={6} md={2.4}>
                    <KpiCard titulo="Negados hoje" valor={stats.negados_hoje || 0} icone={<BlockIcon />} cor={cores.erro} />
                </Grid>
                <Grid item xs={12} sm={6} md={2.4}>
                    <KpiCard titulo="Fiscalizações hoje" valor={stats.fiscalizacoes_hoje || 0} icone={<SecurityIcon />} cor={cores.secundariaClara} />
                </Grid>
                <Grid item xs={12} sm={6}>
                    <KpiCard
                        titulo="Empresas credenciadas"
                        valor={stats.total_empresas || 0}
                        icone={<BusinessIcon />}
                        rodape={`${empresasMetricas.length} ativas no evento`}
                    />
                </Grid>
                <Grid item xs={12} sm={6}>
                    <KpiCard titulo="Participantes cadastrados" valor={stats.total_pessoas || 0} icone={<PeopleIcon />} />
                </Grid>
            </Grid>

            {/* 3. BLOCO CENTRAL: EMPRESAS & TERMINAIS */}
            <Grid container spacing={{ xs: 2, md: 3 }} sx={{ mb: { xs: 2, md: 3 } }}>
                <Grid item xs={12} lg={7.5}>
                    <EmpresasMetricasCard empresas={empresasMetricas} />
                </Grid>

                <Grid item xs={12} lg={4.5}>
                    <TerminaisListaCard terminais={terminaisLista} />
                </Grid>
            </Grid>

            {/* 4. BLOCO INFERIOR: ÚLTIMOS PARTICIPANTES CADASTRADOS */}
            <Grid container spacing={3}>
                <Grid item xs={12}>
                    <GlassCard sx={{ p: { xs: 2, sm: 3 } }}>
                        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
                            <Box>
                                <Typography variant="h6" sx={{
                                    fontWeight: 700,
                                    color: '#FFFFFF',
                                    fontFamily: '"Space Grotesk", sans-serif'
                                }}>
                                    Últimos participantes cadastrados
                                </Typography>
                                <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.5)' }}>
                                    Conferência imediata dos colaboradores recém-adicionados com foto e empresa
                                </Typography>
                            </Box>
                        </Box>
                        <RecentAdditions pessoas={recentPessoas} />
                    </GlassCard>
                </Grid>
            </Grid>
        </Box>
    );
};

export default Dashboard;