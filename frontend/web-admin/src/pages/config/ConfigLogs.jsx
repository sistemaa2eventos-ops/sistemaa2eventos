import React, { useState, useEffect } from 'react';
import { Box, Typography, Grid, List, ListItem, ListItemText, Chip, Button, TextField, CircularProgress } from '@mui/material';
import { History as LogsIcon, BugReport as BugIcon, Warning as WarningIcon, Download as DownloadIcon, Save as SaveIcon } from '@mui/icons-material';
import { useSnackbar } from 'notistack';
import api from '../../services/api';
import PageHeader from '../../components/common/PageHeader';
import GlassCard from '../../components/common/GlassCard';
import NeonButton from '../../components/common/NeonButton';

const ConfigLogs = () => {
    const { enqueueSnackbar } = useSnackbar();
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [sysLogs, setSysLogs] = useState([]);

    const [retentionEdge, setRetentionEdge] = useState(30);
    const [retentionAdmin, setRetentionAdmin] = useState(90);

    useEffect(() => {
        loadSettings();
        loadLogs();
    }, []);

    const loadLogs = async () => {
        try {
            const { data } = await api.get('/monitor/system/logs?lines=50');
            if (data?.success) {
                setSysLogs(data.logs?.reverse() || []);
            }
        } catch (error) {
            enqueueSnackbar('Falha ao carregar syslogs', { variant: 'error' });
        }
    };

    const loadSettings = async () => {
        try {
            const { data } = await api.get('/settings');
            if (data?.success && data?.data) {
                const conf = data.data;
                setRetentionEdge(conf.syslog_retention_edge_days || 30);
                setRetentionAdmin(conf.syslog_retention_admin_days || 90);
            }
        } catch (error) {
            enqueueSnackbar('Falha ao obter limites de retenção', { variant: 'error' });
        } finally {
            setLoading(false);
        }
    };

    const handleSave = async () => {
        setSaving(true);
        try {
            await api.put('/settings', {
                syslog_retention_edge_days: parseInt(retentionEdge, 10),
                syslog_retention_admin_days: parseInt(retentionAdmin, 10)
            });
            enqueueSnackbar('Limites de retenção atualizados!', { variant: 'success' });
        } catch (error) {
            enqueueSnackbar('Erro ao salvar configuração', { variant: 'error' });
        } finally {
            setSaving(false);
        }
    };

    const handleClearLogs = async () => {
        if (!window.confirm("Certeza que deseja esvaziar os arquivos de log do sistema?")) return;
        try {
            await api.delete('/monitor/system/logs');
            enqueueSnackbar('Logs limpos com sucesso!', { variant: 'success' });
            loadLogs();
        } catch (error) {
            enqueueSnackbar('Erro ao limpar logs', { variant: 'error' });
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
                title="Auditoria & Logs (Syslog)"
                subtitle="Monitore as atividades do painel, edições em banco e erros nativos."
                breadcrumbs={[{ text: 'Sistema' }, { text: 'Configurações' }, { text: 'Logs de Auditoria' }]}
            />

            <Grid container spacing={4} sx={{ mt: 1 }}>
                <Grid item xs={12} lg={8}>
                    <GlassCard sx={{ p: 3, mb: 4, height: '100%' }}>
                        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                                <LogsIcon sx={{ color: '#00D4FF', fontSize: 28 }} />
                                <Typography variant="h6" sx={{ fontWeight: 700, color: '#fff' }}>
                                    ACTIVITY TRACKER
                                </Typography>
                            </Box>
                            <Button startIcon={<DownloadIcon />} variant="outlined" sx={{ color: '#fff', borderColor: 'rgba(255,255,255,0.2)' }} size="small">
                                EXPORTAR CSV
                            </Button>
                        </Box>

                        <List sx={{ bgcolor: 'rgba(0,0,0,0.2)', borderRadius: 2, maxHeight: '60vh', overflowY: 'auto' }}>
                            {sysLogs.length === 0 && (
                                <ListItem>
                                    <ListItemText primary="Nenhum registro encontrado." primaryTypographyProps={{ color: 'text.secondary', textAlign: 'center' }} />
                                </ListItem>
                            )}
                            {sysLogs.map((logLine, idx) => {
                                const isObj = typeof logLine === 'object' && logLine !== null;
                                const msg = isObj ? logLine.message : logLine;
                                const level = isObj ? (logLine.level || 'info').toLowerCase() : 'info';
                                const timeStr = isObj && logLine.timestamp ? new Date(logLine.timestamp).toLocaleString() : 'Sem data';

                                return (
                                    <ListItem key={idx} sx={{ borderBottom: '1px solid rgba(255,255,255,0.05)', display: 'flex', gap: 2 }}>
                                        <Box>
                                            {level === 'error' ? <BugIcon color="error" /> :
                                                (level === 'warn' || level === 'warning') ? <WarningIcon color="warning" /> :
                                                    <Box sx={{ w: 24, h: 24, borderRadius: '50%', bgcolor: '#00D4FF', opacity: 0.2 }} />}
                                        </Box>
                                        <ListItemText
                                            primary={msg}
                                            secondary={timeStr}
                                            primaryTypographyProps={{ color: level === 'error' ? '#FF3366' : '#fff', fontWeight: 600, fontSize: '0.9rem' }}
                                            secondaryTypographyProps={{ color: 'text.secondary', fontSize: '0.75rem' }}
                                        />
                                        <Chip label={level.toUpperCase()} size="small" color={level === 'error' ? 'error' : (level === 'warn' || level === 'warning') ? 'warning' : 'info'} variant="outlined" sx={{ fontWeight: 800, fontSize: '0.65rem' }} />
                                    </ListItem>
                                );
                            })}
                        </List>

                        <Box sx={{ textAlign: 'center', mt: 3 }}>
                            <Button sx={{ color: '#00D4FF' }}>Carregar mais registros...</Button>
                        </Box>
                    </GlassCard>
                </Grid>

                <Grid item xs={12} lg={4}>
                    <GlassCard sx={{ p: 3, mb: 4, height: '100%' }}>
                        <Typography variant="h6" sx={{ fontWeight: 700, color: '#FF3366', mb: 3 }}>
                            NÍVEL DE RETENÇÃO
                        </Typography>

                        <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
                            O Syslog consome espaço no banco (Datawarehouse). Determine por quanto tempo os rastros operacionais devem ser guardados antes de auto-exclusão.
                        </Typography>

                        <Box sx={{ mb: 3 }}>
                            <Typography variant="caption" sx={{ color: '#fff', fontWeight: 700 }}>Erros de Hardware (Edge)</Typography>
                            <TextField
                                fullWidth
                                variant="standard"
                                value={retentionEdge}
                                onChange={(e) => setRetentionEdge(e.target.value)}
                                type="number"
                                InputProps={{ endAdornment: <Typography variant="h6" sx={{ color: '#00D4FF', fontWeight: 800 }}>DIAS</Typography>, sx: { color: '#00D4FF', fontSize: '1.5rem', fontWeight: 900 } }}
                            />
                        </Box>

                        <Box sx={{ mb: 3 }}>
                            <Typography variant="caption" sx={{ color: '#fff', fontWeight: 700 }}>Atividade Administrativa</Typography>
                            <TextField
                                fullWidth
                                variant="standard"
                                value={retentionAdmin}
                                onChange={(e) => setRetentionAdmin(e.target.value)}
                                type="number"
                                InputProps={{ endAdornment: <Typography variant="h6" sx={{ color: '#00D4FF', fontWeight: 800 }}>DIAS</Typography>, sx: { color: '#00D4FF', fontSize: '1.5rem', fontWeight: 900 } }}
                            />
                        </Box>

                        <Box sx={{ mb: 4 }}>
                            <Typography variant="caption" sx={{ color: '#fff', fontWeight: 700 }}>Acessos Físicos (Check-ins)</Typography>
                            <Typography variant="h5" sx={{ color: '#00D4FF', fontWeight: 900, mt: 1 }}>ETERNO</Typography>
                        </Box>

                        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                            <NeonButton onClick={handleSave} disabled={saving} startIcon={<SaveIcon />}>
                                {saving ? "SALVANDO..." : "SALVAR POLÍTICA"}
                            </NeonButton>
                        </Box>

                        <Button fullWidth variant="outlined" color="error" sx={{ borderStyle: 'dashed' }} onClick={handleClearLogs}>
                            LIMPAR SYS LOG MANUALMENTE
                        </Button>
                    </GlassCard>
                </Grid>
            </Grid>
        </Box>
    );
};

export default ConfigLogs;
