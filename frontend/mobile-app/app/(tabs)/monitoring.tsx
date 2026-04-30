import React, { useState, useEffect } from 'react';
import { StyleSheet, View, FlatList, Image, ActivityIndicator, RefreshControl } from 'react-native';
import { ThemedText } from '@/components/themed-text';
import { Colors } from '@/constants/Colors';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { Ionicons } from '@expo/vector-icons';
import { apiService } from '@/services/apiService';
import { format } from 'date-fns';

export default function MonitoringScreen() {
    const colorScheme = useColorScheme() ?? 'dark';
    const theme = Colors[colorScheme];

    const [logs, setLogs] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);

    useEffect(() => {
        loadLogs();
        const interval = setInterval(loadLogs, 10000); // Polling cada 10s
        return () => clearInterval(interval);
    }, []);

    const loadLogs = async () => {
        try {
            const data = await apiService.getRecentLogs(30);
            setLogs(data || []);
        } catch (error: any) {
            // Se o erro for "Falta vincular evento", não é fatal — apenas não há evento selecionado ainda
            if (error.message?.includes('vincular evento') || error.message?.includes('Falta vincular')) {
                console.log('ℹ️ Nenhum evento ativo vinculado. Aguardando seleção.');
            } else {
                console.error('Erro ao carregar logs:', error);
            }
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    };

    const renderLogItem = ({ item }: { item: any }) => (
        <View style={styles.logCard}>
            <View style={styles.logHeader}>
                <Image
                    source={item.pessoas?.foto_url ? { uri: item.pessoas.foto_url } : require('@/assets/images/icon.png')}
                    style={styles.avatar}
                />
                <View style={styles.logInfo}>
                    <ThemedText style={styles.name}>{item.pessoas?.nome?.toUpperCase()}</ThemedText>
                    <ThemedText style={styles.meta}>
                        {item.empresas?.nome} • {item.metodo?.toUpperCase()}
                    </ThemedText>
                </View>
                <View style={[styles.statusBadge, {
                    backgroundColor: item.tipo === 'checkin' ? 'rgba(0, 255, 136, 0.1)' : 'rgba(255, 51, 102, 0.1)',
                    borderColor: item.tipo === 'checkin' ? 'rgba(0, 255, 136, 0.3)' : 'rgba(255, 51, 102, 0.3)'
                }]}>
                    <ThemedText style={[styles.statusText, {
                        color: item.tipo === 'checkin' ? '#00FF88' : '#FF3366'
                    }]}>
                        {item.tipo?.toUpperCase()}
                    </ThemedText>
                </View>
            </View>
            <View style={styles.logFooter}>
                <Ionicons name="time-outline" size={14} color="#90A4AE" />
                <ThemedText style={styles.timeText}>
                    {format(new Date(item.created_at), "HH:mm:ss 'em' dd/MM")}
                </ThemedText>
                <View style={{ flex: 1 }} />
                <Ionicons name="hardware-chip-outline" size={14} color="#00D4FF" />
                <ThemedText style={styles.deviceText}>
                    {item.dispositivo_id || 'TERMINAL NEXUS'}
                </ThemedText>
            </View>
        </View>
    );

    return (
        <View style={styles.container}>
            <View style={styles.header}>
                <ThemedText style={styles.title}>NEXUS MONITOR</ThemedText>
                <ThemedText style={styles.subtitle}>FLUXO DE ACESSO EM TEMPO REAL</ThemedText>
            </View>

            {loading && !refreshing ? (
                <View style={styles.center}>
                    <ActivityIndicator size="large" color="#00D4FF" />
                </View>
            ) : (
                <FlatList
                    data={logs}
                    keyExtractor={(item) => item.id}
                    renderItem={renderLogItem}
                    contentContainerStyle={styles.list}
                    refreshControl={
                        <RefreshControl
                            refreshing={refreshing}
                            onRefresh={() => {
                                setRefreshing(true);
                                loadLogs();
                            }}
                            tintColor="#00D4FF"
                        />
                    }
                    ListEmptyComponent={
                        <View style={styles.empty}>
                            <Ionicons name="scan-outline" size={60} color="rgba(144, 164, 174, 0.2)" />
                            <ThemedText style={styles.emptyText}>AGUARDANDO ACESSOS...</ThemedText>
                        </View>
                    }
                />
            )}
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#050B18',
    },
    header: {
        paddingTop: 60,
        paddingHorizontal: 20,
        paddingBottom: 20,
        backgroundColor: '#0A1628',
        borderBottomWidth: 1,
        borderBottomColor: 'rgba(0, 212, 255, 0.2)',
    },
    title: {
        fontFamily: 'Orbitron-Bold',
        fontSize: 18,
        color: '#00D4FF',
        letterSpacing: 2,
    },
    subtitle: {
        fontFamily: 'Orbitron-Medium',
        fontSize: 10,
        color: '#90A4AE',
        letterSpacing: 1,
        marginTop: 4,
    },
    center: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
    },
    list: {
        padding: 15,
    },
    logCard: {
        backgroundColor: 'rgba(10, 22, 40, 0.8)',
        borderRadius: 15,
        borderWidth: 1,
        borderColor: 'rgba(255, 255, 255, 0.05)',
        padding: 15,
        marginBottom: 12,
    },
    logHeader: {
        flexDirection: 'row',
        alignItems: 'center',
    },
    avatar: {
        width: 48,
        height: 48,
        borderRadius: 12,
        backgroundColor: '#000',
        borderWidth: 1,
        borderColor: 'rgba(0, 212, 255, 0.3)',
    },
    logInfo: {
        flex: 1,
        marginLeft: 12,
    },
    name: {
        fontFamily: 'Orbitron-Bold',
        fontSize: 12,
        color: '#fff',
    },
    meta: {
        fontFamily: 'Orbitron-Regular',
        fontSize: 9,
        color: '#90A4AE',
        marginTop: 2,
    },
    statusBadge: {
        paddingHorizontal: 8,
        paddingVertical: 4,
        borderRadius: 6,
        borderWidth: 1,
    },
    statusText: {
        fontFamily: 'Orbitron-Bold',
        fontSize: 8,
    },
    logFooter: {
        flexDirection: 'row',
        alignItems: 'center',
        marginTop: 12,
        paddingTop: 12,
        borderTopWidth: 1,
        borderTopColor: 'rgba(255, 255, 255, 0.05)',
        gap: 6,
    },
    timeText: {
        fontFamily: 'Orbitron-Regular',
        fontSize: 9,
        color: '#546E7A',
    },
    deviceText: {
        fontFamily: 'Orbitron-Medium',
        fontSize: 8,
        color: '#00D4FF',
    },
    empty: {
        flex: 1,
        height: 400,
        justifyContent: 'center',
        alignItems: 'center',
        opacity: 0.5,
    },
    emptyText: {
        fontFamily: 'Orbitron-Bold',
        fontSize: 12,
        color: '#90A4AE',
        marginTop: 15,
        letterSpacing: 2,
    }
});
