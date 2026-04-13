import { useState, useEffect, useRef, useCallback } from 'react';
import { Animated } from 'react-native';
import { useCameraPermissions } from 'expo-camera';
import { useRouter } from 'expo-router';
import NetInfo from '@react-native-community/netinfo';
import * as Crypto from 'expo-crypto';

import { apiService } from '@/services/apiService';
import { offlineService } from '@/services/offlineService';
import { eventService } from '@/services/eventService';

export const useScanner = () => {
    const [permission, requestPermission] = useCameraPermissions();
    const [scanned, setScanned] = useState(false);
    const [processing, setProcessing] = useState(false);
    const [isOnline, setIsOnline] = useState(true);
    const [feedbackColor, setFeedbackColor] = useState<string | null>(null);
    const [feedbackText, setFeedbackText] = useState('');
    const feedbackOpacity = useRef(new Animated.Value(0)).current;
    const router = useRouter();

    // 1. Monitorar Permissões
    useEffect(() => {
        if (!permission) {
            requestPermission();
        }
    }, [permission]);

    // 2. Monitorar Status de Rede
    useEffect(() => {
        const unsubscribe = NetInfo.addEventListener(state => {
            setIsOnline(!!(state.isConnected && state.isInternetReachable !== false));
        });
        return () => unsubscribe();
    }, []);

    // 3. Feedback Visual
    const showFeedback = useCallback((color: string, text: string, durationMs: number = 2000) => {
        setFeedbackColor(color);
        setFeedbackText(text);
        Animated.sequence([
            Animated.timing(feedbackOpacity, { toValue: 1, duration: 200, useNativeDriver: true }),
            Animated.delay(durationMs),
            Animated.timing(feedbackOpacity, { toValue: 0, duration: 300, useNativeDriver: true }),
        ]).start(() => {
            setFeedbackColor(null);
            setFeedbackText('');
        });
    }, [feedbackOpacity]);

    // 4. Lógica de Processamento do Scan (Online/Offline)
    const handleBarCodeScanned = async ({ type, data }: { type: string; data: string }) => {
        if (processing) return;
        setScanned(true);
        setProcessing(true);

        if (isOnline) {
            // ----- MODO ONLINE -----
            try {
                const employee = await apiService.validateQRCode(data);
                showFeedback('#00FF88', `✓ ${employee.nome}`, 1500);

                setTimeout(() => {
                    router.push(`/employee/${employee.id}` as any);
                    setScanned(false);
                    setProcessing(false);
                }, 500);

            } catch (error: any) {
                showFeedback('#FF3366', `✗ ${error.message || 'ERRO'}`, 2500);
                setTimeout(() => {
                    setScanned(false);
                    setProcessing(false);
                }, 2500);
            }
        } else {
            // ----- MODO OFFLINE -----
            try {
                const cachedEvent = await eventService.getActiveEventCached();
                if (!cachedEvent) {
                    showFeedback('#FF3366', '✗ SEM EVENTO ATIVO NO CACHE', 2500);
                    setTimeout(() => { setScanned(false); setProcessing(false); }, 2500);
                    return;
                }

                // Buscar pessoa no SQLite pelo QR Code
                const pessoa = await offlineService.findPessoaByQRCode(data, cachedEvent.id);

                if (!pessoa) {
                    showFeedback('#FF3366', '✗ QR NÃO ENCONTRADO NO CACHE LOCAL', 2500);
                    setTimeout(() => { setScanned(false); setProcessing(false); }, 2500);
                    return;
                }

                const p = pessoa as any;
                const tipo = p.status_acesso === 'checkin' ? 'checkout' : 'checkin';
                const syncId = Crypto.randomUUID();

                // Enfileirar na sync_queue e atualizar status local
                await offlineService.enqueueAction({
                    sync_id: syncId,
                    pessoa_id: p.id,
                    evento_id: cachedEvent.id,
                    tipo: tipo,
                    metodo: 'qrcode',
                    dispositivo_id: 'mobile-offline',
                    offline_timestamp: new Date().toISOString()
                });

                const statusLabel = tipo === 'checkin' ? 'CHECK-IN' : 'CHECK-OUT';
                showFeedback('#FFB800', `⏳ ${statusLabel} OFFLINE: ${p.nome}`, 2000);

                setTimeout(() => {
                    setScanned(false);
                    setProcessing(false);
                }, 2000);

            } catch (error: any) {
                console.error('Erro no modo offline:', error);
                showFeedback('#FF3366', '✗ ERRO NO MODO OFFLINE', 2500);
                setTimeout(() => { setScanned(false); setProcessing(false); }, 2500);
            }
        }
    };

    return {
        permission,
        requestPermission,
        scanned,
        setScanned,
        processing,
        isOnline,
        feedbackColor,
        feedbackText,
        feedbackOpacity,
        handleBarCodeScanned,
        router
    };
};
