import React from 'react';
import { StyleSheet, View, TouchableOpacity, SafeAreaView, Animated } from 'react-native';
import { CameraView } from 'expo-camera';
import { Stack } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';

import { ThemedText } from '@/components/themed-text';
import { A2Button } from '@/components/A2Button';
import { Colors } from '@/constants/Colors';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useScanner } from '@/hooks/useScanner';

/**
 * ScannerScreen: Interface de escaneamento de credenciais (QR Code).
 * Agora utiliza o hook useScanner para centralizar a inteligência e permissões.
 */
export default function ScannerScreen() {
    const {
        permission, requestPermission, scanned,
        isOnline, feedbackColor, feedbackText, feedbackOpacity,
        handleBarCodeScanned, router
    } = useScanner();

    const colorScheme = useColorScheme() ?? 'dark';
    const theme = Colors[colorScheme];

    if (!permission) {
        return <View style={{ flex: 1, backgroundColor: '#050B18' }} />;
    }

    if (!permission.granted) {
        return (
            <View style={[styles.container, { backgroundColor: theme.background, justifyContent: 'center', padding: 40 }]}>
                <ThemedText style={styles.message}>ACESSO À CAMERA NECESSÁRIO PARA OPERAÇÕES DE ESCANEAMENTO.</ThemedText>
                <A2Button onPress={requestPermission} title="AUTORIZAR CAMERA" />
            </View>
        );
    }

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
                barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
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
                            <View style={[styles.corner, styles.topLeft]} />
                            <View style={[styles.corner, styles.topRight]} />
                            <View style={[styles.corner, styles.bottomLeft]} />
                            <View style={[styles.corner, styles.bottomRight]} />

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

                        <TouchableOpacity style={styles.cancelButton} onPress={() => router.back()}>
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
    container: { flex: 1, backgroundColor: '#050B18' },
    message: { textAlign: 'center', padding: 40, fontFamily: 'Orbitron-Bold', fontSize: 12, color: '#90A4AE', marginBottom: 20 },
    camera: { flex: 1 },
    overlay: { flex: 1, backgroundColor: 'transparent' },
    topOverlay: { flex: 1, backgroundColor: 'rgba(5, 11, 24, 0.7)', justifyContent: 'center', alignItems: 'center', gap: 12 },
    statusBadge: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: 'rgba(0, 0, 0, 0.4)', paddingHorizontal: 16, paddingVertical: 6, borderRadius: 20, borderWidth: 1, borderColor: 'rgba(255, 255, 255, 0.1)' },
    statusDot: { width: 8, height: 8, borderRadius: 4 },
    statusText: { fontFamily: 'Orbitron-Bold', fontSize: 9, letterSpacing: 2 },
    scanText: { fontFamily: 'Orbitron-Bold', fontSize: 10, color: '#00FF88', letterSpacing: 2 },
    middleContainer: { flexDirection: 'row', height: 280 },
    sideOverlay: { flex: 1, backgroundColor: 'rgba(5, 11, 24, 0.7)' },
    focusedContainer: { width: 280, backgroundColor: 'transparent', position: 'relative' },
    bottomOverlay: { flex: 1, backgroundColor: 'rgba(5, 11, 24, 0.7)', justifyContent: 'center', alignItems: 'center', gap: 16 },
    corner: { position: 'absolute', width: 30, height: 30, borderColor: '#00D4FF' },
    topLeft: { top: 0, left: 0, borderTopWidth: 4, borderLeftWidth: 4 },
    topRight: { top: 0, right: 0, borderTopWidth: 4, borderRightWidth: 4 },
    bottomLeft: { bottom: 0, left: 0, borderBottomWidth: 4, borderLeftWidth: 4 },
    bottomRight: { bottom: 0, right: 0, borderBottomWidth: 4, borderRightWidth: 4 },
    scanLine: { height: 2, width: '100%', position: 'absolute', top: '50%', zIndex: 10 },
    feedbackBanner: { paddingHorizontal: 24, paddingVertical: 12, borderRadius: 12, borderWidth: 1, minWidth: '70%', alignItems: 'center' },
    feedbackText: { fontFamily: 'Orbitron-Bold', fontSize: 12, letterSpacing: 1, textAlign: 'center' },
    cancelButton: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: 'rgba(255, 51, 102, 0.1)', paddingHorizontal: 20, paddingVertical: 12, borderRadius: 30, borderWidth: 1, borderColor: 'rgba(255, 51, 102, 0.3)' },
    cancelText: { fontFamily: 'Orbitron-Bold', fontSize: 10, color: '#FF3366', letterSpacing: 1 }
});
