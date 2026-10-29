import { useEffect, useRef, useCallback } from 'react';
import { useSnackbar } from 'notistack';
import { usarConexao } from '../services/realtime';
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

        // Conexão compartilhada da aba (services/realtime.js)
        const socket = usarConexao();
        socket.entrarSalaAdmin();
        // Sala do evento ativo (alertas de watchlist)
        const activeEventoId = localStorage.getItem('active_evento_id') || user?.evento_id;
        socket.entrarEvento(activeEventoId);

        // Global watchlist alerts (Facial Reader / check-in)
        socket.on('watchlist_alert', (alert) => {
            if (user?.nivel_acesso !== 'admin_master') return; // watchlist sigilosa
            const targetName = alert.pessoa?.nome || 'Alvo';
            const cpf = alert.pessoa?.cpf || 'CPF não informado';
            const location = alert.area || alert.terminal || 'Leitor Facial';
            const status = alert.tipo === 'negado' ? 'Acesso Negado' : 'Acesso Liberado';

            enqueueSnackbar(`🚨 DETECÇÃO DE ALVO: ${targetName} (CPF: ${cpf}) no ${location} [${status}]`, {
                variant: 'error',
                persist: false,
                autoHideDuration: 6000,
                anchorOrigin: { vertical: 'top', horizontal: 'right' }
            });
        });

        socket.on('system:alert', (payload) => {
            // Watchlist alerts from Cameras (sala sigilosa: só Admin Master)
            if (payload.tipo === 'camera_watchlist_alert') {
                if (user?.nivel_acesso !== 'admin_master') return;
                const target = payload.detection_type === 'face'
                    ? `Alvo Monitorado: ${payload.nome} (CPF: ${payload.cpf})`
                    : `Veículo Monitorado: ${payload.plate}`;

                enqueueSnackbar(`🚨 DETECÇÃO DE WATCHLIST: ${target} na Câmera ${payload.camera_name} (${payload.location || 'Sem local'})`, {
                    variant: 'error',
                    persist: false,
                    autoHideDuration: 6000,
                    anchorOrigin: { vertical: 'top', horizontal: 'right' }
                });
                return;
            }

            // Vencimento de documentos: atualiza o sino de notificações
            if (payload.type === 'DOC_VENCIMENTO' || payload.type === 'AGENTE_OFFLINE') {
                window.dispatchEvent(new CustomEvent('a2:notificacoes-atualizadas'));
            }

            const alertList = payload.alerts || [payload];

            alertList.forEach(alert => {
                const severity = alert.severity || alert.level || 'warning';

                enqueueSnackbar(alert.message || 'Alerta de integridade do sistema!', {
                    variant: severity === 'critical' ? 'error' : (severity === 'info' ? 'info' : 'warning'),
                    persist: false,
                    autoHideDuration: 6000,
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

        return () => socket.liberar();
    }, [user?.nivel_acesso, user?.evento_id, enqueueSnackbar]);

    return null;
};
