import React, { useState, useEffect } from 'react';
import {
    Box, Typography, Stack, TextField, Select, MenuItem,
    FormControl, InputLabel, Tab, Tabs, Button, IconButton,
    Tooltip as MuiTooltip
} from '@mui/material';
import {
    Download as DownloadIcon, FileDownload as ExportIcon,
    Refresh as RefreshIcon, PictureAsPdf as PdfIcon,
    TableChart as TableIcon, AccessTime as TimeIcon,
    Business as BusinessIcon, Devices as DeviceIcon,
    Work as JobIcon, History as HistoryIcon,
    Assignment as DailyIcon
} from '@mui/icons-material';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

import GlassCard from '../components/common/GlassCard';
import PageHeader from '../components/common/PageHeader';
import NeonButton from '../components/common/NeonButton';
import DataTable from '../components/common/DataTable';
import { useReports } from '../hooks/useReports';
import { useEmpresas } from '../hooks/useEmpresas';

/**
 * Reports: Tela de análise e exportação de dados consolidados (NZT Analytics).
 * Focada em performance e dados operacionais através de tabelas detalhadas.
 */
const Reports = () => {
    const {
        loading, empresaId, setEmpresaId,
        dateStart, setDateStart, dateEnd, setDateEnd,
        dailyLogs, totalLogs, page, setPage,
        reportArea, reportEmpresa, reportLeitor, reportFuncao, reportStatus,
        loadLogs, loadTab, handleExport, handleExportPDF
    } = useReports();

    const { empresas } = useEmpresas();
    const [tab, setTab] = useState('logs');

    // Carregar dados iniciais e ao trocar abas
    useEffect(() => {
        if (tab === 'logs') {
            loadLogs(1);
        } else {
            loadTab(tab);
        }
    }, [tab, loadLogs, loadTab]);

    const handleTabChange = (event, newValue) => {
        setTab(newValue);
    };

    const logColumns = [
        { field: 'pessoa', headerName: 'Participante', width: 250 },
        { field: 'empresa', headerName: 'Empresa', width: 200 },
        { 
            field: 'tipo', 
            headerName: 'Tipo', 
            width: 120,
            renderCell: (params) => (
                <Typography 
                    variant="caption" 
                    fontWeight={900} 
                    sx={{ color: params.value === 'checkin' ? '#00FF88' : '#FF3366' }}
                >
                    {params.value.toUpperCase()}
                </Typography>
            )
        },
        { 
            field: 'horario', 
            headerName: 'Horário', 
            width: 180,
            renderCell: (params) => params.value && format(new Date(params.value), "dd/MM HH:mm:ss", { locale: ptBR })
        },
        { field: 'metodo', headerName: 'Método', width: 150 },
        { field: 'leitor', headerName: 'Equipamento', width: 150 }
    ];

    const aggregatedColumns = [
        { field: 'total', headerName: 'Total de Registros', width: 180, type: 'number' },
        { field: 'checkins', headerName: 'Check-ins', width: 150, type: 'number' },
        { field: 'checkouts', headerName: 'Check-outs', width: 150, type: 'number' }
    ];

    const renderExportButtons = (type) => (
        <Stack direction="row" spacing={1}>
            <IconButton onClick={() => handleExport(type, 'excel')} title="Exportar Excel" color="primary">
                <ExportIcon />
            </IconButton>
            <IconButton onClick={() => handleExport(type, 'csv')} title="Exportar CSV" color="info">
                <TableIcon />
            </IconButton>
        </Stack>
    );

    return (
        <Box sx={{ p: 4 }}>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 2 }}>
                <PageHeader
                    title="NZT Analytics"
                    subtitle="Relatórios consolidados para inteligência operacional."
                    breadcrumbs={[{ text: 'Dashboard' }, { text: 'Relatórios' }]}
                />
                <Stack direction="row" spacing={2} sx={{ mt: 2 }}>
                    <NeonButton 
                        startIcon={<DailyIcon />} 
                        onClick={() => handleExport('diario', 'excel')}
                        sx={{ bgcolor: 'rgba(0, 212, 255, 0.1)', color: '#00D4FF' }}
                    >
                        RELATÓRIO DIÁRIO
                    </NeonButton>
                    <NeonButton 
                        startIcon={<PdfIcon />} 
                        onClick={handleExportPDF} 
                        sx={{ bgcolor: 'rgba(123, 47, 190, 0.1)', color: '#7B2FBE' }}
                    >
                        LISTA DE PRESENÇA (PDF)
                    </NeonButton>
                </Stack>
            </Box>

            <GlassCard sx={{ p: 2, mb: 3 }}>
                <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 2, alignItems: 'center' }}>
                    <Box sx={{ flex: '1 1 250px' }}>
                        <Typography variant="caption" sx={{ color: 'text.secondary', fontWeight: 700, display: 'block', mb: 0.5 }}>PERÍODO INICIAL</Typography>
                        <TextField 
                            type="datetime-local" 
                            fullWidth 
                            size="small" 
                            value={dateStart} 
                            onChange={(e) => setDateStart(e.target.value)} 
                        />
                    </Box>
                    <Box sx={{ flex: '1 1 250px' }}>
                        <Typography variant="caption" sx={{ color: 'text.secondary', fontWeight: 700, display: 'block', mb: 0.5 }}>PERÍODO FINAL</Typography>
                        <TextField 
                            type="datetime-local" 
                            fullWidth 
                            size="small" 
                            value={dateEnd} 
                            onChange={(e) => setDateEnd(e.target.value)} 
                        />
                    </Box>
                    <Box sx={{ flex: '1 1 250px' }}>
                        <Typography variant="caption" sx={{ color: 'text.secondary', fontWeight: 700, display: 'block', mb: 0.5 }}>FILTRAR POR EMPRESA</Typography>
                        <FormControl fullWidth size="small">
                            <Select
                                value={empresaId}
                                onChange={(e) => setEmpresaId(e.target.value)}
                                displayEmpty
                            >
                                <MenuItem value="">TODAS AS EMPRESAS</MenuItem>
                                {empresas.map(e => (
                                    <MenuItem key={e.id} value={e.id}>{e.nome}</MenuItem>
                                ))}
                            </Select>
                        </FormControl>
                    </Box>
                    <Box sx={{ flex: '0 0 auto', display: 'flex', alignItems: 'flex-end', pt: '10px' }}>
                        <Button 
                            variant="contained" 
                            fullWidth 
                            startIcon={<RefreshIcon />} 
                            onClick={() => tab === 'logs' ? loadLogs(1) : loadTab(tab)}
                        >
                            ATUALIZAR
                        </Button>
                    </Box>
                </Box>
            </GlassCard>

            <GlassCard sx={{ mb: 3 }}>
                <Tabs 
                    value={tab} 
                    onChange={handleTabChange} 
                    variant="scrollable" 
                    scrollButtons="auto" 
                    sx={{ borderBottom: 1, borderColor: 'divider' }}
                >
                    <Tab icon={<HistoryIcon />} label="LOGS DIÁRIOS" value="logs" />
                    <Tab icon={<TableIcon />} label="POR ÁREA" value="area" />
                    <Tab icon={<BusinessIcon />} label="POR EMPRESA" value="empresa" />
                    <Tab icon={<DeviceIcon />} label="POR LEITOR" value="leitor" />
                    <Tab icon={<JobIcon />} label="POR FUNÇÃO" value="funcao" />
                    <Tab icon={<TimeIcon />} label="POR STATUS" value="status" />
                </Tabs>

                <Box sx={{ p: 2 }}>
                    {tab === 'logs' && (
                        <DataTable
                            rows={dailyLogs}
                            columns={logColumns}
                            loading={loading}
                            pagination
                            paginationMode="server"
                            rowCount={totalLogs}
                            page={page - 1}
                            pageSize={25}
                            onPageChange={(newPage) => setPage(newPage + 1)}
                            toolbar={() => renderExportButtons('logs')}
                        />
                    )}

                    {tab === 'area' && (
                        <DataTable
                            rows={reportArea}
                            columns={[{ field: 'item', headerName: 'Área de Acesso', width: 300 }, ...aggregatedColumns]}
                            loading={loading}
                            toolbar={() => renderExportButtons('area')}
                        />
                    )}

                    {tab === 'empresa' && (
                        <DataTable
                            rows={reportEmpresa}
                            columns={[{ field: 'item', headerName: 'Empresa', width: 300 }, ...aggregatedColumns]}
                            loading={loading}
                            toolbar={() => renderExportButtons('empresa')}
                        />
                    )}

                    {tab === 'leitor' && (
                        <DataTable
                            rows={reportLeitor}
                            columns={[{ field: 'item', headerName: 'Equipamento', width: 300 }, ...aggregatedColumns]}
                            loading={loading}
                            toolbar={() => renderExportButtons('leitor')}
                        />
                    )}

                    {tab === 'funcao' && (
                        <DataTable
                            rows={reportFuncao}
                            columns={[{ field: 'item', headerName: 'Cargo/Função', width: 300 }, ...aggregatedColumns]}
                            loading={loading}
                            toolbar={() => renderExportButtons('funcao')}
                        />
                    )}

                    {tab === 'status' && (
                        <DataTable
                            rows={reportStatus}
                            columns={[{ field: 'item', headerName: 'Status Documental', width: 300 }, ...aggregatedColumns]}
                            loading={loading}
                            toolbar={() => renderExportButtons('status')}
                        />
                    )}
                </Box>
            </GlassCard>
        </Box>
    );
};

export default Reports;
