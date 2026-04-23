import { useState, useEffect, useCallback } from 'react';
import { eventService, Event } from '@/services/eventService';
import { apiService } from '@/services/apiService';

interface DashboardStats {
    total_empresas: number;
    total_pessoas: number;
    total_checkins_hoje: number;
    total_checkouts_hoje: number;
    dispositivos_online: number;
    presentes: number;
  }

export const useDashboard = () => {
    const [nextEvent, setNextEvent] = useState<Event | null>(null);
    const [stats, setStats] = useState<DashboardStats | null>(null);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [qrVisible, setQrVisible] = useState(false);

    const loadData = useCallback(async (isRefresh = false) => {
        if (isRefresh) setRefreshing(true);
        else setLoading(true);

        try {
            const [event, dashData] = await Promise.allSettled([
                eventService.getNextEvent(),
                apiService.getDashboardStats(),
            ]);

            if (event.status === 'fulfilled') setNextEvent(event.value);
            if (dashData.status === 'fulfilled' && dashData.value?.cards) {
                setStats(dashData.value.cards as DashboardStats);
            }
        } catch (e) {
            console.error('Erro ao carregar dados do dashboard:', e);
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    }, []);

    useEffect(() => {
        loadData();
    }, [loadData]);

    return {
        nextEvent,
        stats,
        loading,
        refreshing,
        qrVisible,
        setQrVisible,
        refresh: () => loadData(true)
    };
};
