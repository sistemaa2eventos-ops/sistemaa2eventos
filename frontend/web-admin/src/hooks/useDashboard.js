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
    const isMountedRef = useRef(true);

    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [resetting, setResetting] = useState(false);
    const [stats, setStats] = useState({
        total_empresas: 0, total_pessoas: 0, checkins_hoje: 0,
        checkouts_hoje: 0, presentes: 0, capacidade: 0,
        negados_hoje: 0, fiscalizacoes_hoje: 0, dispositivos_online: 0,
    });
    const [empresasMetricas, setEmpresasMetricas] = useState([]);
    const [terminaisLista, setTerminaisLista] = useState([]);
    const [fluxData, setFluxData] = useState([]);
    const [recentCheckins, setRecentCheckins] = useState([]);
    const [recentPessoas, setRecentPessoas] = useState([]);

    const loadDashboardData = useCallback(async (isManualRefresh = false) => {
        if (!eventoId) {
            if (isMountedRef.current) setLoading(false);
            return;
        }

        if (timeoutRef.current) clearTimeout(timeoutRef.current);

        try {
            if (isManualRefresh && isMountedRef.current) {
                setRefreshing(true);
            }

            const [response, realtimeResp] = await Promise.all([
                api.get('/monitor/dashboard', { params: { evento_id: eventoId } }),
                api.get('/access/stats/realtime', { params: { evento_id: eventoId } }).catch(() => ({ data: { data: {} } }))
            ]);

            if (!isMountedRef.current) return;

            const data = response.data?.data || {};
            const rt = realtimeResp.data?.data || {};

            setStats({
                total_empresas: data.cards?.total_empresas || 0,
                total_pessoas: data.cards?.total_pessoas || 0,
                checkins_hoje: rt.checkins_hoje !== undefined ? rt.checkins_hoje : (data.cards?.total_checkins_hoje || 0),
                checkouts_hoje: rt.checkouts_hoje !== undefined ? rt.checkouts_hoje : (data.cards?.total_checkouts_hoje || 0),
                presentes: rt.presentes !== undefined ? rt.presentes : (data.cards?.checkin || 0),
                capacidade: rt.capacidade || 0,
                negados_hoje: rt.negados_hoje || 0,
                fiscalizacoes_hoje: rt.fiscalizacoes_hoje || 0,
                dispositivos_online: data.cards?.dispositivos_online || 0,
            });

            setEmpresasMetricas(data.empresas_metricas || []);
            setTerminaisLista(data.terminais_lista || []);
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
            if (isMountedRef.current) {
                setLoading(false);
                setRefreshing(false);
                timeoutRef.current = setTimeout(() => {
                    loadDashboardData();
                }, 60000);
            }
        }
    }, [eventoId]);

    const refresh = useCallback(() => {
        if (timeoutRef.current) clearTimeout(timeoutRef.current);
        return loadDashboardData(true);
    }, [loadDashboardData]);

    const handleDailyReset = useCallback(async () => {
        if (!eventoId) return;
        try {
            setResetting(true);
            await api.post('/monitor/dashboard/reset-diario', { evento_id: eventoId });
            await refresh();
        } catch (error) {
            console.error('Erro no reset diário:', error);
        } finally {
            if (isMountedRef.current) {
                setResetting(false);
            }
        }
    }, [eventoId, refresh]);

    useEffect(() => {
        isMountedRef.current = true;
        loadDashboardData();

        return () => {
            isMountedRef.current = false;
            if (timeoutRef.current) clearTimeout(timeoutRef.current);
        };
    }, [loadDashboardData]);

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
        stats, empresasMetricas, terminaisLista, fluxData, recentCheckins, recentPessoas,
        loading, refreshing, resetting, eventoId, refresh, handleDailyReset
    };
};
