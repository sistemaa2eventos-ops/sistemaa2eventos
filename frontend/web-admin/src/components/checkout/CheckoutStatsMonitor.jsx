import React from 'react';
import {
    Stack,
    Box,
    Typography,
    Avatar
} from '@mui/material';
import { History as HistoryIcon } from '@mui/icons-material';
import GlassCard from '../common/GlassCard';

const CheckoutStatsMonitor = ({ realtimeStats, recentLogs = [] }) => {
    return (
        <Stack spacing={3}>
            <GlassCard sx={{ p: 3 }} glowColor="#00FF88">
                <Typography variant="subtitle2" sx={{ color: '#00FF88', fontWeight: 900, mb: 2, letterSpacing: 2 }}>MÉTRICAS DA OPERAÇÃO</Typography>

                {realtimeStats && (
                    <Stack spacing={1.5} sx={{ mb: 3, p: 2, bgcolor: 'rgba(0,0,0,0.2)', borderRadius: 2, border: '1px solid rgba(0, 255, 136, 0.1)' }}>
                        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <Typography variant="body2" sx={{ color: 'text.secondary', fontWeight: 700 }}>Pessoas Presentes:</Typography>
                            <Typography variant="body1" sx={{ color: '#fff', fontWeight: 800 }}>
                                {realtimeStats.presentes} {realtimeStats.capacidade > 0 ? `/ ${realtimeStats.capacidade}` : ''}
                            </Typography>
                        </Box>
                        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <Typography variant="body2" sx={{ color: 'text.secondary', fontWeight: 700 }}>Empresas Logadas:</Typography>
                            <Typography variant="body1" sx={{ color: '#fff', fontWeight: 800 }}>
                                {realtimeStats.empresas?.length || 0}
                            </Typography>
                        </Box>
                        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mt: 1, pt: 1, borderTop: '1px solid rgba(255,255,255,0.05)' }}>
                            <Typography variant="body2" sx={{ color: 'text.secondary', fontWeight: 700 }}>Modo do Terminal:</Typography>
                            <Typography variant="body1" sx={{ color: '#FF3366', fontWeight: 800 }}>SAÍDA EXCLUSIVA</Typography>
                        </Box>
                    </Stack>
                )}
            </GlassCard>

            <GlassCard sx={{ p: 3 }}>
                <Stack direction="row" justifyContent="space-between" alignItems="center" mb={2}>
                    <Typography variant="subtitle2" sx={{ color: 'text.secondary', fontWeight: 700, letterSpacing: 1 }}>FLUXO RECENTE</Typography>
                    <HistoryIcon sx={{ color: 'text.secondary', fontSize: 18 }} />
                </Stack>
                <Stack spacing={2}>
                    {recentLogs.map((log) => (
                        <Box key={log.id} sx={{
                            display: 'flex', gap: 2, p: 1.5,
                            background: 'rgba(255,255,255,0.02)', borderRadius: 3, border: '1px solid rgba(255,255,255,0.05)',
                            transition: '0.2s', '&:hover': { background: 'rgba(0, 212, 255, 0.05)', borderColor: 'rgba(0, 212, 255, 0.2)' }
                        }}>
                            <Avatar sx={{
                                width: 36, height: 36, fontSize: '0.8rem', fontWeight: 800,
                                bgcolor: log.tipo === 'checkin' ? 'rgba(0,255,136,0.1)' : 'rgba(255,51,102,0.1)',
                                color: log.tipo === 'checkin' ? '#00FF88' : '#FF3366'
                            }}>
                                {log.pessoas?.nome?.charAt(0) || 'U'}
                            </Avatar>
                            <Box sx={{ flex: 1 }}>
                                <Typography variant="caption" sx={{ fontWeight: 800, color: '#fff' }}>{log.pessoas?.nome || 'NEXUS OPERADOR'}</Typography>
                                <Typography variant="caption" sx={{ color: 'text.secondary', display: 'flex', alignItems: 'center', gap: 0.5 }}>
                                    {new Date(log.created_at).toLocaleTimeString()} • {log.tipo.toUpperCase()} • {log.dispositivos_acesso?.nome || 'Web Dashboard'}
                                </Typography>
                            </Box>
                        </Box>
                    ))}
                    {recentLogs.length === 0 && (
                        <Typography variant="caption" sx={{ color: 'text.secondary', textAlign: 'center', py: 2 }}>NENHUMA ATIVIDADE</Typography>
                    )}
                </Stack>
            </GlassCard>
        </Stack>
    );
};

export default CheckoutStatsMonitor;
