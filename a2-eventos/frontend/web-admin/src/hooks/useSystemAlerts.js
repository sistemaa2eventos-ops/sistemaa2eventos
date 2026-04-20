import { useEffect, useRef, useCallback } from 'react';
import { useSnackbar } from 'notistack';
import io from 'socket.io-client';
import { useAuth } from '../contexts/AuthContext';

/**
 * useSystemAlerts: Hook global para capturar alertas proativos de saúde do sistema
 * via WebSocket na sala system_admin.
 */
export const useSystemAlerts = () => {
    const { user } = useAuth();
    const { enqueueSnackbar: _enqueueSnackbar } = useSnackbar();

    // Ref estável para enqueueSnackbar — evita invalidar o useEffect a cada render
    const snackRef = useRef(_enqueueSnackbar);
    snackRef.current = _enqueueSnackbar;
    const enqueueSnackbar = useCallback((...args) => snackRef.current(...args), []);

    useEffect(() => {
        // Apenas admin_master recebe alertas de sistema
        const role = user?.nivel_acesso;
        if (!role || !['admin_master', 'admin'].includes(role)) return;

        const token = sessionStorage.getItem('token') || localStorage.getItem('token');
        if (!token) return;

        const socketUrl = (import.meta.env.VITE_API_URL || '').replace(/\/api$/, '') || window.location.origin;
        const socket = io(socketUrl, {
            transports: ['polling', 'websocket'],
            reconnectionAttempts: 5,
            auth: { token }
        });

        socket.on('connect', () => {
            socket.emit('join_system_admin');
        });

        socket.on('system:alert', (payload) => {
            const alertList = payload.alerts || [payload];

            alertList.forEach(alert => {
                const severity = alert.severity || alert.level || 'warning';

                enqueueSnackbar(alert.message || 'Alerta de integridade do sistema!', {
                    variant: severity === 'critical' ? 'error' : (severity === 'info' ? 'info' : 'warning'),
                    persist: severity === 'critical',
                    autoHideDuration: severity === 'critical' ? 10000 : 5000,
                    anchorOrigin: { vertical: 'top', horizontal: 'right' }
                });

                if (severity === 'critical' || alert.type === 'DEVICE_OFFLINE') {
                    const audio = new Audio('/assets/notification.mp3');
                    audio.play().catch(() => {});
                }
            });
        });

        socket.on('connect_error', (err) => {
            if (import.meta.env.DEV) console.error('[SystemWatcher] Erro de conexão:', err.message);
        });

        return () => socket.disconnect();
    }, [user?.nivel_acesso, enqueueSnackbar]);

    return null;
};
