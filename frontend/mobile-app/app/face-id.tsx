import React, { useState, useRef } from 'react';
import { StyleSheet, View, SafeAreaView, ActivityIndicator, Alert, TouchableOpacity } from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { Stack, useRouter } from 'expo-router';
import { ThemedText } from '@/components/themed-text';
import { A2Button } from '@/components/A2Button';
import { Colors } from '@/constants/Colors';
import { useColorScheme } from '@/hooks/use-color-scheme';

export default function FaceIdScreen() {
    const [permission, requestPermission] = useCameraPermissions();
    const [processing, setProcessing] = useState(false);
    const router = useRouter();
    const colorScheme = useColorScheme() ?? 'light';
    const theme = Colors[colorScheme];
    const cameraRef = useRef<any>(null);

    if (!permission) return <View />;
    if (!permission.granted) {
        return (
            <View style={[styles.container, { backgroundColor: theme.background }]}>
                <ThemedText style={styles.message}>Precisamos da câmera para o reconhecimento facial.</ThemedText>
                <A2Button onPress={requestPermission} title="Conceder Permissão" />
            </View>
        );
    }

    const handleCapture = async () => {
        if (cameraRef.current && !processing) {
            setProcessing(true);
            try {
                // Simulação da captura e envio para o microserviço Python
                // const photo = await cameraRef.current.takePictureAsync({ base64: true });
                // Aqui enviaríamos photo.base64 para http://localhost:5000/verify

                setTimeout(() => {
                    Alert.alert('Sucesso', 'Identidade confirmada via Reconhecimento Facial!', [
                        { text: 'OK', onPress: () => router.back() }
                    ]);
                    setProcessing(false);
                }, 2000);
            } catch (error) {
                Alert.alert('Erro', 'Falha ao processar imagem facial.');
                setProcessing(false);
            }
        }
    };

    return (
        <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]}>
            <Stack.Screen options={{ title: 'Reconhecimento Facial', headerShown: true }} />

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
                    Posicione seu rosto dentro da moldura e clique no botão abaixo.
                </ThemedText>

                {processing ? (
                    <ActivityIndicator size="large" color={theme.tint} />
                ) : (
                    <A2Button
                        title="Capturar e Validar"
                        onPress={handleCapture}
                        style={styles.captureButton}
                    />
                )}
            </View>
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
    },
    message: {
        textAlign: 'center',
        padding: 24,
    },
    cameraContainer: {
        flex: 2,
        margin: 24,
        borderRadius: 200, // Tentar manter circular
        overflow: 'hidden',
        borderWidth: 4,
        borderColor: '#2196F3',
    },
    camera: {
        flex: 1,
    },
    guideOverlay: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        backgroundColor: 'rgba(0,0,0,0.2)',
    },
    faceOval: {
        width: 200,
        height: 280,
        borderRadius: 100,
        borderWidth: 2,
        borderColor: 'white',
        borderStyle: 'dashed',
    },
    controls: {
        flex: 1,
        padding: 24,
        alignItems: 'center',
        justifyContent: 'center',
    },
    instruction: {
        textAlign: 'center',
        marginBottom: 24,
        opacity: 0.8,
    },
    captureButton: {
        width: '100%',
    }
});
