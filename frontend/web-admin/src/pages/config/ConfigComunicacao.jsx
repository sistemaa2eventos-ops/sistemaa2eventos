import React, { useState, useEffect, useCallback } from 'react';
import { useLocation } from 'react-router-dom';
import {
    Box, Typography, Grid, TextField, Switch, FormControlLabel,
    Button, CircularProgress, Tabs, Tab, Stack, Divider, Chip,
    IconButton, InputAdornment, List, ListItem,
    ListItemIcon, ListItemText, ListItemSecondaryAction
} from '@mui/material';
import {
    Mail as MailIcon,
    Telegram as TelegramIcon,
    WhatsApp as WhatsAppIcon,
    Storage as StorageIcon,
    CloudDone as CloudIcon,
    CheckCircle as SuccessIcon,
    Error as ErrorIcon,
    Visibility,
    VisibilityOff,
    Save as SaveIcon,
    NotificationsActive as NotifyIcon,
    Warning as WarningIcon,
    Tune as TuneIcon,
    Send as SendIcon,
    Security as SecurityIcon,
    InfoOutlined as InfoIcon
} from '@mui/icons-material';
import { useSnackbar } from 'notistack';
import api from '../../services/api';
import { useSystemSettings } from '../../hooks/useSystemSettings';
import PageHeader from '../../components/common/PageHeader';
import GoogleDriveCard from '../../components/integracoes/GoogleDriveCard';
import GlassCard from '../../components/common/GlassCard';
import NeonButton from '../../components/common/NeonButton';
import { botaoSecundario } from '../../styles/tokens';

const ConfigComunicacao = ({ defaultTab = null }) => {
    const location = useLocation();
    const { enqueueSnackbar } = useSnackbar();
    const { settings, setSettings, loading, saving, handleSave, testEmail, testTelegram } = useSystemSettings();

    // Determina a aba ativa (0: Canais, 1: Alertas & Automações, 2: Modelos de Mensagens)
    const resolveInitialTab = () => {
        if (defaultTab !== null && defaultTab !== undefined) return defaultTab;
        if (location.pathname.includes('notificacoes')) return 1;
        if (location.search.includes('tab=alertas')) return 1;
        if (location.search.includes('tab=templates')) return 2;
        return 0;
    };

    const [activeTab, setActiveTab] = useState(resolveInitialTab);
    const [showSmtpPass, setShowSmtpPass] = useState(false);
    const [showTgToken, setShowTgToken] = useState(false);
    const [showWppToken, setShowWppToken] = useState(false);

    // Estados de teste em andamento
    const [testingSmtp, setTestingSmtp] = useState(false);
    const [testingEmail, setTestingEmail] = useState(false);
    const [testingTg, setTestingTg] = useState(false);
    const [testingWpp, setTestingWpp] = useState(false);

    // Status do Ecossistema
    const [status, setStatus] = useState({
        database: 'loading',
        storage: 'loading',
        smtp: 'loading',
        telegram: 'loading',
        whatsapp: 'loading'
    });

    // Templates de Mensagens
    const [templates, setTemplates] = useState([]);
    const [selectedTemplate, setSelectedTemplate] = useState(null);
    const [tempContent, setTempContent] = useState('');
    const [tempTitle, setTempTitle] = useState('');
    const [savingTemplate, setSavingTemplate] = useState(false);

    const getEventoId = () => sessionStorage.getItem('active_evento_id') || localStorage.getItem('active_evento_id');

    // Checagem de conectividade dos serviços
    const checkStatus = useCallback(async () => {
        try {
            const smtpConfigured = Boolean(
                settings.smtp_host && settings.smtp_port && settings.smtp_user && settings.smtp_pass
            );

            const [db, smtp] = await Promise.all([
                api.get('/settings/test-connection', { timeout: 5000, hideDefaultError: true }).catch(() => ({ data: { success: false } })),
                smtpConfigured
                    ? api.post('/settings/verify-smtp', {
                        host: settings.smtp_host,
                        port: settings.smtp_port,
                        user: settings.smtp_user,
                        pass: settings.smtp_pass
                    }, { hideDefaultError: true }).catch(() => ({ data: { success: false } }))
                    : Promise.resolve({ data: { success: false } })
            ]);

            setStatus({
                database: db.data?.success ? 'online' : 'error',
                storage: db.data?.success ? 'online' : 'error',
                smtp: !smtpConfigured ? 'offline' : (smtp.data?.success ? 'online' : 'error'),
                telegram: (settings.telegram_bot_token && settings.telegram_chat_id) ? 'configured' : (settings.telegram_bot_token ? 'partial' : 'offline'),
                whatsapp: (settings.wpp_token || settings.whatsapp_api_url) ? 'configured' : 'offline'
            });
        } catch (err) {
            console.error('Falha ao checar status:', err);
        }
    }, [settings]);

    useEffect(() => {
        if (!loading) checkStatus();
    }, [loading, checkStatus]);

    // Carregar templates de mensagens
    const loadTemplates = useCallback(async () => {
        try {
            const eventoId = getEventoId();
            if (!eventoId) return;

            const { data } = await api.get('/messages/templates', {
                params: { evento_id: eventoId }
            });
            if (data.success && Array.isArray(data.data)) {
                setTemplates(data.data);
                if (data.data.length > 0) {
                    setSelectedTemplate(data.data[0]);
                    setTempContent(data.data[0].conteudo || '');
                    setTempTitle(data.data[0].titulo || '');
                }
            }
        } catch (error) {
            console.error('Erro ao carregar templates:', error);
        }
    }, []);

    useEffect(() => {
        loadTemplates();
    }, [loadTemplates]);

    const handleSelectTemplate = (t) => {
        setSelectedTemplate(t);
        setTempContent(t.conteudo || '');
        setTempTitle(t.titulo || '');
    };

    const handleSaveTemplate = async () => {
        if (!selectedTemplate) return;
        setSavingTemplate(true);
        try {
            const eventoId = getEventoId();
            await api.post('/messages/templates', {
                slug: selectedTemplate.slug,
                canal: selectedTemplate.canal,
                titulo: tempTitle,
                conteudo: tempContent,
                evento_id: eventoId
            });
            enqueueSnackbar('Template de mensagem salvo com sucesso!', { variant: 'success' });
            loadTemplates();
        } catch (error) {
            enqueueSnackbar('Falha ao salvar template de mensagem', { variant: 'error' });
        } finally {
            setSavingTemplate(false);
        }
    };

    // Ações de teste
    const handleTestSmtp = async () => {
        setTestingSmtp(true);
        try {
            const { data } = await api.post('/settings/verify-smtp', {
                host: settings.smtp_host,
                port: settings.smtp_port,
                user: settings.smtp_user,
                pass: settings.smtp_pass
            });
            if (data.success) {
                enqueueSnackbar('Conexão SMTP validada com sucesso!', { variant: 'success' });
                checkStatus();
            }
        } catch (err) {
            const msg = err.response?.data?.error || 'Falha ao autenticar no servidor SMTP.';
            enqueueSnackbar(msg, { variant: 'error' });
        } finally {
            setTestingSmtp(false);
        }
    };

    const handleSendTestEmail = async () => {
        setTestingEmail(true);
        try {
            await testEmail();
        } finally {
            setTestingEmail(false);
        }
    };

    const handleTestTelegram = async () => {
        if (!settings.telegram_bot_token || !settings.telegram_chat_id) {
            enqueueSnackbar('Preencha o Token do Bot e o Chat ID antes de testar.', { variant: 'warning' });
            return;
        }
        setTestingTg(true);
        try {
            const ok = await testTelegram({
                token: settings.telegram_bot_token,
                chat_id: settings.telegram_chat_id
            });
            if (ok) checkStatus();
        } finally {
            setTestingTg(false);
        }
    };

    const handleTestWpp = async () => {
        setTestingWpp(true);
        try {
            const { data } = await api.post('/settings/verify-wpp');
            enqueueSnackbar(data.message || 'Verificação de WhatsApp concluída.', { variant: 'info' });
        } catch (err) {
            enqueueSnackbar('Falha na comunicação com gateway de WhatsApp.', { variant: 'error' });
        } finally {
            setTestingWpp(false);
        }
    };

    const StatusChip = ({ type }) => {
        const config = {
            loading: { label: 'Verificando...', color: 'default', icon: <CircularProgress size={12} color="inherit" /> },
            online: { label: 'Conectado', color: 'success', icon: <SuccessIcon sx={{ fontSize: 14 }} /> },
            error: { label: 'Falha', color: 'error', icon: <ErrorIcon sx={{ fontSize: 14 }} /> },
            configured: { label: 'Configurado', color: 'info', icon: <SuccessIcon sx={{ fontSize: 14 }} /> },
            partial: { label: 'Falta Chat ID', color: 'warning', icon: <WarningIcon sx={{ fontSize: 14 }} /> },
            offline: { label: 'Não configurado', color: 'default', icon: <ErrorIcon sx={{ fontSize: 14 }} /> },
        };
        const current = config[type] || config.loading;
        return <Chip icon={current.icon} label={current.label} color={current.color} size="small" variant="outlined" sx={{ fontWeight: 700, fontSize: '0.72rem' }} />;
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
                title="Comunicação & Integrações"
                subtitle="Servidores de envio, gateways externos, alertas em tempo real e modelos de mensagens."
                breadcrumbs={[{ text: 'Configurações' }, { text: 'Comunicação & Integrações' }]}
            />

            {/* ABAS UNIFICADAS */}
            <Box sx={{ borderBottom: 1, borderColor: 'rgba(255,255,255,0.08)', mb: 3 }}>
                <Tabs
                    value={activeTab}
                    onChange={(e, val) => setActiveTab(val)}
                    textColor="primary"
                    indicatorColor="primary"
                    variant="scrollable"
                    scrollButtons="auto"
                    allowScrollButtonsMobile
                    sx={{
                        '& .MuiTab-root': {
                            color: 'rgba(255,255,255,0.6)',
                            fontWeight: 700,
                            fontSize: '0.875rem',
                            textTransform: 'none',
                            minHeight: 48,
                            gap: 1
                        },
                        '& .Mui-selected': {
                            color: '#00D4FF !important'
                        }
                    }}
                >
                    <Tab icon={<TuneIcon sx={{ fontSize: 18 }} />} label="Canais & Conexões" iconPosition="start" />
                    <Tab icon={<NotifyIcon sx={{ fontSize: 18 }} />} label="Alertas & Automações" iconPosition="start" />
                    <Tab icon={<MailIcon sx={{ fontSize: 18 }} />} label="Modelos de Mensagens" iconPosition="start" />
                </Tabs>
            </Box>

            {/* ABA 0: CANAIS & CONEXÕES (SMTP, TELEGRAM, WHATSAPP, STATUS) */}
            {activeTab === 0 && (
                <Grid container spacing={3}>
                    {/* STATUS DO ECOSSISTEMA */}
                    <Grid item xs={12}>
                        <GlassCard sx={{ p: 2.5 }}>
                            <Typography variant="subtitle2" sx={{ color: '#FFFFFF', fontWeight: 700, mb: 2 }}>
                                Status do ecossistema de conexões
                            </Typography>
                            <Stack
                                direction={{ xs: 'column', sm: 'row' }}
                                spacing={3}
                                divider={<Divider orientation="vertical" flexItem sx={{ borderColor: 'rgba(255,255,255,0.08)' }} />}
                                sx={{ flexWrap: 'wrap', gap: { xs: 2, sm: 0 } }}
                            >
                                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                                    <StorageIcon color="primary" />
                                    <Box>
                                        <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>Banco Supabase</Typography>
                                        <StatusChip type={status.database} />
                                    </Box>
                                </Box>
                                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                                    <CloudIcon sx={{ color: '#00D4FF' }} />
                                    <Box>
                                        <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>Storage Bucket</Typography>
                                        <StatusChip type={status.storage} />
                                    </Box>
                                </Box>
                                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                                    <MailIcon sx={{ color: '#00FF88' }} />
                                    <Box>
                                        <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>Servidor SMTP</Typography>
                                        <StatusChip type={status.smtp} />
                                    </Box>
                                </Box>
                                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                                    <TelegramIcon sx={{ color: '#00B0FF' }} />
                                    <Box>
                                        <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>Bot Telegram</Typography>
                                        <StatusChip type={status.telegram} />
                                    </Box>
                                </Box>
                                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                                    <WhatsAppIcon sx={{ color: '#25D366' }} />
                                    <Box>
                                        <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>WhatsApp API</Typography>
                                        <StatusChip type={status.whatsapp} />
                                    </Box>
                                </Box>
                            </Stack>
                        </GlassCard>
                    </Grid>

                    {/* CARD 1: SERVIDOR DE E-MAIL (SMTP UNIFICADO) */}
                    <Grid item xs={12} lg={6}>
                        <GlassCard sx={{ p: 3, height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
                            <Box>
                                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
                                    <Typography variant="subtitle1" sx={{ color: '#FFFFFF', fontWeight: 700, display: 'flex', alignItems: 'center', gap: 1 }}>
                                        <MailIcon fontSize="small" sx={{ color: '#00D4FF' }} /> Servidor de E-mail (SMTP)
                                    </Typography>
                                    <FormControlLabel
                                        control={
                                            <Switch
                                                checked={!!settings.smtp_enabled}
                                                onChange={(e) => setSettings(prev => ({ ...prev, smtp_enabled: e.target.checked }))}
                                                color="primary"
                                                size="small"
                                            />
                                        }
                                        label={<Typography variant="caption" sx={{ fontWeight: 600, color: 'text.secondary' }}>Habilitado</Typography>}
                                        sx={{ m: 0 }}
                                    />
                                </Box>
                                <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 2.5 }}>
                                    Utilizado para relatórios noturnos em planilha, convites B2B e alertas do sistema.
                                </Typography>

                                <Grid container spacing={2}>
                                    <Grid item xs={12} sm={8}>
                                        <TextField
                                            label="Servidor SMTP (Host)"
                                            fullWidth
                                            size="small"
                                            placeholder="smtp.gmail.com"
                                            value={settings.smtp_host || ''}
                                            onChange={(e) => setSettings(prev => ({ ...prev, smtp_host: e.target.value }))}
                                        />
                                    </Grid>
                                    <Grid item xs={12} sm={4}>
                                        <TextField
                                            label="Porta"
                                            fullWidth
                                            size="small"
                                            placeholder="587"
                                            type="number"
                                            value={settings.smtp_port || 587}
                                            onChange={(e) => setSettings(prev => ({ ...prev, smtp_port: e.target.value }))}
                                        />
                                    </Grid>
                                    <Grid item xs={12} sm={6}>
                                        <TextField
                                            label="E-mail remetente"
                                            fullWidth
                                            size="small"
                                            placeholder="sistemaa2eventos@gmail.com"
                                            value={settings.email_from || settings.smtp_email || ''}
                                            onChange={(e) => setSettings(prev => ({
                                                ...prev,
                                                email_from: e.target.value,
                                                smtp_email: e.target.value
                                            }))}
                                        />
                                    </Grid>
                                    <Grid item xs={12} sm={6}>
                                        <TextField
                                            label="Nome de exibição do remetente"
                                            fullWidth
                                            size="small"
                                            placeholder="NZT Eventos / Central de Alertas"
                                            value={settings.email_from_name || ''}
                                            onChange={(e) => setSettings(prev => ({ ...prev, email_from_name: e.target.value }))}
                                        />
                                    </Grid>
                                    <Grid item xs={12} sm={6}>
                                        <TextField
                                            label="Usuário de autenticação"
                                            fullWidth
                                            size="small"
                                            placeholder="sistemaa2eventos@gmail.com"
                                            value={settings.smtp_user || ''}
                                            onChange={(e) => setSettings(prev => ({ ...prev, smtp_user: e.target.value }))}
                                        />
                                    </Grid>
                                    <Grid item xs={12} sm={6}>
                                        <TextField
                                            label="Senha / App Password"
                                            fullWidth
                                            size="small"
                                            type={showSmtpPass ? 'text' : 'password'}
                                            value={settings.smtp_pass || ''}
                                            onChange={(e) => setSettings(prev => ({ ...prev, smtp_pass: e.target.value }))}
                                            InputProps={{
                                                endAdornment: (
                                                    <InputAdornment position="end">
                                                        <IconButton size="small" onClick={() => setShowSmtpPass(!showSmtpPass)} edge="end">
                                                            {showSmtpPass ? <VisibilityOff sx={{ fontSize: 16 }} /> : <Visibility sx={{ fontSize: 16 }} />}
                                                        </IconButton>
                                                    </InputAdornment>
                                                )
                                            }}
                                        />
                                    </Grid>
                                </Grid>
                            </Box>

                            <Box sx={{ mt: 3, pt: 2, borderTop: '1px solid rgba(255,255,255,0.06)', display: 'flex', gap: 1.5, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
                                <Button
                                    variant="outlined"
                                    size="small"
                                    onClick={handleTestSmtp}
                                    disabled={testingSmtp}
                                    sx={botaoSecundario}
                                >
                                    {testingSmtp ? 'Testando...' : 'Testar Conexão SMTP'}
                                </Button>
                                <Button
                                    variant="outlined"
                                    size="small"
                                    onClick={handleSendTestEmail}
                                    disabled={testingEmail}
                                    sx={{ borderColor: '#00D4FF', color: '#00D4FF', fontWeight: 600 }}
                                    startIcon={<SendIcon sx={{ fontSize: 14 }} />}
                                >
                                    {testingEmail ? 'Enviando...' : 'Enviar e-mail teste'}
                                </Button>
                            </Box>
                        </GlassCard>
                    </Grid>

                    {/* CARD 2: TELEGRAM (ALERTAS E RELATÓRIOS EM TEMPO REAL) */}
                    <Grid item xs={12} lg={6}>
                        <GlassCard sx={{ p: 3, height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
                            <Box>
                                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
                                    <Typography variant="subtitle1" sx={{ color: '#FFFFFF', fontWeight: 700, display: 'flex', alignItems: 'center', gap: 1 }}>
                                        <TelegramIcon fontSize="small" sx={{ color: '#00B0FF' }} /> Telegram (Alertas & CFTV)
                                    </Typography>
                                    <FormControlLabel
                                        control={
                                            <Switch
                                                checked={!!settings.telegram_alerts_enabled}
                                                onChange={(e) => setSettings(prev => ({ ...prev, telegram_alerts_enabled: e.target.checked }))}
                                                color="primary"
                                                size="small"
                                            />
                                        }
                                        label={<Typography variant="caption" sx={{ fontWeight: 600, color: 'text.secondary' }}>Habilitado</Typography>}
                                        sx={{ m: 0 }}
                                    />
                                </Box>
                                <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 2.5 }}>
                                    Disparo instantâneo com foto para o seu celular ou grupo de segurança em detecções da Watchlist.
                                </Typography>

                                <Stack spacing={2}>
                                    <TextField
                                        label="Bot Token (Telegram API)"
                                        fullWidth
                                        size="small"
                                        placeholder="Ex: 7123456789:AAFlkjw89..."
                                        type={showTgToken ? 'text' : 'password'}
                                        value={settings.telegram_bot_token || ''}
                                        onChange={(e) => setSettings(prev => ({ ...prev, telegram_bot_token: e.target.value }))}
                                        helperText="Token fornecido pelo @BotFather ao criar o seu robô no Telegram."
                                        InputProps={{
                                            endAdornment: (
                                                <InputAdornment position="end">
                                                    <IconButton size="small" onClick={() => setShowTgToken(!showTgToken)} edge="end">
                                                        {showTgToken ? <VisibilityOff sx={{ fontSize: 16 }} /> : <Visibility sx={{ fontSize: 16 }} />}
                                                    </IconButton>
                                                </InputAdornment>
                                            )
                                        }}
                                    />
                                    <TextField
                                        label="Chat ID Global (Usuário ou Canal/Grupo)"
                                        fullWidth
                                        size="small"
                                        placeholder="Ex: 123456789 ou -100192837482"
                                        value={settings.telegram_chat_id || ''}
                                        onChange={(e) => setSettings(prev => ({ ...prev, telegram_chat_id: e.target.value }))}
                                        helperText="Descubra seu Chat ID enviando /start para o @userinfobot ou adicione o bot ao grupo de segurança."
                                    />
                                </Stack>

                                <Box sx={{ mt: 2.5, p: 1.5, bgcolor: 'rgba(0, 176, 255, 0.05)', border: '1px dashed rgba(0, 176, 255, 0.2)', borderRadius: 1.5, display: 'flex', alignItems: 'flex-start', gap: 1 }}>
                                    <InfoIcon sx={{ color: '#00B0FF', fontSize: 18, mt: 0.2 }} />
                                    <Typography variant="caption" sx={{ color: '#94A3B8' }}>
                                        <b style={{ color: '#00B0FF' }}>Como funciona:</b> Ao detectar um CPF da Watchlist, a IA do CFTV salva a foto da câmera e dispara a notificação com foto e ficha completa diretamente neste chat.
                                    </Typography>
                                </Box>
                            </Box>

                            <Box sx={{ mt: 3, pt: 2, borderTop: '1px solid rgba(255,255,255,0.06)', display: 'flex', justifyContent: 'flex-end' }}>
                                <Button
                                    variant="outlined"
                                    size="small"
                                    onClick={handleTestTelegram}
                                    disabled={testingTg}
                                    sx={{ borderColor: '#00B0FF', color: '#00B0FF', fontWeight: 600 }}
                                    startIcon={<SendIcon sx={{ fontSize: 14 }} />}
                                >
                                    {testingTg ? 'Enviando...' : 'Enviar mensagem de teste no Telegram'}
                                </Button>
                            </Box>
                        </GlassCard>
                    </Grid>

                    {/* CARD 3: WHATSAPP GATEWAY */}
                    <Grid item xs={12}>
                        <GlassCard sx={{ p: 3 }}>
                            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
                                <Typography variant="subtitle1" sx={{ color: '#FFFFFF', fontWeight: 700, display: 'flex', alignItems: 'center', gap: 1 }}>
                                    <WhatsAppIcon fontSize="small" sx={{ color: '#25D366' }} /> WhatsApp Gateway (Mensageria Ativa)
                                </Typography>
                                <FormControlLabel
                                    control={
                                        <Switch
                                            checked={!!settings.wpp_enabled}
                                            onChange={(e) => setSettings(prev => ({ ...prev, wpp_enabled: e.target.checked }))}
                                            color="success"
                                            size="small"
                                        />
                                    }
                                    label={<Typography variant="caption" sx={{ fontWeight: 600, color: 'text.secondary' }}>Habilitado</Typography>}
                                    sx={{ m: 0 }}
                                />
                            </Box>

                            <Grid container spacing={2}>
                                <Grid item xs={12} sm={4}>
                                    <TextField
                                        label="Provedor"
                                        fullWidth
                                        size="small"
                                        select
                                        SelectProps={{ native: true }}
                                        value={settings.wpp_provider || 'twilio'}
                                        onChange={(e) => setSettings(prev => ({ ...prev, wpp_provider: e.target.value }))}
                                    >
                                        <option value="twilio">Twilio</option>
                                        <option value="meta">Meta Cloud API (Oficial)</option>
                                        <option value="zapi">Z-API</option>
                                        <option value="wppconnect">WppConnect / Evolution API</option>
                                    </TextField>
                                </Grid>
                                <Grid item xs={12} sm={4}>
                                    <TextField
                                        label="API URL / Endpoint"
                                        fullWidth
                                        size="small"
                                        placeholder="Ex: https://api.z-api.io/instances/..."
                                        value={settings.whatsapp_api_url || ''}
                                        onChange={(e) => setSettings(prev => ({ ...prev, whatsapp_api_url: e.target.value }))}
                                    />
                                </Grid>
                                <Grid item xs={12} sm={4}>
                                    <TextField
                                        label="ID do telefone / Remetente"
                                        fullWidth
                                        size="small"
                                        placeholder="Ex: 5511999999999"
                                        value={settings.wpp_phone_id || ''}
                                        onChange={(e) => setSettings(prev => ({ ...prev, wpp_phone_id: e.target.value }))}
                                    />
                                </Grid>
                                <Grid item xs={12}>
                                    <TextField
                                        label="Authorization Token / Secret Key"
                                        fullWidth
                                        size="small"
                                        type={showWppToken ? 'text' : 'password'}
                                        value={settings.wpp_token || settings.whatsapp_api_key || ''}
                                        onChange={(e) => setSettings(prev => ({
                                            ...prev,
                                            wpp_token: e.target.value,
                                            whatsapp_api_key: e.target.value
                                        }))}
                                        InputProps={{
                                            endAdornment: (
                                                <InputAdornment position="end">
                                                    <IconButton size="small" onClick={() => setShowWppToken(!showWppToken)} edge="end">
                                                        {showWppToken ? <VisibilityOff sx={{ fontSize: 16 }} /> : <Visibility sx={{ fontSize: 16 }} />}
                                                    </IconButton>
                                                </InputAdornment>
                                            )
                                        }}
                                    />
                                </Grid>
                            </Grid>

                            <Box sx={{ mt: 3, pt: 2, borderTop: '1px solid rgba(255,255,255,0.06)', display: 'flex', justifyContent: 'flex-end' }}>
                                <Button
                                    variant="outlined"
                                    size="small"
                                    onClick={handleTestWpp}
                                    disabled={testingWpp}
                                    sx={{ borderColor: '#25D366', color: '#25D366', fontWeight: 600 }}
                                >
                                    {testingWpp ? 'Testando...' : 'Testar Conexão WhatsApp'}
                                </Button>
                            </Box>
                        </GlassCard>
                    </Grid>

                    {/* GOOGLE DRIVE: cópia dos documentos */}
                    <Grid item xs={12}>
                        <GoogleDriveCard />
                    </Grid>
                </Grid>
            )}

            {/* ABA 1: ALERTAS & AUTOMAÇÕES (WATCHLIST, RELATÓRIO DIÁRIO, PICO, SHADOW LOGIN) */}
            {activeTab === 1 && (
                <Grid container spacing={3}>
                    <Grid item xs={12}>
                        <GlassCard sx={{ p: 3 }}>
                            <Typography variant="subtitle1" sx={{ color: '#FFFFFF', fontWeight: 700, mb: 2, display: 'flex', alignItems: 'center', gap: 1 }}>
                                <NotifyIcon fontSize="small" color="primary" /> Regras de Disparo Automático
                            </Typography>
                            <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 3 }}>
                                Configure as regras de envio e quais canais receberão cada tipo de evento.
                            </Typography>

                            <List disablePadding>
                                {/* ALERTA WATCHLIST */}
                                <ListItem sx={{ py: 2 }}>
                                    <ListItemIcon sx={{ color: '#FF3366', minWidth: 48 }}>
                                        <SecurityIcon />
                                    </ListItemIcon>
                                    <ListItemText
                                        primary="Alerta Crítico: Alvo da Watchlist Detectado"
                                        secondary="Notifica imediatamente via Telegram e WhatsApp quando câmeras CFTV ou leitores identificarem um CPF em monitoramento."
                                        primaryTypographyProps={{ fontWeight: 600, color: '#FFFFFF' }}
                                        secondaryTypographyProps={{ fontSize: '0.75rem', color: 'text.secondary' }}
                                    />
                                    <ListItemSecondaryAction>
                                        <Switch
                                            checked={!!settings.telegram_alerts_enabled}
                                            onChange={(e) => setSettings(prev => ({ ...prev, telegram_alerts_enabled: e.target.checked }))}
                                            color="error"
                                        />
                                    </ListItemSecondaryAction>
                                </ListItem>
                                <Divider sx={{ borderColor: 'rgba(255,255,255,0.05)' }} />

                                {/* RELATÓRIO DIÁRIO EMAIL */}
                                <ListItem sx={{ py: 2 }}>
                                    <ListItemIcon sx={{ color: '#00FF88', minWidth: 48 }}>
                                        <MailIcon />
                                    </ListItemIcon>
                                    <ListItemText
                                        primary="Relatório Diário por E-mail (03:30)"
                                        secondary="Gera e despacha a planilha consolidada em Excel (.xlsx) após o fechamento noturno para os administradores master."
                                        primaryTypographyProps={{ fontWeight: 600, color: '#FFFFFF' }}
                                        secondaryTypographyProps={{ fontSize: '0.75rem', color: 'text.secondary' }}
                                    />
                                    <ListItemSecondaryAction>
                                        <Switch
                                            checked={settings.email_relatorio_ativo !== false}
                                            onChange={(e) => setSettings(prev => ({ ...prev, email_relatorio_ativo: e.target.checked }))}
                                            color="success"
                                        />
                                    </ListItemSecondaryAction>
                                </ListItem>
                                <Divider sx={{ borderColor: 'rgba(255,255,255,0.05)' }} />

                                {/* RELATÓRIO DIÁRIO TELEGRAM */}
                                <ListItem sx={{ py: 2 }}>
                                    <ListItemIcon sx={{ color: '#00B0FF', minWidth: 48 }}>
                                        <TelegramIcon />
                                    </ListItemIcon>
                                    <ListItemText
                                        primary="Resumo do Relatório Diário no Telegram"
                                        secondary="Envia o resumo de participantes, check-ins e taxa de ocupação no Chat ID configurado às 03:30."
                                        primaryTypographyProps={{ fontWeight: 600, color: '#FFFFFF' }}
                                        secondaryTypographyProps={{ fontSize: '0.75rem', color: 'text.secondary' }}
                                    />
                                    <ListItemSecondaryAction>
                                        <Switch
                                            checked={!!settings.relatorio_telegram_ativo}
                                            onChange={(e) => setSettings(prev => ({ ...prev, relatorio_telegram_ativo: e.target.checked }))}
                                            color="primary"
                                        />
                                    </ListItemSecondaryAction>
                                </ListItem>
                                <Divider sx={{ borderColor: 'rgba(255,255,255,0.05)' }} />

                                {/* PICO DE OCUPAÇÃO */}
                                <ListItem sx={{ py: 2 }}>
                                    <ListItemIcon sx={{ color: 'warning.main', minWidth: 48 }}>
                                        <WarningIcon />
                                    </ListItemIcon>
                                    <ListItemText
                                        primary="Alerta: Pico de Evento (Lotação Crítica)"
                                        secondary="Dispara alerta quando a ocupação do evento ou setor atingir a porcentagem limite estipulada."
                                        primaryTypographyProps={{ fontWeight: 600, color: '#FFFFFF' }}
                                        secondaryTypographyProps={{ fontSize: '0.75rem', color: 'text.secondary' }}
                                    />
                                    <ListItemSecondaryAction>
                                        <Switch
                                            checked={!!settings.alert_event_peak}
                                            onChange={(e) => setSettings(prev => ({ ...prev, alert_event_peak: e.target.checked }))}
                                            color="warning"
                                        />
                                    </ListItemSecondaryAction>
                                </ListItem>
                                <Divider sx={{ borderColor: 'rgba(255,255,255,0.05)' }} />

                                {/* SHADOW LOGIN */}
                                <ListItem sx={{ py: 2 }}>
                                    <ListItemIcon sx={{ color: '#00D4FF', minWidth: 48 }}>
                                        <SecurityIcon />
                                    </ListItemIcon>
                                    <ListItemText
                                        primary="Alerta: Shadow Login (Operador fora do horário)"
                                        secondary="Avisa masters quando um operador se autentica em horários atípicos (22:00 às 06:00)."
                                        primaryTypographyProps={{ fontWeight: 600, color: '#FFFFFF' }}
                                        secondaryTypographyProps={{ fontSize: '0.75rem', color: 'text.secondary' }}
                                    />
                                    <ListItemSecondaryAction>
                                        <Switch
                                            checked={!!settings.alert_operator_login}
                                            onChange={(e) => setSettings(prev => ({ ...prev, alert_operator_login: e.target.checked }))}
                                        />
                                    </ListItemSecondaryAction>
                                </ListItem>
                            </List>

                            {/* DESTINATÁRIOS ADICIONAIS */}
                            <Box sx={{ mt: 3, pt: 2, borderTop: '1px solid rgba(255,255,255,0.08)' }}>
                                <Typography variant="subtitle2" sx={{ color: '#FFFFFF', fontWeight: 600, mb: 1 }}>
                                    E-mails adicionais para recebimento do relatório diário
                                </Typography>
                                <TextField
                                    fullWidth
                                    size="small"
                                    placeholder="diretoria@evento.com, coordenacao@seguranca.com (separados por vírgula)"
                                    value={Array.isArray(settings.relatorio_emails) ? settings.relatorio_emails.join(', ') : (settings.relatorio_emails || '')}
                                    onChange={(e) => {
                                        const arr = e.target.value.split(',').map(s => s.trim()).filter(Boolean);
                                        setSettings(prev => ({ ...prev, relatorio_emails: arr }));
                                    }}
                                    helperText="Por padrão, todos os administradores master já recebem o relatório automaticamente."
                                />
                            </Box>
                        </GlassCard>
                    </Grid>
                </Grid>
            )}

            {/* ABA 2: MODELOS DE MENSAGENS (TEMPLATES DINÂMICOS) */}
            {activeTab === 2 && (
                <Grid container spacing={3}>
                    <Grid item xs={12} md={4}>
                        <GlassCard sx={{ p: 2, height: '100%' }}>
                            <Typography variant="subtitle1" sx={{ mb: 2, fontWeight: 700, color: '#00D4FF' }}>
                                Lista de templates
                            </Typography>
                            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                                {templates.map(t => (
                                    <Button
                                        key={`${t.slug}-${t.canal}`}
                                        variant={selectedTemplate?.id === t.id ? 'contained' : 'outlined'}
                                        onClick={() => handleSelectTemplate(t)}
                                        sx={{
                                            justifyContent: 'flex-start',
                                            textAlign: 'left',
                                            py: 1.5,
                                            color: '#FFFFFF',
                                            borderColor: selectedTemplate?.id === t.id ? 'primary.main' : 'rgba(255,255,255,0.1)'
                                        }}
                                        startIcon={t.canal === 'email' ? <MailIcon /> : <WhatsAppIcon sx={{ color: '#25D366' }} />}
                                    >
                                        <Box>
                                            <Typography variant="body2" sx={{ fontWeight: 700 }}>
                                                {t.slug.replace(/_/g, ' ')}
                                            </Typography>
                                            <Typography variant="caption" sx={{ opacity: 0.7 }}>
                                                Canal: {t.canal?.toUpperCase()} {t.evento_id ? '(Personalizado)' : '(Padrão)'}
                                            </Typography>
                                        </Box>
                                    </Button>
                                ))}
                                {templates.length === 0 && (
                                    <Typography variant="caption" color="text.secondary" sx={{ p: 2, textAlign: 'center' }}>
                                        Nenhum template cadastrado para o evento ativo.
                                    </Typography>
                                )}
                            </Box>
                        </GlassCard>
                    </Grid>

                    <Grid item xs={12} md={8}>
                        <GlassCard sx={{ p: 3, height: '100%' }}>
                            {selectedTemplate ? (
                                <Box>
                                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
                                        <Typography variant="h6" sx={{ fontWeight: 700, color: '#FFFFFF' }}>
                                            Editando: {selectedTemplate.slug.toUpperCase()} ({selectedTemplate.canal})
                                        </Typography>
                                        <NeonButton onClick={handleSaveTemplate} disabled={savingTemplate} startIcon={<SaveIcon />}>
                                            {savingTemplate ? 'Salvando...' : 'Salvar template'}
                                        </NeonButton>
                                    </Box>

                                    {selectedTemplate.canal === 'email' && (
                                        <TextField
                                            fullWidth
                                            label="Assunto do e-mail"
                                            value={tempTitle}
                                            onChange={(e) => setTempTitle(e.target.value)}
                                            sx={{ mb: 3 }}
                                            size="small"
                                        />
                                    )}

                                    <TextField
                                        fullWidth
                                        multiline
                                        rows={8}
                                        label="Conteúdo da mensagem"
                                        value={tempContent}
                                        onChange={(e) => setTempContent(e.target.value)}
                                        helperText="Clique nas variáveis abaixo para inseri-las dinamicamente."
                                        sx={{
                                            '& .MuiInputBase-root': { fontFamily: '"Inter", sans-serif', fontSize: '0.875rem', color: '#FFFFFF' }
                                        }}
                                    />

                                    <Box sx={{ mt: 3, p: 2, bgcolor: 'rgba(255,255,255,0.03)', borderRadius: 1.5, border: '1px solid rgba(255,255,255,0.06)' }}>
                                        <Typography variant="caption" sx={{ color: '#94A3B8', fontWeight: 600, display: 'block', mb: 1 }}>
                                            Variáveis dinâmicas suportadas:
                                        </Typography>
                                        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
                                            {['nome_empresa', 'responsavel', 'link_onboarding', 'evento_nome', 'data_expiracao', 'link_qrcode'].map(v => (
                                                <Box
                                                    key={v}
                                                    sx={{
                                                        px: 1,
                                                        py: 0.5,
                                                        bgcolor: 'rgba(0,212,255,0.08)',
                                                        border: '1px solid rgba(0,212,255,0.25)',
                                                        borderRadius: 1,
                                                        cursor: 'pointer',
                                                        '&:hover': { bgcolor: 'rgba(0,212,255,0.18)' }
                                                    }}
                                                    onClick={() => setTempContent(prev => prev + ` {{${v}}}`)}
                                                >
                                                    <Typography variant="caption" sx={{ color: '#00D4FF', fontWeight: 700 }}>
                                                        {`{{${v}}}`}
                                                    </Typography>
                                                </Box>
                                            ))}
                                        </Box>
                                    </Box>
                                </Box>
                            ) : (
                                <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100%', minHeight: 250 }}>
                                    <Typography sx={{ color: '#94A3B8' }}>Selecione um template à esquerda para visualizar e editar</Typography>
                                </Box>
                            )}
                        </GlassCard>
                    </Grid>
                </Grid>
            )}

            {/* BOTÃO FIXO DE SALVAR TODAS AS ALTERAÇÕES */}
            <Box sx={{ display: 'flex', justifyContent: 'flex-end', mt: 3 }}>
                <Button
                    variant="contained"
                    color="primary"
                    onClick={() => handleSave()}
                    disabled={saving}
                    startIcon={<SaveIcon />}
                    sx={{ fontWeight: 700, px: 4, py: 1.2, borderRadius: 1.5 }}
                >
                    {saving ? 'Salvando...' : 'Salvar Alterações'}
                </Button>
            </Box>
        </Box>
    );
};

export default ConfigComunicacao;
