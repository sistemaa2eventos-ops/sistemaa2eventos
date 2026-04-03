import React, { useState, useEffect } from 'react';
import { Box, Typography, Grid, TextField, Button, List, ListItem, ListItemText, IconButton, CircularProgress, MenuItem } from '@mui/material';
import { Code as CodeIcon, Delete as DeleteIcon, ContentCopy as CopyIcon, Add as AddIcon, Webhook as WebhookIcon } from '@mui/icons-material';
import { useSnackbar } from 'notistack';
import api from '../../services/api';
import PageHeader from '../../components/common/PageHeader';
import GlassCard from '../../components/common/GlassCard';

const ConfigWebhooks = () => {
    const { enqueueSnackbar } = useSnackbar();
    const [loading, setLoading] = useState(true);
    const [apiKeys, setApiKeys] = useState([]);
    const [webhooks, setWebhooks] = useState([]);

    const [newWebhookUrl, setNewWebhookUrl] = useState('');
    const [newWebhookEvent, setNewWebhookEvent] = useState('NOVO_CADASTRO');

    useEffect(() => {
        loadData();
    }, []);

    const loadData = async () => {
        try {
            const [keysRes, webhooksRes] = await Promise.all([
                api.get('/settings/apikeys'),
                api.get('/settings/webhooks')
            ]);
            setApiKeys(keysRes.data.data || []);
            setWebhooks(webhooksRes.data.data || []);
        } catch (error) {
            enqueueSnackbar('Falha ao obter integrações (Placeholder Mode)', { variant: 'info' });
        } finally {
            setLoading(false);
        }
    };

    const handleCreateApiKey = async () => {
        const name = prompt("Nome da Nova Integração API (Ex: Zapier, PowerBI):");
        if (!name) return;
        try {
            await api.post('/settings/apikeys', { name });
            enqueueSnackbar('API Key gerada!', { variant: 'success' });
            loadData();
        } catch (error) {
            enqueueSnackbar('Erro ao gerar API Key', { variant: 'error' });
        }
    };

    const handleDeleteApiKey = async (id) => {
        if (!window.confirm("Revogar este Token? Aplicações perderão acesso.")) return;
        try {
            await api.delete(`/settings/apikeys/${id}`);
            enqueueSnackbar('API Key revogada!', { variant: 'warning' });
            loadData();
        } catch (error) {
            enqueueSnackbar('Erro ao revogar', { variant: 'error' });
        }
    };

    const handleCreateWebhook = async () => {
        if (!newWebhookUrl) return enqueueSnackbar('URL é obrigatória', { variant: 'warning' });
        try {
            await api.post('/settings/webhooks', {
                trigger_event: newWebhookEvent,
                target_url: newWebhookUrl,
                is_active: 1
            });
            enqueueSnackbar('Webhook criado!', { variant: 'success' });
            setNewWebhookUrl('');
            loadData();
        } catch (error) {
            enqueueSnackbar('Erro ao criar Webhook', { variant: 'error' });
        }
    };

    const handleDeleteWebhook = async (id) => {
        try {
            await api.delete(`/settings/webhooks/${id}`);
            enqueueSnackbar('Webhook removido!', { variant: 'warning' });
            loadData();
        } catch (error) {
            enqueueSnackbar('Erro ao remover', { variant: 'error' });
        }
    };

    const handleCopy = (text) => {
        navigator.clipboard.writeText(text);
        enqueueSnackbar('Token copiado!', { variant: 'info' });
    };

    const formatDate = (dateString) => {
        try {
            return new Date(dateString).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
        } catch {
            return dateString;
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
                title="Webhooks & API Keys"
                subtitle="Exponha endpoints para conectar o NZT ao ERP, PowerBI ou Zapier da empresa."
                breadcrumbs={[{ text: 'Sistema' }, { text: 'Configurações' }, { text: 'Integrações Externas' }]}
            />

            <Grid container spacing={4} sx={{ mt: 1 }}>
                <Grid item xs={12} lg={6}>
                    <GlassCard sx={{ p: 3, mb: 4, height: '100%' }}>
                        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                                <CodeIcon sx={{ color: '#00D4FF', fontSize: 28 }} />
                                <Typography variant="h6" sx={{ fontWeight: 700, color: '#fff' }}>
                                    API KEYS GERADAS (TOKENS)
                                </Typography>
                            </Box>
                            <Button onClick={handleCreateApiKey} startIcon={<AddIcon />} variant="outlined" sx={{ color: '#00D4FF', borderColor: 'rgba(0,212,255,0.3)' }} size="small">
                                GERAR NOVO
                            </Button>
                        </Box>

                        <Typography variant="body2" color="text.secondary" sx={{ mb: 4 }}>
                            Gerencie os Bearer Tokens de acesso longo usados para extrair dados programaticamente.
                        </Typography>

                        <List sx={{ bgcolor: 'rgba(0,0,0,0.2)', borderRadius: 2 }}>
                            {apiKeys.length === 0 ? (
                                <ListItem sx={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                                    <ListItemText primary="Nenhum token gerado" secondary="Crie uma API Key para começar" primaryTypographyProps={{ color: 'text.secondary' }} />
                                </ListItem>
                            ) : apiKeys.map((key) => (
                                <ListItem key={key.id} sx={{ borderBottom: '1px solid rgba(255,255,255,0.05)', display: 'flex', gap: 2 }}>
                                    <ListItemText
                                        primary={key.name}
                                        secondary={`Gerado em: ${formatDate(key.created_at)}`}
                                        primaryTypographyProps={{ color: '#fff', fontWeight: 600, fontSize: '0.95rem' }}
                                        secondaryTypographyProps={{ color: 'text.secondary', fontSize: '0.75rem' }}
                                    />
                                    <Box sx={{ display: 'flex', gap: 1 }}>
                                        <IconButton onClick={() => handleCopy(key.api_key)} size="small" sx={{ color: '#00D4FF', bgcolor: 'rgba(0,212,255,0.05)' }}><CopyIcon fontSize="small" /></IconButton>
                                        <IconButton onClick={() => handleDeleteApiKey(key.id)} size="small" sx={{ color: '#FF3366', bgcolor: 'rgba(255,51,102,0.05)' }}><DeleteIcon fontSize="small" /></IconButton>
                                    </Box>
                                </ListItem>
                            ))}
                        </List>
                    </GlassCard>
                </Grid>

                <Grid item xs={12} lg={6}>
                    <GlassCard sx={{ p: 3, mb: 4, height: '100%' }}>
                        <Box sx={{ display: 'flex', alignItems: 'center', mb: 3, gap: 2 }}>
                            <WebhookIcon sx={{ color: '#7B2FBE', fontSize: 28 }} />
                            <Typography variant="h6" sx={{ fontWeight: 700, color: '#fff' }}>
                                AÇÕES REATIVAS / WEBHOOKS
                            </Typography>
                        </Box>

                        <Typography variant="body2" color="text.secondary" sx={{ mb: 4 }}>
                            Assine eventos para receber chamadas HTTP POST (`application/json`) com as payloads do sistema.
                        </Typography>

                        <List sx={{ bgcolor: 'rgba(0,0,0,0.2)', borderRadius: 2, mb: 4 }}>
                            {webhooks.length === 0 ? (
                                <ListItem sx={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                                    <ListItemText primary="Nenhum webhook ativo" secondary="Adicione uma URL abaixo" primaryTypographyProps={{ color: 'text.secondary' }} />
                                </ListItem>
                            ) : webhooks.map((wh) => (
                                <ListItem key={wh.id} sx={{ borderBottom: '1px solid rgba(255,255,255,0.05)', display: 'flex', flexDirection: 'column', alignItems: 'flex-start' }}>
                                    <Box sx={{ display: 'flex', justifyContent: 'space-between', width: '100%', mb: 1 }}>
                                        <Typography variant="caption" sx={{ color: '#00D4FF', fontWeight: 700 }}>
                                            {wh.trigger_event}
                                        </Typography>
                                        <IconButton onClick={() => handleDeleteWebhook(wh.id)} size="small" sx={{ color: '#FF3366' }}><DeleteIcon fontSize="small" /></IconButton>
                                    </Box>
                                    <Typography variant="body2" sx={{ color: '#fff', wordBreak: 'break-all' }}>
                                        {wh.target_url}
                                    </Typography>
                                </ListItem>
                            ))}
                        </List>

                        <Typography variant="h6" sx={{ color: '#7B2FBE', fontWeight: 700, mb: 2, fontSize: '1rem' }}>+ ADICIONAR NOVO WEBHOOK</Typography>
                        <Box sx={{ p: 2, border: '1px solid rgba(123, 47, 190, 0.3)', borderRadius: 2, bgcolor: 'rgba(123,47,190,0.05)' }}>
                            <TextField
                                select
                                fullWidth
                                label="Gatilho de Evento"
                                value={newWebhookEvent}
                                onChange={(e) => setNewWebhookEvent(e.target.value)}
                                size="small"
                                sx={{ mb: 2 }}
                            >
                                <MenuItem value="NOVO_CADASTRO">Novo Cadastro Realizado</MenuItem>
                                <MenuItem value="ACESSO_PERMITIDO">Acesso Permitido Catraca/Check-in</MenuItem>
                                <MenuItem value="ALERTA_SEGURANCA">Alerta de Segurança (LPR / Passback)</MenuItem>
                            </TextField>
                            <TextField
                                fullWidth
                                label="URL de Destino (POST)"
                                placeholder="https://api.erp.br/webhook"
                                value={newWebhookUrl}
                                onChange={(e) => setNewWebhookUrl(e.target.value)}
                                size="small"
                                sx={{ mb: 2 }}
                            />
                            <Button variant="contained" onClick={handleCreateWebhook} fullWidth sx={{ bgcolor: '#7B2FBE', color: '#fff', '&:hover': { bgcolor: '#5E1B99' } }}>
                                INSCREVER ENDPOINT
                            </Button>
                        </Box>

                    </GlassCard>
                </Grid>

            </Grid>
        </Box>
    );
};

export default ConfigWebhooks;
