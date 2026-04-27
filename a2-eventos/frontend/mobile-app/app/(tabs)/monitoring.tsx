import React, { useState, useEffect } from 'react';
import { StyleSheet, View, FlatList, Image, ActivityIndicator, RefreshControl, TouchableOpacity, ScrollView } from 'react-native';
import { ThemedText } from '@/components/themed-text';
import { Ionicons } from '@expo/vector-icons';
import { apiService } from '@/services/apiService';
import { format } from 'date-fns';

export default function MonitoringScreen() {
    const [logs, setLogs] = useState<any[]>([]);
    const [cameras, setCameras] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [activeTab, setActiveTab] = useState<'logs' | 'cameras'>('logs');
    const [filter, setFilter] = useState<'all' | 'face'>('all');

    useEffect(() => {
        loadData();
        const interval = setInterval(loadData, 10000); 
        return () => clearInterval(interval);
    }, [activeTab]);

    const loadData = async () => {
        try {
            if (activeTab === 'logs') {
                const data = await apiService.getRecentLogs(50);
                setLogs(data || []);
            } else {
                const camData = await apiService.getCameras();
                setCameras(camData || []);
            }
        } catch (error: any) {
            console.error('Erro ao carregar dados:', error);
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    };

    const filteredLogs = filter === 'face' 
        ? logs.filter(l => l.metodo === 'facereader' || l.metodo === 'face' || !!l.pessoas?.foto_url)
        : logs;

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
                        {item.empresas?.nome || 'VISITANTE'} • {item.metodo?.toUpperCase()}
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
                    {format(new Date(item.created_at), "HH:mm:ss")}
                </ThemedText>
                <View style={{ flex: 1 }} />
                <Ionicons name={item.metodo === 'face' ? "eye-outline" : "qr-code-outline"} size={14} color="#00D4FF" />
                <ThemedText style={styles.deviceText}>
                    {item.dispositivos?.nome || 'TERMINAL NEXUS'}
                </ThemedText>
            </View>
        </View>
    );

    const renderCameraItem = ({ item }: { item: any }) => (
        <View style={styles.cameraCard}>
            <Image 
                source={{ uri: item.snapshot_url || 'https://via.placeholder.com/640x360?text=CAM_OFFLINE' }} 
                style={styles.cameraPreview}
                resizeMode="cover"
            />
            <View style={styles.cameraOverlay}>
                <View style={styles.cameraStatus}>
                    <View style={styles.liveDot} />
                    <ThemedText style={styles.cameraName}>{item.nome.toUpperCase()}</ThemedText>
                </View>
                <ThemedText style={styles.cameraIp}>{item.ip || 'RTMP STREAM'}</ThemedText>
            </View>
        </View>
    );

    return (
        <View style={styles.container}>
            <View style={styles.header}>
                <View style={styles.titleRow}>
                    <ThemedText style={styles.title}>NEXUS MONITOR</ThemedText>
                    <View style={styles.badge}>
                        <ThemedText style={styles.badgeText}>LIVE</ThemedText>
                    </View>
                </View>

                <View style={styles.tabContainer}>
                    <TouchableOpacity 
                        style={[styles.tab, activeTab === 'logs' && styles.activeTab]}
                        onPress={() => setActiveTab('logs')}
                    >
                        <ThemedText style={[styles.tabText, activeTab === 'logs' && styles.activeTabText]}>LOGS</ThemedText>
                    </TouchableOpacity>
                    <TouchableOpacity 
                        style={[styles.tab, activeTab === 'cameras' && styles.activeTab]}
                        onPress={() => setActiveTab('cameras')}
                    >
                        <ThemedText style={[styles.tabText, activeTab === 'cameras' && styles.activeTabText]}>CÂMERAS IP</ThemedText>
                    </TouchableOpacity>
                </View>

                {activeTab === 'logs' && (
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filterContainer}>
                        <TouchableOpacity 
                            style={[styles.filterChip, filter === 'all' && styles.activeFilter]}
                            onPress={() => setFilter('all')}
                        >
                            <ThemedText style={styles.filterText}>TODOS OS ACESSOS</ThemedText>
                        </TouchableOpacity>
                        <TouchableOpacity 
                            style={[styles.filterChip, filter === 'face' && styles.activeFilter]}
                            onPress={() => setFilter('face')}
                        >
                            <Ionicons name="eye-outline" size={14} color={filter === 'face' ? '#fff' : '#00D4FF'} style={{ marginRight: 5 }} />
                            <ThemedText style={styles.filterText}>BIOMETRIA FACIAL</ThemedText>
                        </TouchableOpacity>
                    </ScrollView>
                )}
            </View>

            {loading && !refreshing ? (
                <View style={styles.center}>
                    <ActivityIndicator size="large" color="#00D4FF" />
                </View>
            ) : (
                <FlatList
                    data={activeTab === 'logs' ? filteredLogs : cameras}
                    keyExtractor={(item) => item.id}
                    renderItem={activeTab === 'logs' ? renderLogItem : renderCameraItem}
                    contentContainerStyle={styles.list}
                    refreshControl={
                        <RefreshControl
                            refreshing={refreshing}
                            onRefresh={() => {
                                setRefreshing(true);
                                loadData();
                            }}
                            tintColor="#00D4FF"
                        />
                    }
                    ListEmptyComponent={
                        <View style={styles.empty}>
                            <Ionicons name={activeTab === 'logs' ? "scan-outline" : "videocam-off-outline"} size={60} color="rgba(144, 164, 174, 0.2)" />
                            <ThemedText style={styles.emptyText}>
                                {activeTab === 'logs' ? 'AGUARDANDO ACESSOS EM TEMPO REAL...' : 'NENHUMA CÂMERA IP VINCULADA.'}
                            </ThemedText>
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
        paddingBottom: 15,
        backgroundColor: '#0A1628',
        borderBottomWidth: 1,
        borderBottomColor: 'rgba(0, 212, 255, 0.2)',
    },
    titleRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
        marginBottom: 20,
    },
    title: {
        fontFamily: 'Orbitron-Bold',
        fontSize: 18,
        color: '#00D4FF',
        letterSpacing: 2,
    },
    badge: {
        backgroundColor: '#FF3366',
        paddingHorizontal: 6,
        paddingVertical: 2,
        borderRadius: 4,
    },
    badgeText: {
        fontFamily: 'Orbitron-Bold',
        fontSize: 8,
        color: '#fff',
    },
    tabContainer: {
        flexDirection: 'row',
        backgroundColor: 'rgba(255,255,255,0.05)',
        borderRadius: 10,
        padding: 4,
        marginBottom: 15,
    },
    tab: {
        flex: 1,
        paddingVertical: 8,
        alignItems: 'center',
        borderRadius: 8,
    },
    activeTab: {
        backgroundColor: 'rgba(0, 212, 255, 0.2)',
    },
    tabText: {
        fontFamily: 'Orbitron-Bold',
        fontSize: 10,
        color: '#90A4AE',
    },
    activeTabText: {
        color: '#00D4FF',
    },
    filterContainer: {
        flexDirection: 'row',
        marginBottom: 5,
    },
    filterChip: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: 'rgba(0, 212, 255, 0.05)',
        borderWidth: 1,
        borderColor: 'rgba(0, 212, 255, 0.2)',
        paddingHorizontal: 12,
        paddingVertical: 6,
        borderRadius: 20,
        marginRight: 10,
    },
    activeFilter: {
        backgroundColor: '#00D4FF',
        borderColor: '#00D4FF',
    },
    filterText: {
        fontFamily: 'Orbitron-Bold',
        fontSize: 8,
        color: '#fff',
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
    cameraCard: {
        backgroundColor: '#000',
        borderRadius: 15,
        overflow: 'hidden',
        borderWidth: 1,
        borderColor: 'rgba(0, 212, 255, 0.3)',
        marginBottom: 15,
        height: 200,
    },
    cameraPreview: {
        width: '100%',
        height: '100%',
        opacity: 0.8,
    },
    cameraOverlay: {
        position: 'absolute',
        bottom: 0,
        left: 0,
        right: 0,
        padding: 15,
        backgroundColor: 'rgba(5, 11, 24, 0.7)',
    },
    cameraStatus: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
    },
    liveDot: {
        width: 8,
        height: 8,
        borderRadius: 4,
        backgroundColor: '#FF3366',
    },
    cameraName: {
        fontFamily: 'Orbitron-Bold',
        fontSize: 12,
        color: '#fff',
    },
    cameraIp: {
        fontFamily: 'Orbitron-Regular',
        fontSize: 9,
        color: '#90A4AE',
        marginTop: 4,
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
        fontSize: 10,
        color: '#90A4AE',
        marginTop: 15,
        letterSpacing: 2,
        textAlign: 'center',
        paddingHorizontal: 40,
    }
});
