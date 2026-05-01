import { useState, useCallback } from 'react';
import { useSnackbar } from 'notistack';
import { useSearchParams } from 'react-router-dom';
import { format, startOfDay, endOfDay } from 'date-fns';
import api from '../services/api';

/**
 * useReports: Hook refatorado para processamento de dados tabulares (NZT Analytics).
 * Foca em paginação server-side, novos relatórios agregados e exportação multiplataforma.
 */
export const useReports = () => {
    const { enqueueSnackbar } = useSnackbar();
    const [searchParams] = useSearchParams();
    const eventoId = searchParams.get('evento_id') || localStorage.getItem('active_evento_id');

    // Estados de carregamento e dados
    const [loading, setLoading] = useState(false);
    const [empresaId, setEmpresaId] = useState('');
    const [dateStart, setDateStart] = useState(format(startOfDay(new Date()), "yyyy-MM-dd'T'HH:mm"));
    const [dateEnd, setDateEnd] = useState(format(endOfDay(new Date()), "yyyy-MM-dd'T'HH:mm"));

    // Dados dos Relatórios
    const [dailyLogs, setDailyLogs] = useState([]);
    const [totalLogs, setTotalLogs] = useState(0);
    const [page, setPage] = useState(1);
    
    const [reportArea, setReportArea] = useState([]);
    const [reportEmpresa, setReportEmpresa] = useState([]);
    const [reportLeitor, setReportLeitor] = useState([]);
    const [reportFuncao, setReportFuncao] = useState([]);
    const [reportStatus, setReportStatus] = useState([]);
    const [reportPonto, setReportPonto] = useState([]);

    const loadLogs = useCallback(async (p = 1) => {
        if (!eventoId) return;
        try {
            setLoading(true);
            const { data } = await api.get('/reports/daily', {
                params: {
                    evento_id: eventoId,
                    data_inicio: dateStart,
                    data_fim: dateEnd,
                    empresa_id: empresaId,
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
                params: { evento_id: eventoId, data_inicio: dateStart, data_fim: dateEnd, empresa_id: empresaId }
            });
            setters[tab](data.data || []);
        } catch (error) {
            enqueueSnackbar(`Erro ao carregar relatório por ${tab}.`, { variant: 'error' });
        } finally {
            setLoading(false);
        }
    }, [eventoId, dateStart, dateEnd, empresaId, enqueueSnackbar]);

    const handleExport = async (type, format = 'excel') => {
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
                    empresa_id: empresaId,
                    format
                },
                responseType: 'blob'
            });

            const extension = format === 'csv' ? 'csv' : 'xlsx';
            const url = window.URL.createObjectURL(new Blob([response.data]));
            const link = document.createElement('a');
            link.href = url;
            link.setAttribute('download', `Relatorio_${type}_${Date.now()}.${extension}`);
            document.body.appendChild(link);
            link.click();
            link.remove();
        } catch (error) {
            enqueueSnackbar('Erro ao exportar arquivo.', { variant: 'error' });
        }
    };

    const handleExportPDF = async () => {
        try {
            const response = await api.get('/reports/attendance-pdf', {
                params: { evento_id: eventoId, empresa_id: empresaId },
                responseType: 'blob'
            });
            const url = window.URL.createObjectURL(new Blob([response.data]));
            const link = document.createElement('a');
            link.href = url;
            link.setAttribute('download', `Lista_Presenca_${eventoId.split('-')[0]}_${Date.now()}.pdf`);
            document.body.appendChild(link);
            link.click();
            link.remove();
            enqueueSnackbar('PDF gerado com sucesso!', { variant: 'success' });
        } catch (error) {
            enqueueSnackbar('Falha ao gerar PDF de presença.', { variant: 'error' });
        }
    };

    return {
        loading, empresaId, setEmpresaId,
        dateStart, setDateStart, dateEnd, setDateEnd,
        dailyLogs, totalLogs, page, setPage: loadLogs,
        reportArea, reportEmpresa, reportLeitor, reportFuncao, reportStatus, reportPonto,
        loadLogs, loadTab, handleExport, handleExportPDF,
        refresh: loadLogs
    };
};
