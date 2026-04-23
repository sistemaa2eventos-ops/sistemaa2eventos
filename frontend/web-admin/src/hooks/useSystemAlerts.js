import { useEffect } from 'react';
import { useSnackbar } from 'notistack';
import io from 'socket.io-client';
import { useAuth } from '../contexts/AuthContext';

/**
 * useSystemAlerts: Hook global para capturar alertas proativos de saúde do sistema
 * via WebSocket na sala system_admin.
 */
export const useSystemAlerts = () => {
    const { user } = useAuth();
    const { enqueueSnackbar } = useSnackbar();

    useEffect(() => {
        // Apenas Master e Admin recebem alertas de sistema
        if (!user || !['master', 'admin'].includes(user.role)) return;

        const socketUrl = (import.meta.env.VITE_API_URL || '').replace(/\/api$/, '') || window.location.origin;
        const socket = io(socketUrl, { 
            transports: ['polling', 'websocket'],
            reconnectionAttempts: 5,
            query: { token: localStorage.getItem('token') }
        });

        socket.on('connect', () => {
            console.log('🛡️ [SystemWatcher] Conectado ao Gateway de Alertas');
            socket.emit('join_system_admin');
        });

        socket.on('system:alert', (payload) => {
            console.warn('🚨 ALERTA DE SISTEMA:', payload);
            
            // O payload pode vir como um objeto com array 'alerts' ou um alerta único
            const alertList = payload.alerts || [payload];

            alertList.forEach(alert => {
                const severity = alert.severity || alert.level || 'warning';
                
                enqueueSnackbar(alert.message || 'Alerta de integridade do sistema!', { 
                    variant: severity === 'critical' ? 'error' : (severity === 'info' ? 'info' : 'warning'),
                    persist: severity === 'critical',
                    autoHideDuration: severity === 'critical' ? 10000 : 5000,
                    anchorOrigin: { vertical: 'top', horizontal: 'right' }
                });

                // Som de alerta apenas para críticos e avisos de hardware
                if (severity === 'critical' || alert.type === 'DEVICE_OFFLINE') {
                    const audio = new Audio('/assets/notification.mp3');
                    audio.play().catch(() => {});
                }
            });
        });

        socket.on('connect_error', (err) => {
            console.error('❌ [SystemWatcher] Erro de conexão:', err.message);
        });

        return () => {
            if (socket) socket.disconnect();
        };
    }, [user, enqueueSnackbar]);

    return null;
};
