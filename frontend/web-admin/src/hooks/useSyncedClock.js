import { useState, useEffect } from 'react';
import timeSyncService from '../services/timeSyncService';

/**
 * Hook para relógio em tempo real sincronizado de forma atômica entre todas as telas.
 * Respeita a geolocalização do operador e compensa drift de relógio com o servidor.
 */
export const useSyncedClock = () => {
    const [currentTime, setCurrentTime] = useState(() => 
        timeSyncService.formatTime(timeSyncService.getSyncedDate())
    );
    const [currentDate, setCurrentDate] = useState(() => 
        timeSyncService.formatDateTime(timeSyncService.getSyncedDate()).split(' ')[0]
    );
    const [syncState, setSyncState] = useState(() => ({
        timezone: timeSyncService.timezone,
        label: timeSyncService.timezoneLabel,
        isSynced: timeSyncService.isSynced
    }));

    useEffect(() => {
        // Atualização a cada segundo sincronizada com o início do segundo do relógio
        const tick = () => {
            const now = timeSyncService.getSyncedDate();
            setCurrentTime(timeSyncService.formatTime(now));
            setCurrentDate(timeSyncService.formatDateTime(now).split(' ')[0]);
        };

        const unsubscribe = timeSyncService.subscribe(state => {
            setSyncState({
                timezone: state.timezone,
                label: state.label,
                isSynced: state.isSynced
            });
        });

        // Alinhar o próximo tick com a virada do milissegundo do segundo atual
        const nowMs = Date.now();
        const delayToNextSecond = 1000 - (nowMs % 1000);

        let intervalId;
        const timeoutId = setTimeout(() => {
            tick();
            intervalId = setInterval(tick, 1000);
        }, delayToNextSecond);

        return () => {
            clearTimeout(timeoutId);
            if (intervalId) clearInterval(intervalId);
            unsubscribe();
        };
    }, []);

    return {
        currentTime,
        currentDate,
        timezone: syncState.timezone,
        timezoneLabel: syncState.label,
        isSynced: syncState.isSynced,
        formatTime: (d) => timeSyncService.formatTime(d),
        formatDateTime: (d) => timeSyncService.formatDateTime(d),
        getSyncedDate: () => timeSyncService.getSyncedDate()
    };
};

export default useSyncedClock;
