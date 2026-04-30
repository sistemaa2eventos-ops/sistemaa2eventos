import React, { useState, useEffect } from 'react';
import { Box, Typography, Grid, Slider, Switch, FormControlLabel, CircularProgress } from '@mui/material';
import { SyncAlt as CheckInOutIcon, Timer as TimerIcon, Group as GroupIcon, Save as SaveIcon } from '@mui/icons-material';
import { useSnackbar } from 'notistack';
import api from '../../services/api';
import PageHeader from '../../components/common/PageHeader';
import GlassCard from '../../components/common/GlassCard';
import NeonButton from '../../components/common/NeonButton';

const ConfigCheckin = () => {
    const { enqueueSnackbar } = useSnackbar();
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);

    const [apbEnabled, setApbEnabled] = useState(true);
    const [apbCooldown, setApbCooldown] = useState(15);
    const [autoCheckout, setAutoCheckout] = useState(300);
    const [hardBlock, setHardBlock] = useState(true);
    const [vipBypass, setVipBypass] = useState(false);

    useEffect(() => {
        loadSettings();
    }, []);

    const loadSettings = async () => {
        try {
            const { data } = await api.get('/settings');
            if (data?.success && data?.data) {
                const conf = data.data;
                setApbEnabled(!!conf.anti_passback_enabled);
                setApbCooldown(conf.anti_passback_cooldown_min || 0);
                setAutoCheckout(conf.auto_checkout_timeout_min || 300);
                setHardBlock(!!conf.capacity_hard_block_enabled);
                setVipBypass(!!conf.capacity_vip_bypass);
            }
        } catch (error) {
            enqueueSnackbar('Falha ao obter configurações atuais', { variant: 'error' });
        } finally {
            setLoading(false);
        }
    };

    const handleSave = async () => {
        setSaving(true);
        try {
            await api.put('/settings', {
                anti_passback_enabled: apbEnabled,
                anti_passback_cooldown_min: apbCooldown,
                auto_checkout_timeout_min: autoCheckout,
                capacity_hard_block_enabled: hardBlock,
                capacity_vip_bypass: vipBypass
            });
            enqueueSnackbar('Regras de Acesso salvas com sucesso!', { variant: 'success' });
        } catch (error) {
            enqueueSnackbar('Erro ao salvar as regras de acesso', { variant: 'error' });
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
                title="Regras de Acesso (Check-in)"
                subtitle="Configure temporizadores Anti-Passback e limites de Lotação."
                breadcrumbs={[{ text: 'Sistema' }, { text: 'Configurações' }, { text: 'Check-in / Check-out' }]}
            />

            <Grid container spacing={4} sx={{ mt: 1 }}>
                <Grid item xs={12} md={6}>
                    <GlassCard sx={{ p: 3, mb: 4, height: '100%' }}>
                        <Box sx={{ display: 'flex', alignItems: 'center', mb: 3, gap: 2 }}>
                            <TimerIcon sx={{ color: '#FF0088', fontSize: 28 }} />
                            <Typography variant="h6" sx={{ fontWeight: 700, color: '#fff' }}>
                                BLOQUEIO TEMPORAL (ANTI-PASSBACK)
                            </Typography>
                        </Box>

                        <Typography variant="body2" color="text.secondary" sx={{ mb: 4 }}>
                            Evite que a mesma credencial (QR Code ou Face) seja usada para múltiplos ingressos seguidos na mesma catraca ou evento.
                        </Typography>

                        <FormControlLabel
                            control={<Switch checked={apbEnabled} onChange={(e) => setApbEnabled(e.target.checked)} color="secondary" />}
                            label={<Typography sx={{ fontWeight: 600, color: '#fff' }}>Habilitar Anti-Passback</Typography>}
                            sx={{ mb: 3 }}
                        />

                        <Box sx={{ mb: 4, px: 2 }}>
                            <Typography gutterBottom sx={{ color: 'text.secondary', fontWeight: 600 }}>
                                Tempo de Cooldown Restrito (Minutos)
                            </Typography>
                            <Slider
                                value={apbCooldown}
                                onChange={(_, val) => setApbCooldown(val)}
                                step={5}
                                marks
                                min={0}
                                max={120}
                                valueLabelDisplay="auto"
                                sx={{ color: '#FF0088' }}
                            />
                            <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                                Tempo mínimo exigido antes que a credencial autorize uma nova entrada. 0 = Desativado.
                            </Typography>
                        </Box>

                        <Box sx={{ mb: 4, px: 2 }}>
                            <Typography gutterBottom sx={{ color: 'text.secondary', fontWeight: 600 }}>
                                Auto Check-out Virtual (Morte Súbita)
                            </Typography>
                            <Slider
                                value={autoCheckout}
                                onChange={(_, val) => setAutoCheckout(val)}
                                step={30}
                                marks
                                min={30}
                                max={720}
                                valueLabelDisplay="auto"
                                sx={{ color: '#00D4FF' }}
                            />
                            <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                                O Motor de Background fará check-out de credenciais paradas há mais de X minutos (Atual 300 min).
                            </Typography>
                        </Box>

                        <NeonButton color="secondary" onClick={handleSave} disabled={saving} startIcon={<SaveIcon />}>
                            {saving ? "SALVANDO..." : "APLICAR TEMPORIZADORES"}
                        </NeonButton>
                    </GlassCard>
                </Grid>

                <Grid item xs={12} md={6}>
                    <GlassCard sx={{ p: 3, mb: 4, height: '100%' }}>
                        <Box sx={{ display: 'flex', alignItems: 'center', mb: 3, gap: 2 }}>
                            <GroupIcon sx={{ color: '#00D4FF', fontSize: 28 }} />
                            <Typography variant="h6" sx={{ fontWeight: 700, color: '#fff' }}>
                                CONTENÇÃO E LOTAÇÃO
                            </Typography>
                        </Box>

                        <Typography variant="body2" color="text.secondary" sx={{ mb: 4 }}>
                            Caso o evento (Global) ou uma área atinja 100% de capacidade, o NZT bloqueará automaticamente as catracas para evitar superlotação do corpo de bombeiros.
                        </Typography>

                        <FormControlLabel
                            control={<Switch checked={hardBlock} onChange={(e) => setHardBlock(e.target.checked)} color="primary" />}
                            label={<Typography sx={{ fontWeight: 600, color: '#fff' }}>Bloqueio Rígido em 100% Capacidade</Typography>}
                            sx={{ mb: 3 }}
                        />

                        <FormControlLabel
                            control={<Switch checked={vipBypass} onChange={(e) => setVipBypass(e.target.checked)} color="primary" />}
                            label={<Typography sx={{ fontWeight: 600, color: '#fff' }}>Verificação de Vínculo Contratual (VIPs ignoram Lotacao)</Typography>}
                            sx={{ mb: 4 }}
                        />

                        <Box sx={{ p: 2, bgcolor: 'rgba(0, 212, 255, 0.05)', border: '1px dashed rgba(0,212,255,0.3)', borderRadius: 2 }}>
                            <Typography variant="subtitle2" sx={{ color: '#00D4FF', mb: 1, fontWeight: 700 }}>Inteligência Edge Ativa</Typography>
                            <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                                O Bloqueio Rígido informa aos terminais faciais o comando 'No-Open' instantaneamente assim que o limite local estourar. O acesso só volta ao normal se ocorrer saídas (Check-out).
                            </Typography>
                        </Box>
                        <Box sx={{ mt: 3, display: 'flex', justifyContent: 'flex-end' }}>
                            <NeonButton onClick={handleSave} disabled={saving} startIcon={<SaveIcon />}>
                                {saving ? "SALVANDO..." : "SALVAR LOTAÇÃO"}
                            </NeonButton>
                        </Box>
                    </GlassCard>
                </Grid>
            </Grid>
        </Box>
    );
};

export default ConfigCheckin;
