import React from 'react';
import { 
    Box, Typography, Grid, Button, 
    TextField, MenuItem, Select, FormControl, InputLabel,
    CircularProgress, Divider, Stack
} from '@mui/material';
import {
    Schedule as CronIcon,
    Assessment as ReportIcon,
    Sync as SyncIcon,
    DeleteSweep as CleanupIcon,
    GetApp as DownloadIcon,
    PlayArrow as PlayIcon
} from '@mui/icons-material';
import { useSnackbar } from 'notistack';
import { useSystemSettings } from '../../hooks/useSystemSettings';
import GlassCard from '../../components/common/GlassCard';

const ConfigCron = () => {
    const { settings, setSettings, loading, saving, handleSave, downloadDailyReport } = useSystemSettings();
    const { enqueueSnackbar } = useSnackbar();

    const handleDownload = async () => {
        const eid = localStorage.getItem('active_evento_id');
        if (!eid) {
            enqueueSnackbar('Selecione um evento ativo no dashboard primeiro.', { variant: 'warning' });
            return;
        }
        await downloadDailyReport(eid);
    };

    if (loading) return <Box sx={{ display: 'flex', justifyContent: 'center', p: 4 }}><CircularProgress /></Box>;

    return (
        <Box>
            <Typography variant="h6" sx={{ color: 'primary.main', mb: 3, fontWeight: 700 }}>
                🤖 Automação & Jobs em Background
            </Typography>

            <Grid container spacing={3}>
                {/* CARD 1: Reset Diário */}
                <Grid item xs={12} md={6} lg={3}>
                    <GlassCard sx={{ p: 3, height: '100%' }}>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
                            <CronIcon color="primary" />
                            <Typography variant="subtitle2" sx={{ color: '#fff', fontWeight: 700 }}>Reset Diário</Typography>
                        </Box>
                        <FormControl fullWidth size="small">
                            <InputLabel>Horário do Job</InputLabel>
                            <Select
                                value={settings.cron_reset_hora || '03:00'}
                                label="Horário do Job"
                                onChange={(e) => setSettings(prev => ({ ...prev, cron_reset_hora: e.target.value }))}
                            >
                                <MenuItem value="00:00">00:00</MenuItem>
                                <MenuItem value="01:00">01:00</MenuItem>
                                <MenuItem value="02:00">02:00</MenuItem>
                                <MenuItem value="03:00">03:00</MenuItem>
                                <MenuItem value="04:00">04:00</MenuItem>
                            </Select>
                        </FormControl>
                        <Typography variant="caption" color="text.secondary" sx={{ mt: 1, display: 'block' }}>
                            Força checkout e limpa turnos.
                        </Typography>
                    </GlassCard>
                </Grid>

                {/* CARD 2: Relatório Diário */}
                <Grid item xs={12} md={6} lg={3}>
                    <GlassCard sx={{ p: 3, height: '100%' }}>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
                            <ReportIcon sx={{ color: '#00FF88' }} />
                            <Typography variant="subtitle2" sx={{ color: '#fff', fontWeight: 700 }}>Relatório Diário</Typography>
                        </Box>
                        <FormControl fullWidth size="small">
                            <InputLabel>Horário do Job</InputLabel>
                            <Select
                                value={settings.cron_relatorio_hora || '03:30'}
                                label="Horário do Job"
                                onChange={(e) => setSettings(prev => ({ ...prev, cron_relatorio_hora: e.target.value }))}
                            >
                                <MenuItem value="03:30">03:30</MenuItem>
                                <MenuItem value="04:00">04:00</MenuItem>
                                <MenuItem value="05:00">05:00</MenuItem>
                                <MenuItem value="06:00">06:00</MenuItem>
                            </Select>
                        </FormControl>
                        <Typography variant="caption" color="text.secondary" sx={{ mt: 1, display: 'block' }}>
                            Envia PDF/Excel consolidado.
                        </Typography>
                    </GlassCard>
                </Grid>

                {/* CARD 3: Sync Real-time */}
                <Grid item xs={12} md={6} lg={3}>
                    <GlassCard sx={{ p: 3, height: '100%' }}>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
                            <SyncIcon sx={{ color: '#00D4FF' }} />
                            <Typography variant="subtitle2" sx={{ color: '#fff', fontWeight: 700 }}>Sincronização</Typography>
                        </Box>
                        <FormControl fullWidth size="small">
                            <InputLabel>Intervalo</InputLabel>
                            <Select
                                value={settings.cron_sync_interval || '30min'}
                                label="Intervalo"
                                onChange={(e) => setSettings(prev => ({ ...prev, cron_sync_interval: e.target.value }))}
                            >
                                <MenuItem value="5min">Cada 5 min</MenuItem>
                                <MenuItem value="15min">Cada 15 min</MenuItem>
                                <MenuItem value="30min">Cada 30 min</MenuItem>
                                <MenuItem value="1h">Cada 1 hora</MenuItem>
                            </Select>
                        </FormControl>
                        <Typography variant="caption" color="text.secondary" sx={{ mt: 1, display: 'block' }}>
                            Ping de saúde e sync de logs.
                        </Typography>
                    </GlassCard>
                </Grid>

                {/* CARD 4: Retenção de Logs */}
                <Grid item xs={12} md={6} lg={3}>
                    <GlassCard sx={{ p: 3, height: '100%' }}>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
                            <CleanupIcon sx={{ color: '#ff4444' }} />
                            <Typography variant="subtitle2" sx={{ color: '#fff', fontWeight: 700 }}>Limpeza de Logs</Typography>
                        </Box>
                        <TextField
                            label="Retenção (Dias)"
                            type="number"
                            fullWidth
                            size="small"
                            value={settings.log_retention_days || 90}
                            onChange={(e) => setSettings(prev => ({ ...prev, log_retention_days: e.target.value }))}
                        />
                        <Typography variant="caption" color="text.secondary" sx={{ mt: 1, display: 'block' }}>
                            Exclui logs mais antigos que isso.
                        </Typography>
                    </GlassCard>
                </Grid>

                {/* AÇÃO MANUAL */}
                <Grid item xs={12}>
                    <GlassCard sx={{ p: 3, bgcolor: 'rgba(0, 212, 255, 0.03)' }}>
                        <Typography variant="subtitle1" sx={{ color: '#fff', fontWeight: 700, mb: 3 }}>
                            Ações Manuais
                        </Typography>
                        <Stack direction="row" spacing={2}>
                            <Button 
                                variant="contained" 
                                color="secondary" 
                                startIcon={<DownloadIcon />}
                                onClick={handleDownload}
                                sx={{ fontWeight: 700, textTransform: 'none' }}
                            >
                                Gerar Agora (Download Excel)
                            </Button>
                            <Button 
                                variant="outlined" 
                                color="primary" 
                                startIcon={<PlayIcon />}
                                onClick={() => enqueueSnackbar('Gatilho de sync manual enviado.', { variant: 'info' })}
                                sx={{ fontWeight: 700, textTransform: 'none' }}
                            >
                                Disparar Sync Manual
                            </Button>
                        </Stack>
                    </GlassCard>
                </Grid>

                <Grid item xs={12}>
                    <Box sx={{ display: 'flex', justifyContent: 'flex-end', mt: 2 }}>
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

export default ConfigCron;
