import React, { useState, useEffect } from 'react';
import {
    Box, Typography, Grid, TextField, Switch, FormControlLabel,
    CircularProgress, Stack, Avatar
} from '@mui/material';
import {
    EmojiEvents as TrophyIcon,
    Timeline as TimelineIcon,
    Save as SaveIcon,
    Insights as ChartIcon
} from '@mui/icons-material';
import { useSnackbar } from 'notistack';
import api from '../../services/api';
import PageHeader from '../../components/common/PageHeader';
import GlassCard from '../../components/common/GlassCard';
import NeonButton from '../../components/common/NeonButton';

const ConfigGamificacao = () => {
    const { enqueueSnackbar } = useSnackbar();
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);

    const [gamificationEnabled, setGamificationEnabled] = useState(false);
    const [pointsScan, setPointsScan] = useState(15);
    const [pointsEarlybird, setPointsEarlybird] = useState(50);
    const [pointsCheckin, setPointsCheckin] = useState(10);
    const [ranking, setRanking] = useState([]);

    useEffect(() => {
        loadSettings();
    }, [enqueueSnackbar]);

    const loadSettings = async () => {
        try {
            const [settingsRes, rankingRes] = await Promise.all([
                api.get('/settings'),
                api.get('/reports/ranking').catch(() => ({ data: { success: false } }))
            ]);

            if (settingsRes.data?.success && settingsRes.data?.data) {
                const conf = settingsRes.data.data;
                setGamificationEnabled(!!conf.gamification_enabled);
                setPointsScan(conf.gamification_points_scan || 15);
                setPointsEarlybird(conf.gamification_points_earlybird || 50);
                setPointsCheckin(conf.gamification_points_checkin || 10);
            }

            if (rankingRes.data?.success) {
                setRanking(rankingRes.data.data || []);
            }
        } catch (error) {
            console.error('Erro ao carregar gamificação:', error);
            enqueueSnackbar('Falha ao obter configurações atuais', { variant: 'error' });
        } finally {
            setLoading(false);
        }
    };

    const handleSave = async () => {
        setSaving(true);
        try {
            await api.put('/settings', {
                gamification_enabled: gamificationEnabled,
                gamification_points_scan: parseInt(pointsScan, 10),
                gamification_points_earlybird: parseInt(pointsEarlybird, 10),
                gamification_points_checkin: parseInt(pointsCheckin, 10)
            });
            enqueueSnackbar('Configurações de Gamificação salvas!', { variant: 'success' });
        } catch (error) {
            console.error('Erro ao salvar gamificação:', error);
            enqueueSnackbar('Erro ao salvar engine score', { variant: 'error' });
        } finally {
            setSaving(false);
        }
    };

    if (loading) {
        return (
            <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '50vh' }}>
                <CircularProgress color="primary" />
            </Box>
        );
    }

    return (
        <Box sx={{ p: { xs: 2, md: 4 } }}>
            <PageHeader
                title="Gamificação & Analytics"
                subtitle="Crie pesos (scores) para ações do participante a fim de classificar métricas."
                breadcrumbs={[{ text: 'Sistema' }, { text: 'Configurações' }, { text: 'Engajamento Global' }]}
            />

            <Grid container spacing={4} sx={{ mt: 1 }}>
                <Grid item xs={12} md={6}>
                    <GlassCard sx={{ p: 3, mb: 4, height: '100%' }}>
                        <Box sx={{ display: 'flex', alignItems: 'center', mb: 3, gap: 2 }}>
                            <TrophyIcon sx={{ color: '#FFC107', fontSize: 28 }} />
                            <Typography variant="h6" sx={{ fontWeight: 700, color: '#fff' }}>
                                MOTORES DE RECOMPENSA (PONTOS)
                            </Typography>
                        </Box>

                        <FormControlLabel
                            control={<Switch checked={gamificationEnabled} onChange={(e) => setGamificationEnabled(e.target.checked)} color="primary" />}
                            label={<Typography sx={{ fontWeight: 600, color: '#fff' }}>Computar Pontuação por Ações Isoladas</Typography>}
                            sx={{ mb: 4 }}
                        />

                        <Grid container spacing={3}>
                            <Grid item xs={12}>
                                <TextField fullWidth label="Pontos: Visitar Estandes (Scan Expositor)" value={pointsScan} onChange={(e) => setPointsScan(e.target.value)} type="number" size="small" />
                            </Grid>
                            <Grid item xs={12}>
                                <TextField fullWidth label="Pontos: Primeiras 100 Inscrições no Credenciamento" value={pointsEarlybird} onChange={(e) => setPointsEarlybird(e.target.value)} type="number" size="small" />
                            </Grid>
                            <Grid item xs={12}>
                                <TextField fullWidth label="Pontos: Check-in Master de Entrada (Participou Realmente)" value={pointsCheckin} onChange={(e) => setPointsCheckin(e.target.value)} type="number" size="small" />
                            </Grid>
                        </Grid>

                        <Box sx={{ mt: 4, display: 'flex', justifyContent: 'flex-end' }}>
                            <NeonButton onClick={handleSave} disabled={saving} startIcon={<SaveIcon />} sx={{ bgcolor: 'rgba(255, 193, 7, 0.2)', color: '#FFC107', '&:hover': { bgcolor: 'rgba(255, 193, 7, 0.4)' } }}>
                                {saving ? "SALVANDO..." : "DEPLOY ENGINE SCORE"}
                            </NeonButton>
                        </Box>
                    </GlassCard>
                </Grid>

                <Grid item xs={12} md={6}>
                    <GlassCard sx={{ p: 3, mb: 4, height: '100%' }}>
                        <Box sx={{ display: 'flex', alignItems: 'center', mb: 3, gap: 2 }}>
                            <TimelineIcon sx={{ color: '#00D4FF', fontSize: 28 }} />
                            <Typography variant="h6" sx={{ fontWeight: 700, color: '#fff' }}>
                                LÍDERES DE ENGAJAMENTO (TOP 5)
                            </Typography>
                        </Box>

                        <Stack spacing={2}>
                            {ranking.length > 0 ? (
                                ranking.slice(0, 5).map((user, index) => (
                                    <Box key={user.id || index} sx={{
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: 2,
                                        p: 1.5,
                                        borderRadius: 2,
                                        bgcolor: 'rgba(255,255,255,0.03)',
                                        border: index === 0 ? '1px solid rgba(0, 212, 255, 0.3)' : '1px solid transparent'
                                    }}>
                                        <Typography variant="h6" sx={{ color: index === 0 ? '#00D4FF' : 'text.secondary', width: 25, fontWeight: 900 }}>
                                            {index + 1}
                                        </Typography>
                                        <Avatar src={user.foto} sx={{ border: '2px solid rgba(255,255,255,0.1)' }} />
                                        <Box sx={{ flex: 1 }}>
                                            <Typography variant="body2" sx={{ fontWeight: 700, color: '#fff' }}>{user.nome?.toUpperCase()}</Typography>
                                            <Typography variant="caption" sx={{ color: 'text.secondary' }}>{user.empresa}</Typography>
                                        </Box>
                                        <Box sx={{ textAlign: 'right' }}>
                                            <Typography variant="body2" sx={{ fontWeight: 900, color: '#00FF88' }}>{user.score} pts</Typography>
                                            <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block' }}>{user.atividades} ações</Typography>
                                        </Box>
                                    </Box>
                                ))
                            ) : (
                                <Box sx={{ textAlign: 'center', py: 6, opacity: 0.6 }}>
                                    <Typography variant="body2">Nenhum dado de engajamento computado ainda.</Typography>
                                </Box>
                            )}
                        </Stack>

                        <Box sx={{ mt: 3, p: 2, bgcolor: 'rgba(0,0,0,0.2)', borderRadius: 1 }}>
                            <Typography variant="caption" sx={{ color: 'text.secondary', display: 'flex', alignItems: 'center', gap: 1 }}>
                                <ChartIcon sx={{ fontSize: 14 }} /> Atualização em tempo real baseada em logs de acesso campo.
                            </Typography>
                        </Box>
                    </GlassCard>
                </Grid>
            </Grid>
        </Box>
    );
};

export default ConfigGamificacao;
