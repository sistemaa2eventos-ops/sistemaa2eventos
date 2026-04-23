import React, { useState, useEffect } from 'react';
import { Box, Typography, Grid, List, ListItem, ListItemText, Chip, Button, TextField, CircularProgress, FormControl, InputLabel, Select, MenuItem, Stack } from '@mui/material';
import { History as LogsIcon, BugReport as BugIcon, Warning as WarningIcon, Download as DownloadIcon, Save as SaveIcon, FilterList as FilterIcon } from '@mui/icons-material';
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
    const [filtros, setFiltros] = useState({
        modulo: '',
        nivel: '',
        dataInicio: '',
        dataFim: '',
        usuario: ''
    });

    const [retentionEdge, setRetentionEdge] = useState(30);
    const [retentionAdmin, setRetentionAdmin] = useState(90);

    useEffect(() => {
        loadSettings();
        loadLogs();
    }, []);

    const loadLogs = async () => {
        try {
            setLoading(true);
            const params = new URLSearchParams();
            if (filtros.nivel) params.append('level', filtros.nivel);
            if (filtros.dataInicio) params.append('start_date', filtros.dataInicio);
            if (filtros.dataFim) params.append('end_date', filtros.dataFim);
            
            const { data } = await api.get(`/monitor/logs?lines=50&${params.toString()}`);
            if (data?.success) {
                setSysLogs(data.logs?.reverse() || []);
            }
        } catch (error) {
            enqueueSnackbar('Falha ao carregar syslogs', { variant: 'error' });
        } finally {
            setLoading(false);
        }
    };

    const handleFilterChange = (campo, valor) => {
        setFiltros(prev => ({ ...prev, [campo]: valor }));
    };

    const handleApplyFilters = () => {
        loadLogs();
    };

    const handleExportCSV = () => {
        if (sysLogs.length === 0) return;
        const csvContent = [
            ['Timestamp', 'Level', 'Message'].join(','),
            ...sysLogs.map(log => {
                const isObj = typeof log === 'object' && log !== null;
                return [
                    isObj && log.timestamp ? new Date(log.timestamp).toISOString() : '',
                    isObj ? (log.level || 'info') : 'info',
                    isObj ? (log.message || '').replace(/,/g, ';') : log
                ].join(',');
            })
        ].join('\n');
        
        const blob = new Blob([csvContent], { type: 'text/csv' });
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `logs_${new Date().toISOString()}.csv`;
        a.click();
        window.URL.revokeObjectURL(url);
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
            await api.delete('/monitor/logs');
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
                title="Logs do Sistema"
                subtitle="Monitore atividades, erros e auditoria do sistema."
                breadcrumbs={[{ text: 'Configurações' }, { text: 'Logs do Sistema' }]}
            />

            {/* FILTROS */}
            <GlassCard sx={{ p: 2, mb: 3 }}>
                <Stack direction={{ xs: 'flex', md: 'row' }} spacing={2} alignItems="center">
                    <FilterIcon sx={{ color: '#00D4FF' }} />
                    <FormControl size="small" sx={{ minWidth: 120 }}>
                        <InputLabel>Nível</InputLabel>
                        <Select
                            value={filtros.nivel}
                            label="Nível"
                            onChange={(e) => handleFilterChange('nivel', e.target.value)}
                        >
                            <MenuItem value="">Todos</MenuItem>
                            <MenuItem value="info">Info</MenuItem>
                            <MenuItem value="warn">Warning</MenuItem>
                            <MenuItem value="error">Error</MenuItem>
                        </Select>
                    </FormControl>
                    <TextField
                        size="small"
                        type="date"
                        label="Data Início"
                        InputLabelProps={{ shrink: true }}
                        value={filtros.dataInicio}
                        onChange={(e) => handleFilterChange('dataInicio', e.target.value)}
                    />
                    <TextField
                        size="small"
                        type="date"
                        label="Data Fim"
                        InputLabelProps={{ shrink: true }}
                        value={filtros.dataFim}
                        onChange={(e) => handleFilterChange('dataFim', e.target.value)}
                    />
                    <Button variant="contained" onClick={handleApplyFilters}>
                        Filtrar
                    </Button>
                </Stack>
            </GlassCard>

            <Grid container spacing={4} sx={{ mt: 1 }}>
                <Grid item xs={12} lg={8}>
                    <GlassCard sx={{ p: 3, height: '100%' }}>
                        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                                <LogsIcon sx={{ color: '#00D4FF', fontSize: 28 }} />
                                <Typography variant="h6" sx={{ fontWeight: 700, color: '#fff' }}>
                                    REGISTROS
                                </Typography>
                            </Box>
                            <Button 
                                startIcon={<DownloadIcon />} 
                                variant="outlined" 
                                sx={{ color: '#fff', borderColor: 'rgba(255,255,255,0.2)' }} 
                                size="small"
                                onClick={handleExportCSV}
                            >
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
                                                    <Box sx={{ width: 24, height: 24, borderRadius: '50%', bgcolor: '#00D4FF', opacity: 0.2 }} />}
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
                    </GlassCard>
                </Grid>

                <Grid item xs={12} lg={4}>
                    <GlassCard sx={{ p: 3 }}>
                        <Typography variant="h6" sx={{ fontWeight: 700, color: '#FF3366', mb: 3 }}>
                            RETENÇÃO
                        </Typography>

                        <TextField
                            fullWidth
                            label="Retenção Edge (dias)"
                            type="number"
                            value={retentionEdge}
                            onChange={(e) => setRetentionEdge(e.target.value)}
                            sx={{ mb: 2 }}
                        />
                        <TextField
                            fullWidth
                            label="Retenção Admin (dias)"
                            type="number"
                            value={retentionAdmin}
                            onChange={(e) => setRetentionAdmin(e.target.value)}
                            sx={{ mb: 3 }}
                        />

                        <NeonButton onClick={handleSave} disabled={saving} fullWidth>
                            {saving ? "SALVANDO..." : "SALVAR"}
                        </NeonButton>

                        <Button fullWidth variant="outlined" color="error" sx={{ mt: 2, borderStyle: 'dashed' }} onClick={handleClearLogs}>
                            LIMPAR LOGS
                        </Button>
                    </GlassCard>
                </Grid>
            </Grid>
        </Box>
    );
};

export default ConfigLogs;
