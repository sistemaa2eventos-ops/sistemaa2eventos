import React, { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
    Grid,
    Typography,
    Box,
    CircularProgress,
    Stack,
    IconButton,
    Chip,
    Avatar,
} from '@mui/material';
import {
    Business as BusinessIcon,
    People as PeopleIcon,
    Login as LoginIcon,
    Logout as LogoutIcon,
    Refresh as RefreshIcon,
    TrendingUp as TrendingUpIcon,
    TrendingDown as TrendingDownIcon,
    CheckCircle as CheckIcon,
    Event as EventIcon,
} from '@mui/icons-material';
import {
    LineChart,
    Line,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip as ReTooltip,
    ResponsiveContainer,
    Area,
    AreaChart,
} from 'recharts';
import { format, parseISO } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import api from '../services/api';
import GlassCard from '../components/common/GlassCard';
import PageHeader from '../components/common/PageHeader';
import RecentCheckins from '../components/dashboard/RecentCheckins';
import RecentAdditions from '../components/dashboard/RecentAdditions';
import NeonButton from '../components/common/NeonButton';
import { styled } from '@mui/material/styles';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';

const StatValue = styled(Typography)(({ theme, color }) => ({
    fontSize: '2.5rem',
    fontWeight: 900,
    fontFamily: '"Orbitron", sans-serif',
    color: '#fff',
    textShadow: `0 0 20px ${color || '#00D4FF'}40`,
}));

const CustomTooltip = ({ active, payload, label }) => {
    if (active && payload && payload.length) {
        return (
            <Box sx={{
                background: 'rgba(10,14,35,0.95)',
                border: '1px solid rgba(0,212,255,0.3)',
                borderRadius: 2,
                p: 1.5,
            }}>
                <Typography variant="caption" sx={{ color: '#00D4FF', fontWeight: 700 }}>{label}h</Typography>
                <Typography variant="body2" sx={{ color: '#fff' }}>
                    Checkins: <strong>{payload[0]?.value || 0}</strong>
                </Typography>
                {payload[1] && (
                    <Typography variant="body2" sx={{ color: '#FF6B6B' }}>
                        Checkouts: <strong>{payload[1]?.value || 0}</strong>
                    </Typography>
                )}
            </Box>
        );
    }
    return null;
};

const Dashboard = () => {
    const { t } = useTranslation();
    const navigate = useNavigate();
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [stats, setStats] = useState({
        total_empresas: 0,
        total_pessoas: 0,
        checkins_hoje: 0,
        checkouts_hoje: 0,
        presentes: 0,
        dispositivos_online: 0,
    });
    const [fluxData, setFluxData] = useState([]);
    const [recentCheckins, setRecentCheckins] = useState([]);
    const [recentPessoas, setRecentPessoas] = useState([]);

    const [searchParams] = useSearchParams();
    const eventoId = searchParams.get('evento_id') || localStorage.getItem('active_evento_id');

    useEffect(() => {
        loadDashboardData();
    }, [eventoId]);

    const loadDashboardData = async () => {
        try {
            if (!loading) setRefreshing(true);

            if (!eventoId) {
                console.log('Dashboard - Nenhum evento_id definido, abortando carregamento.');
                setLoading(false);
                return;
            }

            const response = await api.get('/monitor/dashboard', {
                params: { evento_id: eventoId }
            });
            const data = response.data.data;

            setStats({
                total_empresas: data.cards?.total_empresas || 0,
                total_pessoas: data.cards?.total_pessoas || 0,
                checkins_hoje: data.cards?.total_checkins_hoje || 0,
                checkouts_hoje: data.cards?.total_checkouts_hoje || 0,
                presentes: data.cards?.checkin || 0,
                dispositivos_online: data.cards?.dispositivos_online || 0,
            });

            setRecentCheckins(data.ultimos_checkins || []);
            setRecentPessoas(data.ultimos_adicionados || []);

            // Processar fluxo 24h: gera dados hora a hora se a API retornar dados
            if (data.fluxo_24h && data.fluxo_24h.length > 0) {
                setFluxData(data.fluxo_24h);
            } else {
                // Gerar placeholder com zeros para as últimas 12 horas
                const now = new Date();
                const placeholderData = Array.from({ length: 13 }, (_, i) => {
                    const h = (now.getHours() - 12 + i + 24) % 24;
                    return { hora: h, checkins: 0, checkouts: 0 };
                });
                setFluxData(placeholderData);
            }

        } catch (error) {
            console.error('Erro ao carregar dashboard:', error);
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    };

    if (!eventoId) {
        return (
            <Box sx={{ p: 4, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '60vh', textAlign: 'center' }}>
                <EventIcon sx={{ fontSize: 60, color: 'rgba(0, 212, 255, 0.2)', mb: 2 }} />
                <Typography variant="h5" sx={{ color: '#fff', mb: 1, fontWeight: 700 }}>Nenhum Evento Selecionado</Typography>
                <Typography variant="body1" sx={{ color: 'text.secondary', mb: 3 }}>
                    Selecione um Nexus (Evento) no menu para visualizar as estatísticas em tempo real.
                </Typography>
                <NeonButton onClick={() => navigate('/eventos')}>
                    IR PARA CENTRAL DE EVENTOS
                </NeonButton>
            </Box>
        );
    }

    if (loading) {
        return (
            <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '80vh' }}>
                <CircularProgress color="primary" />
            </Box>
        );
    }

    const cards = [
        {
            title: t('dashboard.active_devices', { defaultValue: 'EMPRESAS ATIVAS' }),
            value: stats.total_empresas,
            icon: <BusinessIcon />,
            color: '#00D4FF',
            trend: `${stats.total_empresas} credenciada(s)`
        },
        {
            title: t('dashboard.total_people', { defaultValue: 'PARTICIPANTES' }),
            value: stats.total_pessoas,
            icon: <PeopleIcon />,
            color: '#7B2FBE',
            trend: `${stats.presentes} presentes hoje`
        },
        {
            title: t('dashboard.recent_activity', { defaultValue: 'CHECK-INS HOJE' }),
            value: stats.checkins_hoje,
            icon: <LoginIcon />,
            color: '#00FF88',
            trend: `Entradas registradas`
        },
        {
            title: t('dashboard.recent_activity', { defaultValue: 'SAÍDAS HOJE' }),
            value: stats.checkouts_hoje,
            icon: <LogoutIcon />,
            color: '#FFB800',
            trend: `Saídas registradas`
        },
    ];

    return (
        <Box sx={{ p: 4 }}>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <PageHeader
                    title={t('dashboard.title', { defaultValue: 'Visão Geral' })}
                    subtitle="Visão geral em tempo real do ecossistema de acesso."
                    breadcrumbs={[{ text: 'A2 Eventos' }, { text: t('sidebar.dashboard', { defaultValue: 'Dashboard' }) }]}
                />
                <Stack direction="row" spacing={1} alignItems="center" sx={{ mt: 2 }}>
                    {stats.dispositivos_online > 0 && (
                        <Chip
                            icon={<CheckIcon sx={{ fontSize: 14 }} />}
                            label={`${stats.dispositivos_online} Leitor(es) Online`}
                            color="success"
                            size="small"
                            variant="outlined"
                            sx={{ fontWeight: 700 }}
                        />
                    )}
                    <IconButton
                        onClick={loadDashboardData}
                        disabled={refreshing}
                        sx={{
                            border: '1px solid rgba(0, 212, 255, 0.2)',
                            background: 'rgba(0, 212, 255, 0.05)',
                            animation: refreshing ? 'spin 2s linear infinite' : 'none'
                        }}
                    >
                        {refreshing ? <CircularProgress size={20} color="inherit" /> : <RefreshIcon />}
                    </IconButton>
                </Stack>
            </Box>

            <Grid container spacing={3}>
                {/* Stats Cards */}
                {cards.map((card, index) => (
                    <Grid item xs={12} sm={6} md={3} key={index}>
                        <GlassCard glowColor={card.color} sx={{ p: 3 }}>
                            <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 2 }}>
                                <Box
                                    sx={{
                                        p: 1.5,
                                        borderRadius: 3,
                                        background: `${card.color}15`,
                                        color: card.color,
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        boxShadow: `inset 0 0 10px ${card.color}20`
                                    }}
                                >
                                    {card.icon}
                                </Box>
                                <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, color: '#00FF88' }}>
                                    <TrendingUpIcon sx={{ fontSize: 16 }} />
                                    <Typography variant="caption" sx={{ fontWeight: 700 }}>{card.trend}</Typography>
                                </Box>
                            </Box>
                            <Typography variant="caption" sx={{ color: 'text.secondary', fontWeight: 700, letterSpacing: '1px' }}>
                                {card.title}
                            </Typography>
                            <StatValue color={card.color}>
                                {String(card.value).padStart(2, '0')}
                            </StatValue>
                        </GlassCard>
                    </Grid>
                ))}

                {/* Chart - Fluxo de Acessos 24h */}
                <Grid item xs={12} md={7}>
                    <GlassCard sx={{ p: 3, height: '400px' }}>
                        <Typography variant="h6" sx={{ color: '#00D4FF', mb: 3, fontWeight: 700 }}>
                            FLUXO DE ACESSOS (24H)
                        </Typography>
                        <ResponsiveContainer width="100%" height={300}>
                            <AreaChart data={fluxData} margin={{ top: 5, right: 10, left: -20, bottom: 5 }}>
                                <defs>
                                    <linearGradient id="colorCheckins" x1="0" y1="0" x2="0" y2="1">
                                        <stop offset="5%" stopColor="#00D4FF" stopOpacity={0.3} />
                                        <stop offset="95%" stopColor="#00D4FF" stopOpacity={0} />
                                    </linearGradient>
                                    <linearGradient id="colorCheckouts" x1="0" y1="0" x2="0" y2="1">
                                        <stop offset="5%" stopColor="#FF6B6B" stopOpacity={0.3} />
                                        <stop offset="95%" stopColor="#FF6B6B" stopOpacity={0} />
                                    </linearGradient>
                                </defs>
                                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                                <XAxis
                                    dataKey="hora"
                                    stroke="rgba(255,255,255,0.2)"
                                    tick={{ fill: 'rgba(255,255,255,0.5)', fontSize: 11 }}
                                    tickFormatter={(v) => `${v}h`}
                                />
                                <YAxis
                                    stroke="rgba(255,255,255,0.2)"
                                    tick={{ fill: 'rgba(255,255,255,0.5)', fontSize: 11 }}
                                    allowDecimals={false}
                                />
                                <ReTooltip content={<CustomTooltip />} />
                                <Area
                                    type="monotone"
                                    dataKey="checkins"
                                    stroke="#00D4FF"
                                    strokeWidth={2}
                                    fill="url(#colorCheckins)"
                                    name="Checkins"
                                />
                                <Area
                                    type="monotone"
                                    dataKey="checkouts"
                                    stroke="#FF6B6B"
                                    strokeWidth={2}
                                    fill="url(#colorCheckouts)"
                                    name="Checkouts"
                                />
                            </AreaChart>
                        </ResponsiveContainer>
                    </GlassCard>
                </Grid>

                {/* Recent Activity */}
                <Grid item xs={12} md={5}>
                    <GlassCard sx={{ p: 0, height: '400px', overflow: 'hidden' }}>
                        <Box sx={{ p: 3, borderBottom: '1px solid rgba(0, 212, 255, 0.1)' }}>
                            <Typography variant="h6" sx={{ color: '#7B2FBE', fontWeight: 700 }}>
                                RECENTE ATIVIDADE
                            </Typography>
                        </Box>
                        <Box sx={{ p: 2, overflowY: 'auto', maxHeight: 330 }}>
                            <RecentCheckins logs={recentCheckins} />
                        </Box>
                    </GlassCard>
                </Grid>

                {/* Recent registrations */}
                <Grid item xs={12}>
                    <GlassCard sx={{ p: 3 }}>
                        <Typography variant="h6" sx={{ color: '#00FF88', mb: 3, fontWeight: 700 }}>
                            ÚLTIMOS CADASTROS
                        </Typography>
                        <RecentAdditions pessoas={recentPessoas} />
                    </GlassCard>
                </Grid>
            </Grid>
        </Box>
    );
};

export default Dashboard;