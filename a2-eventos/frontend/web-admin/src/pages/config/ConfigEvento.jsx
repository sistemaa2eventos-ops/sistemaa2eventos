import React, { useState, useEffect } from 'react';
import {
    Box, Typography, TextField, Button, Chip, 
    Select, MenuItem, FormControl, InputLabel, 
    Grid, Switch, Divider, CircularProgress, 
    Alert, Stack, Paper
} from '@mui/material';
import { 
    Event as EventIcon,
    Schedule as CronIcon,
    Mail as MailIcon,
    PlayArrow as PlayIcon
} from '@mui/icons-material';
import { useSnackbar } from 'notistack';
import { useSystemSettings } from '../../hooks/useSystemSettings';
import GlassCard from '../../components/common/GlassCard';
import api from '../../services/api';

const ConfigEvento = () => {
    const { settings, setSettings, loading, saving, handleSave } = useSystemSettings();
    const { enqueueSnackbar } = useSnackbar();
    const [evento, setEvento] = useState(null);
    const [newEmail, setNewEmail] = useState('');

    useEffect(() => {
        const fetchEvento = async () => {
            const eid = localStorage.getItem('active_evento_id');
            if (eid) {
                const response = await api.get(`/eventos/${eid}`);
                if (response.data.success) setEvento(response.data.data);
            }
        };
        fetchEvento();
    }, []);

    const handleAddEmail = () => {
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(newEmail)) {
            enqueueSnackbar('Formato de email inválido.', { variant: 'error' });
            return;
        }
        if (settings.relatorio_emails.includes(newEmail)) {
            enqueueSnackbar('Email já adicionado.', { variant: 'warning' });
            return;
        }
        setSettings(prev => ({
            ...prev,
            relatorio_emails: [...prev.relatorio_emails, newEmail]
        }));
        setNewEmail('');
    };

    const handleRemoveEmail = (email) => {
        setSettings(prev => ({
            ...prev,
            relatorio_emails: prev.relatorio_emails.filter(e => e !== email)
        }));
    };

    const handleResetManual = async () => {
        if (!window.confirm('Deseja realmente forçar o reset de turnos agora? Todos os check-ins ativos serão encerrados.')) return;
        try {
            const eid = localStorage.getItem('active_evento_id');
            await api.post(`/eventos/${eid}/reset-manual`);
            enqueueSnackbar('Reset disparado com sucesso!', { variant: 'success' });
        } catch (error) {
            enqueueSnackbar('Erro ao disparar reset manual.', { variant: 'error' });
        }
    };

    if (loading) return <Box sx={{ display: 'flex', justifyContent: 'center', p: 4 }}><CircularProgress /></Box>;

    return (
        <Box>
            <Typography variant="h6" sx={{ color: 'primary.main', mb: 3, fontWeight: 700 }}>
                📅 Módulo de Evento Ativo
            </Typography>

            <Grid container spacing={3}>
                {/* SEÇÃO: Resumo do Evento */}
                <Grid item xs={12}>
                    <GlassCard sx={{ p: 3 }}>
                        <Typography variant="subtitle1" sx={{ color: '#fff', fontWeight: 700, mb: 2, display: 'flex', alignItems: 'center', gap: 1 }}>
                            <EventIcon fontSize="small" color="primary" /> Evento em Foco
                        </Typography>
                        {evento ? (
                            <Box sx={{ display: 'flex', gap: 4 }}>
                                <Box>
                                    <Typography variant="caption" color="text.secondary">NOME:</Typography>
                                    <Typography variant="body2" sx={{ color: '#fff', fontWeight: 600 }}>{evento.nome}</Typography>
                                </Box>
                                <Box>
                                    <Typography variant="caption" color="text.secondary">DATAS:</Typography>
                                    <Typography variant="body2" sx={{ color: '#fff', fontWeight: 600 }}>
                                        {new Date(evento.data_inicio).toLocaleDateString()} a {new Date(evento.data_fim).toLocaleDateString()}
                                    </Typography>
                                </Box>
                                <Box>
                                    <Typography variant="caption" color="text.secondary">STATUS:</Typography>
                                    <Box sx={{ bgcolor: 'rgba(0, 255, 136, 0.1)', color: '#00FF88', px: 1, borderRadius: 1, fontSize: '0.7rem', fontWeight: 800, textAlign: 'center' }}>
                                        ATIVO
                                    </Box>
                                </Box>
                            </Box>
                        ) : (
                            <Typography variant="body2" color="text.secondary">Nenhum evento selecionado.</Typography>
                        )}
                    </GlassCard>
                </Grid>

                {/* SEÇÃO: Reset Diário */}
                <Grid item xs={12} md={6}>
                    <GlassCard sx={{ p: 3, height: '100%' }}>
                        <Typography variant="subtitle1" sx={{ color: '#fff', fontWeight: 700, mb: 3, display: 'flex', alignItems: 'center', gap: 1 }}>
                            <CronIcon fontSize="small" color="primary" /> Automação de Reset
                        </Typography>
                        
                        <FormControl fullWidth sx={{ mb: 3 }}>
                            <InputLabel id="reset-hora-label">Horário de Reset Diário</InputLabel>
                            <Select
                                labelId="reset-hora-label"
                                value={settings.reset_hora || '03:00'}
                                label="Horário de Reset Diário"
                                onChange={(e) => setSettings(prev => ({ ...prev, reset_hora: e.target.value }))}
                            >
                                <MenuItem value="00:00">00:00</MenuItem>
                                <MenuItem value="01:00">01:00</MenuItem>
                                <MenuItem value="02:00">02:00</MenuItem>
                                <MenuItem value="03:00">03:00</MenuItem>
                                <MenuItem value="04:00">04:00</MenuItem>
                                <MenuItem value="05:00">05:00</MenuItem>
                            </Select>
                        </FormControl>

                        <Alert severity="warning" sx={{ mb: 2, bgcolor: 'rgba(255, 184, 0, 0.05)', border: '1px solid rgba(255, 184, 0, 0.1)' }}>
                            <Typography variant="caption" sx={{ color: '#FFB800' }}>
                                O reset forçará o checkout de todos os perfis logados no dispositivo.
                            </Typography>
                        </Alert>

                        <Button 
                            variant="outlined" 
                            color="warning" 
                            fullWidth 
                            startIcon={<PlayIcon />}
                            onClick={handleResetManual}
                            sx={{ fontWeight: 700 }}
                        >
                            Executar Reset Agora
                        </Button>
                    </GlassCard>
                </Grid>

                {/* SEÇÃO: Relatório Diário */}
                <Grid item xs={12} md={6}>
                    <GlassCard sx={{ p: 3, height: '100%' }}>
                        <Typography variant="subtitle1" sx={{ color: '#fff', fontWeight: 700, mb: 3, display: 'flex', alignItems: 'center', gap: 1 }}>
                            <MailIcon fontSize="small" color="primary" /> Relatórios Automáticos
                        </Typography>

                        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
                            <Box>
                                <Typography variant="body2" sx={{ color: '#fff', fontWeight: 600 }}>Receber por Email</Typography>
                                <Typography variant="caption" color="text.secondary">Disparo automático pós-reset</Typography>
                            </Box>
                            <Switch 
                                checked={!!settings.email_relatorio_ativo}
                                onChange={(e) => setSettings(prev => ({ ...prev, email_relatorio_ativo: e.target.checked }))}
                            />
                        </Box>

                        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1 }}>DESTINATÁRIOS:</Typography>
                        <Box sx={{ mb: 2, display: 'flex', flexWrap: 'wrap', gap: 1, minHeight: 40, p: 1, border: '1px solid rgba(255,255,255,0.1)', borderRadius: 2 }}>
                            {settings.relatorio_emails.map((email, i) => (
                                <Chip 
                                    key={i} 
                                    label={email} 
                                    onDelete={() => handleRemoveEmail(email)} 
                                    size="small"
                                    sx={{ bgcolor: 'rgba(0, 212, 255, 0.1)', color: 'primary.main', border: '1px solid rgba(0, 212, 255, 0.2)' }}
                                />
                            ))}
                        </Box>

                        <Stack direction="row" spacing={1}>
                            <TextField 
                                size="small" 
                                placeholder="novo@email.com" 
                                fullWidth 
                                value={newEmail}
                                onChange={(e) => setNewEmail(e.target.value)}
                                onKeyPress={(e) => e.key === 'Enter' && handleAddEmail()}
                            />
                            <Button variant="contained" onClick={handleAddEmail}>+</Button>
                        </Stack>
                    </GlassCard>
                </Grid>

                <Grid item xs={12}>
                    <Box sx={{ display: 'flex', justifyContent: 'flex-end' }}>
                        <Button
                            variant="contained"
                            color="primary"
                            onClick={() => handleSave()}
                            disabled={saving}
                            sx={{ fontWeight: 700, px: 4, borderRadius: 2 }}
                        >
                            {saving ? 'Salvando...' : 'Salvar Alterações'}
                        </Button>
                    </Box>
                </Grid>
            </Grid>
        </Box>
    );
};

export default ConfigEvento;
