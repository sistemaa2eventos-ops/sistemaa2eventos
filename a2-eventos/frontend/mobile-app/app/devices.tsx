import React from 'react';
import { View, StyleSheet, ScrollView, Alert, TouchableOpacity } from 'react-native';
import { Stack } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';

import { ThemedText } from '@/components/themed-text';
import { A2Button } from '@/components/A2Button';
import { A2Card } from '@/components/A2Card';
import { A2Input } from '@/components/A2Input';
import { Colors } from '@/constants/Colors';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useDevices } from '@/hooks/useDevices';

/**
 * DeviceConfigScreen: Interface para gerenciamento de terminais externos (Intelbras/Hikvision).
 * Agora utiliza o hook useDevices para centralizar a lógica de API e estados de formulários.
 */
export default function DeviceConfigScreen() {
    const colorScheme = useColorScheme() ?? 'dark';
    const theme = Colors[colorScheme];

    const {
        devices, loading,
        name, setName,
        brand, setBrand,
        ip, setIp,
        port, setPort,
        user, setUser,
        password, setPassword,
        handleSave, handleTest, handleDelete
    } = useDevices();

    return (
        <ScrollView style={[styles.container, { backgroundColor: theme.background }]}>
            <Stack.Screen options={{
                headerTitle: 'SISTEMAS EXTERNOS',
                headerTitleStyle: { fontFamily: 'Orbitron-Bold', fontSize: 13, color: '#00D4FF' },
                headerStyle: { backgroundColor: '#050B18' },
                headerTintColor: '#00D4FF',
                headerShown: true
            }} />

            <A2Card style={styles.formCard}>
                <View style={styles.sectionHeader}>
                    <Ionicons name="add-circle-outline" size={20} color={theme.primary} />
                    <ThemedText style={styles.sectionTitle}>NOVO TERMINAL</ThemedText>
                </View>

                <ThemedText style={styles.label}>NUCLEO (MARCA)</ThemedText>
                <View style={[styles.row, { gap: 10 }]}>
                    <A2Button
                        title="INTELBRAS"
                        onPress={() => setBrand('intelbras')}
                        variant={brand === 'intelbras' ? 'primary' : 'outline'}
                        style={styles.brandButton}
                        textStyle={{ fontSize: 10 }}
                    />
                    <A2Button
                        title="HIKVISION"
                        onPress={() => setBrand('hikvision')}
                        variant={brand === 'hikvision' ? 'primary' : 'outline'}
                        style={styles.brandButton}
                        textStyle={{ fontSize: 10 }}
                    />
                </View>

                <A2Input
                    label="IDENTIFICAÇÃO DO LOCAL"
                    value={name}
                    onChangeText={setName}
                    placeholder="EX: PORTARIA SUL"
                />

                <A2Input
                    label="ENDEREÇO IP (HOST)"
                    value={ip}
                    onChangeText={setIp}
                    placeholder="0.0.0.0"
                    keyboardType="numeric"
                />

                <View style={styles.row}>
                    <View style={{ flex: 1, marginRight: 8 }}>
                        <A2Input
                            label="PORTA HTTP"
                            value={port}
                            onChangeText={setPort}
                            placeholder="80"
                            keyboardType="numeric"
                        />
                    </View>
                    <View style={{ flex: 1 }}>
                        <A2Input
                            label="USUÁRIO"
                            value={user}
                            onChangeText={setUser}
                        />
                    </View>
                </View>

                <A2Input
                    label="CHAVE DE ACESSO"
                    value={password}
                    onChangeText={setPassword}
                    secureTextEntry
                />

                <View style={styles.actions}>
                    <A2Button
                        title="EXECUTAR PING"
                        onPress={handleTest}
                        variant="outline"
                        loading={loading}
                    />
                    <A2Button
                        title="REGISTRAR TERMINAL"
                        onPress={handleSave}
                        variant="primary"
                        loading={loading}
                    />
                </View>
            </A2Card>

            <View style={styles.listSection}>
                <ThemedText style={styles.listTitle}>TERMINAIS ATIVOS</ThemedText>
                {devices.length === 0 ? (
                    <ThemedText style={styles.emptyText}>NENHUM TERMINAL REGISTRADO NESTA SESSÃO.</ThemedText>
                ) : (
                    devices.map((dev: any) => (
                        <View key={dev.id} style={styles.deviceItem}>
                            <View style={styles.deviceIndicator} />
                            <View style={styles.deviceMainInfo}>
                                <ThemedText style={styles.deviceName}>{dev.nome?.toUpperCase()}</ThemedText>
                                <ThemedText style={styles.deviceMeta}>{dev.marca?.toUpperCase()} • {dev.ip_address}</ThemedText>
                            </View>
                            <View style={styles.statusRow}>
                                <View style={[styles.statusBadge, { borderColor: dev.status === 'online' ? '#00FF88' : '#FF3366' }]}>
                                    <ThemedText style={[styles.statusText, { color: dev.status === 'online' ? '#00FF88' : '#FF3366' }]}>
                                        {dev.status?.toUpperCase() || 'OFFLINE'}
                                    </ThemedText>
                                </View>
                                <TouchableOpacity onPress={() => {
                                    Alert.alert('REMOVER', 'TEM CERTEZA QUE DESEJA EXCLUIR ESTE TERMINAL?', [
                                        { text: 'CANCELAR', style: 'cancel' },
                                        { text: 'CONFIRMAR', style: 'destructive', onPress: () => handleDelete(dev.id) }
                                    ]);
                                }}>
                                    <Ionicons name="trash-outline" size={18} color="#FF3366" />
                                </TouchableOpacity>
                            </View>
                        </View>
                    ))
                )}
            </View>
        </ScrollView>
    );
}



const styles = StyleSheet.create({
    container: { flex: 1, padding: 20 },
    formCard: { marginBottom: 32, borderWidth: 1, borderColor: 'rgba(0, 212, 255, 0.1)' },
    sectionHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 20 },
    sectionTitle: { fontFamily: 'Orbitron-Bold', fontSize: 12, color: '#00D4FF', letterSpacing: 2 },
    label: { fontSize: 10, fontFamily: 'Orbitron-Bold', color: '#90A4AE', letterSpacing: 1.5, marginBottom: 8 },
    row: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 16 },
    brandButton: { flex: 1, height: 40 },
    actions: { marginTop: 24, gap: 12 },
    listSection: { paddingBottom: 60 },
    listTitle: { fontFamily: 'Orbitron-Bold', fontSize: 12, color: '#FFFFFF', letterSpacing: 2, marginBottom: 20, paddingLeft: 4 },
    emptyText: { color: '#90A4AE', fontSize: 10, textAlign: 'center', fontFamily: 'Orbitron-Bold' },
    deviceItem: { flexDirection: 'row', alignItems: 'center', padding: 16, backgroundColor: 'rgba(255, 255, 255, 0.03)', borderRadius: 12, marginBottom: 12, borderWidth: 1, borderColor: 'rgba(255, 255, 255, 0.05)' },
    deviceIndicator: { width: 3, height: 30, backgroundColor: '#00D4FF', borderRadius: 2, marginRight: 16 },
    deviceMainInfo: { flex: 1 },
    deviceName: { fontFamily: 'Orbitron-Bold', fontSize: 13, color: '#FFFFFF' },
    deviceMeta: { fontSize: 10, color: '#90A4AE', marginTop: 2, fontWeight: '600' },
    statusRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
    statusBadge: { paddingVertical: 4, paddingHorizontal: 8, borderRadius: 4, borderWidth: 1 },
    statusText: { fontSize: 9, fontWeight: '900', letterSpacing: 1 }
});
