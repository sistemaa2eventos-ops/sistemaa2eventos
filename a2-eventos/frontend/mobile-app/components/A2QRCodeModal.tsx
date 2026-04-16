import React from 'react';
import { Modal, StyleSheet, View } from 'react-native';
import QRCode from 'react-native-qrcode-svg';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { A2Button } from '@/components/A2Button';
import { Colors } from '@/constants/Colors';
import { useColorScheme } from '@/hooks/use-color-scheme';

interface A2QRCodeModalProps {
    visible: boolean;
    onClose: () => void;
    value: string;
    title?: string;
}

export function A2QRCodeModal({ visible, onClose, value, title = 'Meu Acesso' }: A2QRCodeModalProps) {
    const colorScheme = useColorScheme() ?? 'light';
    const theme = Colors[colorScheme];

    return (
        <Modal
            animationType="slide"
            transparent={true}
            visible={visible}
            onRequestClose={onClose}
        >
            <View style={styles.centeredView}>
                <ThemedView style={[styles.modalView, { backgroundColor: theme.card }]}>
                    <ThemedText type="subtitle" style={styles.modalTitle}>{title}</ThemedText>

                    <View style={styles.qrContainer}>
                        <QRCode
                            value={value}
                            size={200}
                            color={theme.primary}
                            backgroundColor={white}
                        />
                    </View>

                    <ThemedText style={styles.instruction}>
                        Aproxime este código do leitor para liberar seu acesso.
                    </ThemedText>

                    <A2Button
                        title="Fechar"
                        onPress={onClose}
                        variant="outline"
                        style={styles.closeButton}
                    />
                </ThemedView>
            </View>
        </Modal>
    );
}

const white = '#FFFFFF';

const styles = StyleSheet.create({
    centeredView: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        backgroundColor: 'rgba(0,0,0,0.7)',
    },
    modalView: {
        width: '85%',
        borderRadius: 24,
        padding: 32,
        alignItems: 'center',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.25,
        shadowRadius: 4,
        elevation: 5,
    },
    modalTitle: {
        marginBottom: 24,
    },
    qrContainer: {
        padding: 16,
        backgroundColor: white,
        borderRadius: 16,
        marginBottom: 24,
    },
    instruction: {
        textAlign: 'center',
        marginBottom: 32,
        opacity: 0.7,
    },
    closeButton: {
        width: '100%',
    },
});
