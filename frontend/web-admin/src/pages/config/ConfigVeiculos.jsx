import React, { useState, useEffect, useCallback } from 'react';
import { Box, Typography, Grid, TextField, Switch, FormControlLabel, CircularProgress } from '@mui/material';
import { DirectionsCar as CarIcon, LocalParking as ParkingIcon, Save as SaveIcon } from '@mui/icons-material';
import { useSnackbar } from 'notistack';
import api from '../../services/api';
import PageHeader from '../../components/common/PageHeader';
import GlassCard from '../../components/common/GlassCard';
import NeonButton from '../../components/common/NeonButton';

const ConfigVeiculos = () => {
    const { enqueueSnackbar } = useSnackbar();
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);

    const [anprEnabled, setAnprEnabled] = useState(false);
    const [anprEndpoint, setAnprEndpoint] = useState('http://localhost:5001');
    const [anprConfidence, setAnprConfidence] = useState(90);
    const [anprLogRetention, setAnprLogRetention] = useState(30);

    const loadSettings = useCallback(async () => {
        try {
            const { data } = await api.get('/settings');
            if (data?.success && data?.data) {
                const conf = data.data;
                setAnprEnabled(!!conf.anpr_enabled);
                setAnprEndpoint(conf.anpr_endpoint || 'http://localhost:5001');
                setAnprConfidence(conf.anpr_confidence_min || 90);
                setAnprLogRetention(conf.anpr_log_retention_days || 30);
            }
        } catch (error) {
            enqueueSnackbar('Falha ao obter configurações atuais', { variant: 'error' });
        } finally {
            setLoading(false);
        }
    }, [enqueueSnackbar]);

    useEffect(() => {
        loadSettings();
    }, [loadSettings]);

    const handleSave = async () => {
        setSaving(true);
        try {
            await api.put('/settings', {
                anpr_enabled: anprEnabled,
                anpr_endpoint: anprEndpoint,
                anpr_confidence_min: parseInt(anprConfidence, 10),
                anpr_log_retention_days: parseInt(anprLogRetention, 10)
            });
            enqueueSnackbar('Configurações LPR/ANPR salvas com sucesso!', { variant: 'success' });
        } catch (error) {
            enqueueSnackbar('Erro ao salvar configurações', { variant: 'error' });
        } finally {
            setSaving(false);
        }
    };

    if (loading) {
        return (
            <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '50dvh' }}>
                <CircularProgress color="primary" />
            </Box>
        );
    }
    return (
        <Box sx={{ p: { xs: 1.5, sm: 2.5, md: 3 }, maxWidth: '100%', overflowX: 'hidden' }}>
            <PageHeader
                title="Veículos e estacionamento"
                subtitle="Leitura de placas (LPR) e cancelas."
                breadcrumbs={[{ text: 'Configurações' }, { text: 'Veículos & estacionamento' }]}
            />

            <Grid container spacing={3} sx={{ mt: 1 }}>
                <Grid item xs={12} md={6}>
                    <GlassCard sx={{ p: { xs: 2, sm: 3 }, mb: 4 }}>
                        <Box sx={{ display: 'flex', alignItems: 'center', mb: 3, gap: 2 }}>
                            <CarIcon sx={{ color: '#00D4FF', fontSize: 28 }} />
                            <Typography variant="h6" sx={{ fontWeight: 700, color: '#FFFFFF' }}>
                                MOTOR ANPR / LPR (Leitura de Placas)
                            </Typography>
                        </Box>

                        <FormControlLabel
                            control={<Switch checked={anprEnabled} onChange={(e) => setAnprEnabled(e.target.checked)} color="primary" />}
                            label={<Typography sx={{ fontWeight: 600, color: '#FFFFFF' }}>Habilitar módulo de estacionamento</Typography>}
                            sx={{ mb: 3 }}
                        />

                        <Grid container spacing={2}>
                            <Grid item xs={12}>
                                <TextField
                                    fullWidth
                                    label="Endpoint motor LPR IA"
                                    value={anprEndpoint}
                                    onChange={(e) => setAnprEndpoint(e.target.value)}
                                    size="small"
                                />
                            </Grid>
                            <Grid item xs={12} md={6}>
                                <TextField
                                    fullWidth
                                    label="Confiança minima (%)"
                                    value={anprConfidence}
                                    onChange={(e) => setAnprConfidence(e.target.value)}
                                    type="number"
                                    size="small"
                                />
                            </Grid>
                            <Grid item xs={12} md={6}>
                                <TextField
                                    fullWidth
                                    label="Tempo retenção log (dias)"
                                    value={anprLogRetention}
                                    onChange={(e) => setAnprLogRetention(e.target.value)}
                                    type="number"
                                    size="small"
                                />
                            </Grid>
                        </Grid>

                        <Box sx={{ mt: 3, display: 'flex', justifyContent: 'flex-end' }}>
                            <NeonButton onClick={handleSave} disabled={saving} startIcon={<SaveIcon />} sx={{ height: 38, minHeight: 38, borderRadius: '8px' }}>
                                {saving ? "Salvando..." : "Salvar leitura de placas"}
                            </NeonButton>
                        </Box>
                    </GlassCard>
                </Grid>

                <Grid item xs={12} md={6}>
                    <GlassCard sx={{ p: 3, mb: 4, opacity: 0.6 }}>
                        <Box sx={{ display: 'flex', alignItems: 'center', mb: 3, gap: 2 }}>
                            <ParkingIcon sx={{ color: 'text.secondary', fontSize: 28 }} />
                            <Typography variant="h6" sx={{ fontWeight: 700, color: 'text.secondary' }}>
                                Cancelas e estacionamentos
                            </Typography>
                        </Box>
                        <Box sx={{ textAlign: 'center', py: 6 }}>
                            <Typography variant="body1" sx={{ color: 'text.secondary', fontWeight: 600 }}>
                                Nenhuma cancela ou controladora veicular detectada na rede.
                            </Typography>
                            <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block', mt: 1 }}>
                                Instale um nó Edge compatível (ZKTeco ou Intelbras Veicular) para mapear áreas de estacionamento.
                            </Typography>
                        </Box>
                    </GlassCard>
                </Grid>
            </Grid>
        </Box>
    );
};

export default ConfigVeiculos;
