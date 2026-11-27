import React, { useState, useEffect, useCallback } from 'react';
import { Box, Typography, Grid, TextField, Switch, FormControlLabel, CircularProgress, Button, Stack } from '@mui/material';
import {
    Security as SecurityIcon,
    Lock as LockIcon,
    Save as SaveIcon,
    Logout as LogoutAllIcon,
    VerifiedUser as PerfisIcon,
    People as PeopleIcon,
    OpenInNew as OpenIcon
} from '@mui/icons-material';
import { useNavigate } from 'react-router-dom';
import { useSnackbar } from 'notistack';
import api from '../../services/api';
import PageHeader from '../../components/common/PageHeader';
import { botaoSecundario, cores, funcao, tamanhos, tom } from '../../styles/tokens';
import GlassCard from '../../components/common/GlassCard';
import NeonButton from '../../components/common/NeonButton';
import { useConfirmacao } from '../../contexts/ConfirmacaoContext';

const ConfigSeguranca = () => {
    const navigate = useNavigate();
    const confirmar = useConfirmacao();
    const { enqueueSnackbar } = useSnackbar();
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [revoking, setRevoking] = useState(false);

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

    const handleForceLogoutAll = async () => {
        const ok = await confirmar({
            titulo: 'Encerrar todas as sessões ativas',
            mensagem: 'Todos os operadores conectados serão desconectados imediatamente e precisarão entrar novamente. Sua sessão atual continua ativa. Deseja prosseguir?',
            textoConfirmar: 'Desconectar todos'
        });
        if (!ok) return;
        setRevoking(true);
        try {
            const { data } = await api.post('/settings/force-logout-all');
            enqueueSnackbar(data?.message || 'Sessões encerradas com sucesso.', { variant: 'info' });
        } catch (error) {
            enqueueSnackbar(error.response?.data?.error || 'Erro ao encerrar sessões ativas.', { variant: 'error' });
        } finally {
            setRevoking(false);
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
        <Box sx={{ p: { xs: 2, sm: 3, md: 4 }, maxWidth: 1600, mx: 'auto', width: '100%' }}>
            <PageHeader
                title="Segurança"
                subtitle="Sessões, autenticação e proteção de acesso."
                breadcrumbs={[{ text: 'Sistema' }, { text: 'Configurações' }, { text: 'Segurança' }]}
            />

            <Grid container spacing={4} sx={{ mt: 1 }}>
                <Grid item xs={12} md={5}>
                    <GlassCard sx={{ p: 3, mb: 4, height: '100%' }}>
                        <Box sx={{ display: 'flex', alignItems: 'center', mb: 3, gap: 2 }}>
                            <LockIcon sx={{ color: cores.primaria, fontSize: 28 }} />
                            <Typography variant="h6" sx={{ fontWeight: 700, color: cores.textoForte }}>
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
                            label={<Typography sx={{ fontWeight: 600, color: cores.textoForte }}>Exigir verificação em duas etapas para admins</Typography>}
                            sx={{ mb: 2 }}
                        />
                        <FormControlLabel
                            control={<Switch checked={ddosShield} onChange={(e) => setDdosShield(e.target.checked)} color="primary" />}
                            label={<Typography sx={{ fontWeight: 600, color: cores.textoForte }}>Bloquear IPs com tentativas suspeitas</Typography>}
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
                    <GlassCard sx={{ p: 3, mb: 4, height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
                        <Box>
                            <Box sx={{ display: 'flex', alignItems: 'center', mb: 2, gap: 2 }}>
                                <SecurityIcon sx={{ color: funcao.negado, fontSize: 28 }} />
                                <Typography variant="h6" sx={{ fontWeight: 700, color: cores.textoForte }}>
                                    Revogação de sessões em tempo real
                                </Typography>
                            </Box>

                            <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
                                Em caso de troca urgente de equipe, perda de equipamento em campo ou suspeita de credencial compartilhada, encerre todas as sessões abertas dos operadores imediatamente.
                            </Typography>

                            <Box sx={{ p: 2.5, borderRadius: 1.5, bgcolor: cores.fundo, border: `1px solid ${tom(cores.erro, 0.3)}`, mb: 3 }}>
                                <Typography sx={{ fontSize: tamanhos.md, fontWeight: 700, color: cores.textoForte, mb: 0.5 }}>
                                    Desconexão global de emergência
                                </Typography>
                                <Typography sx={{ fontSize: tamanhos.xs, color: cores.textoSecundario, mb: 2, lineHeight: 1.45 }}>
                                    Invalida os tokens ativos de todos os demais usuários sem desativar os cadastros. Quem continuar autorizado poderá fazer login normalmente em seguida.
                                </Typography>
                                <NeonButton
                                    neonColor={cores.erro}
                                    startIcon={<LogoutAllIcon />}
                                    loading={revoking}
                                    onClick={handleForceLogoutAll}
                                >
                                    Desconectar todos os operadores agora
                                </NeonButton>
                            </Box>
                        </Box>

                        <Box sx={{ pt: 2, borderTop: `1px solid ${cores.borda}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 1 }}>
                            <Typography sx={{ fontSize: tamanhos.xs, color: cores.textoSecundario }}>
                                Papéis, módulos liberados e vínculos por evento são gerenciados em:
                            </Typography>
                            <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
                                <Button
                                    size="small"
                                    variant="outlined"
                                    startIcon={<PerfisIcon sx={{ fontSize: 16 }} />}
                                    endIcon={<OpenIcon sx={{ fontSize: 14 }} />}
                                    onClick={() => navigate('/config/permissoes')}
                                    sx={{ ...botaoSecundario, minHeight: 34, fontSize: tamanhos.xs }}
                                >
                                    Perfis de acesso
                                </Button>
                                <Button
                                    size="small"
                                    variant="outlined"
                                    startIcon={<PeopleIcon sx={{ fontSize: 16 }} />}
                                    endIcon={<OpenIcon sx={{ fontSize: 14 }} />}
                                    onClick={() => navigate('/usuarios')}
                                    sx={{ ...botaoSecundario, minHeight: 34, fontSize: tamanhos.xs }}
                                >
                                    Operadores
                                </Button>
                            </Stack>
                        </Box>
                    </GlassCard>
                </Grid>
            </Grid>
        </Box>
    );
};

export default ConfigSeguranca;
