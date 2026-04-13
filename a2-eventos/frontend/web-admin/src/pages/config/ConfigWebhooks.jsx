import React, { useState, useEffect } from 'react';
import { 
    Box, Typography, Grid, TextField, Button, 
    List, ListItem, ListItemText, IconButton, 
    CircularProgress, MenuItem, Stack, Chip, Divider
} from '@mui/material';
import { 
    Code as CodeIcon, 
    Delete as DeleteIcon, 
    ContentCopy as CopyIcon, 
    Add as AddIcon, 
    Webhook as WebhookIcon,
    Security as SecurityIcon 
} from '@mui/icons-material';
import { useSnackbar } from 'notistack';
import { useSystemSettings } from '../../hooks/useSystemSettings';
import GlassCard from '../../components/common/GlassCard';
import api from '../../services/api';

const ConfigWebhooks = () => {
    const { settings, refresh, generateApiKey } = useSystemSettings();
    const { enqueueSnackbar } = useSnackbar();
    const [loading, setLoading] = useState(true);
    const [webhooks, setWebhooks] = useState([]);
    
    // API Keys agora ficam em settings.config.api_keys conforme novo controlador
    const apiKeys = settings.config?.api_keys || [];

    const [newWebhookUrl, setNewWebhookUrl] = useState('');
    const [newWebhookEvent, setNewWebhookEvent] = useState('NOVO_CADASTRO');

    useEffect(() => {
        loadWebhooks();
    }, []);

    const loadWebhooks = async () => {
        try {
            const res = await api.get('/settings/webhooks');
            setWebhooks(res.data.data || []);
        } catch (error) {
            console.error(error);
        } finally {
            setLoading(false);
        }
    };

    const handleCreateKey = async () => {
        const key = await generateApiKey();
        if (key) {
            alert(`Sua nova API Key foi gerada:\n\n${key}\n\nCOPIE E SALVE AGORA. Por segurança, esta chave não será exibida novamente por completo.`);
        }
    };

    const handleDeleteKey = async (targetKey) => {
        if (!window.confirm("Revogar este Token?")) return;
        try {
            const newKeys = apiKeys.filter(k => k.key !== targetKey);
            await api.put('/settings', { 
                config: { ...settings.config, api_keys: newKeys } 
            });
            enqueueSnackbar('Chave revogada.', { variant: 'info' });
            refresh();
        } catch (error) {
            enqueueSnackbar('Erro ao revogar chave.', { variant: 'error' });
        }
    };

    const handleCreateWebhook = async () => {
        if (!newWebhookUrl) return enqueueSnackbar('URL é obrigatória', { variant: 'warning' });
        try {
            await api.post('/settings/webhooks', {
                trigger_event: newWebhookEvent,
                target_url: newWebhookUrl,
                is_active: true
            });
            enqueueSnackbar('Webhook criado!', { variant: 'success' });
            setNewWebhookUrl('');
            loadWebhooks();
        } catch (error) {
            enqueueSnackbar('Erro ao criar Webhook', { variant: 'error' });
        }
    };

    const handleDeleteWebhook = async (id) => {
        try {
            await api.delete(`/settings/webhooks/${id}`);
            enqueueSnackbar('Webhook removido!', { variant: 'warning' });
            loadWebhooks();
        } catch (error) {
            enqueueSnackbar('Erro ao remover', { variant: 'error' });
        }
    };

    const handleCopy = (text) => {
        navigator.clipboard.writeText(text);
        enqueueSnackbar('Copiado para o clipboard!', { variant: 'info' });
    };

    if (loading) return <Box sx={{ display: 'flex', justifyContent: 'center', p: 4 }}><CircularProgress /></Box>;

    return (
        <Box>
            <Typography variant="h6" sx={{ color: 'primary.main', mb: 3, fontWeight: 700 }}>
                🔗 Integrações: API & Webhooks
            </Typography>

            <Grid container spacing={3}>
                {/* SEÇÃO: API Keys */}
                <Grid item xs={12} lg={6}>
                    <GlassCard sx={{ p: 3, height: '100%' }}>
                        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
                            <Typography variant="subtitle1" sx={{ color: '#fff', fontWeight: 700, display: 'flex', alignItems: 'center', gap: 1 }}>
                                <SecurityIcon fontSize="small" color="primary" /> Chaves de Acesso (API)
                            </Typography>
                            <Button size="small" variant="outlined" onClick={handleCreateKey} startIcon={<AddIcon />}>Gerar</Button>
                        </Box>
                        
                        <List sx={{ bgcolor: 'rgba(0,0,0,0.1)', borderRadius: 2 }}>
                            {apiKeys.length === 0 ? (
                                <ListItem><Typography variant="caption" color="text.secondary">Nenhuma chave gerada.</Typography></ListItem>
                            ) : apiKeys.map((k, i) => (
                                <ListItem key={i} divider={i !== apiKeys.length - 1}>
                                    <ListItemText 
                                        primary={k.created_by || 'Dev Token'} 
                                        secondary={`Criado em: ${new Date(k.created_at).toLocaleDateString()}`}
                                        primaryTypographyProps={{ color: '#fff', fontWeight: 600, fontSize: '0.8rem' }}
                                        secondaryTypographyProps={{ fontSize: '0.7rem' }}
                                    />
                                    <Stack direction="row" spacing={1}>
                                        <IconButton size="small" color="primary" onClick={() => handleCopy(k.key)}><CopyIcon fontSize="small" /></IconButton>
                                        <IconButton size="small" color="error" onClick={() => handleDeleteKey(k.key)}><DeleteIcon fontSize="small" /></IconButton>
                                    </Stack>
                                </ListItem>
                            ))}
                        </List>
                    </GlassCard>
                </Grid>

                {/* SEÇÃO: Webhooks */}
                <Grid item xs={12} lg={6}>
                    <GlassCard sx={{ p: 3, height: '100%' }}>
                        <Typography variant="subtitle1" sx={{ color: '#fff', fontWeight: 700, mb: 3, display: 'flex', alignItems: 'center', gap: 1 }}>
                            <WebhookIcon fontSize="small" color="primary" /> Gatilhos de Webhook
                        </Typography>

                        <Stack spacing={2} sx={{ mb: 3 }}>
                            <TextField
                                select
                                fullWidth
                                size="small"
                                label="Evento"
                                value={newWebhookEvent}
                                onChange={(e) => setNewWebhookEvent(e.target.value)}
                            >
                                <MenuItem value="NOVO_CADASTRO">Novo Cadastro</MenuItem>
                                <MenuItem value="CHECKIN">Entrada Realizada</MenuItem>
                                <MenuItem value="CHECKOUT">Saída Realizada</MenuItem>
                                <MenuItem value="ALERTA">Alerta de Segurança</MenuItem>
                            </TextField>
                            <TextField
                                fullWidth
                                size="small"
                                label="URL de Destino (POST)"
                                placeholder="https://api.erp.br/webhook"
                                value={newWebhookUrl}
                                onChange={(e) => setNewWebhookUrl(e.target.value)}
                            />
                            <Button variant="contained" onClick={handleCreateWebhook}>Adicionar Endpoint</Button>
                        </Stack>

                        <Divider sx={{ mb: 2, borderColor: 'rgba(255,255,255,0.05)' }} />

                        <Box sx={{ maxHeight: 200, overflowY: 'auto' }}>
                            {webhooks.map((wh) => (
                                <Box key={wh.id} sx={{ p: 1.5, mb: 1, bgcolor: 'rgba(0,0,0,0.1)', borderRadius: 1 }}>
                                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                        <Chip label={wh.trigger_event} size="small" sx={{ fontSize: '0.6rem', fontWeight: 800, bgcolor: 'rgba(0, 212, 255, 0.1)', color: 'primary.main' }} />
                                        <IconButton size="small" color="error" onClick={() => handleDeleteWebhook(wh.id)}><DeleteIcon sx={{ fontSize: 16 }} /></IconButton>
                                    </Box>
                                    <Typography variant="caption" sx={{ color: 'text.secondary', wordBreak: 'break-all', display: 'block', mt: 1 }}>
                                        {wh.target_url}
                                    </Typography>
                                </Box>
                            ))}
                        </Box>
                    </GlassCard>
                </Grid>

                <Grid item xs={12}>
                    <Box sx={{ display: 'flex', justifyContent: 'flex-end', mt: 2 }}>
                        <Typography variant="caption" color="text.secondary">
                            Webhooks são disparados via POST com JSON contendo detalhes do objeto afetado.
                        </Typography>
                    </Box>
                </Grid>
            </Grid>
        </Box>
    );
};

export default ConfigWebhooks;
