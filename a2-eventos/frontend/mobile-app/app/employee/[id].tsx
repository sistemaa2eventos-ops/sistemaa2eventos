import React from 'react';
import { StyleSheet, View, ScrollView, Image, ActivityIndicator, TextInput, Alert } from 'react-native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';

import { ThemedText } from '@/components/themed-text';
import { A2Button } from '@/components/A2Button';
import { Colors } from '@/constants/Colors';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useEmployee } from '@/hooks/useEmployee';

/**
 * EmployeeDetailScreen: Tela de identificação e check-in manual do colaborador.
 * Agora utiliza o hook useEmployee para lidar com a persistência híbrida e rede.
 */
export default function EmployeeDetailScreen() {
    const { id } = useLocalSearchParams();
    const router = useRouter();
    const colorScheme = useColorScheme() ?? 'dark';
    const theme = Colors[colorScheme];

    const {
        employee, loading, saving, pulseira, setPulseira,
        dataSource, isOnline, assignPulseira, executeCheckin
    } = useEmployee(id as string, router);

    if (loading || !employee) {
        return (
            <View style={[styles.container, { justifyContent: 'center', alignItems: 'center' }]}>
                <ActivityIndicator size="large" color="#00D4FF" />
            </View>
        );
    }

    return (
        <ScrollView style={styles.container}>
            <Stack.Screen options={{
                headerTitle: 'IDENTIFICAÇÃO',
                headerTitleStyle: { fontFamily: 'Orbitron-Bold', fontSize: 13, color: '#00D4FF' },
                headerStyle: { backgroundColor: '#050B18' },
                headerTintColor: '#00D4FF',
                headerShown: true
            }} />

            <View style={styles.content}>
                {/* Data Source Badge */}
                {dataSource === 'offline' && (
                    <View style={styles.offlineBadge}>
                        <View style={styles.statusDot} />
                        <ThemedText style={styles.offlineLabel}>DADOS DO CACHE OFFLINE</ThemedText>
                    </View>
                )}

                <View style={styles.card}>
                    <View style={styles.cardHeader}>
                        <Image
                            source={employee.foto_url ? { uri: employee.foto_url } : require('@/assets/images/icon.png')}
                            style={styles.photo}
                        />
                        <View style={styles.headerInfo}>
                            <ThemedText style={styles.name}>{employee.nome?.toUpperCase()}</ThemedText>
                            <ThemedText style={styles.company}>{employee.empresas?.nome || 'ENTIDADE NÃO DEFINIDA'}</ThemedText>
                            <View style={styles.badge}>
                                <ThemedText style={styles.badgeText}>{employee.funcao?.toUpperCase() || 'PARTICIPANTE'}</ThemedText>
                            </View>
                        </View>
                    </View>

                    <View style={styles.divider} />

                    <View style={styles.details}>
                        <View style={styles.detailRow}>
                            <Ionicons name="card-outline" size={16} color="#00D4FF" />
                            <ThemedText style={styles.detailText}>CPF: {employee.cpf}</ThemedText>
                        </View>
                        <View style={styles.detailRow}>
                            <Ionicons name="ribbon-outline" size={16} color="#00FF88" />
                            <ThemedText style={styles.detailText}>Acesso: {employee.status_acesso?.toUpperCase()}</ThemedText>
                        </View>
                        <View style={styles.detailRow}>
                            <Ionicons name={employee.status_ingresso === 'ativo' ? "checkmark-circle" : "warning"} size={16} color={employee.status_ingresso === 'ativo' ? "#00FF88" : "#FF3366"} />
                            <ThemedText style={[styles.detailText, { color: employee.status_ingresso === 'ativo' ? "#00FF88" : "#FF3366" }]}>
                                Ticket: {employee.status_ingresso?.toUpperCase() || 'ATIVO'}
                            </ThemedText>
                        </View>
                    </View>
                </View>

                {/* Pulseira Assignment */}
                <View style={styles.section}>
                    <ThemedText style={styles.sectionTitle}>VINCULAR DISPOSITIVO (PULSEIRA)</ThemedText>
                    <View style={styles.inputContainer}>
                        <Ionicons name="barcode-outline" size={20} color="#90A4AE" style={{ marginRight: 10 }} />
                        <TextInput
                            style={styles.input}
                            placeholder="NÚMERO DA PULSEIRA"
                            placeholderTextColor="#546E7A"
                            value={pulseira}
                            onChangeText={setPulseira}
                        />
                    </View>
                    <A2Button
                        title="VINCULAR PULSEIRA"
                        onPress={() => assignPulseira(pulseira)}
                        loading={saving}
                        variant="primary"
                    />
                </View>

                {/* Actions */}
                <View style={styles.actions}>
                    {employee.status_ingresso === 'bloqueado' || employee.status_ingresso === 'cancelado' ? (
                        <View style={styles.blockedBanner}>
                            <ThemedText style={styles.blockedText}>INGRESSO BLOQUEADO (REGRAS DE SEGURANÇA).</ThemedText>
                        </View>
                    ) : (
                        <A2Button
                            title="REALIZAR CHECK-IN"
                            onPress={executeCheckin}
                            loading={saving}
                            variant="secondary"
                            disabled={employee.status_acesso === 'checkin'}
                        />
                    )}
                </View>
            </View>
        </ScrollView>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#050B18' },
    content: { padding: 20 },
    offlineBadge: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 12, paddingHorizontal: 12, paddingVertical: 6, backgroundColor: 'rgba(255,184,0,0.1)', borderRadius: 8, borderWidth: 1, borderColor: 'rgba(255,184,0,0.3)', alignSelf: 'flex-start' },
    statusDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#FFB800' },
    offlineLabel: { fontFamily: 'Orbitron-Bold', fontSize: 8, color: '#FFB800', letterSpacing: 1 },
    card: { backgroundColor: 'rgba(10, 22, 40, 0.8)', borderRadius: 20, borderWidth: 1, borderColor: 'rgba(0, 212, 255, 0.2)', padding: 20, marginBottom: 25, shadowColor: '#00D4FF', shadowOffset: { width: 0, height: 0 }, shadowOpacity: 0.2, shadowRadius: 15, elevation: 10 },
    cardHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 15 },
    photo: { width: 100, height: 100, borderRadius: 15, borderWidth: 2, borderColor: '#00D4FF', backgroundColor: '#000' },
    headerInfo: { flex: 1, marginLeft: 20 },
    name: { fontFamily: 'Orbitron-Bold', fontSize: 13, color: '#fff', marginBottom: 2 },
    company: { fontFamily: 'Orbitron-Regular', fontSize: 9, color: '#00D4FF', marginBottom: 8 },
    badge: { backgroundColor: 'rgba(0, 255, 136, 0.1)', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 6, alignSelf: 'flex-start', borderWidth: 1, borderColor: 'rgba(0, 255, 136, 0.3)' },
    badgeText: { fontFamily: 'Orbitron-Bold', fontSize: 8, color: '#00FF88', letterSpacing: 1 },
    divider: { height: 1, backgroundColor: 'rgba(255, 255, 255, 0.1)', marginVertical: 15 },
    details: { gap: 10 },
    detailRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
    detailText: { fontFamily: 'Orbitron-Regular', fontSize: 11, color: '#90A4AE' },
    section: { marginBottom: 25 },
    sectionTitle: { fontFamily: 'Orbitron-Bold', fontSize: 10, color: '#90A4AE', letterSpacing: 2, marginBottom: 15 },
    inputContainer: { flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(255, 255, 255, 0.05)', borderRadius: 12, paddingHorizontal: 15, marginBottom: 15, borderWidth: 1, borderColor: 'rgba(255, 255, 255, 0.1)', height: 56 },
    input: { flex: 1, fontFamily: 'Orbitron-Bold', fontSize: 14, color: '#fff', letterSpacing: 2 },
    actions: { marginTop: 10, gap: 15 },
    blockedBanner: { backgroundColor: 'rgba(255, 51, 102, 0.1)', padding: 15, borderRadius: 10, borderWidth: 1, borderColor: '#FF3366' },
    blockedText: { color: '#FF3366', textAlign: 'center', fontFamily: 'Orbitron-Bold', fontSize: 12 }
});
