import { useState, useRef, useCallback, useEffect } from 'react';
import { Alert } from 'react-native';
import { useCameraPermissions } from 'expo-camera';
import { useRouter } from 'expo-router';
import { faceApiService } from '../services/faceApiService';
import { eventService } from '../services/eventService';

/**
 * useFaceId: Hook para captura biométrica real e verificação no backend.
 * Substitui a simulação anterior por processamento direto.
 */
export const useFaceId = () => {
    const [permission, requestPermission] = useCameraPermissions();
    const [processing, setProcessing] = useState(false);
    const cameraRef = useRef<any>(null);
    const router = useRouter();

    useEffect(() => {
        if (!permission) {
            requestPermission();
        }
    }, [permission]);

    const handleCapture = useCallback(async () => {
        if (!cameraRef.current || processing) return;

        setProcessing(true);
        try {
            // 1. Captura a foto da câmera (qualidade otimizada para biometria)
            const photo = await cameraRef.current.takePictureAsync({
                quality: 0.6,
                base64: true,
                skipProcessing: true
            });

            if (!photo.base64) {
                throw new Error('Falha ao obter imagem da câmera.');
            }

            // 2. Obtém o evento ativo para o contexto
            const event = await eventService.getActiveEventCached();
            if (!event) {
                throw new Error('Nenhum evento ativo selecionado.');
            }

            // 3. Envia para o backend A2 Node.js (Motor Biométrico)
            const result = await faceApiService.verifyFace(
                photo.base64,
                event.id,
                'mobile-app-scanner'
            );

            if (result.success && result.action === 'allow') {
                Alert.alert(
                    '📍 Acesso Permitido',
                    `Bem-vindo(a), ${result.nome}!\nIdentidade confirmada via Face ID.`,
                    [{ text: 'OK', onPress: () => router.back() }]
                );
            } else {
                Alert.alert(
                    '❌ Acesso Negado',
                    result.error || 'Identidade não reconhecida.'
                );
            }

        } catch (error: any) {
            console.error('❌ [useFaceId] Erro biometria:', error.message);
            Alert.alert('Erro', error.message || 'Falha ao processar biometria facial.');
        } finally {
            setProcessing(false);
        }
    }, [processing, router]);

    return {
        permission,
        requestPermission,
        processing,
        cameraRef,
        handleCapture,
        router
    };
};
