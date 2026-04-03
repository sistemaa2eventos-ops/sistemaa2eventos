import React, { useState, useEffect } from 'react';
import {
    Box, Typography, Grid, TextField, Button, LinearProgress, Alert,
    CircularProgress, Dialog, DialogTitle, DialogContent, Table,
    TableBody, TableCell, TableHead, TableRow, IconButton, Tooltip
} from '@mui/material';
import {
    Save as SaveIcon, Storage as DatabaseIcon, CloudSync as SyncIcon,
    History as HistoryIcon, Close as CloseIcon, CheckCircle as SuccessIcon,
    Error as ErrorIcon
} from '@mui/icons-material';
import { useSnackbar } from 'notistack';
import api from '../../services/api';
import GlassCard from '../../components/common/GlassCard';
import NeonButton from '../../components/common/NeonButton';
import PageHeader from '../../components/common/PageHeader';

const ConfigBancoDados = () => {
    const { enqueueSnackbar } = useSnackbar();
    const [syncing, setSyncing] = useState(false);
    const [testing, setTesting] = useState(false);
    const [metrics, setMetrics] = useState(null);
    const [loading, setLoading] = useState(true);
    const [historyOpen, setHistoryOpen] = useState(false);
    const [syncHistory, setSyncHistory] = useState([]);

    useEffect(() => {
        fetchMetrics();
    }, []);

    const fetchMetrics = async () => {
        try {
            const res = await api.get('/settings/metrics');
            setMetrics(res.data.data);
        } catch (error) {
            console.error("Erro ao buscar métricas:", error);
        } finally {
            setLoading(false);
        }
    };

    const handleTestConnection = async () => {
        setTesting(true);
        try {
            const { data } = await api.get('/settings/test-connection');
            if (data.success) {
                enqueueSnackbar(data.message, { variant: 'success' });
            }
        } catch (error) {
            enqueueSnackbar(error.response?.data?.error || 'Falha ao conectar no SQL Server', { variant: 'error' });
        } finally {
            setTesting(false);
        }
    };

    const handleSync = async () => {
        setSyncing(true);
        try {
            await api.post('/sync/force');
            enqueueSnackbar('Sincronização manual iniciada com sucesso!', { variant: 'success' });
        } catch (error) {
            enqueueSnackbar('Falha ao iniciar sincronização.', { variant: 'error' });
        } finally {
            setTimeout(() => setSyncing(false), 2000);
        }
    };

    const handleViewLogs = async () => {
        try {
            const { data } = await api.get('/settings/sync-history');
            if (data.success) {
                setSyncHistory(data.data);
                setHistoryOpen(true);
            }
        } catch (error) {
            enqueueSnackbar('Não foi possível carregar os logs de sincronização.', { variant: 'error' });
        }
    };

    return (
        <Box sx={{ p: { xs: 2, md: 4 } }}>
            <PageHeader
                title="Banco de Dados e Nuvem"
                subtitle="Gerenciamento de conexões e sincronização offline primária."
                breadcrumbs={[{ text: 'Sistema' }, { text: 'Configurações' }, { text: 'Datawarehouse' }]}
            />
            <Grid container spacing={4} sx={{ mt: 1 }}>
                <Grid item xs={12} md={6}>
                    <GlassCard sx={{ p: 3, height: '100%' }}>
                        <Box sx={{ display: 'flex', alignItems: 'center', mb: 3, gap: 2 }}>
                            <DatabaseIcon sx={{ color: '#00D4FF' }} />
                            <Typography variant="h6" sx={{ fontWeight: 700, color: '#fff' }}>
                                CONEXÃO DATAWAREHOUSE
                            </Typography>
                        </Box>

                        <TextField
                            label="Host / Endpoint"
                            fullWidth
                            disabled
                            value={import.meta.env.VITE_API_URL || "Local / Nuvem"}
                            sx={{ mb: 2 }}
                        />
                        <TextField
                            label="Ambiente (Node Version)"
                            fullWidth
                            disabled
                            value={metrics?.nodeVersion || 'Desconhecido'}
                            sx={{ mb: 2 }}
                        />

                        {loading ? (
                            <CircularProgress size={24} />
                        ) : metrics?.status === 'online' ? (
                            <Alert severity="success" sx={{ bgcolor: 'rgba(0, 255, 136, 0.1)', color: '#00FF88', border: '1px solid rgba(0, 255, 136, 0.2)' }}>
                                Conexão ativa ({metrics.service}). Latência real: {metrics.latency}ms.
                            </Alert>
                        ) : (
                            <Alert severity="error" sx={{ bgcolor: 'rgba(255, 51, 102, 0.1)', color: '#FF3366', border: '1px solid rgba(255, 51, 102, 0.2)' }}>
                                Sem conexão com o banco de dados mestre.
                            </Alert>
                        )}

                        <Box sx={{ mt: 3, display: 'flex', justifyContent: 'flex-end' }}>
                            <Button
                                onClick={handleTestConnection}
                                disabled={testing}
                                sx={{ color: 'text.secondary' }}
                            >
                                {testing ? "TESTANDO..." : "TESTAR CONEXÃO"}
                            </Button>
                            <NeonButton startIcon={<SaveIcon />} sx={{ ml: 2 }}>
                                SALVAR
                            </NeonButton>
                        </Box>
                    </GlassCard>
                </Grid>

                <Grid item xs={12} md={6}>
                    <GlassCard sx={{ p: 3, height: '100%' }}>
                        <Box sx={{ display: 'flex', alignItems: 'center', mb: 3, gap: 2 }}>
                            <SyncIcon sx={{ color: '#7B2FBE' }} />
                            <Typography variant="h6" sx={{ fontWeight: 700, color: '#fff' }}>
                                SINCRONIZAÇÃO & BACKUP
                            </Typography>
                        </Box>

                        <Typography variant="subtitle2" sx={{ color: 'text.secondary', mb: 1 }}>Status da Sincronização SQL Server</Typography>
                        <Box sx={{ mb: 4 }}>
                            <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.5 }}>
                                <Typography variant="caption" sx={{ color: '#fff' }}>Sincronizando registros offline locais...</Typography>
                                <Typography variant="caption" sx={{ color: '#00D4FF' }}>{metrics?.syncProgress || 100}%</Typography>
                            </Box>
                            <LinearProgress variant="determinate" value={metrics?.syncProgress || 100} sx={{ height: 6, borderRadius: 3, bgcolor: 'rgba(255,255,255,0.1)', '& .MuiLinearProgress-bar': { bgcolor: '#00D4FF' } }} />
                            <Typography variant="caption" sx={{ color: 'text.secondary', mt: 0.5, display: 'block' }}>Ultima verificação: {metrics?.lastCheck || 'Ao carregar a página.'}</Typography>
                        </Box>

                        <Typography variant="subtitle2" sx={{ color: 'text.secondary', mb: 2 }}>Ações Manuais</Typography>
                        <NeonButton
                            fullWidth
                            startIcon={<SyncIcon />}
                            onClick={handleSync}
                            disabled={syncing}
                        >
                            {syncing ? 'SINCRONIZANDO...' : 'FORÇAR SYNC COM NUVEM'}
                        </NeonButton>
                        <Button
                            fullWidth
                            variant="outlined"
                            startIcon={<HistoryIcon />}
                            onClick={handleViewLogs}
                            sx={{ mt: 2, borderColor: 'rgba(255,255,255,0.2)', color: 'text.secondary' }}
                        >
                            VER LOGS DE EXECUÇÃO
                        </Button>
                    </GlassCard>
                </Grid>
            </Grid>

            {/* Dialog de Logs */}
            <Dialog
                open={historyOpen}
                onClose={() => setHistoryOpen(false)}
                maxWidth="md"
                fullWidth
                PaperProps={{
                    sx: {
                        bgcolor: '#1A1A2E',
                        backgroundImage: 'none',
                        color: '#fff',
                        border: '1px solid rgba(255,255,255,0.1)'
                    }
                }}
            >
                <DialogTitle sx={{ m: 0, p: 2, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    Histórico de Sincronização
                    <IconButton onClick={() => setHistoryOpen(false)} sx={{ color: 'text.secondary' }}>
                        <CloseIcon />
                    </IconButton>
                </DialogTitle>
                <DialogContent dividers sx={{ borderColor: 'rgba(255,255,255,0.1)' }}>
                    {syncHistory.length > 0 ? (
                        <Table size="small">
                            <TableHead>
                                <TableRow>
                                    <TableCell sx={{ color: 'text.secondary', fontWeight: 700 }}>Data/Hora</TableCell>
                                    <TableCell sx={{ color: 'text.secondary', fontWeight: 700 }}>Duração</TableCell>
                                    <TableCell sx={{ color: 'text.secondary', fontWeight: 700 }}>Sincronizados</TableCell>
                                    <TableCell sx={{ color: 'text.secondary', fontWeight: 700 }}>Falhas</TableCell>
                                    <TableCell sx={{ color: 'text.secondary', fontWeight: 700 }}>Status</TableCell>
                                </TableRow>
                            </TableHead>
                            <TableBody>
                                {syncHistory.map((log, index) => (
                                    <TableRow key={index} sx={{ '&:last-child td, &:last-child th': { border: 0 } }}>
                                        <TableCell sx={{ color: '#fff' }}>{new Date(log.timestamp).toLocaleString()}</TableCell>
                                        <TableCell sx={{ color: '#fff' }}>{log.duration}s</TableCell>
                                        <TableCell sx={{ color: '#00FF88' }}>{log.synced}</TableCell>
                                        <TableCell sx={{ color: '#FF3366' }}>{log.failed}</TableCell>
                                        <TableCell>
                                            {log.failed === 0 ? (
                                                <Tooltip title="Sucesso Total">
                                                    <SuccessIcon sx={{ color: '#00FF88', fontSize: 18 }} />
                                                </Tooltip>
                                            ) : (
                                                <Tooltip title="Possui falhas residuais">
                                                    <ErrorIcon sx={{ color: '#FFC107', fontSize: 18 }} />
                                                </Tooltip>
                                            )}
                                        </TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    ) : (
                        <Box sx={{ py: 4, textAlign: 'center' }}>
                            <Typography variant="body2" sx={{ color: 'text.secondary' }}>
                                Nenhum log de sincronização encontrado.
                            </Typography>
                        </Box>
                    )}
                </DialogContent>
            </Dialog>
        </Box>
    );
};

export default ConfigBancoDados;
