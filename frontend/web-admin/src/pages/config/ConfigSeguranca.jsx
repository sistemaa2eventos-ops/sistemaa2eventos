import React, { useState, useEffect } from 'react';
import { Box, Typography, Grid, TextField, Switch, FormControlLabel, List, ListItem, ListItemText, CircularProgress } from '@mui/material';
import { Security as SecurityIcon, Lock as LockIcon, Save as SaveIcon } from '@mui/icons-material';
import { useSnackbar } from 'notistack';
import api from '../../services/api';
import PageHeader from '../../components/common/PageHeader';
import GlassCard from '../../components/common/GlassCard';
import NeonButton from '../../components/common/NeonButton';

const ConfigSeguranca = () => {
    const { enqueueSnackbar } = useSnackbar();
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);

    const [jwtExpiration, setJwtExpiration] = useState(8);
    const [force2FA, setForce2FA] = useState(true);
    const [ddosShield, setDdosShield] = useState(false);

    useEffect(() => {
        loadSettings();
    }, []);

    const loadSettings = async () => {
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
    };

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
            <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '50vh' }}>
                <CircularProgress color="primary" />
            </Box>
        );
    }
    return (
        <Box sx={{ p: { xs: 2, md: 4 } }}>
            <PageHeader
                title="Segurança & Permissões"
                subtitle="Políticas de acesso, criptografia e expiração de sessões AD."
                breadcrumbs={[{ text: 'Sistema' }, { text: 'Configurações' }, { text: 'Segurança' }]}
            />

            <Grid container spacing={4} sx={{ mt: 1 }}>
                <Grid item xs={12} md={5}>
                    <GlassCard sx={{ p: 3, mb: 4, height: '100%' }}>
                        <Box sx={{ display: 'flex', alignItems: 'center', mb: 3, gap: 2 }}>
                            <LockIcon sx={{ color: '#00D4FF', fontSize: 28 }} />
                            <Typography variant="h6" sx={{ fontWeight: 700, color: '#fff' }}>
                                JWT & SESSÕES
                            </Typography>
                        </Box>

                        <Box sx={{ mb: 3 }}>
                            <TextField
                                fullWidth
                                label="Token Expiration (Horas)"
                                value={jwtExpiration}
                                onChange={(e) => setJwtExpiration(e.target.value)}
                                type="number"
                                size="small"
                            />
                            <Typography variant="caption" color="text.secondary" sx={{ mt: 1, display: 'block' }}>
                                Após esse tempo, o sistema força logout automático do backoffice.
                            </Typography>
                        </Box>

                        <FormControlLabel
                            control={<Switch checked={force2FA} onChange={(e) => setForce2FA(e.target.checked)} color="primary" />}
                            label={<Typography sx={{ fontWeight: 600, color: '#fff' }}>Forçar Autenticação em 2 Fatores (Admin)</Typography>}
                            sx={{ mb: 2 }}
                        />
                        <FormControlLabel
                            control={<Switch checked={ddosShield} onChange={(e) => setDdosShield(e.target.checked)} color="primary" />}
                            label={<Typography sx={{ fontWeight: 600, color: '#fff' }}>Habilitar Bloqueio de IP (DDoS Shield)</Typography>}
                            sx={{ mb: 4 }}
                        />

                        <Box sx={{ display: 'flex', justifyContent: 'flex-end' }}>
                            <NeonButton onClick={handleSave} disabled={saving} startIcon={<SaveIcon />}>
                                {saving ? "SALVANDO..." : "SALVAR REGRAS"}
                            </NeonButton>
                        </Box>
                    </GlassCard>
                </Grid>

                <Grid item xs={12} md={7}>
                    <GlassCard sx={{ p: 3, mb: 4, height: '100%' }}>
                        <Box sx={{ display: 'flex', alignItems: 'center', mb: 3, gap: 2 }}>
                            <SecurityIcon sx={{ color: '#7B2FBE', fontSize: 28 }} />
                            <Typography variant="h6" sx={{ fontWeight: 700, color: '#fff' }}>
                                PERFIS DE ACESSO (RBAC)
                            </Typography>
                        </Box>

                        <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
                            Estes níveis de acesso determinam a visibilidade de botões e APIs nos painéis Frontend.
                        </Typography>

                        <List sx={{ bgcolor: 'rgba(0,0,0,0.2)', borderRadius: 2 }}>
                            <ListItem sx={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                                <ListItemText
                                    primary="[ADMIN] High-Level Operations"
                                    secondary="Acesso full a eventos globais, apagar banco de dados e modificar integrações Node/Python."
                                    primaryTypographyProps={{ color: '#00FF88', fontWeight: 700 }}
                                />
                            </ListItem>
                            <ListItem sx={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                                <ListItemText
                                    primary="[SUPERVISOR] Event Management"
                                    secondary="Pode exportar relatórios, cadastrar participantes, mas não muda parâmetros de hardware."
                                    primaryTypographyProps={{ color: '#00D4FF', fontWeight: 700 }}
                                />
                            </ListItem>
                            <ListItem sx={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                                <ListItemText
                                    primary="[OPERADOR] Reception & Control"
                                    secondary="Restrito ao PDV/Credenciamento final. Não possui acesso a relatórios gerenciais ou configurações."
                                    primaryTypographyProps={{ color: '#fff', fontWeight: 600 }}
                                />
                            </ListItem>
                        </List>

                        <Box sx={{ mt: 3, display: 'flex', justifyContent: 'center' }}>
                            <Typography variant="caption" sx={{ color: 'text.secondary' }}>*Edição customizada de Roles planejada para Update 2.0</Typography>
                        </Box>
                    </GlassCard>
                </Grid>
            </Grid>
        </Box>
    );
};

export default ConfigSeguranca;
