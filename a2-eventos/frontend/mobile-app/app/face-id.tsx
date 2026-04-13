import React from 'react';
import { StyleSheet, View, SafeAreaView, ActivityIndicator } from 'react-native';
import { CameraView } from 'expo-camera';
import { Stack } from 'expo-router';

import { ThemedText } from '@/components/themed-text';
import { A2Button } from '@/components/A2Button';
import { Colors } from '@/constants/Colors';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useFaceId } from '@/hooks/useFaceId';

/**
 * FaceIdScreen: Interface de validação biométrica via câmera frontal.
 * Agora utiliza o hook useFaceId para centralizar permissões e processamento de imagem.
 */
export default function FaceIdScreen() {
    const colorScheme = useColorScheme() ?? 'dark';
    const theme = Colors[colorScheme];

    const {
        permission, requestPermission, processing,
        cameraRef, handleCapture
    } = useFaceId();

    if (!permission) {
        return <View style={{ flex: 1, backgroundColor: '#050B18' }} />;
    }

    if (!permission.granted) {
        return (
            <View style={[styles.container, { backgroundColor: theme.background, justifyContent: 'center', padding: 40 }]}>
                <ThemedText style={styles.message}>PRECISAMOS DA CÂMERA PARA O RECONHECIMENTO FACIAL.</ThemedText>
                <A2Button onPress={requestPermission} title="CONCEDER PERMISSÃO" />
            </View>
        );
    }

    return (
        <SafeAreaView style={[styles.container, { backgroundColor: '#050B18' }]}>
            <Stack.Screen options={{
                headerTitle: 'VALIDAÇÃO BIOMÉTRICA',
                headerTitleStyle: { fontFamily: 'Orbitron-Bold', fontSize: 13, color: '#00D4FF' },
                headerStyle: { backgroundColor: '#050B18' },
                headerTintColor: '#00D4FF',
                headerShown: true
            }} />

            <View style={styles.cameraContainer}>
                <CameraView
                    ref={cameraRef}
                    style={styles.camera}
                    facing="front"
                >
                    <View style={styles.guideOverlay}>
                        <View style={styles.faceOval} />
                    </View>
                </CameraView>
            </View>

            <View style={styles.controls}>
                <ThemedText style={styles.instruction}>
                    POSICIONE SEU ROSTO DENTRO DA MOLDURA E CLIQUE NO BOTÃO ABAIXO.
                </ThemedText>

                {processing ? (
                    <ActivityIndicator size="large" color="#00D4FF" />
                ) : (
                    <A2Button
                        title="CAPTURAR E VALIDAR"
                        onPress={handleCapture}
                        style={styles.captureButton}
                    />
                )}
            </View>
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1 },
    message: { textAlign: 'center', padding: 24, fontSize: 12, fontFamily: 'Orbitron-Bold', color: '#90A4AE' },
    cameraContainer: {
        flex: 2,
        margin: 24,
        borderRadius: 200,
        overflow: 'hidden',
        borderWidth: 4,
        borderColor: '#00D4FF',
    },
    camera: { flex: 1 },
    guideOverlay: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        backgroundColor: 'rgba(5, 11, 24, 0.4)',
    },
    faceOval: {
        width: 220,
        height: 280,
        borderRadius: 110,
        borderWidth: 2,
        borderColor: '#00D4FF',
        borderStyle: 'dashed',
    },
    controls: {
        flex: 1,
        padding: 40,
        alignItems: 'center',
        justifyContent: 'center',
    },
    instruction: {
        textAlign: 'center',
        marginBottom: 24,
        fontSize: 10,
        fontFamily: 'Orbitron-Bold',
        letterSpacing: 1.5,
        color: '#FFFFFF'
    },
    captureButton: { width: '100%' }
});
