import React, { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
    Box,
    Grid,
    Typography,
    Stack,
    Avatar,
    Divider,
    TextField,
} from '@mui/material';
import {
    Assessment as ReportsIcon,
    TrendingUp as TrendingIcon,
    Business as BusinessIcon,
    People as PeopleIcon,
    QrCode as ScanIcon,
} from '@mui/icons-material';
import api from '../services/api';
import GlassCard from '../components/common/GlassCard';
import PageHeader from '../components/common/PageHeader';
import NeonButton from '../components/common/NeonButton';
import { styled } from '@mui/material/styles';
import {
    AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
    PieChart, Pie, Cell, Legend
} from 'recharts';
import { format, startOfDay, endOfDay, eachHourOfInterval, isWithinInterval } from 'date-fns';
import { ptBR } from 'date-fns/locale';

const StatValue = styled(Typography)(({ color }) => ({
    fontFamily: '"Orbitron", sans-serif',
    fontWeight: 900,
    fontSize: '2rem',
    color: color || '#00D4FF',
    textShadow: `0 0 15px ${color}44`,
}));

const ActivityItem = styled(Box)(({ theme }) => ({
    padding: theme.spacing(2),
    borderRadius: 12,
    background: 'rgba(255, 255, 255, 0.02)',
    border: '1px solid rgba(255, 255, 255, 0.05)',
    display: 'flex',
    alignItems: 'center',
    gap: theme.spacing(2),
    transition: 'all 0.3s ease',
    '&:hover': {
        background: 'rgba(0, 212, 255, 0.05)',
        borderColor: 'rgba(0, 212, 255, 0.2)',
        transform: 'translateX(8px)',
    }
}));

const Reports = () => {
    const [summary, setSummary] = useState({});
    const [dailyLogs, setDailyLogs] = useState([]);
    const [loading, setLoading] = useState(true);
    const [chartData, setChartData] = useState([]);

    // Filtros de Data
    const [dateStart, setDateStart] = useState(format(startOfDay(new Date()), "yyyy-MM-dd'T'HH:mm"));
    const [dateEnd, setDateEnd] = useState(format(endOfDay(new Date()), "yyyy-MM-dd'T'HH:mm"));

    const [searchParams] = useSearchParams();
    const eventoId = searchParams.get('evento_id') || localStorage.getItem('active_evento_id');

    useEffect(() => {
        loadData();
    }, [eventoId, dateStart, dateEnd]);

    const loadData = async () => {
        try {
            setLoading(true);
            const [summaryRes, logsRes] = await Promise.all([
                api.get('/reports/company-summary', { params: { evento_id: eventoId } }),
                api.get('/reports/daily', {
                    params: {
                        evento_id: eventoId,
                        data_inicio: dateStart,
                        data_fim: dateEnd
                    }
                })
            ]);
            setSummary(summaryRes.data.summary || {});
            const logs = logsRes.data.data || [];
            setDailyLogs(logs);
            processChartData(logs);
        } catch (error) {
            console.error('Erro ao carregar relatórios:', error);
        } finally {
            setLoading(false);
        }
    };

    const processChartData = (logs) => {
        const start = new Date(dateStart);
        const end = new Date(dateEnd);
        const hours = eachHourOfInterval({ start, end });

        const data = hours.map(hour => {
            const hourStr = format(hour, 'HH:00');
            const hourLogs = logs.filter(log => {
                const logDate = new Date(log.horario);
                return logDate.getHours() === hour.getHours() &&
                    logDate.getDate() === hour.getDate();
            });

            return {
                hora: hourStr,
                checkin: hourLogs.filter(l => l.tipo === 'checkin').length,
                checkout: hourLogs.filter(l => l.tipo === 'checkout').length
            };
        });

        setChartData(data);
    };

    const handleExportExcel = async () => {
        try {
            const response = await api.get('/excel/export', {
                params: { eventoId },
                responseType: 'blob'
            });

            const url = window.URL.createObjectURL(new Blob([response.data]));
            const link = document.createElement('a');
            link.href = url;
            link.setAttribute('download', `Relatorio_Nexus_${format(new Date(), 'yyyyMMdd_HHmm')}.xlsx`);
            document.body.appendChild(link);
            link.click();
            link.remove();
        } catch (error) {
            console.error('Erro ao exportar Excel:', error);
        }
    };

    const totalCheckins = dailyLogs.filter(l => l.tipo === 'checkin').length;
    const totalCheckouts = dailyLogs.filter(l => l.tipo === 'checkout').length;

    return (
        <Box sx={{ p: 4 }}>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 2 }}>
                <PageHeader
                    title="Sistemas de Relatórios"
                    subtitle="Análise consolidada de fluxo e ocupação do evento."
                    breadcrumbs={[{ text: 'Dashboard' }, { text: 'Relatórios' }]}
                />
                <NeonButton
                    startIcon={<ReportsIcon />}
                    onClick={handleExportExcel}
                    sx={{ mt: 2 }}
                >
                    EXPORTAR EXCEL COMPLETO
                </NeonButton>
            </Box>

            {/* Filtros de Data */}
            <GlassCard sx={{ p: 2, mb: 3 }}>
                <Stack direction="row" spacing={3} alignItems="center">
                    <Box>
                        <Typography variant="caption" sx={{ color: 'text.secondary', fontWeight: 700, display: 'block', mb: 0.5 }}>INÍCIO</Typography>
                        <TextField
                            type="datetime-local"
                            size="small"
                            value={dateStart}
                            onChange={(e) => setDateStart(e.target.value)}
                            sx={{
                                input: { color: '#fff' },
                                '& .MuiOutlinedInput-notchedOutline': { borderColor: 'rgba(0,212,255,0.2)' }
                            }}
                        />
                    </Box>
                    <Box>
                        <Typography variant="caption" sx={{ color: 'text.secondary', fontWeight: 700, display: 'block', mb: 0.5 }}>TÉRMINO</Typography>
                        <TextField
                            type="datetime-local"
                            size="small"
                            value={dateEnd}
                            onChange={(e) => setDateEnd(e.target.value)}
                            sx={{
                                input: { color: '#fff' },
                                '& .MuiOutlinedInput-notchedOutline': { borderColor: 'rgba(0,212,255,0.2)' }
                            }}
                        />
                    </Box>
                    <Box sx={{ ml: 'auto', textAlign: 'right' }}>
                        <Typography variant="h6" sx={{ color: '#00D4FF', fontWeight: 800 }}>{dailyLogs.length}</Typography>
                        <Typography variant="caption" sx={{ color: 'text.secondary' }}>Registros no período</Typography>
                    </Box>
                </Stack>
            </GlassCard>

            <Grid container spacing={3}>
                {/* Stats Cards Integration */}
                <Grid item xs={12} md={4}>
                    <GlassCard glowColor="#00D4FF">
                        <Box sx={{ p: 3 }}>
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 1 }}>
                                <Avatar sx={{ bgcolor: 'rgba(0, 212, 255, 0.1)', color: '#00D4FF' }}>
                                    <ScanIcon />
                                </Avatar>
                                <Typography variant="subtitle2" sx={{ color: 'text.secondary', fontWeight: 700 }}>CHECK-INS NO PERÍODO</Typography>
                            </Box>
                            <StatValue>{totalCheckins}</StatValue>
                            <Typography variant="caption" sx={{ color: '#00FF88', fontWeight: 600 }}>DADOS ATUALIZADOS</Typography>
                        </Box>
                    </GlassCard>
                </Grid>

                <Grid item xs={12} md={4}>
                    <GlassCard glowColor="#7B2FBE">
                        <Box sx={{ p: 3 }}>
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 1 }}>
                                <Avatar sx={{ bgcolor: 'rgba(123, 47, 190, 0.1)', color: '#7B2FBE' }}>
                                    <BusinessIcon />
                                </Avatar>
                                <Typography variant="subtitle2" sx={{ color: 'text.secondary', fontWeight: 700 }}>EMPRESAS NO RADAR</Typography>
                            </Box>
                            <StatValue color="#7B2FBE">{Object.keys(summary).length}</StatValue>
                            <Typography variant="caption" sx={{ color: 'text.secondary' }}>EM OPERAÇÃO</Typography>
                        </Box>
                    </GlassCard>
                </Grid>

                <Grid item xs={12} md={4}>
                    <GlassCard glowColor="#FF3366">
                        <Box sx={{ p: 3 }}>
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 1 }}>
                                <Avatar sx={{ bgcolor: 'rgba(255, 51, 102, 0.1)', color: '#FF3366' }}>
                                    <TrendingIcon />
                                </Avatar>
                                <Typography variant="subtitle2" sx={{ color: 'text.secondary', fontWeight: 700 }}>SAÍDAS PROCESSADAS</Typography>
                            </Box>
                            <StatValue color="#FF3366">{totalCheckouts}</StatValue>
                            <Typography variant="caption" sx={{ color: 'text.secondary' }}>FLUXO DE DISPERSÃO</Typography>
                        </Box>
                    </GlassCard>
                </Grid>

                {/* Gráfico de Fluxo Temporal */}
                <Grid item xs={12} lg={8}>
                    <GlassCard glowColor="#00D4FF" sx={{ p: 3, height: '450px', display: 'flex', flexDirection: 'column' }}>
                        <Typography variant="h6" sx={{ fontWeight: 800, mb: 3, letterSpacing: 1 }}>FLUXO DE ACESSOS (POR HORA)</Typography>
                        <Box sx={{ flexGrow: 1, width: '100%', minHeight: 300 }}>
                            <ResponsiveContainer width="100%" height="100%">
                                <AreaChart data={chartData}>
                                    <defs>
                                        <linearGradient id="colorIn" x1="0" y1="0" x2="0" y2="1">
                                            <stop offset="5%" stopColor="#00FF88" stopOpacity={0.3} />
                                            <stop offset="95%" stopColor="#00FF88" stopOpacity={0} />
                                        </linearGradient>
                                        <linearGradient id="colorOut" x1="0" y1="0" x2="0" y2="1">
                                            <stop offset="5%" stopColor="#FF3366" stopOpacity={0.3} />
                                            <stop offset="95%" stopColor="#FF3366" stopOpacity={0} />
                                        </linearGradient>
                                    </defs>
                                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
                                    <XAxis
                                        dataKey="hora"
                                        stroke="rgba(255,255,255,0.5)"
                                        fontSize={12}
                                        tickLine={false}
                                        axisLine={false}
                                    />
                                    <YAxis
                                        stroke="rgba(255,255,255,0.5)"
                                        fontSize={12}
                                        tickLine={false}
                                        axisLine={false}
                                    />
                                    <Tooltip
                                        contentStyle={{
                                            background: 'rgba(10, 25, 41, 0.95)',
                                            borderRadius: 12,
                                            border: '1px solid rgba(0,212,255,0.2)',
                                            boxShadow: '0 10px 30px rgba(0,0,0,0.5)'
                                        }}
                                        itemStyle={{ fontSize: 13, fontWeight: 700 }}
                                    />
                                    <Legend verticalAlign="top" height={36} />
                                    <Area
                                        name="Entradas"
                                        type="monotone"
                                        dataKey="checkin"
                                        stroke="#00FF88"
                                        strokeWidth={3}
                                        fillOpacity={1}
                                        fill="url(#colorIn)"
                                    />
                                    <Area
                                        name="Saídas"
                                        type="monotone"
                                        dataKey="checkout"
                                        stroke="#FF3366"
                                        strokeWidth={3}
                                        fillOpacity={1}
                                        fill="url(#colorOut)"
                                    />
                                </AreaChart>
                            </ResponsiveContainer>
                        </Box>
                    </GlassCard>
                </Grid>

                {/* Distribuição por Empresa */}
                <Grid item xs={12} lg={4}>
                    <GlassCard glowColor="#7B2FBE" sx={{ p: 3, height: '450px', display: 'flex', flexDirection: 'column' }}>
                        <Typography variant="h6" sx={{ fontWeight: 800, mb: 1, letterSpacing: 1 }}>OCUPAÇÃO POR EMPRESA</Typography>
                        <Box sx={{ flexGrow: 1, position: 'relative' }}>
                            <ResponsiveContainer width="100%" height="100%">
                                <PieChart>
                                    <Pie
                                        data={Object.entries(summary).map(([name, stats]) => ({ name, value: stats.presentes }))}
                                        cx="50%"
                                        cy="50%"
                                        innerRadius={60}
                                        outerRadius={80}
                                        paddingAngle={5}
                                        dataKey="value"
                                    >
                                        {Object.entries(summary).map((entry, index) => (
                                            <Cell key={`cell-${index}`} fill={['#00D4FF', '#7B2FBE', '#00FF88', '#FFB800', '#FF3366'][index % 5]} />
                                        ))}
                                    </Pie>
                                    <Tooltip
                                        contentStyle={{
                                            background: 'rgba(10, 25, 41, 0.95)',
                                            borderRadius: 12,
                                            border: '1px solid rgba(123, 47, 190, 0.2)'
                                        }}
                                    />
                                    <Legend layout="horizontal" align="center" verticalAlign="bottom" />
                                </PieChart>
                            </ResponsiveContainer>
                            <Box sx={{ position: 'absolute', top: '45%', left: '50%', transform: 'translate(-50%, -50%)', textAlign: 'center', pointerEvents: 'none' }}>
                                <Typography variant="h4" sx={{ fontWeight: 900, color: '#fff' }}>
                                    {Object.values(summary).reduce((a, b) => a + (b.presentes || 0), 0)}
                                </Typography>
                                <Typography variant="caption" sx={{ color: 'text.secondary', fontWeight: 700 }}>TOTAL PRESENTES</Typography>
                            </Box>
                        </Box>
                    </GlassCard>
                </Grid>

                {/* Activity Feed */}
                <Grid item xs={12}>
                    <GlassCard sx={{ p: 4 }}>
                        <Typography variant="h6" sx={{ color: '#fff', mb: 3, fontWeight: 800 }}>REGISTROS DE CAMPO (DETALHADO)</Typography>
                        <Stack spacing={2}>
                            {dailyLogs.slice(0, 20).map((log) => (
                                <ActivityItem key={log.id} sx={{
                                    borderLeft: log.tipo === 'negado' ? '4px solid #FF3366' : 'none',
                                    background: log.tipo === 'negado' ? 'rgba(255, 51, 102, 0.05)' : 'rgba(255, 255, 255, 0.02)'
                                }}>
                                    <Avatar sx={{
                                        bgcolor: log.tipo === 'checkin' ? 'rgba(0, 255, 136, 0.1)' :
                                            log.tipo === 'negado' ? 'rgba(255, 51, 102, 0.1)' : 'rgba(255, 184, 0, 0.1)',
                                        color: log.tipo === 'checkin' ? '#00FF88' :
                                            log.tipo === 'negado' ? '#FF3366' : '#FFB800'
                                    }}>
                                        {log.tipo === 'checkin' ? <ScanIcon /> :
                                            log.tipo === 'negado' ? <PeopleIcon /> : <TrendingIcon />}
                                    </Avatar>
                                    <Box sx={{ flexGrow: 1 }}>
                                        <Stack direction="row" alignItems="center" spacing={1}>
                                            <Typography variant="body2" sx={{ color: '#fff', fontWeight: 700 }}>
                                                {log.pessoa || 'SISTEMA'}
                                            </Typography>
                                            {log.cpf && (
                                                <Typography variant="caption" sx={{ color: 'text.secondary', bgcolor: 'rgba(255,255,255,0.05)', px: 0.5, borderRadius: 0.5 }}>
                                                    {log.cpf}
                                                </Typography>
                                            )}
                                        </Stack>
                                        <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block' }}>
                                            {log.empresa || 'Sem Empresa'} • {log.metodo?.toUpperCase()} {log.dispositivo_id ? `(${log.dispositivo_id})` : ''}
                                        </Typography>
                                        {log.tipo === 'negado' && log.observacao && (
                                            <Typography variant="caption" sx={{ color: '#FF3366', fontWeight: 600, mt: 0.5, display: 'block' }}>
                                                MOTIVO: {log.observacao.toUpperCase()}
                                            </Typography>
                                        )}
                                    </Box>
                                    <Box sx={{ textAlign: 'right' }}>
                                        <Typography variant="caption" sx={{
                                            color: log.tipo === 'checkin' ? '#00FF88' :
                                                log.tipo === 'negado' ? '#FF3366' : '#FFB800',
                                            fontWeight: 900,
                                            letterSpacing: 1
                                        }}>
                                            {log.tipo.toUpperCase()}
                                        </Typography>
                                        <Typography variant="caption" sx={{ color: 'text.secondary', fontSize: '0.7rem' }}>
                                            {(log.horario && !isNaN(new Date(log.horario).getTime())) ? format(new Date(log.horario), "HH:mm:ss 'em' dd/MM", { locale: ptBR }) : 'S/ horário'}
                                        </Typography>
                                    </Box>
                                </ActivityItem>
                            ))}
                            {dailyLogs.length === 0 && (
                                <Box sx={{ textAlign: 'center', py: 8 }}>
                                    <Typography variant="body2" sx={{ color: 'text.secondary' }}>
                                        NENHUM REGISTRO ENCONTRADO PARA O PERÍODO SELECIONADO.
                                    </Typography>
                                </Box>
                            )}
                        </Stack>
                    </GlassCard>
                </Grid>
            </Grid>
        </Box>
    );
};

export default Reports;
