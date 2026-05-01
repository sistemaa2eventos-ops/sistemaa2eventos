import React, { useState, useEffect, useCallback } from 'react';
import {
    Box, Typography, Grid, TextField, Button,
    List, ListItem, ListItemText, IconButton,
    CircularProgress, MenuItem, Stack, Chip, Divider, Switch,
    Tooltip, LinearProgress
} from '@mui/material';
import {
    Delete as DeleteIcon,
    ContentCopy as CopyIcon,
    Add as AddIcon,
    Webhook as WebhookIcon,
    Security as SecurityIcon,
    PlayArrow as TestIcon,
    CheckCircle as OkIcon,
    Error as ErrorIcon,
    AccessTime as ExpiryIcon
} from '@mui/icons-material';
import { useSnackbar } from 'notistack';
import GlassCard from '../../components/common/GlassCard';
import api from '../../services/api';
import { formatDistanceToNow, isPast, differenceInDays } from 'date-fns';
import { ptBR } from 'date-fns/locale';

const TRIGGER_EVENTS = [
    { value: 'NOVO_CADASTRO',    label: 'Novo Cadastro' },
    { value: 'CHECKIN',          label: 'Entrada Realizada' },
    { value: 'CHECKOUT',         label: 'Saída Realizada' },
    { value: 'PESSOA_BLOQUEADA', label: 'Pessoa Bloqueada' },
    { value: 'ALERTA',           label: 'Alerta de Segurança' }
];

// ──────────────────────────────────────────────
// Sub-componente: status badge do webhook
// ──────────────────────────────────────────────
const WebhookStatusBadge = ({ webhook }) => {
    if (!webhook.last_dispatch_at) {
        return <Chip label="Nunca disparado" size="small" sx={{ fontSize: '0.6rem', bgcolor: 'rgba(255,255,255,0.05)', color: 'text.secondary' }} />;
    }
    const ok = webhook.last_status_code >= 200 && webhook.last_status_code < 300;
    return (
        <Stack direction="row" spacing={0.5} alignItems="center">
            <Chip
                icon={ok ? <OkIcon sx={{ fontSize: '0.75rem !important' }} /> : <ErrorIcon sx={{ fontSize: '0.75rem !important' }} />}
                label={`${webhook.last_status_code ?? 'Timeout'}`}
                size="small"
                sx={{
                    fontSize: '0.6rem', fontWeight: 800,
                    bgcolor: ok ? 'rgba(0,255,136,0.1)' : 'rgba(255,51,102,0.1)',
                    color: ok ? '#00FF88' : '#FF3366',
                    border: `1px solid ${ok ? 'rgba(0,255,136,0.3)' : 'rgba(255,51,102,0.3)'}`
                }}
            />
            {webhook.failure_count > 0 && (
                <Chip label={`${webhook.failure_count} falhas`} size="small" sx={{ fontSize: '0.6rem', bgcolor: 'rgba(255,170,0,0.1)', color: '#FFAA00' }} />
            )}
        </Stack>
    );
};

// ──────────────────────────────────────────────
// Componente principal
// ──────────────────────────────────────────────
const ConfigWebhooks = () => {
    const { enqueueSnackbar } = useSnackbar();
    const [loadingKeys, setLoadingKeys]     = useState(true);
    const [loadingHooks, setLoadingHooks]   = useState(true);
    const [testingId, setTestingId]         = useState(null);

    // API Keys
    const [apiKeys, setApiKeys] = useState([]);

    // Webhooks
    const [webhooks, setWebhooks]               = useState([]);
    const [newWebhookUrl, setNewWebhookUrl]     = useState('');
    const [urlError, setUrlError]               = useState('');
    const [newWebhookEvent, setNewWebhookEvent] = useState('NOVO_CADASTRO');
    const [newWebhookDesc, setNewWebhookDesc]   = useState('');

    // ── Carregamentos ──────────────────────────
    const loadApiKeys = useCallback(async () => {
        try {
            setLoadingKeys(true);
            const res = await api.get('/settings/apikeys');
            setApiKeys(res.data.data || []);
        } catch {
            enqueueSnackbar('Erro ao carregar chaves de API.', { variant: 'error' });
        } finally {
            setLoadingKeys(false);
        }
    }, [enqueueSnackbar]);

    const loadWebhooks = useCallback(async () => {
        try {
            setLoadingHooks(true);
            const res = await api.get('/settings/webhooks');
            setWebhooks(res.data.data || []);
        } catch {
            enqueueSnackbar('Erro ao carregar webhooks.', { variant: 'error' });
        } finally {
            setLoadingHooks(false);
        }
    }, [enqueueSnackbar]);

    useEffect(() => {
        loadApiKeys();
        loadWebhooks();
    }, [loadApiKeys, loadWebhooks]);

    // ── API Keys ───────────────────────────────
    const handleGenerateKey = async () => {
        try {
            const res = await api.post('/settings/generate-api-key');
            const key = res.data.key;
            enqueueSnackbar(`COPIE AGORA — API Key: ${key}`, {
                variant: 'info',
                autoHideDuration: 20000,
                anchorOrigin: { vertical: 'top', horizontal: 'center' }
            });
            loadApiKeys();
        } catch (err) {
            enqueueSnackbar(err.response?.data?.error || 'Erro ao gerar chave.', { variant: 'error' });
        }
    };

    const handleCopyKey = (token) => {
        navigator.clipboard.writeText(token);
        enqueueSnackbar('Copiado para o clipboard!', { variant: 'info' });
    };

    const handleRevokeKey = async (id) => {
        if (!window.confirm('Revogar esta chave? Integrações que a usam deixarão de funcionar.')) return;
        try {
            await api.delete(`/settings/apikeys/${id}`);
            enqueueSnackbar('Chave revogada.', { variant: 'warning' });
            setApiKeys(prev => prev.filter(k => k.id !== id));
        } catch {
            enqueueSnackbar('Erro ao revogar chave.', { variant: 'error' });
        }
    };

    // ── Webhooks ───────────────────────────────
    const validateUrl = (url) => {
        try {
            new URL(url);
            setUrlError('');
            return true;
        } catch {
            setUrlError('URL inválida. Use o formato https://dominio.com/endpoint');
            return false;
        }
    };

    const handleCreateWebhook = async () => {
        if (!newWebhookUrl) return enqueueSnackbar('URL é obrigatória.', { variant: 'warning' });
        if (!validateUrl(newWebhookUrl)) return;
        try {
            await api.post('/settings/webhooks', {
                trigger_event: newWebhookEvent,
                target_url: newWebhookUrl,
                descricao: newWebhookDesc || null,
                is_active: true
            });
            enqueueSnackbar('Webhook criado!', { variant: 'success' });
            setNewWebhookUrl('');
            setNewWebhookDesc('');
            loadWebhooks();
        } catch (err) {
            enqueueSnackbar(err.response?.data?.error || 'Erro ao criar webhook.', { variant: 'error' });
        }
    };

    const handleToggleWebhook = async (id, currentActive) => {
        try {
            await api.put(`/settings/webhooks/${id}`, { is_active: !currentActive });
            setWebhooks(prev => prev.map(w => w.id === id ? { ...w, is_active: !currentActive } : w));
        } catch {
            enqueueSnackbar('Erro ao atualizar webhook.', { variant: 'error' });
        }
    };

    const handleTestWebhook = async (id) => {
        setTestingId(id);
        try {
            const res = await api.post(`/settings/webhooks/${id}/test`);
            const { success, status_code, response_time_ms, error: errMsg } = res.data;
            if (success) {
                enqueueSnackbar(`✅ Webhook respondeu ${status_code} em ${response_time_ms}ms`, { variant: 'success' });
            } else {
                enqueueSnackbar(`❌ Falha: ${errMsg || `HTTP ${status_code}`}`, { variant: 'error' });
            }
            loadWebhooks(); // atualiza last_dispatch_at e status
        } catch {
            enqueueSnackbar('Erro ao testar webhook.', { variant: 'error' });
        } finally {
            setTestingId(null);
        }
    };

    const handleDeleteWebhook = async (id) => {
        try {
            await api.delete(`/settings/webhooks/${id}`);
            enqueueSnackbar('Webhook removido.', { variant: 'warning' });
            setWebhooks(prev => prev.filter(w => w.id !== id));
        } catch {
            enqueueSnackbar('Erro ao remover webhook.', { variant: 'error' });
        }
    };

    // ── Helpers de formatação ──────────────────
    const expiryChip = (expires_at) => {
        if (!expires_at) return null;
        const daysLeft = differenceInDays(new Date(expires_at), new Date());
        if (isPast(new Date(expires_at))) {
            return <Chip icon={<ExpiryIcon />} label="Expirada" size="small" sx={{ bgcolor: 'rgba(255,51,102,0.1)', color: '#FF3366', fontSize: '0.6rem' }} />;
        }
        if (daysLeft <= 30) {
            return <Chip icon={<ExpiryIcon />} label={`Expira em ${daysLeft}d`} size="small" sx={{ bgcolor: 'rgba(255,170,0,0.1)', color: '#FFAA00', fontSize: '0.6rem' }} />;
        }
        return <Chip label={`Expira em ${daysLeft}d`} size="small" sx={{ bgcolor: 'rgba(0,255,136,0.05)', color: 'text.secondary', fontSize: '0.6rem' }} />;
    };

    // ── Render ─────────────────────────────────
    return (
        <Box>
            <Typography variant="h6" sx={{ color: 'primary.main', mb: 3, fontWeight: 700 }}>
                🔗 Integrações: API Keys & Webhooks
            </Typography>

            <Grid container spacing={3}>

                {/* ── SEÇÃO: API KEYS ── */}
                <Grid item xs={12} lg={6}>
                    <GlassCard sx={{ p: 3, height: '100%' }}>
                        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
                            <Typography variant="subtitle1" sx={{ color: '#fff', fontWeight: 700, display: 'flex', alignItems: 'center', gap: 1 }}>
                                <SecurityIcon fontSize="small" color="primary" /> Chaves de API
                            </Typography>
                            <Button size="small" variant="outlined" onClick={handleGenerateKey} startIcon={<AddIcon />}>
                                Gerar Nova
                            </Button>
                        </Box>
                        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 2 }}>
                            A chave é exibida <b>uma única vez</b> ao ser gerada. Copie e guarde em local seguro.
                        </Typography>

                        {loadingKeys ? <LinearProgress /> : (
                            <List sx={{ bgcolor: 'rgba(0,0,0,0.15)', borderRadius: 2 }}>
                                {apiKeys.length === 0 ? (
                                    <ListItem>
                                        <Typography variant="caption" color="text.secondary">Nenhuma chave gerada.</Typography>
                                    </ListItem>
                                ) : apiKeys.map((k, i) => (
                                    <ListItem key={k.id} divider={i !== apiKeys.length - 1}
                                        secondaryAction={
                                            <Stack direction="row" spacing={0.5}>
                                                <Tooltip title="Copiar token">
                                                    <IconButton size="small" color="primary" onClick={() => handleCopyKey(k.token)}>
                                                        <CopyIcon fontSize="small" />
                                                    </IconButton>
                                                </Tooltip>
                                                <Tooltip title="Revogar chave">
                                                    <IconButton size="small" color="error" onClick={() => handleRevokeKey(k.id)}>
                                                        <DeleteIcon fontSize="small" />
                                                    </IconButton>
                                                </Tooltip>
                                            </Stack>
                                        }
                                    >
                                        <ListItemText
                                            primary={
                                                <Stack direction="row" spacing={1} alignItems="center">
                                                    <Typography variant="body2" fontWeight={600} color="#fff" sx={{ fontSize: '0.8rem' }}>
                                                        {k.name}
                                                    </Typography>
                                                    {expiryChip(k.expires_at)}
                                                </Stack>
                                            }
                                            secondary={
                                                <Typography variant="caption" color="text.secondary">
                                                    {k.created_by && `Por ${k.created_by} • `}
                                                    {k.created_at && formatDistanceToNow(new Date(k.created_at), { addSuffix: true, locale: ptBR })}
                                                </Typography>
                                            }
                                        />
                                    </ListItem>
                                ))}
                            </List>
                        )}
                    </GlassCard>
                </Grid>

                {/* ── SEÇÃO: WEBHOOKS ── */}
                <Grid item xs={12} lg={6}>
                    <GlassCard sx={{ p: 3, height: '100%' }}>
                        <Typography variant="subtitle1" sx={{ color: '#fff', fontWeight: 700, mb: 2, display: 'flex', alignItems: 'center', gap: 1 }}>
                            <WebhookIcon fontSize="small" color="primary" /> Gatilhos de Webhook
                        </Typography>

                        {/* Formulário de novo webhook */}
                        <Stack spacing={1.5} sx={{ mb: 2 }}>
                            <TextField select fullWidth size="small" label="Evento que dispara" value={newWebhookEvent}
                                onChange={(e) => setNewWebhookEvent(e.target.value)}>
                                {TRIGGER_EVENTS.map(ev => (
                                    <MenuItem key={ev.value} value={ev.value}>{ev.label}</MenuItem>
                                ))}
                            </TextField>
                            <TextField fullWidth size="small" label="URL de Destino (HTTPS)"
                                placeholder="https://api.seuapp.com/webhook"
                                value={newWebhookUrl}
                                onChange={(e) => { setNewWebhookUrl(e.target.value); if (urlError) validateUrl(e.target.value); }}
                                error={!!urlError}
                                helperText={urlError}
                            />
                            <TextField fullWidth size="small" label="Descrição (opcional)"
                                placeholder="Ex: ERP interno de RH"
                                value={newWebhookDesc}
                                onChange={(e) => setNewWebhookDesc(e.target.value)}
                            />
                            <Button variant="contained" onClick={handleCreateWebhook} startIcon={<AddIcon />}>
                                Adicionar Endpoint
                            </Button>
                        </Stack>

                        <Divider sx={{ mb: 2, borderColor: 'rgba(255,255,255,0.05)' }} />

                        {/* Lista de webhooks */}
                        {loadingHooks ? <LinearProgress /> : (
                            <Box sx={{ maxHeight: 320, overflowY: 'auto' }}>
                                {webhooks.length === 0 && (
                                    <Typography variant="caption" color="text.secondary">Nenhum webhook configurado.</Typography>
                                )}
                                {webhooks.map(wh => (
                                    <Box key={wh.id} sx={{
                                        p: 1.5, mb: 1, bgcolor: 'rgba(0,0,0,0.15)', borderRadius: 2,
                                        border: wh.is_active ? '1px solid rgba(0,212,255,0.1)' : '1px solid rgba(255,255,255,0.04)',
                                        opacity: wh.is_active ? 1 : 0.55
                                    }}>
                                        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 0.5 }}>
                                            <Stack direction="row" spacing={0.5} alignItems="center">
                                                <Chip label={wh.trigger_event} size="small"
                                                    sx={{ fontSize: '0.6rem', fontWeight: 800, bgcolor: 'rgba(0,212,255,0.1)', color: 'primary.main' }} />
                                                {wh.descricao && (
                                                    <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.65rem' }}>
                                                        {wh.descricao}
                                                    </Typography>
                                                )}
                                            </Stack>
                                            <Stack direction="row" spacing={0} alignItems="center">
                                                <Tooltip title={wh.is_active ? 'Desativar' : 'Ativar'}>
                                                    <Switch size="small" checked={wh.is_active}
                                                        onChange={() => handleToggleWebhook(wh.id, wh.is_active)} />
                                                </Tooltip>
                                                <Tooltip title="Testar agora">
                                                    <span>
                                                        <IconButton size="small" color="info" disabled={testingId === wh.id}
                                                            onClick={() => handleTestWebhook(wh.id)}>
                                                            {testingId === wh.id
                                                                ? <CircularProgress size={14} />
                                                                : <TestIcon sx={{ fontSize: 16 }} />}
                                                        </IconButton>
                                                    </span>
                                                </Tooltip>
                                                <Tooltip title="Remover">
                                                    <IconButton size="small" color="error" onClick={() => handleDeleteWebhook(wh.id)}>
                                                        <DeleteIcon sx={{ fontSize: 16 }} />
                                                    </IconButton>
                                                </Tooltip>
                                            </Stack>
                                        </Box>

                                        <Typography variant="caption" sx={{ color: 'text.secondary', wordBreak: 'break-all', display: 'block', fontSize: '0.65rem' }}>
                                            {wh.target_url}
                                        </Typography>

                                        <Box sx={{ mt: 0.5 }}>
                                            <WebhookStatusBadge webhook={wh} />
                                        </Box>

                                        {wh.last_dispatch_at && (
                                            <Typography variant="caption" color="text.disabled" sx={{ fontSize: '0.6rem' }}>
                                                Último disparo: {formatDistanceToNow(new Date(wh.last_dispatch_at), { addSuffix: true, locale: ptBR })}
                                            </Typography>
                                        )}
                                    </Box>
                                ))}
                            </Box>
                        )}

                        <Typography variant="caption" color="text.disabled" sx={{ display: 'block', mt: 2 }}>
                            Webhooks disparam via POST com JSON. Seu servidor deve responder 2xx em até 10s.
                        </Typography>
                    </GlassCard>
                </Grid>
            </Grid>
        </Box>
    );
};

export default ConfigWebhooks;
