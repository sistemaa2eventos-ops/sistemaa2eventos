import React, { useState, useEffect, useCallback } from 'react';
import {
    Container, Grid, Typography, Box, Card, TextField, Select, MenuItem, FormControl,
    InputLabel, Button, Chip, Table, TableBody, TableCell, TableContainer, TableHead,
    TableRow, TablePagination, IconButton, Tooltip, CircularProgress, Alert
} from '@mui/material';
import {
    TrendingUp as TrendingUpIcon,
    Warning as WarningIcon,
    CheckCircle as CheckIcon,
    Block as BlockIcon,
    AccountBalance as BankIcon,
    Download as DownloadIcon,
    DoneAll as ReconcileIcon,
    Refresh as RefreshIcon,
    FilterList as FilterIcon,
} from '@mui/icons-material';
import { useSnackbar } from 'notistack';
import PageHeader from '../components/common/PageHeader';
import GlassCard from '../components/common/GlassCard';
import api from '../services/api';

const STATUS_COLORS = {
    confirmado: { bg: 'rgba(0,255,136,0.1)', color: '#00FF88', label: 'Confirmado' },
    pendente: { bg: 'rgba(255,184,0,0.1)', color: '#FFB800', label: 'Pendente' },
    rejeitado: { bg: 'rgba(255,51,102,0.1)', color: '#FF3366', label: 'Rejeitado' },
    cancelado: { bg: 'rgba(255,51,102,0.1)', color: '#FF3366', label: 'Cancelado' },
    reconciliado: { bg: 'rgba(0,212,255,0.1)', color: '#00D4FF', label: 'Reconciliado' },
};

const KpiCard = ({ icon, label, value, color, sub }) => (
    <GlassCard sx={{ p: 2.5, position: 'relative', overflow: 'hidden' }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
            <Box sx={{ p: 1.5, borderRadius: 2, background: `${color}15`, border: `1px solid ${color}25` }}>
                {React.cloneElement(icon, { sx: { color, fontSize: 28 } })}
            </Box>
            <Box>
                <Typography variant="caption" sx={{ color: 'text.secondary', fontWeight: 600, letterSpacing: 1, fontSize: '0.65rem' }}>
                    {label}
                </Typography>
                <Typography variant="h4" sx={{ color, fontWeight: 900, lineHeight: 1.1 }}>
                    {value}
                </Typography>
                {sub && <Typography variant="caption" sx={{ color: 'text.secondary', fontSize: '0.65rem' }}>{sub}</Typography>}
            </Box>
        </Box>
        <Box sx={{
            position: 'absolute', top: -20, right: -20, width: 80, height: 80,
            borderRadius: '50%', background: `${color}08`, border: `1px solid ${color}10`
        }} />
    </GlassCard>
);

export default function Financeiro() {
    const { enqueueSnackbar } = useSnackbar();
    const [loading, setLoading] = useState(true);
    const [transactions, setTransactions] = useState([]);
    const [kpis, setKpis] = useState({});
    const [pagination, setPagination] = useState({ page: 1, limit: 15, total: 0, pages: 0 });
    const [eventos, setEventos] = useState([]);

    // Filtros
    const [filters, setFilters] = useState({ evento_id: '', status: '', provider: '' });

    const fetchEvents = useCallback(async () => {
        try {
            const { data } = await api.get('/eventos');
            const lista = data.eventos || data.data || data || [];
            setEventos(Array.isArray(lista) ? lista : []);
        } catch { /* ignora */ }
    }, []);

    const fetchTransactions = useCallback(async (page = 1) => {
        setLoading(true);
        try {
            const params = new URLSearchParams({ page, limit: pagination.limit });
            if (filters.evento_id) params.append('evento_id', filters.evento_id);
            if (filters.status) params.append('status', filters.status);
            if (filters.provider) params.append('provider', filters.provider);

            const { data } = await api.get(`/payments/transactions?${params}`);
            const txList = data.transactions || data.data || [];
            setTransactions(Array.isArray(txList) ? txList : []);
            setKpis(data.kpis || {});
            setPagination(data.pagination || {});
        } catch (err) {
            enqueueSnackbar('Erro ao carregar transações.', { variant: 'error' });
        } finally {
            setLoading(false);
        }
    }, [filters, pagination.limit, enqueueSnackbar]);

    useEffect(() => { fetchEvents(); }, [fetchEvents]);
    useEffect(() => { fetchTransactions(1); }, [filters]); // eslint-disable-line

    const handleReconcile = async (id) => {
        if (!window.confirm('Confirma reconciliação manual desta transação?')) return;
        try {
            await api.put(`/payments/transactions/${id}/reconcile`);
            enqueueSnackbar('Transação reconciliada com sucesso!', { variant: 'success' });
            fetchTransactions(pagination.page);
        } catch {
            enqueueSnackbar('Erro ao reconciliar transação.', { variant: 'error' });
        }
    };

    const handleExportCSV = () => {
        if (transactions.length === 0) return;
        const headers = ['Data', 'Nome', 'CPF', 'Valor', 'Provider', 'Status', 'ID Externo'];
        const rows = transactions.map(t => [
            t.webhook_received_at ? new Date(t.webhook_received_at).toLocaleString('pt-BR') : '-',
            t.pessoas?.nome || '-',
            t.pessoas?.cpf || '-',
            `R$ ${(parseFloat(t.valor) || 0).toFixed(2)}`,
            t.provider,
            t.status,
            t.external_id || '-'
        ]);
        const csv = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
        const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `transacoes_${new Date().toISOString().split('T')[0]}.csv`;
        a.click();
        URL.revokeObjectURL(url);
    };

    const formatCurrency = (val) => `R$ ${(parseFloat(val) || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`;

    return (
        <Container maxWidth="xl" sx={{ py: 4 }}>
            <PageHeader title="Painel Financeiro" subtitle="Reconciliação e monitoramento de transações" icon={<BankIcon />} />

            {/* KPI Cards */}
            <Grid container spacing={2} sx={{ mb: 3 }}>
                <Grid item xs={6} md={3}>
                    <KpiCard icon={<TrendingUpIcon />} label="TOTAL RECEBIDO" value={formatCurrency(kpis.total_recebido)} color="#00FF88" sub={`${kpis.total || 0} transações`} />
                </Grid>
                <Grid item xs={6} md={3}>
                    <KpiCard icon={<WarningIcon />} label="PENDENTES" value={kpis.pendentes || 0} color="#FFB800" sub="Aguardando confirmação" />
                </Grid>
                <Grid item xs={6} md={3}>
                    <KpiCard icon={<BlockIcon />} label="REJEITADOS" value={kpis.rejeitados || 0} color="#FF3366" sub="Falha ou cancelamento" />
                </Grid>
                <Grid item xs={6} md={3}>
                    <KpiCard icon={<CheckIcon />} label="TAXA DE SUCESSO" value={`${kpis.taxa_sucesso || 0}%`} color="#00D4FF" sub="Confirmados / Total" />
                </Grid>
            </Grid>

            {/* Filtros */}
            <GlassCard sx={{ p: 2, mb: 3 }}>
                <Box sx={{ display: 'flex', gap: 2, alignItems: 'center', flexWrap: 'wrap' }}>
                    <FilterIcon sx={{ color: 'text.secondary' }} />
                    <FormControl size="small" sx={{ minWidth: 200 }}>
                        <InputLabel>Evento</InputLabel>
                        <Select value={filters.evento_id} label="Evento" onChange={(e) => setFilters({ ...filters, evento_id: e.target.value })}>
                            <MenuItem value="">Todos</MenuItem>
                            {(Array.isArray(eventos) ? eventos : []).map(ev => <MenuItem key={ev.id} value={ev.id}>{ev.nome}</MenuItem>)}
                        </Select>
                    </FormControl>
                    <FormControl size="small" sx={{ minWidth: 140 }}>
                        <InputLabel>Status</InputLabel>
                        <Select value={filters.status} label="Status" onChange={(e) => setFilters({ ...filters, status: e.target.value })}>
                            <MenuItem value="">Todos</MenuItem>
                            <MenuItem value="confirmado">Confirmado</MenuItem>
                            <MenuItem value="pendente">Pendente</MenuItem>
                            <MenuItem value="rejeitado">Rejeitado</MenuItem>
                            <MenuItem value="reconciliado">Reconciliado</MenuItem>
                        </Select>
                    </FormControl>
                    <FormControl size="small" sx={{ minWidth: 140 }}>
                        <InputLabel>Gateway</InputLabel>
                        <Select value={filters.provider} label="Gateway" onChange={(e) => setFilters({ ...filters, provider: e.target.value })}>
                            <MenuItem value="">Todos</MenuItem>
                            <MenuItem value="asaas">Asaas</MenuItem>
                            <MenuItem value="stripe">Stripe</MenuItem>
                        </Select>
                    </FormControl>
                    <Box sx={{ flex: 1 }} />
                    <Tooltip title="Atualizar"><IconButton onClick={() => fetchTransactions(pagination.page)} color="primary"><RefreshIcon /></IconButton></Tooltip>
                    <Button variant="outlined" size="small" startIcon={<DownloadIcon />} onClick={handleExportCSV}
                        sx={{ color: '#00D4FF', borderColor: 'rgba(0,212,255,0.3)', fontWeight: 700, fontSize: '0.75rem' }}>
                        CSV
                    </Button>
                </Box>
            </GlassCard>

            {/* Tabela */}
            <GlassCard sx={{ overflow: 'hidden' }}>
                {loading ? (
                    <Box sx={{ p: 6, display: 'flex', justifyContent: 'center' }}><CircularProgress /></Box>
                ) : transactions.length === 0 ? (
                    <Box sx={{ p: 6, textAlign: 'center' }}>
                        <BankIcon sx={{ fontSize: 48, color: 'text.secondary', mb: 2 }} />
                        <Typography color="text.secondary">Nenhuma transação encontrada com os filtros atuais.</Typography>
                    </Box>
                ) : (
                    <>
                        <TableContainer>
                            <Table size="small">
                                <TableHead>
                                    <TableRow sx={{ '& th': { fontWeight: 700, color: 'text.secondary', fontSize: '0.7rem', letterSpacing: 1, borderBottom: '1px solid rgba(255,255,255,0.05)' } }}>
                                        <TableCell>DATA/HORA</TableCell>
                                        <TableCell>NOME</TableCell>
                                        <TableCell>CPF</TableCell>
                                        <TableCell align="right">VALOR</TableCell>
                                        <TableCell>GATEWAY</TableCell>
                                        <TableCell>STATUS</TableCell>
                                        <TableCell>ID EXTERNO</TableCell>
                                        <TableCell align="center">AÇÕES</TableCell>
                                    </TableRow>
                                </TableHead>
                                <TableBody>
                                    {transactions.map((tx) => {
                                        const st = STATUS_COLORS[tx.status] || STATUS_COLORS.pendente;
                                        return (
                                            <TableRow key={tx.id} sx={{ '&:hover': { bgcolor: 'rgba(255,255,255,0.02)' }, '& td': { borderBottom: '1px solid rgba(255,255,255,0.03)', py: 1.2 } }}>
                                                <TableCell sx={{ fontSize: '0.75rem', color: 'text.secondary' }}>
                                                    {tx.webhook_received_at ? new Date(tx.webhook_received_at).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '-'}
                                                </TableCell>
                                                <TableCell sx={{ fontWeight: 600, color: '#fff', fontSize: '0.8rem' }}>{tx.pessoas?.nome || '-'}</TableCell>
                                                <TableCell sx={{ fontSize: '0.75rem', color: 'text.secondary', fontFamily: 'monospace' }}>{tx.pessoas?.cpf || '-'}</TableCell>
                                                <TableCell align="right" sx={{ fontWeight: 700, color: '#00FF88', fontSize: '0.85rem' }}>{formatCurrency(tx.valor)}</TableCell>
                                                <TableCell>
                                                    <Chip label={(tx.provider || '-').toUpperCase()} size="small"
                                                        sx={{ fontWeight: 700, fontSize: '0.65rem', height: 22, bgcolor: tx.provider === 'stripe' ? 'rgba(123,47,190,0.1)' : 'rgba(0,212,255,0.1)', color: tx.provider === 'stripe' ? '#7B2FBE' : '#00D4FF' }} />
                                                </TableCell>
                                                <TableCell>
                                                    <Chip label={st.label} size="small"
                                                        sx={{ fontWeight: 700, fontSize: '0.65rem', height: 22, bgcolor: st.bg, color: st.color }} />
                                                </TableCell>
                                                <TableCell sx={{ fontSize: '0.7rem', color: 'text.secondary', fontFamily: 'monospace', maxWidth: 120, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                                    {tx.external_id || '-'}
                                                </TableCell>
                                                <TableCell align="center">
                                                    {tx.status === 'pendente' && (
                                                        <Tooltip title="Reconciliar Manualmente">
                                                            <IconButton size="small" onClick={() => handleReconcile(tx.id)} sx={{ color: '#00D4FF' }}>
                                                                <ReconcileIcon fontSize="small" />
                                                            </IconButton>
                                                        </Tooltip>
                                                    )}
                                                </TableCell>
                                            </TableRow>
                                        );
                                    })}
                                </TableBody>
                            </Table>
                        </TableContainer>
                        <TablePagination
                            component="div"
                            count={pagination.total}
                            page={pagination.page - 1}
                            rowsPerPage={pagination.limit}
                            onPageChange={(_, p) => fetchTransactions(p + 1)}
                            rowsPerPageOptions={[10, 15, 25, 50, 100]}
                            sx={{ borderTop: '1px solid rgba(255,255,255,0.05)', color: 'text.secondary' }}
                        />
                    </>
                )}
            </GlassCard>
        </Container>
    );
}
