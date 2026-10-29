import React, { useState, useEffect, useCallback } from 'react';
import { Box, Typography, Grid, TextField, Switch, FormControlLabel, List, ListItem, ListItemText, CircularProgress } from '@mui/material';
import { Security as SecurityIcon, Lock as LockIcon, Save as SaveIcon } from '@mui/icons-material';
import { useSnackbar } from 'notistack';
import api from '../../services/api';
import PageHeader from '../../components/common/PageHeader';
import { funcao, papeis } from '../../styles/tokens';
import GlassCard from '../../components/common/GlassCard';
import NeonButton from '../../components/common/NeonButton';

const ConfigSeguranca = () => {
    const { enqueueSnackbar } = useSnackbar();
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);

    const [jwtExpiration, setJwtExpiration] = useState(8);
    const [force2FA, setForce2FA] = useState(true);
    const [ddosShield, setDdosShield] = useState(false);

    const loadSettings = useCallback(async () => {
        try {
            const { data } = await api.get('/settings');
            if (data?.success && data?.data) {
                const conf = data.data;
                setJwtExpiration(conf.jwt_expiration_hours || 8);
                setForce2FA(!!conf.force_2fa_admin);
                setDdosShield(!!conf.ddos_shield_enabled);
            }
        } catch (error) {
            enqueueSnackbar('Falha ao obter configurações de segurança', { variant: 'error' });
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
                jwt_expiration_hours: parseInt(jwtExpiration, 10),
                force_2fa_admin: force2FA,
                ddos_shield_enabled: ddosShield
            });
            enqueueSnackbar('Regras de segurança salvas!', { variant: 'success' });
        } catch (error) {
            enqueueSnackbar('Erro ao salvar as regras', { variant: 'error' });
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
                title="Segurança"
                subtitle="Sessões, autenticação e proteção de acesso."
                breadcrumbs={[{ text: 'Sistema' }, { text: 'Configurações' }, { text: 'Segurança' }]}
            />

            <Grid container spacing={4} sx={{ mt: 1 }}>
                <Grid item xs={12} md={5}>
                    <GlassCard sx={{ p: 3, mb: 4, height: '100%' }}>
                        <Box sx={{ display: 'flex', alignItems: 'center', mb: 3, gap: 2 }}>
                            <LockIcon sx={{ color: '#00D4FF', fontSize: 28 }} />
                            <Typography variant="h6" sx={{ fontWeight: 700, color: '#FFFFFF' }}>
                                Sessões de login
                            </Typography>
                        </Box>

                        <Box sx={{ mb: 3 }}>
                            <TextField
                                fullWidth
                                label="Duração do login (horas)"
                                value={jwtExpiration}
                                onChange={(e) => setJwtExpiration(e.target.value)}
                                type="number"
                                size="small"
                            />
                            <Typography variant="caption" color="text.secondary" sx={{ mt: 1, display: 'block' }}>
                                Depois desse tempo, o operador precisa entrar de novo no painel.
                            </Typography>
                        </Box>

                        <FormControlLabel
                            control={<Switch checked={force2FA} onChange={(e) => setForce2FA(e.target.checked)} color="primary" />}
                            label={<Typography sx={{ fontWeight: 600, color: '#FFFFFF' }}>Exigir verificação em duas etapas para admins</Typography>}
                            sx={{ mb: 2 }}
                        />
                        <FormControlLabel
                            control={<Switch checked={ddosShield} onChange={(e) => setDdosShield(e.target.checked)} color="primary" />}
                            label={<Typography sx={{ fontWeight: 600, color: '#FFFFFF' }}>Bloquear IPs com tentativas suspeitas</Typography>}
                            sx={{ mb: 4 }}
                        />

                        <Box sx={{ display: 'flex', justifyContent: 'flex-end' }}>
                            <NeonButton onClick={handleSave} disabled={saving} startIcon={<SaveIcon />}>
                                {saving ? "Salvando..." : "Salvar regras"}
                            </NeonButton>
                        </Box>
                    </GlassCard>
                </Grid>

                <Grid item xs={12} md={7}>
                    <GlassCard sx={{ p: 3, mb: 4, height: '100%' }}>
                        <Box sx={{ display: 'flex', alignItems: 'center', mb: 3, gap: 2 }}>
                            <SecurityIcon sx={{ color: funcao.acao, fontSize: 28 }} />
                            <Typography variant="h6" sx={{ fontWeight: 700, color: '#FFFFFF' }}>
                                Perfis de acesso
                            </Typography>
                        </Box>

                        <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
                            O sistema tem dois perfis. O que cada operador vê é definido em Perfis de acesso e em Usuários.
                        </Typography>

                        <List sx={{ bgcolor: 'rgba(0,0,0,0.2)', borderRadius: 1.5 }}>
                            <ListItem sx={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                                <ListItemText
                                    primary={papeis.admin_master.rotulo}
                                    secondary="Acesso total: todos os eventos, usuários, configurações e integrações."
                                    primaryTypographyProps={{ color: papeis.admin_master.cor, fontWeight: 700 }}
                                />
                            </ListItem>
                            <ListItem>
                                <ListItemText
                                    primary={papeis.operador.rotulo}
                                    secondary="Acessa só os módulos liberados para ele (check-in, checkout, relatórios…) nos eventos em que foi vinculado."
                                    primaryTypographyProps={{ color: papeis.operador.cor, fontWeight: 700 }}
                                />
                            </ListItem>
                        </List>
                    </GlassCard>
                </Grid>
            </Grid>
        </Box>
    );
};

export default ConfigSeguranca;
