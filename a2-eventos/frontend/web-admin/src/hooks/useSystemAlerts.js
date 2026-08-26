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
            
            // Join active event room to receive watchlist alerts
            const activeEventoId = localStorage.getItem('active_evento_id') || user?.evento_id;
            if (activeEventoId) {
                socket.emit('join_event', activeEventoId);
            }
        });

        // Global watchlist alerts (Facial Reader / check-in)
        socket.on('watchlist_alert', (alert) => {
            const targetName = alert.pessoa?.nome || 'Alvo';
            const cpf = alert.pessoa?.cpf || 'CPF não informado';
            const location = alert.area || alert.terminal || 'Leitor Facial';
            const status = alert.tipo === 'negado' ? 'Acesso Negado' : 'Acesso Liberado';

            enqueueSnackbar(`🚨 DETECÇÃO DE ALVO: ${targetName} (CPF: ${cpf}) no ${location} [${status}]`, {
                variant: 'error',
                persist: true,
                anchorOrigin: { vertical: 'top', horizontal: 'right' }
            });
        });

        socket.on('system:alert', (payload) => {
            // Watchlist alerts from Cameras
            if (payload.tipo === 'camera_watchlist_alert') {
                const target = payload.detection_type === 'face'
                    ? `Alvo Monitorado: ${payload.nome} (CPF: ${payload.cpf})`
                    : `Veículo Monitorado: ${payload.plate}`;

                enqueueSnackbar(`🚨 DETECÇÃO DE WATCHLIST: ${target} na Câmera ${payload.camera_name} (${payload.location || 'Sem local'})`, {
                    variant: 'error',
                    persist: true,
                    anchorOrigin: { vertical: 'top', horizontal: 'right' }
                });
                return;
            }

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
