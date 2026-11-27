import React, { useState, useEffect } from 'react';
import { StyleSheet, View, ScrollView, Image, TouchableOpacity, Alert, ActivityIndicator, TextInput } from 'react-native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { ThemedText } from '@/components/themed-text';
import { A2Button } from '@/components/A2Button';
import { Colors } from '@/constants/Colors';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { Ionicons } from '@expo/vector-icons';
import { apiService } from '@/services/apiService';
import { offlineService } from '@/services/offlineService';
import { eventService } from '@/services/eventService';
import { supabase } from '@/services/supabase';
import NetInfo from '@react-native-community/netinfo';
import * as Crypto from 'expo-crypto';

/**
 * CIRURGIA 6: Employee Detail com fallback SQLite.
 * - Online: busca do Supabase (dados completos com empresa)
 * - Offline: busca do SQLite local (dados básicos do cache)
 * - Check-in funciona em ambos os modos
 */
import { cores, fonte } from '@/constants/theme';
export default function EmployeeDetailScreen() {
    const { id } = useLocalSearchParams();
    const router = useRouter();
    const colorScheme = useColorScheme() ?? 'dark';
    const theme = Colors[colorScheme];

    const [loading, setLoading] = useState(true);
    const [employee, setEmployee] = useState<any>(null);
    const [pulseira, setPulseira] = useState('');
    const [saving, setSaving] = useState(false);
    const [isOnline, setIsOnline] = useState(true);
    const [dataSource, setDataSource] = useState<'online' | 'offline'>('online');

    useEffect(() => {
        const unsubscribe = NetInfo.addEventListener(state => {
            setIsOnline(!!(state.isConnected && state.isInternetReachable !== false));
        });
        return () => unsubscribe();
    }, []);

    useEffect(() => {
        loadEmployee();
    }, [id]);

    const loadEmployee = async () => {
        try {
            setLoading(true);

            // Tentar online primeiro
            const { data, error } = await supabase
                .from('pessoas')
                .select('*, empresas(nome)')
                .eq('id', id)
                .single();

            if (!error && data) {
                setEmployee(data);
                setPulseira(data.numero_pulseira || '');
                setDataSource('online');
                return;
            }
        } catch (err) {
            console.log('Online fetch falhou, tentando cache...');
        }

        // Fallback: SQLite local
        try {
            const cached = await offlineService.getPessoaById(id as string);
            if (cached) {
                setEmployee(cached);
                setDataSource('offline');
                console.log('📱 Dados carregados do cache SQLite.');
            } else {
                Alert.alert('Erro', 'Cadastro não encontrado (online ou cache).');
                router.back();
            }
        } catch (offlineErr) {
            Alert.alert('Erro', 'Não foi possível carregar os dados do cadastro.');
            router.back();
        } finally {
            setLoading(false);
        }
    };

    const handleAssignPulseira = async () => {
        if (!pulseira.trim()) {
            Alert.alert('Atenção', 'Informe o número da pulseira.');
            return;
        }

        if (!isOnline) {
            Alert.alert('Offline', 'Vinculação de pulseira requer conexão com a internet.');
            return;
        }

        try {
            setSaving(true);
            const { error } = await supabase
                .from('pessoas')
                .update({ numero_pulseira: pulseira })
                .eq('id', id);

            if (error) throw error;

            Alert.alert('Sucesso', 'Pulseira vinculada com sucesso!');
            loadEmployee();
        } catch (error: any) {
            Alert.alert('Erro', 'Falha ao salvar pulseira.');
        } finally {
            setSaving(false);
        }
    };

    const handleCheckin = async () => {
        try {
            setSaving(true);

            if (isOnline && employee.qr_code) {
                // Online: usa a API normalmente
                await apiService.checkinQRCode(employee.qr_code);
                Alert.alert('Sucesso', 'Check-in realizado com sucesso!', [
                    { text: 'OK', onPress: () => router.back() }
                ]);
            } else {
                // Offline: enfileira na sync_queue
                const cachedEvent = await eventService.getActiveEventCached();
                if (!cachedEvent) {
                    Alert.alert('Erro', 'Nenhum evento ativo no cache.');
                    return;
                }

                await offlineService.enqueueAction({
                    sync_id: Crypto.randomUUID(),
                    pessoa_id: employee.id,
                    evento_id: cachedEvent.id,
                    tipo: 'checkin',
                    metodo: 'manual',
                    dispositivo_id: 'mobile-offline',
                    offline_timestamp: new Date().toISOString()
                });

                Alert.alert('Check-in Offline', 'Ação enfileirada. Será sincronizada quando a conexão voltar.', [
                    { text: 'OK', onPress: () => router.back() }
                ]);
            }
        } catch (error: any) {
            Alert.alert('Erro', error.message || 'Falha ao realizar check-in.');
        } finally {
            setSaving(false);
        }
    };

    if (loading) {
        return (
            <View style={[styles.container, { justifyContent: 'center', alignItems: 'center' }]}>
                <ActivityIndicator size="large" color={cores.primaria} />
            </View>
        );
    }

    return (
        <ScrollView style={styles.container}>
            <Stack.Screen options={{
                headerTitle: 'IDENTIFICAÇÃO',
                headerTitleStyle: { fontFamily: fonte.titulo, fontSize: 12, color: cores.primaria },
                headerStyle: { backgroundColor: cores.fundo },
                headerTintColor: cores.primaria,
                headerShown: true
            }} />

            <View style={styles.content}>
                {/* Data Source Badge */}
                {dataSource === 'offline' && (
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 12, paddingHorizontal: 12, paddingVertical: 6, backgroundColor: 'rgba(255,184,0,0.1)', borderRadius: 8, borderWidth: 1, borderColor: 'rgba(255,184,0,0.3)', alignSelf: 'flex-start' }}>
                        <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: cores.alerta }} />
                        <ThemedText style={{ fontFamily: fonte.titulo, fontSize: 8, color: cores.alerta, letterSpacing: 1 }}>DADOS DO CACHE OFFLINE</ThemedText>
                    </View>
                )}

                {/* ID Card Style */}
                <View style={styles.card}>
                    <View style={styles.cardHeader}>
                        <Image
                            source={employee.foto_url ? { uri: employee.foto_url } : require('@/assets/images/icon.png')}
                            style={styles.photo}
                        />
                        <View style={styles.headerInfo}>
                            <ThemedText style={styles.name}>{employee.nome?.toUpperCase()}</ThemedText>
                            <ThemedText style={styles.company}>{employee.empresas?.nome}</ThemedText>
                            <View style={styles.badge}>
                                <ThemedText style={styles.badgeText}>{employee.funcao?.toUpperCase()}</ThemedText>
                            </View>
                        </View>
                    </View>

                    <View style={styles.divider} />

                    <View style={styles.details}>
                        <View style={styles.detailRow}>
                            <Ionicons name="card-outline" size={16} color={cores.primaria} />
                            <ThemedText style={styles.detailText}>CPF: {employee.cpf}</ThemedText>
                        </View>
                        <View style={styles.detailRow}>
                            <Ionicons name="ribbon-outline" size={16} color={cores.sucesso} />
                            <ThemedText style={styles.detailText}>Acesso: {employee.status_acesso?.toUpperCase()}</ThemedText>
                        </View>
                        <View style={styles.detailRow}>
                            <Ionicons name={employee.status_ingresso === 'ativo' ? "checkmark-circle" : "warning"} size={16} color={employee.status_ingresso === 'ativo' ? cores.sucesso : cores.erro} />
                            <ThemedText style={[styles.detailText, { color: employee.status_ingresso === 'ativo' ? cores.sucesso : cores.erro }]}>
                                Ticket: {employee.status_ingresso?.toUpperCase() || 'ATIVO'}
                            </ThemedText>
                        </View>
                    </View>
                </View>

                {/* Pulseira Assignment */}
                <View style={styles.section}>
                    <ThemedText style={styles.sectionTitle}>VINCULAR PULSEIRA</ThemedText>
                    <View style={styles.inputContainer}>
                        <Ionicons name="barcode-outline" size={20} color={cores.textoSecundario} style={{ marginRight: 10 }} />
                        <TextInput
                            style={styles.input}
                            placeholder="NÚMERO DA PULSEIRA"
                            placeholderTextColor={cores.textoFraco}
                            value={pulseira}
                            onChangeText={setPulseira}
                        />
                    </View>
                    <A2Button
                        title="VINCULAR PULSEIRA"
                        onPress={handleAssignPulseira}
                        loading={saving}
                        variant="primary"
                    />
                </View>

                {/* Actions */}
                <View style={styles.actions}>
                    {employee.status_ingresso === 'transferencia_pendente' || employee.status_ingresso === 'transferido' || employee.status_ingresso === 'cancelado' ? (
                        <View style={{ backgroundColor: 'rgba(255, 51, 102, 0.1)', padding: 15, borderRadius: 10, borderWidth: 1, borderColor: cores.erro }}>
                            <ThemedText style={{ color: cores.erro, textAlign: 'center', fontFamily: fonte.titulo, fontSize: 12 }}>
                                INGRESSO BLOQUEADO (ANTI-FRAUDE/TRANSFERÊNCIA).
                            </ThemedText>
                        </View>
                    ) : (
                        <A2Button
                            title="REALIZAR CHECK-IN"
                            onPress={handleCheckin}
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
    container: {
        flex: 1,
        backgroundColor: cores.fundo,
    },
    content: {
        padding: 20,
    },
    card: {
        backgroundColor: 'rgba(10, 22, 40, 0.8)',
        borderRadius: 20,
        borderWidth: 1,
        borderColor: 'rgba(0, 212, 255, 0.2)',
        padding: 20,
        marginBottom: 25,
        shadowColor: cores.primaria,
        shadowOffset: { width: 0, height: 0 },
        shadowOpacity: 0.2,
        shadowRadius: 15,
        elevation: 10,
    },
    cardHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: 15,
    },
    photo: {
        width: 100,
        height: 100,
        borderRadius: 15,
        borderWidth: 2,
        borderColor: cores.primaria,
        backgroundColor: '#000',
    },
    headerInfo: {
        flex: 1,
        marginLeft: 20,
    },
    name: {
        fontFamily: fonte.titulo,
        fontSize: 14,
        color: '#fff',
        marginBottom: 2,
    },
    company: {
        fontFamily: fonte.corpo,
        fontSize: 10,
        color: cores.primaria,
        marginBottom: 8,
    },
    badge: {
        backgroundColor: 'rgba(0, 255, 136, 0.1)',
        paddingHorizontal: 10,
        paddingVertical: 4,
        borderRadius: 6,
        alignSelf: 'flex-start',
        borderWidth: 1,
        borderColor: 'rgba(0, 255, 136, 0.3)',
    },
    badgeText: {
        fontFamily: fonte.titulo,
        fontSize: 8,
        color: cores.sucesso,
        letterSpacing: 1,
    },
    divider: {
        height: 1,
        backgroundColor: 'rgba(255, 255, 255, 0.1)',
        marginVertical: 15,
    },
    details: {
        gap: 10,
    },
    detailRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
    },
    detailText: {
        fontFamily: fonte.corpo,
        fontSize: 11,
        color: cores.textoSecundario,
    },
    section: {
        marginBottom: 25,
    },
    sectionTitle: {
        fontFamily: fonte.titulo,
        fontSize: 10,
        color: cores.textoSecundario,
        letterSpacing: 2,
        marginBottom: 15,
    },
    inputContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: 'rgba(255, 255, 255, 0.05)',
        borderRadius: 12,
        paddingHorizontal: 15,
        marginBottom: 15,
        borderWidth: 1,
        borderColor: 'rgba(255, 255, 255, 0.1)',
        height: 56,
    },
    input: {
        flex: 1,
        fontFamily: fonte.titulo,
        fontSize: 14,
        color: '#fff',
        letterSpacing: 2,
    },
    actions: {
        marginTop: 10,
        gap: 15,
    }
});
