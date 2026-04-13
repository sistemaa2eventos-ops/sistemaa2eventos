import { useState, useCallback, useEffect } from 'react';
import api from '../services/api';
import { useSearchParams } from 'react-router-dom';

/**
 * Hook para gerenciar os logs de auditoria do sistema.
 */
export const useAudit = () => {
    const [searchParams] = useSearchParams();
    const eventoId = searchParams.get('evento_id') || localStorage.getItem('active_evento_id');

    const [logs, setLogs] = useState([]);
    const [loading, setLoading] = useState(false);
    const [pagination, setPagination] = useState({ page: 1, limit: 50, total: 0, pages: 1 });
    const [filters, setFilters] = useState({
        acao: '',
        recurso: '',
        data_inicio: '',
        data_fim: ''
    });

    const fetchLogs = useCallback(async (page = 1) => {
        if (!eventoId) return;

        setLoading(true);
        try {
            const response = await api.get('/audit', {
                params: {
                    evento_id: eventoId,
                    page,
                    limit: pagination.limit,
                    ...filters
                }
            });

            if (response.data.success) {
                setLogs(response.data.data);
                setPagination(response.data.pagination);
            }
        } catch (error) {
            const log = import.meta.env.DEV ? console.error : () => { };
            log('Erro ao buscar logs de auditoria:', error);
        } finally {
            setLoading(false);
        }
    }, [eventoId, filters, pagination.limit]);

    useEffect(() => {
        fetchLogs(1);
    }, [fetchLogs]);

    const handleFilterChange = (newFilters) => {
        setFilters(prev => ({ ...prev, ...newFilters }));
    };

    return {
        logs,
        loading,
        pagination,
        filters,
        handleFilterChange,
        fetchLogs,
        eventoId
    };
};
