import { useState, useEffect, useCallback } from 'react';
import { offlineService } from '@/services/offlineService';
import { SyncManager } from '@/services/SyncManager';
import NetInfo from '@react-native-community/netinfo';

export const useOfflineSync = () => {
    const [pendingCount, setPendingCount] = useState(0);
    const [isSyncing, setIsSyncing] = useState(false);
    const [lastSyncTime, setLastSyncTime] = useState<Date | null>(null);

    const updatePendingCount = useCallback(async () => {
        try {
            const actions = await offlineService.getPendingActions();
            setPendingCount(actions.length);
        } catch (error) {
            console.error('Erro ao buscar contagem offline:', error);
        }
    }, []);

    const forceSync = useCallback(async () => {
        if (SyncManager.isSyncing) return;
        setIsSyncing(true);
        try {
            await SyncManager.syncPendingActions();
            await updatePendingCount();
            setLastSyncTime(new Date());
        } catch (error) {
            console.error('Erro no checkout forçado:', error);
        } finally {
            setIsSyncing(false);
        }
    }, [updatePendingCount]);

    useEffect(() => {
        // Inicializar contagem
        updatePendingCount();

        // Monitorar mudanças na rede para disparar sync ou atualizar UI
        const unsubscribe = NetInfo.addEventListener(state => {
            if (state.isConnected && state.isInternetReachable !== false) {
                forceSync();
            }
            updatePendingCount();
        });

        // Polling de contagem (opcional, para refletir inserções feitas em outras telas)
        const interval = setInterval(updatePendingCount, 5000);

        return () => {
            unsubscribe();
            clearInterval(interval);
        };
    }, [forceSync, updatePendingCount]);

    return {
        pendingCount,
        isSyncing: isSyncing || SyncManager.isSyncing,
        lastSyncTime,
        forceSync,
        refreshCount: updatePendingCount
    };
};
