import React, { useState, useEffect, useRef } from 'react';
import { StyleSheet, Text, View, TouchableOpacity, SafeAreaView, Alert, Animated } from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { Stack, useRouter } from 'expo-router';
import { ThemedText } from '@/components/themed-text';
import { A2Button } from '@/components/A2Button';
import { Colors } from '@/constants/Colors';
import { useColorScheme } from '@/hooks/use-color-scheme';

import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import NetInfo from '@react-native-community/netinfo';
import * as Crypto from 'expo-crypto';

import { apiService } from '@/services/apiService';
import { offlineService } from '@/services/offlineService';
import { eventService } from '@/services/eventService';

/**
 * CIRURGIA 5: Scanner dual-mode (Online/Offline)
 * - Online: Valida QR no backend e navega para detalhes
 * - Offline: Busca no SQLite local, faz checkin local, enfileira sync
 * - Feedback visual instantâneo: verde (OK), vermelho (erro), amarelo (offline queued)
 */
export default function ScannerScreen() {
    const [permission, requestPermission] = useCameraPermissions();
    const [scanned, setScanned] = useState(false);
    const [processing, setProcessing] = useState(false);
    const [isOnline, setIsOnline] = useState(true);
    const [feedbackColor, setFeedbackColor] = useState<string | null>(null);
    const [feedbackText, setFeedbackText] = useState('');
    const feedbackOpacity = useRef(new Animated.Value(0)).current;
    const router = useRouter();
    const colorScheme = useColorScheme() ?? 'dark';
    const theme = Colors[colorScheme];

    useEffect(() => {
        if (!permission) {
            requestPermission();
        }
    }, [permission]);

    // Escutar status de rede
    useEffect(() => {
        const unsubscribe = NetInfo.addEventListener(state => {
            setIsOnline(!!(state.isConnected && state.isInternetReachable !== false));
        });
        return () => unsubscribe();
    }, []);

    // Mostrar feedback visual temporário
    const showFeedback = (color: string, text: string, durationMs: number = 2000) => {
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
    };

    if (!permission) {
        return <View style={{ flex: 1, backgroundColor: '#050B18' }} />;
    }

    if (!permission.granted) {
        return (
            <View style={[styles.container, { backgroundColor: theme.background }]}>
                <ThemedText style={styles.message}>ACESSO À CAMERA NECESSÁRIO PARA OPERAÇÕES DE ESCANEAMENTO.</ThemedText>
                <A2Button onPress={requestPermission} title="AUTORIZAR CAMERA" />
            </View>
        );
    }

    const handleBarCodeScanned = async ({ type, data }: { type: string; data: string }) => {
        if (processing) return;
        setScanned(true);
        setProcessing(true);

        if (isOnline) {
            // ===== MODO ONLINE =====
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
            // ===== MODO OFFLINE =====
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

                // Determinar ação: se está checkout → checkin, se está checkin → checkout
                const tipo = p.status_acesso === 'checkin' ? 'checkout' : 'checkin';

                // Gerar ID único para deduplicação
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

                // Feedback amarelo (offline queued)
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

    return (
        <SafeAreaView style={styles.container}>
            <Stack.Screen options={{
                headerTitle: 'SCANNER DE CREDENCIAIS',
                headerTitleStyle: { fontFamily: 'Orbitron-Bold', fontSize: 12, color: '#00D4FF' },
                headerStyle: { backgroundColor: '#050B18' },
                headerTintColor: '#00D4FF',
                headerShown: true
            }} />

            <CameraView
                style={styles.camera}
                onBarcodeScanned={scanned ? undefined : handleBarCodeScanned}
                barcodeScannerSettings={{
                    barcodeTypes: ['qr'],
                }}
            >
                <View style={styles.overlay}>
                    <View style={styles.topOverlay}>
                        {/* Indicador Online/Offline */}
                        <View style={styles.statusBadge}>
                            <View style={[styles.statusDot, { backgroundColor: isOnline ? '#00FF88' : '#FFB800' }]} />
                            <ThemedText style={[styles.statusText, { color: isOnline ? '#00FF88' : '#FFB800' }]}>
                                {isOnline ? 'ONLINE' : 'MODO OFFLINE'}
                            </ThemedText>
                        </View>
                        <ThemedText style={styles.scanText}>AGUARDANDO QR CODE...</ThemedText>
                    </View>

                    <View style={styles.middleContainer}>
                        <View style={styles.sideOverlay} />
                        <View style={styles.focusedContainer}>
                            {/* Corner Borders */}
                            <View style={[styles.corner, styles.topLeft]} />
                            <View style={[styles.corner, styles.topRight]} />
                            <View style={[styles.corner, styles.bottomLeft]} />
                            <View style={[styles.corner, styles.bottomRight]} />

                            {/* Scan Line */}
                            <LinearGradient
                                colors={['transparent', isOnline ? '#00FF88' : '#FFB800', 'transparent']}
                                style={styles.scanLine}
                            />
                        </View>
                        <View style={styles.sideOverlay} />
                    </View>

                    <View style={styles.bottomOverlay}>
                        {/* Feedback visual instantâneo */}
                        {feedbackColor && (
                            <Animated.View style={[styles.feedbackBanner, { backgroundColor: feedbackColor + '22', borderColor: feedbackColor, opacity: feedbackOpacity }]}>
                                <ThemedText style={[styles.feedbackText, { color: feedbackColor }]}>
                                    {feedbackText}
                                </ThemedText>
                            </Animated.View>
                        )}

                        <TouchableOpacity
                            style={styles.cancelButton}
                            onPress={() => router.back()}
                        >
                            <Ionicons name="close-circle-outline" size={24} color="#FF3366" />
                            <ThemedText style={styles.cancelText}>CANCELAR OPERAÇÃO</ThemedText>
                        </TouchableOpacity>
                    </View>
                </View>
            </CameraView>
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#050B18',
    },
    message: {
        textAlign: 'center',
        padding: 40,
        fontFamily: 'Orbitron-Bold',
        fontSize: 12,
        color: '#90A4AE',
        letterSpacing: 1.5,
    },
    camera: {
        flex: 1,
    },
    overlay: {
        flex: 1,
        backgroundColor: 'transparent',
    },
    topOverlay: {
        flex: 1,
        backgroundColor: 'rgba(5, 11, 24, 0.7)',
        justifyContent: 'center',
        alignItems: 'center',
        gap: 12,
    },
    statusBadge: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        backgroundColor: 'rgba(0, 0, 0, 0.4)',
        paddingHorizontal: 16,
        paddingVertical: 6,
        borderRadius: 20,
        borderWidth: 1,
        borderColor: 'rgba(255, 255, 255, 0.1)',
    },
    statusDot: {
        width: 8,
        height: 8,
        borderRadius: 4,
    },
    statusText: {
        fontFamily: 'Orbitron-Bold',
        fontSize: 9,
        letterSpacing: 2,
    },
    scanText: {
        fontFamily: 'Orbitron-Bold',
        fontSize: 10,
        color: '#00FF88',
        letterSpacing: 2,
    },
    middleContainer: {
        flexDirection: 'row',
        height: 280,
    },
    sideOverlay: {
        flex: 1,
        backgroundColor: 'rgba(5, 11, 24, 0.7)',
    },
    focusedContainer: {
        width: 280,
        backgroundColor: 'transparent',
        position: 'relative',
    },
    bottomOverlay: {
        flex: 1,
        backgroundColor: 'rgba(5, 11, 24, 0.7)',
        justifyContent: 'center',
        alignItems: 'center',
        gap: 16,
    },
    corner: {
        position: 'absolute',
        width: 30,
        height: 30,
        borderColor: '#00D4FF',
    },
    topLeft: {
        top: 0,
        left: 0,
        borderTopWidth: 4,
        borderLeftWidth: 4,
    },
    topRight: {
        top: 0,
        right: 0,
        borderTopWidth: 4,
        borderRightWidth: 4,
    },
    bottomLeft: {
        bottom: 0,
        left: 0,
        borderBottomWidth: 4,
        borderLeftWidth: 4,
    },
    bottomRight: {
        bottom: 0,
        right: 0,
        borderBottomWidth: 4,
        borderRightWidth: 4,
    },
    scanLine: {
        height: 2,
        width: '100%',
        position: 'absolute',
        top: '50%',
        zIndex: 10,
    },
    feedbackBanner: {
        paddingHorizontal: 24,
        paddingVertical: 12,
        borderRadius: 12,
        borderWidth: 1,
        minWidth: '70%',
        alignItems: 'center',
    },
    feedbackText: {
        fontFamily: 'Orbitron-Bold',
        fontSize: 12,
        letterSpacing: 1,
        textAlign: 'center',
    },
    cancelButton: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
        backgroundColor: 'rgba(255, 51, 102, 0.1)',
        paddingHorizontal: 20,
        paddingVertical: 12,
        borderRadius: 30,
        borderWidth: 1,
        borderColor: 'rgba(255, 51, 102, 0.3)',
    },
    cancelText: {
        fontFamily: 'Orbitron-Bold',
        fontSize: 10,
        color: '#FF3366',
        letterSpacing: 1,
    }
});
