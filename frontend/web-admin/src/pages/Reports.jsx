import React, { useState, useEffect, useCallback } from 'react';
import {
    Box, Typography, Stack, TextField, Select, MenuItem,
    FormControl, Tab, Tabs, Button, IconButton,
    Chip, Avatar, Dialog, DialogTitle,
    DialogContent, DialogActions, Grid, Paper, InputAdornment,
    ToggleButton, ToggleButtonGroup
} from '@mui/material';
import {
    FileDownload as ExportIcon,
    Refresh as RefreshIcon, PictureAsPdf as PdfIcon,
    TableChart as TableIcon, AccessTime as TimeIcon,
    Business as BusinessIcon, Devices as DeviceIcon,
    Work as JobIcon, History as HistoryIcon,
    Assignment as DailyIcon,
    Badge as BadgeIcon,
    EditNote as NoteIcon,
    InfoOutlined as InfoIcon,
    Search as SearchIcon
} from '@mui/icons-material';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

import GlassCard from '../components/common/GlassCard';
import KpiCard from '../components/common/KpiCard';
import { cores, botaoSecundario } from '../styles/tokens';
import { Groups as KpiCadastradosIcon, HowToReg as KpiPresentesIcon, Logout as KpiSaidasIcon, PersonOff as KpiAusentesIcon, Timer as KpiTempoIcon } from '@mui/icons-material';
import PageHeader from '../components/common/PageHeader';
import DataTable from '../components/common/DataTable';
import { useReports } from '../hooks/useReports';
import { useEmpresas } from '../hooks/useEmpresas';
import api from '../services/api';

import { comoRotulo } from '../utils/formatadores';
/**
 * NZT Relatórios: Central operacional e executiva de relatórios do sistema.
 * Apresenta o Relatório Diário de Acessos consolidado (Empresa, Colaborador, CPF, Função,
 * Pulseira, Check-in, Check-out, Tempo de Permanência), relatórios setoriais e auditoria.
 */
const Reports = () => {
    const {
        loading, empresaId, setEmpresaId,
        dateStart, setDateStart, dateEnd, setDateEnd,

        // Relatório Diário Consolidado
        dailyConsolidado, totaisDiarios,
        dataReferenciaDiario, setDataReferenciaDiario,
        statusFiltroDiario, setStatusFiltroDiario,
        searchDiario, setSearchDiario,
        fechamentosList, selectedFechamentoId, setSelectedFechamentoId,
        loadDiarioConsolidado, loadFechamentos,
        handleExportDiarioXLSX, handleExportDiarioPDF,

        // Abas agregadas e logs
        dailyLogs, totalLogs, page, setPage,
        reportArea, reportEmpresa, reportLeitor, reportFuncao, reportStatus,
        loadLogs, loadTab, handleExport, handleExportAbaPDF
    } = useReports();

    const { empresas } = useEmpresas();
    const [tab, setTab] = useState('diario');

    // Estado para Sessões de Operador
    const [sessoesList, setSessoesList] = useState([]);
    const [loadingSessoes, setLoadingSessoes] = useState(false);
    const [selectedSessao, setSelectedSessao] = useState(null);
    const [modalDetalhesOpen, setModalDetalhesOpen] = useState(false);
    const [modalNotasOpen, setModalNotasOpen] = useState(false);
    const [notasOperador, setNotasOperador] = useState('');
    const [notasOperadorNome, setNotasOperadorNome] = useState('');

    // Carregar sessões dos operadores
    const loadSessoes = useCallback(async () => {
        try {
            setLoadingSessoes(true);
            const eventoId = localStorage.getItem('active_evento_id');
            const { data } = await api.get('/audit/sessoes-operadores', {
                params: {
                    evento_id: eventoId,
                    data_inicio: dateStart,
                    data_fim: dateEnd,
                    limit: 100
                }
            });
            setSessoesList(data?.data || []);
        } catch (error) {
            console.error('Erro ao carregar sessões de operador:', error);
        } finally {
            setLoadingSessoes(false);
        }
    }, [dateStart, dateEnd]);

    // Carregar dados conforme aba ativa
    useEffect(() => {
        if (tab === 'diario') {
            loadDiarioConsolidado();
            loadFechamentos();
        } else if (tab === 'logs') {
            loadLogs(1);
        } else if (tab === 'sessoes') {
            loadSessoes();
        } else {
            loadTab(tab);
        }
    }, [tab, loadDiarioConsolidado, loadFechamentos, loadLogs, loadTab, loadSessoes]);

    const handleTabChange = (_event, newValue) => {
        setTab(newValue);
    };

    // Exportar Sessões para CSV
    const exportarSessoesCSV = () => {
        if (!sessoesList || sessoesList.length === 0) return;
        const headers = ['Operador', 'Email', 'Nivel', 'Login', 'Logout', 'Tempo Online', 'Pessoas Criadas', 'Empresas Criadas', 'Itens Apagados', 'Checkins', 'Notas'];
        const rows = sessoesList.map(s => [
            `"${s.operador_nome || ''}"`,
            `"${s.operador_email || ''}"`,
            `"${s.nivel_acesso || ''}"`,
            `"${s.login_at ? format(new Date(s.login_at), 'dd/MM/yyyy HH:mm:ss', { locale: ptBR }) : ''}"`,
            `"${s.logout_at ? format(new Date(s.logout_at), 'dd/MM/yyyy HH:mm:ss', { locale: ptBR }) : ''}"`,
            `"${s.tempo_online_formatado || ''}"`,
            s.pessoas_criadas || 0,
            s.empresas_criadas || 0,
            s.itens_apagados || 0,
            s.checkins_realizados || 0,
            `"${(s.notas || '').replace(/"/g, '""')}"`
        ]);

        const csvContent = 'data:text/csv;charset=utf-8,\uFEFF' + [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
        const encodedUri = encodeURI(csvContent);
        const link = document.createElement('a');
        link.setAttribute('href', encodedUri);
        link.setAttribute('download', `NZT_Relatorio_Sessoes_Operadores_${format(new Date(), 'yyyy-MM-dd_HHmm')}.csv`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    // =========================================================================
    // DEFINIÇÕES DE COLUNAS DAS TABELAS
    // =========================================================================

    // 1. Aba Principal: RELATÓRIO DIÁRIO (8 Colunas Exigidas)
    const diarioColumns = [
        {
            id: 'empresa_nome',
            label: 'Nome da empresa',
            width: 220,
            format: (val) => (
                <Typography variant="body2" sx={{ fontWeight: 700, color: '#00D4FF' }} noWrap>
                    {val || 'Sem Empresa'}
                </Typography>
            )
        },
        {
            id: 'colaborador_nome',
            label: 'Nome do colaborador',
            width: 240,
            format: (val) => (
                <Typography variant="body2" sx={{ fontWeight: 700, color: '#FFFFFF' }} noWrap>
                    {val || '—'}
                </Typography>
            )
        },
        {
            id: 'cpf',
            label: 'CPF',
            width: 150,
            format: (val) => (
                <Typography variant="body2" sx={{ fontFamily: '"Inter", sans-serif', fontSize: '0.875rem', color: '#94A3B8' }}>
                    {val || '—'}
                </Typography>
            )
        },
        {
            id: 'funcao',
            label: 'Função',
            width: 170,
            format: (val) => (
                <Typography variant="body2" sx={{ color: '#CBD5E1', fontSize: '0.875rem' }} noWrap>
                    {val || '—'}
                </Typography>
            )
        },
        {
            id: 'numero_pulseira',
            label: 'Nº Pulseira',
            width: 130,
            align: 'center',
            format: (val) => val && val !== '—' ? (
                <Chip
                    label={val}
                    size="small"
                    sx={{
                        bgcolor: 'rgba(0, 212, 255, 0.12)',
                        color: '#00D4FF',
                        fontFamily: '"Inter", sans-serif',
                        fontWeight: 700,
                        border: '1px solid rgba(0, 212, 255, 0.3)'
                    }}
                />
            ) : (
                <Typography variant="caption" sx={{ color: '#64748B' }}>—</Typography>
            )
        },
        {
            id: 'checkin_at',
            label: 'Check-in (entrada)',
            width: 175,
            format: (val) => val && val !== '—' ? (
                <Typography variant="body2" sx={{ fontFamily: '"Inter", sans-serif', fontSize: '0.8125rem', color: '#00FF88', fontWeight: 700 }}>
                    {val}
                </Typography>
            ) : (
                <Typography variant="caption" sx={{ color: '#64748B' }}>—</Typography>
            )
        },
        {
            id: 'checkout_at',
            label: 'Check-out (saída)',
            width: 175,
            format: (val) => {
                if (val === 'Não registrada') {
                    return (
                        <Chip
                            label="Não registrada"
                            size="small"
                            title="A pessoa não bateu a saída; o fechamento de turno encerrou o registro"
                            sx={{
                                bgcolor: 'rgba(255, 51, 102, 0.12)',
                                color: '#FF3366',
                                fontWeight: 700,
                                fontSize: '0.75rem',
                                border: '1px solid rgba(255, 51, 102, 0.3)'
                            }}
                        />
                    );
                }
                if (val === 'No evento') {
                    return (
                        <Chip
                            label="No evento"
                            size="small"
                            sx={{
                                bgcolor: 'rgba(255, 184, 0, 0.15)',
                                color: '#FFB800',
                                fontWeight: 700,
                                fontSize: '0.75rem',
                                border: '1px solid rgba(255, 184, 0, 0.3)'
                            }}
                        />
                    );
                }
                if (val && val !== '—') {
                    return (
                        <Typography variant="body2" sx={{ fontFamily: '"Inter", sans-serif', fontSize: '0.8125rem', color: '#00D4FF', fontWeight: 700 }}>
                            {val}
                        </Typography>
                    );
                }
                return <Typography variant="caption" sx={{ color: '#64748B' }}>—</Typography>;
            }
        },
        {
            id: 'tempo_permanencia',
            label: 'Tempo de permanência',
            width: 200,
            format: (val, _row) => {
                if (!val || val === '—') {
                    return <Typography variant="caption" sx={{ color: '#64748B' }}>00h 00m</Typography>;
                }
                // sem horas no dia: saída não registrada (a conferir) ou turno contado no dia da entrada
                if (val === 'Saída não registrada' || val === 'Turno do dia anterior') {
                    const conferir = val === 'Saída não registrada';
                    return (
                        <Chip
                            label={conferir ? 'A conferir' : 'Turno do dia anterior'}
                            size="small"
                            title={conferir
                                ? 'Sem horário de saída real: as horas não entram no total nem na média'
                                : 'As horas deste turno estão no relatório do dia da entrada'}
                            sx={{
                                bgcolor: conferir ? 'rgba(255, 51, 102, 0.12)' : 'rgba(148, 163, 184, 0.12)',
                                color: conferir ? '#FF3366' : '#94A3B8',
                                fontWeight: 700,
                                fontSize: '0.75rem',
                                border: `1px solid ${conferir ? 'rgba(255, 51, 102, 0.3)' : 'rgba(148, 163, 184, 0.3)'}`
                            }}
                        />
                    );
                }
                const isAndamento = val.includes('Em andamento');
                return (
                    <Chip
                        icon={<TimeIcon sx={{ fontSize: '13px !important', color: (isAndamento ? '#FFB800' : '#00FF88') + ' !important' }} />}
                        label={val}
                        size="small"
                        sx={{
                            bgcolor: isAndamento ? 'rgba(255, 184, 0, 0.12)' : 'rgba(0, 255, 136, 0.12)',
                            color: isAndamento ? '#FFB800' : '#00FF88',
                            fontFamily: '"Inter", sans-serif',
                            fontWeight: 700,
                            fontSize: '0.75rem',
                            border: `1px solid ${isAndamento ? 'rgba(255, 184, 0, 0.3)' : 'rgba(0, 255, 136, 0.3)'}`
                        }}
                    />
                );
            }
        }
    ];

    // 2. Colunas dos Logs Diários Brutos
    const logColumns = [
        { id: 'pessoa', label: 'Participante', width: 230 },
        { id: 'empresa', label: 'Empresa', width: 200 },
        { 
            id: 'tipo', 
            label: 'Tipo', 
            width: 120,
            format: (value) => (
                <Chip
                    label={comoRotulo(value)}
                    size="small"
                    sx={{
                        bgcolor: (value === 'checkin' || value === 'entrada') ? 'rgba(0, 255, 136, 0.15)' : 'rgba(255, 51, 102, 0.15)',
                        color: (value === 'checkin' || value === 'entrada') ? '#00FF88' : '#FF3366',
                        fontWeight: 700,
                        fontSize: '0.75rem'
                    }}
                />
            )
        },
        { 
            id: 'horario', 
            label: 'Horário', 
            width: 170,
            format: (value) => value && (
                <Typography variant="body2" sx={{ fontFamily: '"Inter", sans-serif', fontSize: '0.8125rem', color: '#00D4FF' }}>
                    {format(new Date(value), "dd/MM HH:mm:ss", { locale: ptBR })}
                </Typography>
            )
        },
        { id: 'metodo', label: 'Método', width: 140 },
        { id: 'numero_pulseira', label: 'Pulseira', width: 110, align: 'center', format: (val) => val || '—' },
        { id: 'equipamento', label: 'Equipamento', width: 180 }
    ];

    // 3. Colunas: Por Área
    const areaColumns = [
        { id: 'area', label: 'Área / localização', width: 260 },
        { id: 'entradas', label: 'Entradas', width: 130, align: 'center', type: 'number' },
        { id: 'saidas', label: 'Saídas', width: 130, align: 'center', type: 'number' },
        {
            id: 'pico',
            label: 'Pico de fluxo',
            width: 150,
            align: 'center',
            format: (val) => (
                <Chip
                    label={val || '—'}
                    size="small"
                    sx={{ bgcolor: 'rgba(0, 212, 255, 0.12)', color: '#00D4FF', fontFamily: '"Inter", sans-serif', fontWeight: 700 }}
                />
            )
        }
    ];

    // 4. Colunas: Por Empresa
    const empresaColumns = [
        { id: 'empresa', label: 'Nome da empresa', width: 250 },
        { id: 'pessoas', label: 'Colaboradores', width: 130, align: 'center', type: 'number' },
        { id: 'entradas', label: 'Entradas', width: 120, align: 'center', type: 'number' },
        { id: 'saidas', label: 'Saídas', width: 120, align: 'center', type: 'number' },
        { id: 'bloqueados', label: 'Bloqueados', width: 120, align: 'center', type: 'number' },
        { id: 'expulsos', label: 'Expulsos', width: 120, align: 'center', type: 'number' }
    ];

    // 5. Colunas: Por Leitor
    const leitorColumns = [
        { id: 'terminal', label: 'Terminal / equipamento', width: 220 },
        { id: 'localizacao', label: 'Localização', width: 200 },
        { id: 'total', label: 'Total leituras', width: 130, align: 'center', type: 'number' },
        { id: 'entradas', label: 'Entradas', width: 110, align: 'center', type: 'number' },
        { id: 'saidas', label: 'Saídas', width: 110, align: 'center', type: 'number' },
        { id: 'erros', label: 'Erros / negados', width: 130, align: 'center', type: 'number' }
    ];

    // 6. Colunas: Por Função
    const funcaoColumns = [
        { id: 'funcao', label: 'Função / cargo', width: 250 },
        { id: 'total', label: 'Total cadastrado', width: 150, align: 'center', type: 'number' },
        { id: 'presentes', label: 'Presentes agora', width: 140, align: 'center', type: 'number' },
        { id: 'entradas_periodo', label: 'Entradas no período', width: 160, align: 'center', type: 'number' },
        { id: 'saidas_periodo', label: 'Saídas no período', width: 160, align: 'center', type: 'number' }
    ];

    // 7. Colunas: Por Status
    const statusColumns = [
        { 
            id: 'status', 
            label: 'Status documental / acesso', 
            width: 250,
            format: (val) => (
                <Chip
                    label={comoRotulo(val || 'pendente')}
                    size="small"
                    sx={{
                        bgcolor: val === 'autorizado' || val === 'ativo' ? 'rgba(0, 255, 136, 0.15)' : 'rgba(255, 184, 0, 0.15)',
                        color: val === 'autorizado' || val === 'ativo' ? '#00FF88' : '#FFB800',
                        fontWeight: 700
                    }}
                />
            )
        },
        { id: 'quantidade', label: 'Quantidade de pessoas', width: 200, align: 'center', type: 'number' }
    ];

    // 8. Colunas: Sessões de Operador
    const sessoesColumns = [
        {
            id: 'operador_nome',
            label: 'Operador',
            width: 230,
            format: (val, row) => (
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                    <Avatar sx={{ width: 32, height: 32, bgcolor: '#0A1628', border: '1px solid #00D4FF', color: '#00D4FF', fontSize: '0.8125rem', fontWeight: 700 }}>
                        {val?.charAt(0) || 'O'}
                    </Avatar>
                    <Box sx={{ minWidth: 0 }}>
                        <Typography variant="body2" sx={{ fontWeight: 700, color: '#FFFFFF', fontSize: '0.875rem' }} noWrap>
                            {val || 'Operador'}
                        </Typography>
                        <Typography variant="caption" sx={{ color: 'text.secondary', fontSize: '0.75rem' }} noWrap>
                            {row.operador_email || row.nivel_acesso?.toUpperCase()}
                        </Typography>
                    </Box>
                </Box>
            )
        },
        {
            id: 'login_at',
            label: 'Entrada (login)',
            width: 170,
            format: (val) => val && (
                <Typography variant="body2" sx={{ fontFamily: '"Inter", sans-serif', fontSize: '0.8125rem', color: '#00D4FF' }}>
                    {format(new Date(val), "dd/MM/yyyy HH:mm:ss", { locale: ptBR })}
                </Typography>
            )
        },
        {
            id: 'logout_at',
            label: 'Saída (logout)',
            width: 170,
            format: (val) => val ? (
                <Typography variant="body2" sx={{ fontFamily: '"Inter", sans-serif', fontSize: '0.8125rem', color: '#FFB800' }}>
                    {format(new Date(val), "dd/MM/yyyy HH:mm:ss", { locale: ptBR })}
                </Typography>
            ) : (
                <Chip label="Online agora" size="small" sx={{ bgcolor: 'rgba(0,255,136,0.15)', color: '#00FF88', fontWeight: 700, fontSize: '0.75rem' }} />
            )
        },
        {
            id: 'tempo_online_formatado',
            label: 'Duração online',
            width: 150,
            format: (val) => (
                <Chip
                    icon={<TimeIcon sx={{ fontSize: '14px !important', color: '#00FF88 !important' }} />}
                    label={val || '00h 00m 00s'}
                    size="small"
                    sx={{
                        bgcolor: 'rgba(0, 255, 136, 0.1)',
                        color: '#00FF88',
                        fontFamily: '"Inter", sans-serif',
                        fontWeight: 700,
                        border: '1px solid rgba(0, 255, 136, 0.3)'
                    }}
                />
            )
        },
        {
            id: 'pessoas_criadas',
            label: 'Pessoas criadas',
            width: 130,
            align: 'center',
            format: (val) => (
                <Chip
                    label={`+${val || 0}`}
                    size="small"
                    sx={{ bgcolor: 'rgba(0, 212, 255, 0.15)', color: '#00D4FF', fontWeight: 700, minWidth: 45 }}
                />
            )
        },
        {
            id: 'empresas_criadas',
            label: 'Empresas criadas',
            width: 140,
            align: 'center',
            format: (val) => (
                <Chip
                    label={`+${val || 0}`}
                    size="small"
                    sx={{ bgcolor: 'rgba(123, 47, 190, 0.15)', color: '#A855F7', fontWeight: 700, minWidth: 45 }}
                />
            )
        },
        {
            id: 'itens_apagados',
            label: 'Itens apagados',
            width: 130,
            align: 'center',
            format: (val) => (
                <Chip
                    label={val || 0}
                    size="small"
                    sx={{ bgcolor: val > 0 ? 'rgba(255, 51, 102, 0.15)' : 'rgba(255,255,255,0.05)', color: val > 0 ? '#FF3366' : 'text.secondary', fontWeight: 700, minWidth: 45 }}
                />
            )
        },
        {
            id: 'checkins_realizados',
            label: 'Check-ins',
            width: 110,
            align: 'center',
            format: (val) => (
                <Chip
                    label={val || 0}
                    size="small"
                    sx={{ bgcolor: 'rgba(0, 255, 136, 0.15)', color: '#00FF88', fontWeight: 700, minWidth: 45 }}
                />
            )
        },
        {
            id: 'notas',
            label: 'Notas de turno',
            width: 140,
            align: 'center',
            format: (val, row) => val ? (
                <IconButton
                    size="small"
                    onClick={() => {
                        setNotasOperador(val);
                        setNotasOperadorNome(row.operador_nome || 'Operador');
                        setModalNotasOpen(true);
                    }}
                    sx={{ color: '#00D4FF', '&:hover': { bgcolor: 'rgba(0, 212, 255, 0.15)' } }}
                    title="Ver anotações do operador"
                >
                    <NoteIcon fontSize="small" />
                </IconButton>
            ) : (
                <Typography variant="caption" sx={{ color: 'text.secondary' }}>—</Typography>
            )
        },
        {
            id: 'actions',
            label: 'Resumo',
            width: 90,
            align: 'center',
            format: (_, row) => (
                <IconButton
                    size="small"
                    onClick={() => {
                        setSelectedSessao(row);
                        setModalDetalhesOpen(true);
                    }}
                    sx={{ color: '#00D4FF', '&:hover': { bgcolor: 'rgba(0, 212, 255, 0.15)' } }}
                    title="Ver resumo consolidado"
                >
                    <InfoIcon fontSize="small" />
                </IconButton>
            )
        }
    ];

    return (
        <Box sx={{ p: { xs: 2, md: 3 } }}>
            {/* CABEÇALHO DA PÁGINA (NZT Relatórios) */}
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: { xs: 'flex-start', sm: 'center' }, mb: 3, flexWrap: 'wrap', gap: 2 }}>
                <PageHeader
                    title="Relatórios"
                    subtitle="Fluxo de acesso, fechamento diário e histórico da operação."
                    breadcrumbs={[{ text: 'Dashboard' }, { text: 'Relatórios' }]}
                    sx={{ mb: 0 }}
                />

                {/* BOTÕES DE EXPORTAÇÃO PADRONIZADOS */}
                <Stack direction="row" spacing={1.5} flexWrap="wrap">
                    {tab === 'diario' ? (
                        <>
                            <Button variant="outlined"
                                startIcon={<ExportIcon />}
                                onClick={handleExportDiarioXLSX}
                                sx={botaoSecundario}
                            >
                                Exportar Excel
                            </Button>
                            <Button variant="outlined"
                                startIcon={<PdfIcon />}
                                onClick={handleExportDiarioPDF}
                                sx={botaoSecundario}
                            >
                                Exportar PDF
                            </Button>
                        </>
                    ) : tab === 'sessoes' ? (
                        <Button variant="outlined"
                            startIcon={<ExportIcon />}
                            onClick={exportarSessoesCSV}
                            sx={botaoSecundario}
                        >
                            Exportar sessões (CSV)
                        </Button>
                    ) : (
                        <>
                            <Button variant="outlined" 
                                startIcon={<ExportIcon />} 
                                onClick={() => handleExport(tab, 'excel')}
                                sx={botaoSecundario}
                            >
                                Exportar Excel
                            </Button>
                            <Button variant="outlined" 
                                startIcon={<PdfIcon />} 
                                onClick={() => handleExportAbaPDF(tab)} 
                                sx={botaoSecundario}
                            >
                                Exportar PDF
                            </Button>
                        </>
                    )}
                </Stack>
            </Box>

            {/* SEÇÃO DA ABA: RELATÓRIO DIÁRIO */}
            {tab === 'diario' && (
                <>
                    {/* RESUMO DO DIA */}
                    <Grid container spacing={2} sx={{ mb: 3 }}>
                        <Grid item xs={6} sm={4} md={2.4}>
                            <KpiCard titulo="Cadastrados" valor={totaisDiarios.total_colaboradores || dailyConsolidado.length} icone={<KpiCadastradosIcon />} />
                        </Grid>
                        <Grid item xs={6} sm={4} md={2.4}>
                            <KpiCard titulo="Presentes no evento" valor={totaisDiarios.total_presentes || 0} icone={<KpiPresentesIcon />} cor={cores.sucesso} />
                        </Grid>
                        <Grid item xs={6} sm={4} md={2.4}>
                            <KpiCard titulo="Saídas registradas" valor={totaisDiarios.total_finalizados || 0} icone={<KpiSaidasIcon />} cor={cores.saida} />
                        </Grid>
                        <Grid item xs={6} sm={4} md={2.4}>
                            <KpiCard titulo="Não compareceram" valor={totaisDiarios.total_ausentes || 0} icone={<KpiAusentesIcon />} cor={cores.textoSecundario} />
                        </Grid>
                        <Grid item xs={12} sm={4} md={2.4}>
                            <KpiCard titulo="Tempo médio no evento" valor={totaisDiarios.tempo_medio_formatado || '00h 00m'} icone={<KpiTempoIcon />} cor={cores.secundariaClara} valorCompacto />
                        </Grid>
                    </Grid>

                    {/* FILTROS DO RELATÓRIO DIÁRIO */}
                    <GlassCard sx={{ p: 2.5, mb: 3 }}>
                        <Grid container spacing={2} alignItems="center">
                            {/* Data de Referência */}
                            <Grid item xs={12} sm={6} md={2.5}>
                                <Typography variant="caption" sx={{ color: 'text.secondary', fontWeight: 700, display: 'block', mb: 0.5 }}>Data de referência</Typography>
                                <TextField
                                    type="date"
                                    fullWidth
                                    size="small"
                                    value={dataReferenciaDiario}
                                    onChange={(e) => {
                                        setDataReferenciaDiario(e.target.value);
                                        setSelectedFechamentoId('');
                                    }}
                                />
                            </Grid>

                            {/* Seletor de Snapshot de Fechamento Diário (Resets Gravados) */}
                            <Grid item xs={12} sm={6} md={3}>
                                <Typography variant="caption" sx={{ color: 'text.secondary', fontWeight: 700, display: 'block', mb: 0.5 }}>Arquivo / reset diário</Typography>
                                <FormControl fullWidth size="small">
                                    <Select
                                        value={selectedFechamentoId}
                                        onChange={(e) => setSelectedFechamentoId(e.target.value)}
                                        displayEmpty
                                    >
                                        <MenuItem value="">Tempo real (ao vivo)</MenuItem>
                                        {fechamentosList.map(f => (
                                            <MenuItem key={f.id} value={f.id}>
                                                Reset {f.tipo_reset?.toUpperCase()} • {f.hora_fechamento ? format(new Date(f.hora_fechamento), 'dd/MM/yyyy HH:mm', { locale: ptBR }) : f.data_referencia}
                                            </MenuItem>
                                        ))}
                                    </Select>
                                </FormControl>
                            </Grid>

                            {/* Filtrar por Empresa */}
                            <Grid item xs={12} sm={6} md={3}>
                                <Typography variant="caption" sx={{ color: 'text.secondary', fontWeight: 700, display: 'block', mb: 0.5 }}>Filtrar por empresa</Typography>
                                <FormControl fullWidth size="small">
                                    <Select
                                        value={empresaId}
                                        onChange={(e) => setEmpresaId(e.target.value)}
                                        displayEmpty
                                    >
                                        <MenuItem value="">Todas as empresas</MenuItem>
                                        {empresas.map(e => (
                                            <MenuItem key={e.id} value={e.id}>{e.nome}</MenuItem>
                                        ))}
                                    </Select>
                                </FormControl>
                            </Grid>

                            {/* Campo de Busca Rápida */}
                            <Grid item xs={12} sm={6} md={2.5}>
                                <Typography variant="caption" sx={{ color: 'text.secondary', fontWeight: 700, display: 'block', mb: 0.5 }}>Pesquisar</Typography>
                                <TextField
                                    fullWidth
                                    size="small"
                                    placeholder="Nome, CPF, pulseira..."
                                    value={searchDiario}
                                    onChange={(e) => setSearchDiario(e.target.value)}
                                    InputProps={{
                                        startAdornment: (
                                            <InputAdornment position="start">
                                                <SearchIcon sx={{ color: '#00D4FF', fontSize: 18 }} />
                                            </InputAdornment>
                                        )
                                    }}
                                />
                            </Grid>

                            {/* Botão de Atualização */}
                            <Grid item xs={12} sm={12} md={1}>
                                <Typography variant="caption" sx={{ opacity: 0, display: 'block', mb: 0.5 }}>Ação</Typography>
                                <Button
                                    variant="contained"
                                    fullWidth
                                    onClick={loadDiarioConsolidado}
                                    sx={{ height: 40, minWidth: 40, p: 0, bgcolor: '#00D4FF', color: '#000000', '&:hover': { bgcolor: '#00FF88' } }}
                                    title="Atualizar dados"
                                >
                                    <RefreshIcon />
                                </Button>
                            </Grid>
                        </Grid>

                        {/* Filtros Rápidos de Status */}
                        <Box sx={{ mt: 2, display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
                            <Typography variant="caption" sx={{ color: 'text.secondary', fontWeight: 700, mr: 1 }}>Status:</Typography>
                            <ToggleButtonGroup
                                size="small"
                                value={statusFiltroDiario}
                                exclusive
                                onChange={(e, val) => val && setStatusFiltroDiario(val)}
                                sx={{
                                    '& .MuiToggleButton-root': {
                                        color: '#94A3B8',
                                        borderColor: 'rgba(255,255,255,0.1)',
                                        py: 0.4,
                                        px: 1.5,
                                        fontSize: '0.75rem',
                                        fontWeight: 700,
                                        '&.Mui-selected': {
                                            bgcolor: 'rgba(0, 212, 255, 0.15)',
                                            color: '#00D4FF',
                                            borderColor: 'rgba(0, 212, 255, 0.4)'
                                        }
                                    }
                                }}
                            >
                                <ToggleButton value="todos">Todos ({dailyConsolidado.length})</ToggleButton>
                                <ToggleButton value="presente">Presentes</ToggleButton>
                                <ToggleButton value="finalizado">Finalizados</ToggleButton>
                                <ToggleButton value="ausente">Não compareceram</ToggleButton>
                            </ToggleButtonGroup>
                        </Box>
                    </GlassCard>
                </>
            )}

            {/* SEÇÃO DE FILTROS GERAIS PARA AS DEMAIS ABAS */}
            {tab !== 'diario' && (
                <GlassCard sx={{ p: 2, mb: 3 }}>
                    <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 2, alignItems: 'center' }}>
                        <Box sx={{ flex: '1 1 250px' }}>
                            <Typography variant="caption" sx={{ color: 'text.secondary', fontWeight: 700, display: 'block', mb: 0.5 }}>Período inicial</Typography>
                            <TextField 
                                type="datetime-local" 
                                fullWidth 
                                size="small" 
                                value={dateStart} 
                                onChange={(e) => setDateStart(e.target.value)} 
                            />
                        </Box>
                        <Box sx={{ flex: '1 1 250px' }}>
                            <Typography variant="caption" sx={{ color: 'text.secondary', fontWeight: 700, display: 'block', mb: 0.5 }}>Período final</Typography>
                            <TextField 
                                type="datetime-local" 
                                fullWidth 
                                size="small" 
                                value={dateEnd} 
                                onChange={(e) => setDateEnd(e.target.value)} 
                            />
                        </Box>
                        {tab !== 'sessoes' && (
                            <Box sx={{ flex: '1 1 250px' }}>
                                <Typography variant="caption" sx={{ color: 'text.secondary', fontWeight: 700, display: 'block', mb: 0.5 }}>Filtrar por empresa</Typography>
                                <FormControl fullWidth size="small">
                                    <Select
                                        value={empresaId}
                                        onChange={(e) => setEmpresaId(e.target.value)}
                                        displayEmpty
                                    >
                                        <MenuItem value="">Todas as empresas</MenuItem>
                                        {empresas.map(e => (
                                            <MenuItem key={e.id} value={e.id}>{e.nome}</MenuItem>
                                        ))}
                                    </Select>
                                </FormControl>
                            </Box>
                        )}
                        <Box sx={{ flex: '0 0 auto', display: 'flex', alignItems: 'flex-end', pt: '10px' }}>
                            <Button 
                                variant="contained" 
                                fullWidth 
                                startIcon={<RefreshIcon />} 
                                onClick={() => {
                                    if (tab === 'logs') loadLogs(1);
                                    else if (tab === 'sessoes') loadSessoes();
                                    else loadTab(tab);
                                }}
                                sx={{ bgcolor: '#00D4FF', color: '#000000', fontWeight: 700 }}
                            >
                                Atualizar
                            </Button>
                        </Box>
                    </Box>
                </GlassCard>
            )}

            {/* ABAS DO MENU DE RELATÓRIOS */}
            <GlassCard sx={{ mb: 3 }}>
                <Tabs 
                    value={tab} 
                    onChange={handleTabChange} 
                    variant="scrollable" 
                    scrollButtons="auto" 
                    sx={{ borderBottom: 1, borderColor: 'divider' }}
                >
                    <Tab icon={<DailyIcon />} label="Relatório diário" value="diario" />
                    <Tab icon={<HistoryIcon />} label="Logs de acesso" value="logs" />
                    <Tab icon={<BadgeIcon />} label="Sessões de operador" value="sessoes" />
                    <Tab icon={<TableIcon />} label="Por área" value="area" />
                    <Tab icon={<BusinessIcon />} label="Por empresa" value="empresa" />
                    <Tab icon={<DeviceIcon />} label="Por leitor" value="leitor" />
                    <Tab icon={<JobIcon />} label="Por função" value="funcao" />
                    <Tab icon={<TimeIcon />} label="Por status" value="status" />
                </Tabs>

                <Box sx={{ p: 2 }}>
                    {/* 1. RELATÓRIO DIÁRIO (8 COLUNAS EXIGIDAS) */}
                    {tab === 'diario' && (
                        <DataTable
                            data={dailyConsolidado}
                            columns={diarioColumns}
                            loading={loading}
                            rowsPerPage={25}
                        />
                    )}

                    {/* 2. LOGS DE ACESSO */}
                    {tab === 'logs' && (
                        <DataTable
                            data={dailyLogs}
                            columns={logColumns}
                            loading={loading}
                            totalCount={totalLogs}
                            page={page - 1}
                            rowsPerPage={25}
                            onPageChange={(event, newPage) => setPage(newPage + 1)}
                        />
                    )}

                    {/* 3. SESSÕES DE OPERADOR */}
                    {tab === 'sessoes' && (
                        <DataTable
                            data={sessoesList}
                            columns={sessoesColumns}
                            loading={loadingSessoes}
                            rowsPerPage={25}
                        />
                    )}

                    {/* 4. POR ÁREA */}
                    {tab === 'area' && (
                        <DataTable
                            data={reportArea}
                            columns={areaColumns}
                            loading={loading}
                            rowsPerPage={25}
                        />
                    )}

                    {/* 5. POR EMPRESA */}
                    {tab === 'empresa' && (
                        <DataTable
                            data={reportEmpresa}
                            columns={empresaColumns}
                            loading={loading}
                            rowsPerPage={25}
                        />
                    )}

                    {/* 6. POR LEITOR */}
                    {tab === 'leitor' && (
                        <DataTable
                            data={reportLeitor}
                            columns={leitorColumns}
                            loading={loading}
                            rowsPerPage={25}
                        />
                    )}

                    {/* 7. POR FUNÇÃO */}
                    {tab === 'funcao' && (
                        <DataTable
                            data={reportFuncao}
                            columns={funcaoColumns}
                            loading={loading}
                            rowsPerPage={25}
                        />
                    )}

                    {/* 8. POR STATUS */}
                    {tab === 'status' && (
                        <DataTable
                            data={reportStatus}
                            columns={statusColumns}
                            loading={loading}
                            rowsPerPage={25}
                        />
                    )}
                </Box>
            </GlassCard>

            {/* MODAL: NOTAS DE TURNO DO OPERADOR */}
            <Dialog
                open={modalNotasOpen}
                onClose={() => setModalNotasOpen(false)}
                maxWidth="sm"
                fullWidth
            >
                <DialogTitle sx={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        <NoteIcon sx={{ }} />
                        <Typography variant="h6" sx={{ fontWeight: 700 }}>
                            Notas do Turno • {notasOperadorNome}
                        </Typography>
                    </Box>
                </DialogTitle>
                <DialogContent sx={{ pt: 2.5 }}>
                    <Paper sx={{ p: 2, bgcolor: 'rgba(255,255,255,0.03)', borderRadius: 1.5, border: '1px solid rgba(255,255,255,0.06)' }}>
                        <Typography variant="body1" sx={{ whiteSpace: 'pre-wrap', color: '#FFFFFF', lineHeight: 1.6 }}>
                            {notasOperador || 'Nenhum lembrete registrado durante este turno.'}
                        </Typography>
                    </Paper>
                </DialogContent>
                <DialogActions sx={{ p: 2 }}>
                    <Button variant="outlined" onClick={() => setModalNotasOpen(false)} sx={botaoSecundario}>
                        Fechar
                    </Button>
                </DialogActions>
            </Dialog>

            {/* MODAL: DETALHES CONSOLIDADOS DA SESSÃO */}
            <Dialog
                open={modalDetalhesOpen}
                onClose={() => setModalDetalhesOpen(false)}
                maxWidth="md"
                fullWidth
            >
                <DialogTitle sx={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                    <Typography variant="h6" sx={{ fontWeight: 700 }}>
                        Relatório consolidado de turno
                    </Typography>
                    <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                        Operador: <strong style={{ color: '#FFFFFF' }}>{selectedSessao?.operador_nome}</strong> ({selectedSessao?.nivel_acesso?.toUpperCase()})
                    </Typography>
                </DialogTitle>
                <DialogContent sx={{ pt: 2.5 }}>
                    {selectedSessao && (
                        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2.5 }}>
                            {/* Cards de Métricas do Turno */}
                            <Grid container spacing={2}>
                                <Grid item xs={6} sm={3}>
                                    <Paper sx={{ p: 1.5, textAlign: 'center', bgcolor: 'rgba(0, 255, 136, 0.08)', border: '1px solid rgba(0, 255, 136, 0.2)', borderRadius: 1.5 }}>
                                        <Typography variant="caption" sx={{ color: 'text.secondary', fontWeight: 700 }}>Tempo online</Typography>
                                        <Typography variant="h6" sx={{ color: '#00FF88', fontWeight: 700, fontFamily: '"Inter", sans-serif' }}>
                                            {selectedSessao.tempo_online_formatado}
                                        </Typography>
                                    </Paper>
                                </Grid>
                                <Grid item xs={6} sm={3}>
                                    <Paper sx={{ p: 1.5, textAlign: 'center', bgcolor: 'rgba(0, 212, 255, 0.08)', border: '1px solid rgba(0, 212, 255, 0.2)', borderRadius: 1.5 }}>
                                        <Typography variant="caption" sx={{ color: 'text.secondary', fontWeight: 700 }}>Pessoas criadas</Typography>
                                        <Typography variant="h6" sx={{ color: '#00D4FF', fontWeight: 700 }}>
                                            {selectedSessao.pessoas_criadas || 0}
                                        </Typography>
                                    </Paper>
                                </Grid>
                                <Grid item xs={6} sm={3}>
                                    <Paper sx={{ p: 1.5, textAlign: 'center', bgcolor: 'rgba(168, 85, 247, 0.08)', border: '1px solid rgba(168, 85, 247, 0.2)', borderRadius: 1.5 }}>
                                        <Typography variant="caption" sx={{ color: 'text.secondary', fontWeight: 700 }}>Empresas criadas</Typography>
                                        <Typography variant="h6" sx={{ color: '#A855F7', fontWeight: 700 }}>
                                            {selectedSessao.empresas_criadas || 0}
                                        </Typography>
                                    </Paper>
                                </Grid>
                                <Grid item xs={6} sm={3}>
                                    <Paper sx={{ p: 1.5, textAlign: 'center', bgcolor: 'rgba(255, 51, 102, 0.08)', border: '1px solid rgba(255, 51, 102, 0.2)', borderRadius: 1.5 }}>
                                        <Typography variant="caption" sx={{ color: 'text.secondary', fontWeight: 700 }}>Itens apagados</Typography>
                                        <Typography variant="h6" sx={{ color: '#FF3366', fontWeight: 700 }}>
                                            {selectedSessao.itens_apagados || 0}
                                        </Typography>
                                    </Paper>
                                </Grid>
                            </Grid>

                            {/* Informações de Login e Logout */}
                            <Paper sx={{ p: 2, bgcolor: 'rgba(255,255,255,0.02)', borderRadius: 1.5, border: '1px solid rgba(255,255,255,0.05)' }}>
                                <Grid container spacing={2}>
                                    <Grid item xs={12} sm={6}>
                                        <Typography variant="caption" sx={{ color: 'text.secondary' }}>Horário de início (login):</Typography>
                                        <Typography variant="body1" sx={{ color: '#00D4FF', fontWeight: 700, fontFamily: '"Inter", sans-serif' }}>
                                            {selectedSessao.login_at ? format(new Date(selectedSessao.login_at), "dd/MM/yyyy HH:mm:ss", { locale: ptBR }) : '--'}
                                        </Typography>
                                    </Grid>
                                    <Grid item xs={12} sm={6}>
                                        <Typography variant="caption" sx={{ color: 'text.secondary' }}>Horário de encerramento (logout):</Typography>
                                        <Typography variant="body1" sx={{ color: '#FFB800', fontWeight: 700, fontFamily: '"Inter", sans-serif' }}>
                                            {selectedSessao.logout_at ? format(new Date(selectedSessao.logout_at), "dd/MM/yyyy HH:mm:ss", { locale: ptBR }) : '--'}
                                        </Typography>
                                    </Grid>
                                </Grid>
                            </Paper>
                        </Box>
                    )}
                </DialogContent>
                <DialogActions sx={{ p: 2 }}>
                    <Button variant="outlined" onClick={() => setModalDetalhesOpen(false)} sx={botaoSecundario}>
                        Fechar
                    </Button>
                </DialogActions>
            </Dialog>
        </Box>
    );
};

export default Reports;
