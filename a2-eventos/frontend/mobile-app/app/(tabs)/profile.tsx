import React, { useState, useEffect } from 'react';
import { StyleSheet, View, SafeAreaView, TouchableOpacity, Alert, ScrollView, TextInput } from 'react-native';
import { ThemedText } from '@/components/themed-text';
import { A2Button } from '@/components/A2Button';
import { useAuth } from '@/context/AuthContext';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { supabase } from '@/services/supabase';
import { SyncManager } from '@/services/SyncManager';
import { offlineService } from '@/services/offlineService';

const ProfileScreen = () => {
    const { user, profile, signOut } = useAuth();
    const router = useRouter();

    const [isEditing, setIsEditing] = useState(false);
    const [loading, setLoading] = useState(false);
    const [pendingCount, setPendingCount] = useState(0); // Adicionado state para filas offline
    const [formData, setFormData] = useState({
        nome_completo: '',
        telefone: '',
        documento: ''
    });

    useEffect(() => {
        if (profile) {
            setFormData({
                nome_completo: profile.nome_completo || '',
                telefone: (profile as any).telefone || '',
                documento: (profile as any).documento || ''
            });
        }

        const fetchQueue = async () => {
            try {
                const pending = await offlineService.getPendingActions();
                setPendingCount(pending.length);
            } catch {
                // ignore queue refresh errors on profile load
            }
        };
        fetchQueue();
    }, [profile, isEditing]);

    const handleLogout = async () => {
        Alert.alert(
            'LOGOFF DO SISTEMA',
            'ENCERRAR SESSÃO NO NEXUS E LIMPAR CREDENCIAIS?',
            [
                { text: 'ABORTAR', style: 'cancel' },
                {
                    text: 'LOGOFF',
                    style: 'destructive',
                    onPress: async () => {
                        await signOut();
                        router.replace('/(auth)/login');
                    }
                }
            ]
        );
    };

    const handleSave = async () => {
        try {
            setLoading(true);
            const { error } = await supabase
                .from('perfis')
                .update({
                    nome_completo: formData.nome_completo,
                    telefone: formData.telefone,
                    documento: formData.documento,
                    updated_at: new Date()
                })
                .eq('id', user?.id);

            if (error) throw error;
            Alert.alert('Protocolo Sincronizado', 'Dados pessoais atualizados no Nexus.');
            setIsEditing(false);
        } catch (error: any) {
            Alert.alert('Erro de Sincronia', error.message);
        } finally {
            setLoading(false);
        }
    }; // Close handleSave correctly

    const handleManualSync = async () => {
        try {
            setLoading(true);
            await SyncManager.syncPendingActions();
            const pending = await offlineService.getPendingActions();
            setPendingCount(pending.length);
            Alert.alert('Sincronização', pending.length === 0 ? 'Fila sincronizada com sucesso!' : `Ainda há ${pending.length} itens na fila.`);
        } catch (error: any) {
            Alert.alert('Erro', error.message);
        } finally {
            setLoading(false);
        }
    };

    const MenuItem = ({ icon, label, onPress, color = '#00D4FF' }: any) => (
        <TouchableOpacity style={styles.menuItem} onPress={onPress}>
            <View style={[styles.menuIconContainer, { backgroundColor: `${color}15`, borderColor: `${color}33` }]}>
                <Ionicons name={icon} size={22} color={color} />
            </View>
            <View style={styles.menuTextContainer}>
                <ThemedText style={styles.menuTitle}>{label.toUpperCase()}</ThemedText>
            </View>
            <Ionicons name="chevron-forward" size={18} color="rgba(255, 255, 255, 0.2)" />
        </TouchableOpacity>
    );

    const TerminalInput = ({ label, value, onChangeText }: any) => (
        <View style={{ width: '100%', marginBottom: 15 }}>
            <ThemedText style={{ fontSize: 9, color: '#00D4FF', fontFamily: 'Orbitron-Bold', marginBottom: 5 }}>{label}</ThemedText>
            <TextInput
                style={{
                    backgroundColor: 'rgba(5, 11, 24, 0.8)',
                    borderWidth: 1,
                    borderColor: 'rgba(0, 212, 255, 0.3)',
                    borderRadius: 8,
                    color: '#fff',
                    padding: 12,
                    fontFamily: 'Orbitron-Regular',
                    fontSize: 12
                }}
                value={value}
                onChangeText={onChangeText}
                placeholderTextColor="rgba(255,255,255,0.2)"
            />
        </View>
    );

    return (
        <LinearGradient colors={['#050B18', '#0A1628']} style={styles.container}>
            <SafeAreaView style={styles.safeArea}>
                <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
                    {/* Profile Header */}
                    <View style={styles.header}>
                        <View style={styles.avatarGlow}>
                            <View style={styles.avatarInner}>
                                <ThemedText style={styles.avatarInitial}>
                                    {profile?.nome_completo?.[0].toUpperCase() || user?.email?.[0].toUpperCase() || 'A'}
                                </ThemedText>
                            </View>
                        </View>

                        {isEditing ? (
                            <View style={{ width: '100%', alignItems: 'center' }}>
                                <TerminalInput
                                    label="NOME OPERACIONAL"
                                    value={formData.nome_completo}
                                    onChangeText={(val: string) => setFormData({ ...formData, nome_completo: val })}
                                />
                                <TerminalInput
                                    label="TELEFONE / WHATSAPP"
                                    value={formData.telefone}
                                    onChangeText={(val: string) => setFormData({ ...formData, telefone: val })}
                                />
                                <TerminalInput
                                    label="DOCUMENTO / CPF"
                                    value={formData.documento}
                                    onChangeText={(val: string) => setFormData({ ...formData, documento: val })}
                                />
                                <View style={{ flexDirection: 'row', gap: 10, marginTop: 10 }}>
                                    <A2Button
                                        title="ABORTAR"
                                        onPress={() => setIsEditing(false)}
                                        variant="outline"
                                        style={{ flex: 1 }}
                                    />
                                    <A2Button
                                        title={loading ? "SALVANDO..." : "SINCRONIZAR"}
                                        onPress={handleSave}
                                        style={{ flex: 1 }}
                                    />
                                </View>
                            </View>
                        ) : (
                            <View style={{ alignItems: 'center' }}>
                                <ThemedText style={styles.userId}>ID: {user?.id?.substring(0, 8).toUpperCase() || 'NEXUS-77'}</ThemedText>
                                <ThemedText style={styles.userName}>{profile?.nome_completo?.toUpperCase() || user?.email?.split('@')[0].toUpperCase() || 'OPERADOR'}</ThemedText>
                                <View style={styles.statusBadge}>
                                    <View style={styles.statusDot} />
                                    <ThemedText style={styles.statusText}>{profile?.nivel_acesso?.toUpperCase() || 'OPERADOR'} • ONLINE</ThemedText>
                                </View>
                            </View>
                        )}
                    </View>

                    {!isEditing && (
                        <>
                            {/* Stats Summary */}
                            <View style={styles.statsRow}>
                                <View style={styles.statBox}>
                                    <ThemedText style={styles.statLabel}>CHECK-INS</ThemedText>
                                    <ThemedText style={[styles.statValue, { color: '#00FF88' }]}>128</ThemedText>
                                </View>
                                <View style={styles.statDivider} />
                                <View style={styles.statBox}>
                                    <ThemedText style={styles.statLabel}>EVENTOS</ThemedText>
                                    <ThemedText style={[styles.statValue, { color: '#00D4FF' }]}>04</ThemedText>
                                </View>
                                <View style={styles.statDivider} />
                                <View style={styles.statBox}>
                                    <ThemedText style={styles.statLabel}>STATUS</ThemedText>
                                    <ThemedText style={[styles.statValue, { color: '#7B2FBE' }]}>ATIVO</ThemedText>
                                </View>
                            </View>

                            {/* Terminal Menu */}
                            <View style={styles.menuSection}>
                                <ThemedText style={styles.sectionLabel}>MÓDULOS NEXUS</ThemedText>

                                <MenuItem
                                    icon="person-outline"
                                    label="Ajustes de Perfil"
                                    onPress={() => setIsEditing(true)}
                                />

                                <MenuItem
                                    icon="shield-checkmark-outline"
                                    label="Segurança Nexus"
                                    color="#7B2FBE"
                                    onPress={() => { }}
                                />

                                <MenuItem
                                    icon="hardware-chip-outline"
                                    label="Dispositivos Conectados"
                                    color="#00FF88"
                                    onPress={() => router.push('/devices')}
                                />

                                <MenuItem
                                    icon="cloud-upload-outline"
                                    label={`Forçar Sincronia (${pendingCount})`}
                                    color={pendingCount > 0 ? "#FFC107" : "#00D4FF"}
                                    onPress={handleManualSync}
                                />
                            </View>

                            <A2Button
                                title="EFETUAR LOGOFF"
                                variant="outline"
                                onPress={handleLogout}
                                style={styles.logoutBtn}
                                textStyle={{ fontFamily: 'Orbitron-Bold', fontSize: 12, color: '#FF3366' }}
                            />
                        </>
                    )}

                    <ThemedText style={styles.versionText}>NZT ACCESS v1.0.4-STABLE</ThemedText>
                </ScrollView>
            </SafeAreaView>
        </LinearGradient>
    );
};

export default ProfileScreen;

const styles = StyleSheet.create({
    container: {
        flex: 1,
    },
    safeArea: {
        flex: 1,
    },
    scrollContent: {
        padding: 24,
        paddingBottom: 40,
    },
    header: {
        alignItems: 'center',
        marginTop: 40,
        marginBottom: 32,
    },
    avatarGlow: {
        width: 100,
        height: 100,
        borderRadius: 50,
        backgroundColor: 'rgba(0, 212, 255, 0.1)',
        justifyContent: 'center',
        alignItems: 'center',
        borderWidth: 1,
        borderColor: 'rgba(0, 212, 255, 0.3)',
        marginBottom: 16,
        shadowColor: '#00D4FF',
        shadowOffset: { width: 0, height: 0 },
        shadowOpacity: 0.5,
        shadowRadius: 15,
    },
    avatarInner: {
        width: 84,
        height: 84,
        borderRadius: 42,
        backgroundColor: '#050B18',
        justifyContent: 'center',
        alignItems: 'center',
        borderWidth: 2,
        borderColor: '#00D4FF',
    },
    avatarInitial: {
        fontSize: 32,
        fontFamily: 'Orbitron-Bold',
        color: '#00D4FF',
    },
    userId: {
        fontSize: 10,
        fontFamily: 'Orbitron-Bold',
        color: 'rgba(144, 164, 174, 0.5)',
        letterSpacing: 2,
        marginBottom: 4,
    },
    userName: {
        fontSize: 22,
        fontFamily: 'Orbitron-Bold',
        color: '#FFFFFF',
        letterSpacing: 1,
        marginBottom: 12,
    },
    statusBadge: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: 'rgba(0, 255, 136, 0.1)',
        paddingHorizontal: 12,
        paddingVertical: 6,
        borderRadius: 20,
        borderWidth: 1,
        borderColor: 'rgba(0, 255, 136, 0.2)',
    },
    statusDot: {
        width: 6,
        height: 6,
        borderRadius: 3,
        backgroundColor: '#00FF88',
        marginRight: 8,
    },
    statusText: {
        fontSize: 9,
        fontFamily: 'Orbitron-Bold',
        color: '#00FF88',
        letterSpacing: 1,
    },
    statsRow: {
        flexDirection: 'row',
        backgroundColor: 'rgba(10, 22, 40, 0.4)',
        borderRadius: 16,
        padding: 20,
        borderWidth: 1,
        borderColor: 'rgba(255, 255, 255, 0.05)',
        marginBottom: 32,
    },
    statBox: {
        flex: 1,
        alignItems: 'center',
    },
    statDivider: {
        width: 1,
        height: '100%',
        backgroundColor: 'rgba(255, 255, 255, 0.05)',
    },
    statLabel: {
        fontSize: 9,
        fontFamily: 'Orbitron-Bold',
        color: 'rgba(144, 164, 174, 0.6)',
        marginBottom: 4,
    },
    statValue: {
        fontSize: 16,
        fontFamily: 'Orbitron-Bold',
    },
    menuSection: {
        marginBottom: 32,
    },
    sectionLabel: {
        fontSize: 10,
        fontFamily: 'Orbitron-Bold',
        color: 'rgba(144, 164, 174, 0.4)',
        letterSpacing: 2,
        marginBottom: 16,
        paddingLeft: 4,
    },
    menuItem: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: 'rgba(255, 255, 255, 0.02)',
        padding: 16,
        borderRadius: 12,
        borderWidth: 1,
        borderColor: 'rgba(255, 255, 255, 0.05)',
        marginBottom: 12,
    },
    menuIconContainer: {
        width: 44,
        height: 44,
        borderRadius: 12,
        justifyContent: 'center',
        alignItems: 'center',
        borderWidth: 1,
        marginRight: 16,
    },
    menuTextContainer: {
        flex: 1,
    },
    menuTitle: {
        fontSize: 12,
        fontFamily: 'Orbitron-Bold',
        color: '#FFFFFF',
        marginBottom: 2,
    },
    logoutBtn: {
        borderColor: 'rgba(255, 51, 102, 0.3)',
        marginBottom: 24,
    },
    versionText: {
        textAlign: 'center',
        fontSize: 9,
        fontFamily: 'Orbitron-Bold',
        color: 'rgba(144, 164, 174, 0.3)',
        letterSpacing: 1,
    }
});
