import React, { useState } from 'react';
import {
    Box, Typography, Grid, TextField, MenuItem,
    Select, FormControl, InputLabel, CircularProgress,
    Stack, Alert, Chip, LinearProgress, Tooltip
} from '@mui/material';
import {
    Schedule as CronIcon,
    Assessment as ReportIcon,
    Sync as SyncIcon,
    DeleteSweep as CleanupIcon,
    GetApp as DownloadIcon,
    PlayArrow as PlayIcon,
    Timer as FixedIcon,
    RotateRight as TriggerIcon
} from '@mui/icons-material';
import { useSnackbar } from 'notistack';
import { useSystemSettings } from '../../hooks/useSystemSettings';
import GlassCard from '../../components/common/GlassCard';
import NeonButton from '../../components/common/NeonButton';
import api from '../../services/api';

// Todas as horas do dia em intervalos de 30 min
const HORAS = Array.from({ length: 48 }, (_, i) => {
    const h = String(Math.floor(i / 2)).padStart(2, '0');
    const m = i % 2 === 0 ? '00' : '30';
    return `${h}:${m}`;
});

// Jobs com schedule fixo (não configuráveis pelo usuário)
const JOBS_FIXOS = [
    { label: 'Auto-checkout de Trava',   schedule: 'A cada 5 min',  desc: 'Detecta pessoas presas em check-in e força checkout.' },
    { label: 'Saúde dos Dispositivos',   schedule: 'A cada 5 min',  desc: 'Ping em terminais biométricos e atualiza status online/offline.' },
    { label: 'Fila de Sincronização',    schedule: 'A cada 1 min',  desc: 'Processa comandos enfileirados para terminais offline.' },
    { label: 'Saúde do Sistema',         schedule: 'A cada 30 seg', desc: 'Verifica memória, conexões e integridade geral do servidor.' },
    { label: 'Sync Noturno Inteligente', schedule: 'Diário às 01:00', desc: 'Sincroniza acessos e limpa cache de faces desatualizadas.' },
    { label: 'Revogação de Documentos',  schedule: 'Diário às 04:00', desc: 'Invalida NRs e ASOs vencidos no ECM.' },
];

const ConfigCron = () => {
    const { settings, setSettings, loading, saving, handleSave, downloadDailyReport } = useSystemSettings();
    const { enqueueSnackbar } = useSnackbar();
    const [runningReset,  setRunningReset]  = useState(false);
    const [runningSync,   setRunningSync]   = useState(false);
    const [downloading,   setDownloading]   = useState(false);

    const retencao = parseInt(settings.log_retention_days) || 90;
    const retencaoInvalida = retencao < 7 || retencao > 365;

    const handleDownload = async () => {
        const eid = localStorage.getItem('active_evento_id');
        if (!eid) {
            enqueueSnackbar('Selecione um evento ativo no Dashboard antes de gerar o relatório.', { variant: 'warning' });
            return;
        }
        try {
            setDownloading(true);
            await downloadDailyReport(eid);
            enqueueSnackbar('Relatório gerado e download iniciado!', { variant: 'success' });
        } catch {
            enqueueSnackbar('Erro ao gerar relatório.', { variant: 'error' });
        } finally {
            setDownloading(false);
        }
    };

    const handleManualReset = async () => {
        if (!window.confirm('Disparar reset de turnos agora? Pessoas em check-in serão forçadas a checkout.')) return;
        try {
            setRunningReset(true);
            await api.post('/eventos/reset/manual');
            enqueueSnackbar('Reset de turnos executado com sucesso!', { variant: 'success' });
        } catch (err) {
            enqueueSnackbar(err.response?.data?.error || 'Erro ao executar reset.', { variant: 'error' });
        } finally {
            setRunningReset(false);
        }
    };

    const handleManualSync = async () => {
        try {
            setRunningSync(true);
            await api.post('/sync/run');
            enqueueSnackbar('Sincronização manual executada!', { variant: 'success' });
        } catch (err) {
            enqueueSnackbar(err.response?.data?.error || 'Erro ao executar sync.', { variant: 'error' });
        } finally {
            setRunningSync(false);
        }
    };

    const handleSalvar = async () => {
        if (retencaoInvalida) {
            enqueueSnackbar('Retenção de logs deve ser entre 7 e 365 dias.', { variant: 'warning' });
            return;
        }
        if (settings.cron_relatorio_hora <= settings.cron_reset_hora) {
            enqueueSnackbar('O Relatório deve ser agendado APÓS o Reset de Turno.', { variant: 'warning' });
            return;
        }
        await handleSave();
    };

    if (loading) {
        return (
            <Box sx={{ display: 'flex', justifyContent: 'center', p: 4 }}>
                <CircularProgress />
            </Box>
        );
    }

    return (
        <Box>
            <Typography variant="h6" sx={{ color: 'primary.main', mb: 3, fontWeight: 700 }}>
                🤖 Automação & Jobs em Background
            </Typography>

            {/* Aviso: mudanças de horário são aplicadas em tempo real */}
            <Alert severity="info" sx={{ mb: 3, bgcolor: 'rgba(0,212,255,0.05)', color: '#E8F4FD', border: '1px solid rgba(0,212,255,0.2)' }}>
                Alterações nos horários configuráveis são aplicadas <b>imediatamente</b> sem reiniciar o servidor.
                Os jobs com horário fixo abaixo não são configuráveis pela interface.
            </Alert>

            <Grid container spacing={3}>

                {/* ── JOBS CONFIGURÁVEIS ── */}
                <Grid item xs={12}>
                    <Typography variant="subtitle1" sx={{ color: '#fff', fontWeight: 700, mb: 2, display: 'flex', alignItems: 'center', gap: 1 }}>
                        <CronIcon sx={{ color: '#00D4FF' }} fontSize="small" /> Jobs Configuráveis
                    </Typography>
                </Grid>

                {/* Reset Diário */}
                <Grid item xs={12} md={6} lg={4}>
                    <GlassCard glowColor="rgba(0,212,255,0.3)" sx={{ p: 3, height: '100%' }}>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
                            <CronIcon sx={{ color: '#00D4FF' }} fontSize="small" />
                            <Typography variant="subtitle1" sx={{ color: '#fff', fontWeight: 700 }}>
                                Reset de Turno Diário
                            </Typography>
                        </Box>
                        <FormControl fullWidth size="small">
                            <InputLabel>Horário de Execução</InputLabel>
                            <Select
                                value={settings.cron_reset_hora || '03:00'}
                                label="Horário de Execução"
                                onChange={(e) => setSettings(prev => ({ ...prev, cron_reset_hora: e.target.value }))}
                            >
                                {HORAS.map(h => <MenuItem key={h} value={h}>{h}</MenuItem>)}
                            </Select>
                        </FormControl>
                        <Typography variant="caption" color="text.secondary" sx={{ mt: 1.5, display: 'block' }}>
                            Força checkout em todas as pessoas ainda em check-in e gera relatório noturno.
                        </Typography>
                    </GlassCard>
                </Grid>

                {/* Relatório Diário */}
                <Grid item xs={12} md={6} lg={4}>
                    <GlassCard glowColor="rgba(0,255,136,0.3)" sx={{ p: 3, height: '100%' }}>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
                            <ReportIcon sx={{ color: '#00FF88' }} fontSize="small" />
                            <Typography variant="subtitle1" sx={{ color: '#fff', fontWeight: 700 }}>
                                Relatório Diário
                            </Typography>
                        </Box>
                        <FormControl fullWidth size="small">
                            <InputLabel>Horário de Execução</InputLabel>
                            <Select
                                value={settings.cron_relatorio_hora || '03:30'}
                                label="Horário de Execução"
                                onChange={(e) => setSettings(prev => ({ ...prev, cron_relatorio_hora: e.target.value }))}
                            >
                                {HORAS.map(h => <MenuItem key={h} value={h}>{h}</MenuItem>)}
                            </Select>
                        </FormControl>
                        <Typography variant="caption" color="text.secondary" sx={{ mt: 1.5, display: 'block' }}>
                            Envia relatório consolidado (Excel/PDF) para os emails cadastrados. Deve ser agendado após o Reset.
                        </Typography>
                    </GlassCard>
                </Grid>

                {/* Retenção de Logs */}
                <Grid item xs={12} md={6} lg={4}>
                    <GlassCard glowColor="rgba(255,51,102,0.3)" sx={{ p: 3, height: '100%' }}>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
                            <CleanupIcon sx={{ color: '#FF3366' }} fontSize="small" />
                            <Typography variant="subtitle1" sx={{ color: '#fff', fontWeight: 700 }}>
                                Retenção de Logs
                            </Typography>
                        </Box>
                        <TextField
                            label="Dias de Retenção"
                            type="number"
                            fullWidth
                            size="small"
                            value={retencao}
                            onChange={(e) => setSettings(prev => ({ ...prev, log_retention_days: parseInt(e.target.value, 10) }))}
                            inputProps={{ min: 7, max: 365 }}
                            error={retencaoInvalida}
                            helperText={retencaoInvalida ? 'Entre 7 e 365 dias.' : 'Logs com mais de X dias são removidos automaticamente.'}
                        />
                        {retencao < 30 && !retencaoInvalida && (
                            <Alert severity="warning" sx={{ mt: 1.5, py: 0.5, fontSize: '0.75rem' }}>
                                Retenção abaixo de 30 dias pode apagar logs recentes em uso.
                            </Alert>
                        )}
                    </GlassCard>
                </Grid>

                {/* ── JOBS FIXOS (informativos) ── */}
                <Grid item xs={12} sx={{ mt: 1 }}>
                    <Typography variant="subtitle1" sx={{ color: '#fff', fontWeight: 700, mb: 2, display: 'flex', alignItems: 'center', gap: 1 }}>
                        <FixedIcon sx={{ color: '#FFAA00' }} fontSize="small" /> Jobs de Sistema (Fixos, não configuráveis)
                    </Typography>
                </Grid>

                <Grid item xs={12}>
                    <GlassCard sx={{ p: 3 }}>
                        <Grid container spacing={2}>
                            {JOBS_FIXOS.map((job, i) => (
                                <Grid item xs={12} sm={6} md={4} key={i}>
                                    <Box sx={{ p: 1.5, bgcolor: 'rgba(255,255,255,0.03)', borderRadius: 2, border: '1px solid rgba(255,255,255,0.06)', height: '100%' }}>
                                        <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 0.5 }}>
                                            <SyncIcon sx={{ fontSize: 14, color: '#FFAA00' }} />
                                            <Typography variant="body2" fontWeight={700} color="#fff" sx={{ fontSize: '0.8rem' }}>
                                                {job.label}
                                            </Typography>
                                        </Stack>
                                        <Chip label={job.schedule} size="small" sx={{ mb: 0.75, fontSize: '0.6rem', fontWeight: 700, bgcolor: 'rgba(255,170,0,0.1)', color: '#FFAA00' }} />
                                        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', fontSize: '0.7rem' }}>
                                            {job.desc}
                                        </Typography>
                                    </Box>
                                </Grid>
                            ))}
                        </Grid>
                    </GlassCard>
                </Grid>

                {/* ── AÇÕES MANUAIS ── */}
                <Grid item xs={12}>
                    <GlassCard sx={{ p: 3, border: '1px solid rgba(0,212,255,0.1)' }}>
                        <Typography variant="subtitle1" sx={{ color: '#fff', fontWeight: 700, mb: 2, display: 'flex', alignItems: 'center', gap: 1 }}>
                            <TriggerIcon sx={{ color: '#00D4FF' }} fontSize="small" /> Ações Manuais
                        </Typography>
                        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
                            <Tooltip title="Gera e faz download do relatório Excel do evento ativo">
                                <span>
                                    <NeonButton
                                        startIcon={downloading ? <CircularProgress size={16} /> : <DownloadIcon />}
                                        disabled={downloading}
                                        onClick={handleDownload}
                                    >
                                        {downloading ? 'Gerando...' : 'Baixar Relatório Excel'}
                                    </NeonButton>
                                </span>
                            </Tooltip>
                            <Tooltip title="Força checkout de pessoas presas e limpa turnos do dia">
                                <span>
                                    <NeonButton
                                        neonColor="#FFAA00"
                                        startIcon={runningReset ? <CircularProgress size={16} /> : <PlayIcon />}
                                        disabled={runningReset}
                                        onClick={handleManualReset}
                                    >
                                        {runningReset ? 'Executando...' : 'Reset de Turno Agora'}
                                    </NeonButton>
                                </span>
                            </Tooltip>
                            <Tooltip title="Executa sincronização de dispositivos imediatamente">
                                <span>
                                    <NeonButton
                                        neonColor="#00FF88"
                                        startIcon={runningSync ? <CircularProgress size={16} /> : <SyncIcon />}
                                        disabled={runningSync}
                                        onClick={handleManualSync}
                                    >
                                        {runningSync ? 'Sincronizando...' : 'Sync Manual de Dispositivos'}
                                    </NeonButton>
                                </span>
                            </Tooltip>
                        </Stack>
                    </GlassCard>
                </Grid>

                {/* ── SALVAR ── */}
                <Grid item xs={12}>
                    <Box sx={{ display: 'flex', justifyContent: 'flex-end' }}>
                        {saving && <LinearProgress sx={{ width: 200, mr: 2, alignSelf: 'center' }} />}
                        <NeonButton onClick={handleSalvar} disabled={saving || retencaoInvalida}>
                            {saving ? 'Salvando...' : 'Salvar Alterações'}
                        </NeonButton>
                    </Box>
                </Grid>
            </Grid>
        </Box>
    );
};

export default ConfigCron;
