import React from 'react';
import {
    Grid, Typography, Box, CircularProgress, Stack, IconButton, Chip
} from '@mui/material';
import {
    Business as BusinessIcon, People as PeopleIcon, Login as LoginIcon,
    Logout as LogoutIcon, Refresh as RefreshIcon, TrendingUp as TrendingUpIcon,
    CheckCircle as CheckIcon, Event as EventIcon,
} from '@mui/icons-material';
import {
    Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip as ReTooltip, XAxis, YAxis
} from 'recharts';
import { styled } from '@mui/material/styles';
import { useNavigate } from 'react-router-dom';

import GlassCard from '../components/common/GlassCard';
import PageHeader from '../components/common/PageHeader';
import RecentAdditions from '../components/dashboard/RecentAdditions';
import NeonButton from '../components/common/NeonButton';
import { useDashboard } from '../hooks/useDashboard';

const StatValue = styled(Typography)(({ theme, color }) => ({
    fontSize: '2.5rem', fontWeight: 900, fontFamily: '"Orbitron", sans-serif',
    color: '#fff', textShadow: `0 0 20px ${color || '#00D4FF'}40`,
}));

const CustomTooltip = ({ active, payload, label }) => {
    if (active && payload?.[0]) {
        return (
            <Box sx={{ background: 'rgba(10,14,35,0.95)', border: '1px solid #00D4FF', borderRadius: 2, p: 1.5 }}>
                <Typography variant="caption" sx={{ color: '#00D4FF', fontWeight: 700 }}>{label}h</Typography>
                <Typography variant="body2" sx={{ color: '#fff' }}>Checkins: <strong>{payload[0].value}</strong></Typography>
                {payload[1] && <Typography variant="body2" sx={{ color: '#FF6B6B' }}>Checkouts: <strong>{payload[1].value}</strong></Typography>}
            </Box>
        );
    }
    return null;
};

/**
 * Dashboard: Painel central de controle A2 Eventos.
 * Agora utiliza o hook useDashboard para centralizar métricas e analytics.
 */
const Dashboard = () => {
    const navigate = useNavigate();
    const {
        stats, fluxData, recentCheckins, recentPessoas,
        loading, refreshing, eventoId, refresh
    } = useDashboard();

    if (!eventoId) {
        return (
            <Box sx={{ p: 4, textAlign: 'center', mt: 10 }}>
                <EventIcon sx={{ fontSize: 60, opacity: 0.2, mb: 2 }} />
                <Typography variant="h5" fontWeight={700}>NENHUM EVENTO ATIVO</Typography>
                <Typography variant="body2" sx={{ mb: 3 }} color="text.secondary">Selecione um Evento no menu lateral.</Typography>
                <NeonButton onClick={() => navigate('/eventos')}>IR PARA EVENTOS</NeonButton>
            </Box>
        );
    }

    if (loading) return <Box sx={{ display: 'flex', justifyContent: 'center', mt: 10 }}><CircularProgress /></Box>;

    const cards = [
        { title: 'EMPRESAS', value: stats.total_empresas, icon: <BusinessIcon />, color: '#00D4FF', trend: 'Credenciadas' },
        { title: 'PARTICIPANTES', value: stats.total_pessoas, icon: <PeopleIcon />, color: '#7B2FBE', trend: `${stats.presentes} presentes` },
        { title: 'CHECK-INS (HOJE)', value: stats.checkins_hoje, icon: <LoginIcon />, color: '#00FF88', trend: 'Entradas' },
        { title: 'SAÍDAS (HOJE)', value: stats.checkouts_hoje, icon: <LogoutIcon />, color: '#FFB800', trend: 'Dispersão' },
    ];

    return (
        <Box sx={{ p: 4 }}>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 4 }}>
                <PageHeader title="A2 Eventos / NZT Dashboard" subtitle="Telemetria e controle de fluxo biométrico em tempo real." />
                <Stack direction="row" spacing={2} alignItems="center">
                    {stats.dispositivos_online > 0 && <Chip label={`${stats.dispositivos_online} Leitores Online`} color="success" size="small" variant="outlined" sx={{ fontWeight: 800 }} />}
                    <IconButton onClick={refresh} sx={{ animation: refreshing ? 'spin 2s linear infinite' : 'none' }}>
                        <RefreshIcon />
                    </IconButton>
                </Stack>
            </Box>

            <Grid container spacing={3}>
                {cards.map((card, i) => (
                    <Grid item xs={12} sm={6} md={3} key={i}>
                        <GlassCard glowColor={card.color} sx={{ p: 3 }}>
                            <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 2 }}>
                                <Box sx={{ p: 1, borderRadius: 2, background: `${card.color}20`, color: card.color }}>{card.icon}</Box>
                                <Typography variant="caption" color="#00FF88" fontWeight={700}><TrendingUpIcon sx={{ fontSize: 14 }} /> {card.trend}</Typography>
                            </Box>
                            <Typography variant="caption" fontWeight={700} color="text.secondary">{card.title}</Typography>
                            <StatValue color={card.color}>{String(card.value).padStart(2, '0')}</StatValue>
                        </GlassCard>
                    </Grid>
                ))}

                <Grid item xs={12} md={7}>
                    <GlassCard sx={{ p: 3, height: 400 }}>
                        <Typography variant="h6" fontWeight={700} color="#00D4FF" mb={3}>FLUXO DE ACESSO (24H)</Typography>
                        <ResponsiveContainer width="100%" height={300}>
                            <AreaChart data={fluxData}>
                                <defs>
                                    <linearGradient id="colorIn" x1="0" y1="0" x2="0" y2="1">
                                        <stop offset="5%" stopColor="#00D4FF" stopOpacity={0.3} /><stop offset="95%" stopColor="#00D4FF" stopOpacity={0} />
                                    </linearGradient>
                                </defs>
                                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                                <XAxis dataKey="hora" stroke="rgba(255,255,255,0.2)" tickFormatter={v => `${v}h`} />
                                <YAxis stroke="rgba(255,255,255,0.2)" allowDecimals={false} />
                                <ReTooltip content={<CustomTooltip />} />
                                <Area type="monotone" dataKey="checkins" stroke="#00D4FF" fill="url(#colorIn)" />
                                <Area type="monotone" dataKey="checkouts" stroke="#FF6B6B" fill="transparent" />
                            </AreaChart>
                        </ResponsiveContainer>
                    </GlassCard>
                </Grid>

                <Grid item xs={12} md={5}>
                    <GlassCard sx={{ p: 3, height: 400, display: 'flex', flexDirection: 'column' }}>
                        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
                            <Typography variant="h6" fontWeight={700} color="#00FF88">TERMINAIS ATIVOS</Typography>
                            <Chip label={stats.dispositivos_online > 0 ? 'ONLINE' : 'OFFLINE'} size="small" sx={{ bgcolor: stats.dispositivos_online > 0 ? 'rgba(0,255,136,0.1)' : 'rgba(255,51,102,0.1)', color: stats.dispositivos_online > 0 ? '#00FF88' : '#FF3366', fontWeight: 800 }} />
                        </Box>
                        <Stack spacing={2} sx={{ flexGrow: 1, justifyContent: 'center', alignItems: 'center' }}>
                            <Box sx={{ position: 'relative', display: 'inline-flex' }}>
                                <CircularProgress variant="determinate" value={100} size={120} thickness={2} sx={{ color: 'rgba(255,255,255,0.05)' }} />
                                <CircularProgress variant="determinate" value={stats.dispositivos_online > 0 ? 100 : 0} size={120} thickness={4} sx={{ color: '#00FF88', position: 'absolute', left: 0 }} />
                                <Box sx={{ top: 0, left: 0, bottom: 0, right: 0, position: 'absolute', display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column' }}>
                                    <Typography variant="h4" component="div" sx={{ fontWeight: 900, color: '#fff' }}>{stats.dispositivos_online}</Typography>
                                    <Typography variant="caption" sx={{ color: 'text.secondary', fontWeight: 700 }}>LEITORES</Typography>
                                </Box>
                            </Box>
                            <Typography variant="body2" color="text.secondary" textAlign="center" sx={{ maxWidth: '80%' }}>Detectamos {stats.dispositivos_online} dispositivos ativos na rede local do evento.</Typography>
                        </Stack>
                    </GlassCard>
                </Grid>

                <Grid item xs={12}>
                    <GlassCard sx={{ p: 3 }}>
                        <Typography variant="h6" fontWeight={700} color="#00FF88" mb={3}>ÚLTIMOS PARTICIPANTES CADASTRADOS</Typography>
                        <RecentAdditions pessoas={recentPessoas} />
                    </GlassCard>
                </Grid>
            </Grid>
        </Box>
    );
};

export default Dashboard;