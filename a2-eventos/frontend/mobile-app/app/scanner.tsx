import React, { useState } from 'react';
import { StyleSheet, View, TouchableOpacity, SafeAreaView, Animated, Modal, TextInput } from 'react-native';
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
 * Adicionado suporte para verificação manual de Pulseiras/Seriais.
 */
export default function ScannerScreen() {
    const {
        permission, requestPermission, scanned,
        isOnline, feedbackColor, feedbackText, feedbackOpacity,
        handleBarCodeScanned, handleBraceletCheck, router
    } = useScanner();

    const [braceletModal, setBraceletModal] = useState(false);
    const [braceletSerial, setBraceletSerial] = useState('');

    const colorScheme = useColorScheme() ?? 'dark';
    const theme = Colors[colorScheme];

    const confirmBracelet = () => {
        handleBraceletCheck(braceletSerial);
        setBraceletSerial('');
        setBraceletModal(false);
    };

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
                headerTitle: 'SCANNER NEXUS',
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
                        <View style={styles.statusBadge}>
                            <View style={[styles.statusDot, { backgroundColor: isOnline ? '#00FF88' : '#FFB800' }]} />
                            <ThemedText style={[styles.statusText, { color: isOnline ? '#00FF88' : '#FFB800' }]}>
                                {isOnline ? 'ONLINE' : 'MODO OFFLINE'}
                            </ThemedText>
                        </View>
                        <ThemedText style={styles.scanText}>RODANDO VARREDURA DE QR CODE...</ThemedText>
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
                        {feedbackColor && (
                            <Animated.View style={[styles.feedbackBanner, { backgroundColor: feedbackColor + '22', borderColor: feedbackColor, opacity: feedbackOpacity }]}>
                                <ThemedText style={[styles.feedbackText, { color: feedbackColor }]}>
                                    {feedbackText}
                                </ThemedText>
                            </Animated.View>
                        )}

                        <View style={styles.controlsRow}>
                            <TouchableOpacity style={styles.secondaryBtn} onPress={() => setBraceletModal(true)}>
                                <Ionicons name="barcode-outline" size={20} color="#00D4FF" />
                                <ThemedText style={styles.secondaryBtnText}>PULSEIRA</ThemedText>
                            </TouchableOpacity>

                            <TouchableOpacity style={styles.cancelButton} onPress={() => router.back()}>
                                <Ionicons name="close-circle-outline" size={20} color="#FF3366" />
                                <ThemedText style={styles.cancelText}>FECHAR</ThemedText>
                            </TouchableOpacity>
                        </View>
                    </View>
                </View>
            </CameraView>

            {/* Modal de Validação de Pulseira */}
            <Modal visible={braceletModal} transparent animationType="fade">
                <View style={styles.modalOverlay}>
                    <View style={styles.modalContent}>
                        <ThemedText style={styles.modalTitle}>VALIDADOR DE PULSEIRA</ThemedText>
                        <ThemedText style={styles.modalSubtitle}>DIGITE O NÚMERO DE SÉRIE PARA AUDITORIA</ThemedText>
                        
                        <TextInput
                            style={styles.serialInput}
                            placeholder="EX: PNZ-2024-XXXX"
                            placeholderTextColor="#546E7A"
                            value={braceletSerial}
                            onChangeText={setBraceletSerial}
                            autoFocus
                            autoCapitalize="characters"
                        />

                        <View style={styles.modalButtons}>
                            <TouchableOpacity style={styles.modalClose} onPress={() => setBraceletModal(false)}>
                                <ThemedText style={styles.modalCloseText}>VOLTAR</ThemedText>
                            </TouchableOpacity>
                            <TouchableOpacity style={styles.modalConfirm} onPress={confirmBracelet}>
                                <ThemedText style={styles.modalConfirmText}>VERIFICAR</ThemedText>
                            </TouchableOpacity>
                        </View>
                    </View>
                </View>
            </Modal>
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
    controlsRow: { flexDirection: 'row', gap: 12 },
    secondaryBtn: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: 'rgba(0, 212, 255, 0.1)', paddingHorizontal: 20, paddingVertical: 12, borderRadius: 30, borderWidth: 1, borderColor: 'rgba(0, 212, 255, 0.3)' },
    secondaryBtnText: { fontFamily: 'Orbitron-Bold', fontSize: 10, color: '#00D4FF', letterSpacing: 1 },
    cancelButton: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: 'rgba(255, 51, 102, 0.1)', paddingHorizontal: 20, paddingVertical: 12, borderRadius: 30, borderWidth: 1, borderColor: 'rgba(255, 51, 102, 0.3)' },
    cancelText: { fontFamily: 'Orbitron-Bold', fontSize: 10, color: '#FF3366', letterSpacing: 1 },
    modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.85)', justifyContent: 'center', padding: 30 },
    modalContent: { backgroundColor: '#0A1628', borderRadius: 20, padding: 30, borderWIdth: 1, borderColor: '#00D4FF', alignItems: 'center' },
    modalTitle: { fontFamily: 'Orbitron-Bold', fontSize: 16, color: '#00D4FF', marginBottom: 10 },
    modalSubtitle: { fontFamily: 'Orbitron-Regular', fontSize: 10, color: '#90A4AE', textAlign: 'center', marginBottom: 20 },
    serialInput: { width: '100%', backgroundColor: 'rgba(255,255,255,0.05)', borderRadius: 10, padding: 15, color: '#fff', fontFamily: 'Orbitron-Bold', fontSize: 16, textAlign: 'center', borderWIdth: 1, borderColor: 'rgba(0,212,255,0.2)', marginBottom: 20 },
    modalButtons: { flexDirection: 'row', gap: 15 },
    modalClose: { flex: 1, padding: 15, alignItems: 'center', backgroundColor: 'rgba(144, 164, 174, 0.1)', borderRadius: 10 },
    modalCloseText: { fontFamily: 'Orbitron-Bold', fontSize: 10, color: '#90A4AE' },
    modalConfirm: { flex: 2, padding: 15, alignItems: 'center', backgroundColor: '#00D4FF', borderRadius: 10 },
    modalConfirmText: { fontFamily: 'Orbitron-Bold', fontSize: 10, color: '#050B18' }
});
