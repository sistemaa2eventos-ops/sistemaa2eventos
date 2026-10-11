import { useState, useCallback } from 'react';
import { useSnackbar } from 'notistack';
import { useSearchParams } from 'react-router-dom';
import { format, startOfDay, endOfDay } from 'date-fns';
import api from '../services/api';

/**
 * useReports: Hook completo de dados para NZT Relatórios.
 * Suporta Relatório Diário Consolidado (8 colunas), histórico de resets fechados,
 * relatórios agregados e exportação instantânea para XLSX e PDF em todas as abas.
 */
export const useReports = () => {
    const { enqueueSnackbar } = useSnackbar();
    const [searchParams] = useSearchParams();
    const eventoId = searchParams.get('evento_id') || localStorage.getItem('active_evento_id');

    // Estados gerais
    const [loading, setLoading] = useState(false);
    const [empresaId, setEmpresaId] = useState('');
    const [dateStart, setDateStart] = useState(format(startOfDay(new Date()), "yyyy-MM-dd'T'HH:mm"));
    const [dateEnd, setDateEnd] = useState(format(endOfDay(new Date()), "yyyy-MM-dd'T'HH:mm"));

    // --- RELATÓRIO DIÁRIO CONSOLIDADO ---
    const [dailyConsolidado, setDailyConsolidado] = useState([]);
    const [totaisDiarios, setTotaisDiarios] = useState({
        total_colaboradores: 0,
        total_presentes: 0,
        total_finalizados: 0,
        total_ausentes: 0,
        total_checkins: 0,
        tempo_medio_formatado: '00h 00m 00s'
    });
    const [dataReferenciaDiario, setDataReferenciaDiario] = useState(format(new Date(), 'yyyy-MM-dd'));
    const [statusFiltroDiario, setStatusFiltroDiario] = useState('todos');
    const [searchDiario, setSearchDiario] = useState('');
    const [fechamentosList, setFechamentosList] = useState([]);
    const [selectedFechamentoId, setSelectedFechamentoId] = useState('');

    // --- OUTROS RELATÓRIOS ---
    const [dailyLogs, setDailyLogs] = useState([]);
    const [totalLogs, setTotalLogs] = useState(0);
    const [page, setPage] = useState(1);
    
    const [reportArea, setReportArea] = useState([]);
    const [reportEmpresa, setReportEmpresa] = useState([]);
    const [reportLeitor, setReportLeitor] = useState([]);
    const [reportFuncao, setReportFuncao] = useState([]);
    const [reportStatus, setReportStatus] = useState([]);
    const [reportPonto, setReportPonto] = useState([]);

    /**
     * Carrega Relatório Diário Consolidado
     */
    const loadDiarioConsolidado = useCallback(async () => {
        if (!eventoId) return;
        try {
            setLoading(true);
            const { data } = await api.get('/reports/diario-consolidado', {
                params: {
                    evento_id: eventoId,
                    data: dataReferenciaDiario,
                    empresa_id: empresaId || undefined,
                    status: statusFiltroDiario !== 'todos' ? statusFiltroDiario : undefined,
                    search: searchDiario || undefined,
                    fechamento_id: selectedFechamentoId || undefined
                }
            });

            if (data?.success) {
                setDailyConsolidado(data.data || []);
                if (data.totais) {
                    setTotaisDiarios(data.totais);
                }
            }
        } catch (error) {
            console.error('Erro ao carregar relatório diário:', error);
            enqueueSnackbar('Falha ao carregar relatório diário consolidado.', { variant: 'error' });
        } finally {
            setLoading(false);
        }
    }, [eventoId, dataReferenciaDiario, empresaId, statusFiltroDiario, searchDiario, selectedFechamentoId, enqueueSnackbar]);

    /**
     * Carrega histórico de fechamentos salvos no reset diário
     */
    const loadFechamentos = useCallback(async () => {
        if (!eventoId) return;
        try {
            const { data } = await api.get('/reports/fechamentos-diarios', {
                params: { evento_id: eventoId }
            });
            if (data?.success) {
                setFechamentosList(data.data || []);
            }
        } catch (error) {
            console.error('Erro ao carregar fechamentos:', error);
        }
    }, [eventoId]);

    /**
     * Carrega logs detalhados
     */
    const loadLogs = useCallback(async (p = 1) => {
        if (!eventoId) return;
        try {
            setLoading(true);
            const { data } = await api.get('/reports/daily', {
                params: {
                    evento_id: eventoId,
                    data_inicio: dateStart,
                    data_fim: dateEnd,
                    empresa_id: empresaId || undefined,
                    page: p,
                    limit: 50
                }
            });
            setDailyLogs(data.data || []);
            setTotalLogs(data.total || 0);
            setPage(p);
        } catch (error) {
            enqueueSnackbar('Erro ao carregar logs de acesso.', { variant: 'error' });
        } finally {
            setLoading(false);
        }
    }, [eventoId, dateStart, dateEnd, empresaId, enqueueSnackbar]);

    /**
     * Carrega dados de abas agregadas
     */
    const loadTab = useCallback(async (tab) => {
        if (!eventoId) return;
        try {
            setLoading(true);
            const endpoints = {
                area: '/reports/por-area',
                empresa: '/reports/por-empresa',
                leitor: '/reports/por-leitor',
                funcao: '/reports/por-funcao',
                status: '/reports/por-status',
                ponto: '/reports/ponto-resumo'
            };
            const setters = {
                area: setReportArea,
                empresa: setReportEmpresa,
                leitor: setReportLeitor,
                funcao: setReportFuncao,
                status: setReportStatus,
                ponto: setReportPonto
            };

            if (!endpoints[tab]) return;

            const { data } = await api.get(endpoints[tab], {
                params: { 
                    evento_id: eventoId, 
                    data_inicio: dateStart, 
                    data_fim: dateEnd, 
                    empresa_id: empresaId || undefined 
                }
            });
            setters[tab](data.data || []);
        } catch (error) {
            enqueueSnackbar(`Erro ao carregar relatório por ${tab}.`, { variant: 'error' });
        } finally {
            setLoading(false);
        }
    }, [eventoId, dateStart, dateEnd, empresaId, enqueueSnackbar]);

    /**
     * Exportação do Relatório Diário em XLSX
     */
    const handleExportDiarioXLSX = async () => {
        try {
            enqueueSnackbar('Gerando planilha Excel do Relatório Diário...', { variant: 'info' });
            const response = await api.get('/reports/diario-consolidado/xlsx', {
                params: {
                    evento_id: eventoId,
                    data: dataReferenciaDiario,
                    empresa_id: empresaId || undefined
                },
                responseType: 'blob'
            });

            const url = window.URL.createObjectURL(new Blob([response.data]));
            const link = document.createElement('a');
            link.href = url;
            link.setAttribute('download', `NZT_Relatorio_Diario_${dataReferenciaDiario}_${Date.now()}.xlsx`);
            document.body.appendChild(link);
            link.click();
            link.remove();
            enqueueSnackbar('Planilha baixada com sucesso!', { variant: 'success' });
        } catch (error) {
            enqueueSnackbar('Falha ao exportar relatório diário XLSX.', { variant: 'error' });
        }
    };

    /**
     * Exportação do Relatório Diário em PDF
     */
    const handleExportDiarioPDF = async () => {
        try {
            enqueueSnackbar('Gerando PDF do Relatório Diário...', { variant: 'info' });
            const response = await api.get('/reports/diario-consolidado/pdf', {
                params: {
                    evento_id: eventoId,
                    data: dataReferenciaDiario,
                    empresa_id: empresaId || undefined
                },
                responseType: 'blob'
            });

            const url = window.URL.createObjectURL(new Blob([response.data]));
            const link = document.createElement('a');
            link.href = url;
            link.setAttribute('download', `NZT_Relatorio_Diario_${dataReferenciaDiario}_${Date.now()}.pdf`);
            document.body.appendChild(link);
            link.click();
            link.remove();
            enqueueSnackbar('PDF baixado com sucesso!', { variant: 'success' });
        } catch (error) {
            enqueueSnackbar('Falha ao exportar relatório diário em PDF.', { variant: 'error' });
        }
    };

    /**
     * Exportação de Qualquer Aba em PDF
     */
    const handleExportAbaPDF = async (tabName) => {
        try {
            enqueueSnackbar('Gerando documento PDF...', { variant: 'info' });
            const response = await api.get('/reports/exportar-aba-pdf', {
                params: {
                    evento_id: eventoId,
                    aba: tabName,
                    data_inicio: dateStart,
                    data_fim: dateEnd,
                    empresa_id: empresaId || undefined
                },
                responseType: 'blob'
            });

            const url = window.URL.createObjectURL(new Blob([response.data]));
            const link = document.createElement('a');
            link.href = url;
            link.setAttribute('download', `NZT_Relatorio_${tabName.toUpperCase()}_${Date.now()}.pdf`);
            document.body.appendChild(link);
            link.click();
            link.remove();
            enqueueSnackbar('PDF gerado com sucesso!', { variant: 'success' });
        } catch (error) {
            enqueueSnackbar('Falha ao gerar relatório PDF da aba.', { variant: 'error' });
        }
    };

    /**
     * Exportação genérica de abas para Excel / CSV
     */
    const handleExport = async (type, format = 'excel') => {
        if (type === 'diario' && format === 'excel') {
            return handleExportDiarioXLSX();
        }
        if (type === 'diario' && format === 'pdf') {
            return handleExportDiarioPDF();
        }

        try {
            const routes = {
                logs: '/excel/evento',
                area: '/excel/export-area',
                empresa: '/excel/export-empresa',
                leitor: '/excel/export-leitor',
                funcao: '/excel/export-funcao',
                status: '/excel/export-status',
                diario: '/excel/export/relatorio-diario',
                ponto: '/excel/export/ponto'
            };

            if (!routes[type]) return;

            const response = await api.get(routes[type], {
                params: {
                    evento_id: eventoId,
                    data_inicio: dateStart,
                    data_fim: dateEnd,
                    empresa_id: empresaId || undefined,
                    format
                },
                responseType: 'blob'
            });

            const extension = format === 'csv' ? 'csv' : 'xlsx';
            const url = window.URL.createObjectURL(new Blob([response.data]));
            const link = document.createElement('a');
            link.href = url;
            link.setAttribute('download', `NZT_Relatorio_${type}_${Date.now()}.${extension}`);
            document.body.appendChild(link);
            link.click();
            link.remove();
        } catch (error) {
            enqueueSnackbar('Erro ao exportar arquivo.', { variant: 'error' });
        }
    };

    /**
     * Exportação de Lista de Presença PDF
     */
    const handleExportPDF = async () => {
        try {
            const response = await api.get('/reports/attendance-pdf', {
                params: { evento_id: eventoId, empresa_id: empresaId || undefined },
                responseType: 'blob'
            });
            const url = window.URL.createObjectURL(new Blob([response.data]));
            const link = document.createElement('a');
            link.href = url;
            link.setAttribute('download', `Lista_Presenca_${eventoId.split('-')[0]}_${Date.now()}.pdf`);
            document.body.appendChild(link);
            link.click();
            link.remove();
            enqueueSnackbar('Lista de Presença PDF gerada com sucesso!', { variant: 'success' });
        } catch (error) {
            enqueueSnackbar('Falha ao gerar PDF de presença.', { variant: 'error' });
        }
    };

    return {
        loading, empresaId, setEmpresaId,
        dateStart, setDateStart, dateEnd, setDateEnd,
        
        // Relatório Diário
        dailyConsolidado, totaisDiarios,
        dataReferenciaDiario, setDataReferenciaDiario,
        statusFiltroDiario, setStatusFiltroDiario,
        searchDiario, setSearchDiario,
        fechamentosList, selectedFechamentoId, setSelectedFechamentoId,
        loadDiarioConsolidado, loadFechamentos,
        handleExportDiarioXLSX, handleExportDiarioPDF,

        // Abas agregadas e logs
        dailyLogs, totalLogs, page, setPage: loadLogs,
        reportArea, reportEmpresa, reportLeitor, reportFuncao, reportStatus, reportPonto,
        loadLogs, loadTab, handleExport, handleExportPDF, handleExportAbaPDF,
        refresh: loadLogs
    };
};
