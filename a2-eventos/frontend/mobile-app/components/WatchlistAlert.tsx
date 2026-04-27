import React, { useEffect, useState } from 'react';
import { StyleSheet, View, Modal, TouchableOpacity, Image, Dimensions } from 'react-native';
import { ThemedText } from './themed-text';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { Colors } from '@/constants/Colors';
import { useColorScheme } from '@/hooks/use-color-scheme';

interface AlertData {
    id: string;
    pessoa: {
        nome: string;
        cpf: string;
        foto_url?: string;
    };
    dispositivo: string;
    timestamp: string;
}

export function WatchlistAlert() {
    const [visible, setVisible] = useState(false);
    const [alert, setAlert] = useState<AlertData | null>(null);
    const colorScheme = useColorScheme() ?? 'dark';
    
    // Simulação de WebSocket Listener (Idealmente via Socket.io ou PubSub do Supabase)
    useEffect(() => {
        // Mock de alerta para teste de auditoria se necessário
        // window.triggerMobileAlert = (data) => { setAlert(data); setVisible(true); }
    }, []);

    useEffect(() => {
        if (visible) {
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
        }
    }, [visible]);

    if (!alert) return null;

    return (
        <Modal
            visible={visible}
            transparent={true}
            animationType="slide"
        >
            <View style={styles.overlay}>
                <View style={styles.alertCard}>
                    <View style={styles.header}>
                        <Ionicons name="warning" size={32} color="#FF3366" />
                        <ThemedText style={styles.title}>ALERTA DE SEGURANÇA</ThemedText>
                    </View>

                    <View style={styles.content}>
                        <Image 
                            source={alert.pessoa.foto_url ? { uri: alert.pessoa.foto_url } : require('@/assets/images/icon.png')} 
                            style={styles.avatar}
                        />
                        <ThemedText style={styles.name}>{alert.pessoa.nome.toUpperCase()}</ThemedText>
                        <ThemedText style={styles.cpf}>CPF: {alert.pessoa.cpf}</ThemedText>
                        
                        <View style={styles.statusBox}>
                            <ThemedText style={styles.statusLabel}>ALVO DETECTADO EM:</ThemedText>
                            <ThemedText style={styles.statusValue}>{alert.dispositivo.toUpperCase()}</ThemedText>
                        </View>
                    </View>

                    <TouchableOpacity 
                        style={styles.closeBtn}
                        onPress={() => setVisible(false)}
                    >
                        <ThemedText style={styles.closeBtnText}>CIENTE / FECHAR</ThemedText>
                    </TouchableOpacity>
                </View>
            </View>
        </Modal>
    );
}

const styles = StyleSheet.create({
    overlay: {
        flex: 1,
        backgroundColor: 'rgba(0, 0, 0, 0.9)',
        justifyContent: 'center',
        alignItems: 'center',
        padding: 20,
    },
    alertCard: {
        backgroundColor: '#1A0505',
        width: '100%',
        borderRadius: 25,
        borderWidth: 2,
        borderColor: '#FF3366',
        padding: 24,
        alignItems: 'center',
        shadowColor: '#FF3366',
        shadowOffset: { width: 0, height: 0 },
        shadowOpacity: 0.5,
        shadowRadius: 15,
    },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        marginBottom: 24,
    },
    title: {
        fontFamily: 'Orbitron-Bold',
        fontSize: 16,
        color: '#FF3366',
        letterSpacing: 2,
    },
    content: {
        alignItems: 'center',
        width: '100%',
        marginBottom: 30,
    },
    avatar: {
        width: 120,
        height: 120,
        borderRadius: 20,
        borderWidth: 3,
        borderColor: '#FF3366',
        marginBottom: 16,
        backgroundColor: '#000',
    },
    name: {
        fontFamily: 'Orbitron-Bold',
        fontSize: 18,
        color: '#fff',
        textAlign: 'center',
    },
    cpf: {
        fontFamily: 'Orbitron-Medium',
        fontSize: 12,
        color: '#90A4AE',
        marginTop: 4,
    },
    statusBox: {
        backgroundColor: 'rgba(255, 51, 102, 0.1)',
        width: '100%',
        padding: 15,
        borderRadius: 12,
        marginTop: 20,
        alignItems: 'center',
    },
    statusLabel: {
        fontFamily: 'Orbitron-Medium',
        fontSize: 9,
        color: '#FF3366',
        letterSpacing: 1,
    },
    statusValue: {
        fontFamily: 'Orbitron-Bold',
        fontSize: 12,
        color: '#fff',
        marginTop: 4,
    },
    closeBtn: {
        backgroundColor: '#FF3366',
        width: '100%',
        padding: 16,
        borderRadius: 12,
        alignItems: 'center',
    },
    closeBtnText: {
        fontFamily: 'Orbitron-Bold',
        fontSize: 12,
        color: '#fff',
        letterSpacing: 2,
    }
});
