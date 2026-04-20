import { useState, useEffect, useCallback, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import api from '../services/api';

const log = import.meta.env.DEV ? console.log : () => {};

/**
 * useDashboard: Hook de inteligência para o painel principal do Web Admin.
 * Centraliza métricas de tempo real, fluxo 24h e logs de atividades recentes.
 */
export const useDashboard = () => {
    const [searchParams] = useSearchParams();
    const eventoId = searchParams.get('evento_id') || localStorage.getItem('active_evento_id');

    const timeoutRef = useRef(null);

    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [stats, setStats] = useState({
        total_empresas: 0, total_pessoas: 0, checkins_hoje: 0,
        checkouts_hoje: 0, presentes: 0, dispositivos_online: 0,
    });
    const [fluxData, setFluxData] = useState([]);
    const [recentCheckins, setRecentCheckins] = useState([]);
    const [recentPessoas, setRecentPessoas] = useState([]);

    const scheduleNext = useCallback(() => {
        timeoutRef.current = setTimeout(() => {
            loadDashboardData();
        }, 60000);
    }, []);

    const loadDashboardData = useCallback(async () => {
        if (!eventoId) {
            setLoading(false);
            return;
        }

        if (timeoutRef.current) clearTimeout(timeoutRef.current);

        try {
            if (!loading) setRefreshing(true);
            const response = await api.get('/monitor/dashboard', { params: { evento_id: eventoId } });
            const data = response.data.data;

            setStats({
                total_empresas: data.cards?.total_empresas || 0,
                total_pessoas: data.cards?.total_pessoas || 0,
                checkins_hoje: data.cards?.total_checkins_hoje || 0,
                checkouts_hoje: data.cards?.total_checkouts_hoje || 0,
                presentes: data.cards?.checkin || 0,
                dispositivos_online: data.cards?.dispositivos_online || 0,
            });

            setRecentCheckins(data.ultimos_checkins || []);
            setRecentPessoas(data.ultimos_adicionados || []);

            if (data.fluxo_24h?.length > 0) {
                setFluxData(data.fluxo_24h);
            } else {
                setFluxData([]);
            }
        } catch (error) {
            console.error('Erro no loadDashboardData:', error);
        } finally {
            setLoading(false);
            setRefreshing(false);
            scheduleNext();
        }
    }, [eventoId, loading, scheduleNext]);

    const refresh = () => {
        if (timeoutRef.current) clearTimeout(timeoutRef.current);
        loadDashboardData();
    };

    useEffect(() => {
        loadDashboardData();
        return () => {
            if (timeoutRef.current) clearTimeout(timeoutRef.current);
        };
    }, [eventoId]);

    // F-02: Escuta evento global de sincronização offline concluída para atualizar UI
    useEffect(() => {
        const handleGlobalRefresh = () => {
            log('Dashboard Refresh Triggered via Global Event');
            refresh();
        };

        window.addEventListener('refresh-global-data', handleGlobalRefresh);
        return () => window.removeEventListener('refresh-global-data', handleGlobalRefresh);
    }, [refresh]);

    return {
        stats, fluxData, recentCheckins, recentPessoas,
        loading, refreshing, eventoId, refresh
    };
};
