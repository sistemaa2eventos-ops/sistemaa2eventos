import React, { useState, useEffect } from 'react';
import { Box, Typography, Grid, TextField, Switch, FormControlLabel, Button, CircularProgress } from '@mui/material';
import { Email as MailIcon, Message as SmsIcon, Save as SaveIcon } from '@mui/icons-material';
import { useSnackbar } from 'notistack';
import api from '../../services/api';
import PageHeader from '../../components/common/PageHeader';
import GlassCard from '../../components/common/GlassCard';
import NeonButton from '../../components/common/NeonButton';

const ConfigComunicacao = () => {
    const { enqueueSnackbar } = useSnackbar();
    const [loading, setLoading] = useState(true);
    const [savingSmtp, setSavingSmtp] = useState(false);
    const [savingWpp, setSavingWpp] = useState(false);

    // SMTP Configs
    const [smtpEnabled, setSmtpEnabled] = useState(true);
    const [smtpHost, setSmtpHost] = useState('');
    const [smtpPort, setSmtpPort] = useState(465);
    const [smtpEmail, setSmtpEmail] = useState('');
    const [smtpUser, setSmtpUser] = useState('');
    const [smtpPass, setSmtpPass] = useState('');

    // WPP Configs
    const [wppEnabled, setWppEnabled] = useState(false);
    const [wppProvider, setWppProvider] = useState('twilio');
    const [wppToken, setWppToken] = useState('');
    const [wppPhoneId, setWppPhoneId] = useState('');

    useEffect(() => {
        loadSettings();
    }, []);

    const loadSettings = async () => {
        try {
            const { data } = await api.get('/settings');
            if (data?.success && data?.data) {
                const conf = data.data;
                // SMTP
                setSmtpEnabled(!!conf.smtp_enabled);
                setSmtpHost(conf.smtp_host || '');
                setSmtpPort(conf.smtp_port || 465);
                setSmtpEmail(conf.smtp_email || '');
                setSmtpUser(conf.smtp_user || '');
                setSmtpPass(conf.smtp_pass || '');

                // WPP
                setWppEnabled(!!conf.wpp_enabled);
                setWppProvider(conf.wpp_provider || 'twilio');
                setWppToken(conf.wpp_token || '');
                setWppPhoneId(conf.wpp_phone_id || '');
            }
        } catch (error) {
            enqueueSnackbar('Falha ao obter configurações atuais', { variant: 'error' });
        } finally {
            setLoading(false);
        }
    };

    const handleTestSmtp = async () => {
        try {
            const { data } = await api.post('/settings/verify-smtp', {
                host: smtpHost,
                port: smtpPort,
                user: smtpUser,
                pass: smtpPass,
                from: smtpEmail,
                to: smtpEmail // Envia para o próprio remetente como teste
            });
            if (data.success) {
                enqueueSnackbar('Sinal SMTP validado! Verifique sua caixa de entrada.', { variant: 'success' });
            }
        } catch (error) {
            const msg = error.response?.data?.error || 'Falha ao conectar no servidor SMTP';
            enqueueSnackbar(msg, { variant: 'error' });
        }
    };

    const handleTestWpp = async () => {
        try {
            const { data } = await api.post('/settings/verify-wpp', {
                provider: wppProvider,
                token: wppToken,
                phone_id: wppPhoneId
            });
            if (data.success) {
                enqueueSnackbar(data.message || 'API de Mensageria Validada!', { variant: 'success' });
            }
        } catch (error) {
            const msg = error.response?.data?.error || 'Falha na validação da API';
            enqueueSnackbar(msg, { variant: 'error' });
        }
    };

    const handleSaveSmtp = async (e) => {
        if (e && e.preventDefault) e.preventDefault();
        setSavingSmtp(true);
        try {
            await api.put('/settings', {
                smtp_enabled: smtpEnabled,
                smtp_host: smtpHost,
                smtp_port: parseInt(smtpPort, 10),
                smtp_email: smtpEmail,
                smtp_user: smtpUser,
                smtp_pass: smtpPass
            });
            enqueueSnackbar('Configurações SMTP salvas!', { variant: 'success' });
        } catch (error) {
            enqueueSnackbar('Erro ao salvar SMTP', { variant: 'error' });
        } finally {
            setSavingSmtp(false);
        }
    };

    const handleSaveWpp = async (e) => {
        if (e && e.preventDefault) e.preventDefault();
        setSavingWpp(true);
        try {
            await api.put('/settings', {
                wpp_enabled: wppEnabled,
                wpp_provider: wppProvider,
                wpp_token: wppToken,
                wpp_phone_id: wppPhoneId
            });
            enqueueSnackbar('Configurações de WhatsApp/SMS salvas!', { variant: 'success' });
        } catch (error) {
            enqueueSnackbar('Erro ao salvar gateways de mensagens', { variant: 'error' });
        } finally {
            setSavingWpp(false);
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
                title="Módulo de Comunicação (SMTP/SMS)"
                subtitle="Integre gateways nativos para disparar aprovações e links de credenciamento web e whatsapp."
                breadcrumbs={[{ text: 'Sistema' }, { text: 'Configurações' }, { text: 'E-mail & SMS' }]}
            />

            <Grid container spacing={4} sx={{ mt: 1 }}>
                <Grid item xs={12} md={6}>
                    <form onSubmit={handleSaveSmtp}>
                        <GlassCard sx={{ p: 3, mb: 4, height: '100%' }}>
                            <Box sx={{ display: 'flex', alignItems: 'center', mb: 3, gap: 2 }}>
                                <MailIcon sx={{ color: '#00D4FF', fontSize: 28 }} />
                                <Typography variant="h6" sx={{ fontWeight: 700, color: '#fff' }}>
                                    SERVIDOR DE E-MAIL (SMTP)
                                </Typography>
                            </Box>

                            <FormControlLabel
                                control={<Switch checked={smtpEnabled} onChange={(e) => setSmtpEnabled(e.target.checked)} color="primary" />}
                                label={<Typography sx={{ fontWeight: 600, color: '#fff' }}>Habilitar Envio de E-mails</Typography>}
                                sx={{ mb: 3 }}
                            />

                            <Grid container spacing={2}>
                                <Grid item xs={12} md={8}>
                                    <TextField fullWidth label="Servidor SMTP" value={smtpHost} onChange={(e) => setSmtpHost(e.target.value)} placeholder="smtp.hostgator.com.br" size="small" />
                                </Grid>
                                <Grid item xs={12} md={4}>
                                    <TextField fullWidth label="Porta" value={smtpPort} onChange={(e) => setSmtpPort(e.target.value)} type="number" size="small" />
                                </Grid>
                                <Grid item xs={12}>
                                    <TextField fullWidth label="E-mail Origem (Remetente)" value={smtpEmail} onChange={(e) => setSmtpEmail(e.target.value)} placeholder="contato@meuevento.com.br" size="small" />
                                </Grid>
                                <Grid item xs={12} md={6}>
                                    <TextField fullWidth label="Usuário Autenticação" value={smtpUser} onChange={(e) => setSmtpUser(e.target.value)} size="small" />
                                </Grid>
                                <Grid item xs={12} md={6}>
                                    <TextField fullWidth label="Senha (App Password)" value={smtpPass} onChange={(e) => setSmtpPass(e.target.value)} type="password" size="small" />
                                </Grid>
                            </Grid>

                            <Box sx={{ mt: 4, display: 'flex', gap: 2, justifyContent: 'flex-end' }}>
                                <Button
                                    variant="text"
                                    sx={{ color: '#00D4FF' }}
                                    onClick={handleTestSmtp}
                                >
                                    TESTAR DISPARO
                                </Button>
                                <NeonButton type="submit" disabled={savingSmtp} startIcon={<SaveIcon />}>
                                    {savingSmtp ? "SALVANDO..." : "SALVAR SMTP"}
                                </NeonButton>
                            </Box>
                        </GlassCard>
                    </form>
                </Grid>

                <Grid item xs={12} md={6}>
                    <form onSubmit={handleSaveWpp}>
                        <GlassCard sx={{ p: 3, mb: 4, height: '100%' }}>
                            <Box sx={{ display: 'flex', alignItems: 'center', mb: 3, gap: 2 }}>
                                <SmsIcon sx={{ color: '#00FF88', fontSize: 28 }} />
                                <Typography variant="h6" sx={{ fontWeight: 700, color: '#fff' }}>
                                    WHATSAPP / SMS (API)
                                </Typography>
                            </Box>

                            <FormControlLabel
                                control={<Switch checked={wppEnabled} onChange={(e) => setWppEnabled(e.target.checked)} color="primary" />}
                                label={<Typography sx={{ fontWeight: 600, color: '#fff' }}>Habilitar Disparos Oficiais WhatsApp (Meta)</Typography>}
                                sx={{ mb: 3 }}
                            />

                            <Grid container spacing={2}>
                                <Grid item xs={12}>
                                    <TextField fullWidth label="API Gateway Privider" value={wppProvider} onChange={(e) => setWppProvider(e.target.value)} select SelectProps={{ native: true }} size="small">
                                        <option value="twilio">Twilio (Recomendado)</option>
                                        <option value="zenvia">Zenvia</option>
                                        <option value="meta">Meta Cloud API Direta</option>
                                        <option value="wppconnect">WppConnect (Não Oficial)</option>
                                    </TextField>
                                </Grid>
                                <Grid item xs={12}>
                                    <TextField fullWidth label="Authorization Token (Bearer / Secret)" value={wppToken} onChange={(e) => setWppToken(e.target.value)} type="password" size="small" />
                                </Grid>
                                <Grid item xs={12}>
                                    <TextField fullWidth label="ID do Telefone Remetente" value={wppPhoneId} onChange={(e) => setWppPhoneId(e.target.value)} placeholder="+55 11 99999-9999" size="small" />
                                </Grid>
                            </Grid>

                            <Box sx={{ p: 2, mt: 3, bgcolor: 'rgba(0, 255, 136, 0.05)', border: '1px dashed rgba(0, 255, 136, 0.2)', borderRadius: 2 }}>
                                <Typography variant="caption" sx={{ color: '#00FF88' }}>
                                    Lembre-se: O Gateway de disparo de mensageria requer modelos (templates) aprovados na operadora caso o disparo seja proativo.
                                </Typography>
                            </Box>

                            <Box sx={{ mt: 3, display: 'flex', gap: 2, justifyContent: 'flex-end' }}>
                                <Button
                                    variant="text"
                                    sx={{ color: '#00FF88' }}
                                    onClick={handleTestWpp}
                                >
                                    TESTAR API
                                </Button>
                                <NeonButton type="submit" color="success" disabled={savingWpp} startIcon={<SaveIcon />}>
                                    {savingWpp ? "SALVANDO..." : "SALVAR MENSAGERIA"}
                                </NeonButton>
                            </Box>
                        </GlassCard>
                    </form>
                </Grid>
            </Grid>
        </Box>
    );
};

export default ConfigComunicacao;
