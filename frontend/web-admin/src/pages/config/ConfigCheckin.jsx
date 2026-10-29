import React, { useState, useEffect, useCallback } from 'react';
import { Box, Typography, Grid, Slider, Switch, FormControlLabel, CircularProgress } from '@mui/material';
import { Timer as TimerIcon, Group as GroupIcon, Save as SaveIcon } from '@mui/icons-material';
import { useSnackbar } from 'notistack';
import api from '../../services/api';
import PageHeader from '../../components/common/PageHeader';
import GlassCard from '../../components/common/GlassCard';
import NeonButton from '../../components/common/NeonButton';

import { funcao, tom } from '../../styles/tokens';
const ConfigCheckin = () => {
    const { enqueueSnackbar } = useSnackbar();
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);

    const [apbEnabled, setApbEnabled] = useState(true);
    const [apbCooldown, setApbCooldown] = useState(15);
    const [autoCheckout, setAutoCheckout] = useState(300);
    const [hardBlock, setHardBlock] = useState(true);
    const [vipBypass, setVipBypass] = useState(false);

    const loadSettings = useCallback(async () => {
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
    }, [enqueueSnackbar]);

    useEffect(() => {
        loadSettings();
    }, [loadSettings]);

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
            <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '50dvh' }}>
                <CircularProgress color="primary" />
            </Box>
        );
    }
    return (
        <Box sx={{ p: { xs: 2, md: 4 } }}>
            <PageHeader
                title="Regras de acesso"
                subtitle="Tempo mínimo entre passagens e limites de lotação."
                breadcrumbs={[{ text: 'Sistema' }, { text: 'Configurações' }, { text: 'Check-in / check-out' }]}
            />

            <Grid container spacing={4} sx={{ mt: 1 }}>
                <Grid item xs={12} md={6}>
                    <GlassCard sx={{ p: 3, mb: 4, height: '100%' }}>
                        <Box sx={{ display: 'flex', alignItems: 'center', mb: 3, gap: 2 }}>
                            <TimerIcon sx={{ color: funcao.acao, fontSize: 28 }} />
                            <Typography variant="h6" sx={{ fontWeight: 700, color: '#FFFFFF' }}>
                                Bloqueio temporal (anti-passback)
                            </Typography>
                        </Box>

                        <Typography variant="body2" color="text.secondary" sx={{ mb: 4 }}>
                            Impede que a mesma credencial (QR code, pulseira ou rosto) seja usada para entrar de novo logo em seguida.
                        </Typography>

                        <FormControlLabel
                            control={<Switch checked={apbEnabled} onChange={(e) => setApbEnabled(e.target.checked)} />}
                            label={<Typography sx={{ fontWeight: 600, color: '#FFFFFF' }}>Ativar anti-passback</Typography>}
                            sx={{ mb: 3 }}
                        />

                        <Box sx={{ mb: 4, px: 2 }}>
                            <Typography gutterBottom sx={{ color: 'text.secondary', fontWeight: 600 }}>
                                Tempo mínimo entre entradas (minutos)
                            </Typography>
                            <Slider
                                value={apbCooldown}
                                onChange={(_, val) => setApbCooldown(val)}
                                step={5}
                                marks
                                min={0}
                                max={120}
                                valueLabelDisplay="auto"
                            />
                            <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                                Depois de entrar, a mesma credencial só libera uma nova entrada após esse tempo. 0 = sem limite.
                            </Typography>
                        </Box>

                        <Box sx={{ mb: 4, px: 2 }}>
                            <Typography gutterBottom sx={{ color: 'text.secondary', fontWeight: 600 }}>
                                Saída automática por inatividade (minutos)
                            </Typography>
                            <Slider
                                value={autoCheckout}
                                onChange={(_, val) => setAutoCheckout(val)}
                                step={30}
                                marks
                                min={30}
                                max={720}
                                valueLabelDisplay="auto"
                            />
                            <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                                Quem está há mais de {autoCheckout} minutos sem nenhuma passagem recebe saída automática.
                            </Typography>
                        </Box>

                        <NeonButton onClick={handleSave} disabled={saving} startIcon={<SaveIcon />}>
                            {saving ? "Salvando..." : "Salvar regras de tempo"}
                        </NeonButton>
                    </GlassCard>
                </Grid>

                <Grid item xs={12} md={6}>
                    <GlassCard sx={{ p: 3, mb: 4, height: '100%' }}>
                        <Box sx={{ display: 'flex', alignItems: 'center', mb: 3, gap: 2 }}>
                            <GroupIcon sx={{ color: funcao.acao, fontSize: 28 }} />
                            <Typography variant="h6" sx={{ fontWeight: 700, color: '#FFFFFF' }}>
                                Contenção e lotação
                            </Typography>
                        </Box>

                        <Typography variant="body2" color="text.secondary" sx={{ mb: 4 }}>
                            Quando o evento ou uma área chega à capacidade máxima, as entradas são bloqueadas para não passar do limite aprovado (bombeiros).
                        </Typography>

                        <FormControlLabel
                            control={<Switch checked={hardBlock} onChange={(e) => setHardBlock(e.target.checked)} color="primary" />}
                            label={<Typography sx={{ fontWeight: 600, color: '#FFFFFF' }}>Bloquear entradas ao atingir a capacidade</Typography>}
                            sx={{ mb: 3 }}
                        />

                        <FormControlLabel
                            control={<Switch checked={vipBypass} onChange={(e) => setVipBypass(e.target.checked)} color="primary" />}
                            label={<Typography sx={{ fontWeight: 600, color: '#FFFFFF' }}>VIPs entram mesmo com a lotação cheia</Typography>}
                            sx={{ mb: 4 }}
                        />

                        <Box sx={{ p: 2, bgcolor: tom(funcao.acao, 0.05), border: `1px solid ${tom(funcao.acao, 0.25)}`, borderRadius: 1.5 }}>
                            <Typography variant="subtitle2" sx={{ mb: 1, fontWeight: 700 }}>Como funciona nos leitores</Typography>
                            <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                                Com o bloqueio ligado, os leitores faciais deixam de liberar a catraca assim que a lotação enche. As entradas voltam quando houver saídas.
                            </Typography>
                        </Box>
                        <Box sx={{ mt: 3, display: 'flex', justifyContent: 'flex-end' }}>
                            <NeonButton onClick={handleSave} disabled={saving} startIcon={<SaveIcon />}>
                                {saving ? "Salvando..." : "Salvar lotação"}
                            </NeonButton>
                        </Box>
                    </GlassCard>
                </Grid>
            </Grid>
        </Box>
    );
};

export default ConfigCheckin;
