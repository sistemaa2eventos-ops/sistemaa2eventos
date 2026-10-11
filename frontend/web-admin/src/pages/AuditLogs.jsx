import React from 'react';
import {
    Box,
    Typography,
    Grid,
    TextField,
    MenuItem,
    Chip,
    IconButton,
    Tooltip,
    LinearProgress,
    Stack,
    Pagination,
    Avatar
} from '@mui/material';
import {
    History as HistoryIcon,
    Refresh as RefreshIcon,
    Security as SecurityIcon
} from '@mui/icons-material';
import { DataGrid, GridToolbarContainer, GridToolbarExport } from '@mui/x-data-grid';
import { useAudit } from '../hooks/useAudit';
import { format } from 'date-fns';
import GlassCard from '../components/common/GlassCard';
import { styled } from '@mui/material/styles';

const StyledDataGrid = styled(DataGrid)(() => ({
    border: 'none',
    color: '#CBD5E1',
    '& .MuiDataGrid-columnHeaders': {
        background: 'rgba(0, 212, 255, 0.05)',
        borderBottom: '1px solid rgba(0, 212, 255, 0.2)',
        fontWeight: 700,
    },
    '& .MuiDataGrid-row': {
        borderBottom: '1px solid rgba(255, 255, 255, 0.05)',
        '&:hover': {
            background: 'rgba(0, 212, 255, 0.03)',
        },
    },
    '& .MuiDataGrid-cell': {
        borderBottom: 'none',
    },
    '& .MuiDataGrid-footerContainer': {
        borderTop: '1px solid rgba(0, 212, 255, 0.2)',
        background: 'rgba(5, 11, 24, 0.8)',
    },
}));

const AuditLogs = () => {
    const {
        logs,
        loading,
        pagination,
        filters,
        handleFilterChange,
        fetchLogs,
        eventoId
    } = useAudit();

    const getActionColor = (acao) => {
        if (acao.includes('DELETE')) return '#FF3366';
        if (acao.includes('RESET') || acao.includes('BLOCK')) return '#FFB800';
        if (acao.includes('CREATE') || acao.includes('SYNC')) return '#00D4FF';
        if (acao.includes('APPROVE') || acao.includes('AUDIT')) return '#00FF88';
        return '#CBD5E1';
    };

    const columns = [
        {
            field: 'created_at',
            headerName: 'Data/Hora',
            width: 180,
            renderCell: (params) => (
                <Typography variant="body2" sx={{ fontWeight: 600, color: '#00D4FF', fontFamily: '"Inter", sans-serif', fontSize: '0.8125rem' }}>
                    {format(new Date(params.value), 'dd/MM/yy HH:mm:ss')}
                </Typography>
            )
        },
        {
            field: 'usuario_nome',
            headerName: 'Operador',
            flex: 1,
            renderCell: (params) => (
                <Stack direction="row" spacing={1.5} alignItems="center">
                    <Avatar sx={{ width: 24, height: 24, fontSize: '0.75rem', bgcolor: 'secondary.main' }}>
                        {params.value?.charAt(0) || 'U'}
                    </Avatar>
                    <Box>
                        <Typography variant="body2" sx={{ fontWeight: 700 }}>{params.value || 'Sistema'}</Typography>
                        <Typography variant="caption" sx={{ opacity: 0.7 }}>{params.row.usuario_email}</Typography>
                    </Box>
                </Stack>
            )
        },
        {
            field: 'recurso',
            headerName: 'Módulo',
            width: 130,
            renderCell: (params) => (
                <Chip
                    label={params.value}
                    size="small"
                    variant="outlined"
                    sx={{ border: '1px solid rgba(255,255,255,0.1)', fontWeight: 700, fontSize: '0.75rem' }}
                />
            )
        },
        {
            field: 'acao',
            headerName: 'Ação Executada',
            flex: 1,
            renderCell: (params) => (
                <Box>
                    <Typography variant="body2" sx={{ fontWeight: 700, color: getActionColor(params.value) }}>
                        {params.value?.replace(/_/g, ' ')}
                    </Typography>
                    <Typography variant="caption" sx={{ display: 'block', opacity: 0.6, fontSize: '0.75rem' }}>
                        ID Target: {params.row.recurso_id?.substring(0, 8)}...
                    </Typography>
                </Box>
            )
        },
        {
            field: 'detalhes',
            headerName: 'Detalhes',
            flex: 1,
            renderCell: (params) => (
                <Tooltip title={JSON.stringify(params.value, null, 2)} arrow>
                    <Typography variant="caption" noWrap sx={{ cursor: 'help', opacity: 0.8, maxWidth: 200 }}>
                        {JSON.stringify(params.value)}
                    </Typography>
                </Tooltip>
            )
        }
    ];

    if (!eventoId) {
        return (
            <Box p={4} textAlign="center">
                <SecurityIcon sx={{ fontSize: 80, color: 'rgba(255,255,255,0.1)', mb: 2 }} />
                <Typography variant="h4" color="textSecondary">Selecione um console A2 Eventos / NZT para acessar a auditoria.</Typography>
            </Box>
        );
    }

    return (
        <Box sx={{ p: { xs: 2, md: 3 }, position: 'relative', overflowX: 'hidden' }}>
            {/* Header Security Label */}
            <Box mb={3} display="flex" flexDirection={{ xs: 'column', md: 'row' }} gap={2} justifyContent="space-between" alignItems={{ xs: 'flex-start', md: 'center' }}>
                <Box>
                    <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5} alignItems={{ xs: 'flex-start', sm: 'center' }} mb={0.5}>
                        <HistoryIcon sx={{ color: '#00D4FF', fontSize: 32 }} />
                        <Typography
                            variant="h4"
                            sx={{
                                fontWeight: 700,
                                fontFamily: '"Space Grotesk", sans-serif',
                                letterSpacing: '-0.02em',
                                color: '#FFFFFF'
                            }}
                        >
                            Logs de auditoria
                        </Typography>
                    </Stack>
                    <Typography variant="body2" color="textSecondary" sx={{ ml: { xs: 0, sm: 5.5 } }}>
                        Trilha de transparência operacional e histórico de ações administrativas.
                    </Typography>
                </Box>
                <Chip
                    icon={<SecurityIcon sx={{ color: '#00FF88 !important' }} />}
                    label="Ambiente monitorado"
                    sx={{
                        background: 'rgba(0, 255, 136, 0.1)',
                        border: '1px solid rgba(0, 255, 136, 0.3)',
                        color: '#00FF88',
                        fontWeight: 700,
                        fontSize: '0.75rem',
                        height: 32
                    }}
                />
            </Box>

            {/* Filters Section */}
            <GlassCard sx={{ mb: 3, p: 3 }}>
                <Grid container spacing={3} alignItems="center">
                    <Grid item xs={12} sm={3}>
                        <TextField
                            fullWidth
                            select
                            label="Filtrar por módulo"
                            value={filters.recurso}
                            onChange={(e) => handleFilterChange({ recurso: e.target.value })}
                            variant="outlined"
                        >
                            <MenuItem value="">Todos</MenuItem>
                            <MenuItem value="USUARIOS">Usuários</MenuItem>
                            <MenuItem value="PESSOAS">Participantes</MenuItem>
                            <MenuItem value="DOCUMENTOS">Documentos</MenuItem>
                            <MenuItem value="CHECKIN">Operacional</MenuItem>
                        </TextField>
                    </Grid>
                    <Grid item xs={12} sm={3}>
                        <TextField
                            fullWidth
                            label="Data início"
                            type="date"
                            InputLabelProps={{ shrink: true }}
                            value={filters.data_inicio}
                            onChange={(e) => handleFilterChange({ data_inicio: e.target.value })}
                        />
                    </Grid>
                    <Grid item xs={12} sm={3}>
                        <TextField
                            fullWidth
                            label="Data fim"
                            type="date"
                            InputLabelProps={{ shrink: true }}
                            value={filters.data_fim}
                            onChange={(e) => handleFilterChange({ data_fim: e.target.value })}
                        />
                    </Grid>
                    <Grid item xs={12} sm={3}>
                        <IconButton
                            onClick={() => fetchLogs(1)}
                            sx={{
                                width: 56,
                                height: 56,
                                background: 'linear-gradient(135deg, #00D4FF 0%, #00FF88 100%)',
                                color: '#000000',
                                boxShadow: '0 0 15px rgba(0, 212, 255, 0.3)',
                                '&:hover': { transform: 'scale(1.05)' }
                            }}
                        >
                            <RefreshIcon />
                        </IconButton>
                    </Grid>
                </Grid>
            </GlassCard>

            {/* Data Grid Section */}
            <GlassCard sx={{ height: 600, position: 'relative' }}>
                {loading && <LinearProgress color="secondary" sx={{ position: 'absolute', top: 0, left: 0, right: 0 }} />}
                <StyledDataGrid
                    rows={logs}
                    columns={columns}
                    hideFooter
                    density="comfortable"
                    disableSelectionOnClick
                    components={{
                        Toolbar: () => (
                            <GridToolbarContainer sx={{ p: 2, justifyContent: 'flex-end' }}>
                                <GridToolbarExport
                                    sx={{
                                        color: '#00D4FF',
                                        fontWeight: 700,
                                        border: '1px solid rgba(0, 212, 255, 0.3)',
                                        px: 2,
                                        '&:hover': { background: 'rgba(0, 212, 255, 0.1)' }
                                    }}
                                />
                            </GridToolbarContainer>
                        )
                    }}
                />

                {/* Custom Pagination */}
                <Box p={2} display="flex" justifyContent="center">
                    <Stack spacing={2} alignItems="center">
                        <Pagination
                            count={pagination.pages}
                            page={pagination.page}
                            onChange={(e, value) => fetchLogs(value)}
                            color="secondary"
                            showFirstButton
                            showLastButton
                        />
                        <Typography variant="caption" sx={{ opacity: 0.6 }}>
                            Mostrando {(pagination.page - 1) * pagination.limit + 1} - {Math.min(pagination.page * pagination.limit, pagination.total)} de {pagination.total} registros
                        </Typography>
                    </Stack>
                </Box>
            </GlassCard>
        </Box>
    );
};

export default AuditLogs;
