import React, { useEffect, useState, useCallback } from 'react';
import {
  StyleSheet, View, ScrollView, SafeAreaView,
  ActivityIndicator, TouchableOpacity, RefreshControl
} from 'react-native';
import { ThemedText } from '@/components/themed-text';
import { A2Button } from '@/components/A2Button';
import { A2Card } from '@/components/A2Card';
import { A2QRCodeModal } from '@/components/A2QRCodeModal';
import { Colors } from '@/constants/Colors';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { HelloWave } from '@/components/hello-wave';
import { eventService, Event } from '@/services/eventService';
import { apiService } from '@/services/apiService';
import { useAuth } from '@/context/AuthContext';
import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';

interface DashboardStats {
  total_empresas: number;
  total_pessoas: number;
  total_checkins_hoje: number;
  total_checkouts_hoje: number;
  dispositivos_online: number;
  presentes: number;
}

const StatCard = ({
  icon, label, value, color, sub
}: {
  icon: string; label: string; value: number | string; color: string; sub?: string;
}) => (
  <View style={[styles.statCard, { borderColor: `${color}30` }]}>
    <LinearGradient
      colors={[`${color}12`, 'transparent']}
      style={StyleSheet.absoluteFill}
    />
    <Ionicons name={icon as any} size={22} color={color} style={{ marginBottom: 8 }} />
    <ThemedText style={[styles.statValue, { color }]}>{String(value).padStart(2, '0')}</ThemedText>
    <ThemedText style={styles.statLabel}>{label}</ThemedText>
    {sub && <ThemedText style={styles.statSub}>{sub}</ThemedText>}
  </View>
);

export default function HomeScreen() {
  const [nextEvent, setNextEvent] = useState<Event | null>(null);
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [qrVisible, setQrVisible] = useState(false);
  const { user, profile } = useAuth();
  const colorScheme = useColorScheme() ?? 'light';
  const theme = Colors[colorScheme];
  const router = useRouter();

  const isOperador = profile?.nivel_acesso === 'operador';

  const loadData = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);

    try {
      const [event, dashData] = await Promise.allSettled([
        eventService.getNextEvent(),
        apiService.getDashboardStats(),
      ]);

      if (event.status === 'fulfilled') setNextEvent(event.value);
      if (dashData.status === 'fulfilled' && dashData.value?.cards) {
        setStats(dashData.value.cards as DashboardStats);
      }
    } catch (e) {
      console.error('Erro ao carregar dados:', e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { loadData(); }, []);

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]}>
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={() => loadData(true)} tintColor="#00D4FF" />
        }
      >
        {/* Header */}
        <View style={styles.header}>
          <View>
            <ThemedText style={styles.brandingText}>NZT</ThemedText>
            <View style={styles.titleRow}>
              <ThemedText style={styles.mainTitle}>Core</ThemedText>
              <HelloWave />
            </View>
            <ThemedText style={styles.subtitle}>
              {profile?.nome_completo?.toUpperCase() || user?.email?.split('@')[0]?.toUpperCase() || 'OPERADOR'}
            </ThemedText>
          </View>
          <View style={styles.statusIndicator}>
            <View style={[styles.statusDot, { backgroundColor: '#00FF88' }]} />
            <ThemedText style={styles.statusText}>{profile?.nivel_acesso?.toUpperCase() || 'OFFLINE'}</ThemedText>
          </View>
        </View>

        {loading ? (
          <ActivityIndicator size="large" color={theme.primary} style={{ marginTop: 40 }} />
        ) : (
          <>
            {/* Evento Ativo */}
            <A2Card style={styles.heroCard}>
              <View style={styles.cardHeader}>
                <Ionicons name="calendar-outline" size={20} color={theme.primary} />
                <ThemedText style={styles.cardTag}>OPERAÇÃO ATIVA</ThemedText>
              </View>

              {nextEvent ? (
                <>
                  <ThemedText style={styles.eventTitle}>
                    {nextEvent.nome.toUpperCase()}
                  </ThemedText>
                  <View style={styles.infoRow}>
                    <Ionicons name="location-outline" size={16} color="#90A4AE" />
                    <ThemedText style={styles.infoText}>{nextEvent.local || 'LOCAL NÃO DEFINIDO'}</ThemedText>
                  </View>
                  <View style={styles.infoRow}>
                    <Ionicons name="time-outline" size={16} color="#90A4AE" />
                    <ThemedText style={styles.infoText}>
                      {new Date(nextEvent.data_inicio).toLocaleDateString('pt-BR', {
                        day: '2-digit',
                        month: 'short',
                        hour: '2-digit',
                        minute: '2-digit'
                      }).toUpperCase()}
                    </ThemedText>
                  </View>
                  <A2Button
                    title="TOKEN DE ACESSO"
                    onPress={() => setQrVisible(true)}
                    style={{ marginTop: 24 }}
                  />
                </>
              ) : (
                <ThemedText style={{ marginTop: 8, color: '#90A4AE', fontStyle: 'italic' }}>
                  NENHUMA OPERAÇÃO AGENDADA NO MOMENTO.
                </ThemedText>
              )}
            </A2Card>

            {/* Stats em tempo real */}
            {stats && (
              <View style={styles.section}>
                <ThemedText style={styles.sectionTitle}>PAINEL OPERACIONAL</ThemedText>
                <View style={styles.statsGrid}>
                  <StatCard
                    icon="business-outline"
                    label="EMPRESAS"
                    value={stats.total_empresas}
                    color="#00D4FF"
                    sub="Credenciadas"
                  />
                  <StatCard
                    icon="people-outline"
                    label="PARTICIPANTES"
                    value={stats.total_pessoas}
                    color="#7B2FBE"
                    sub={`${stats.presentes || 0} presentes`}
                  />
                  <StatCard
                    icon="log-in-outline"
                    label="CHECK-INS"
                    value={stats.total_checkins_hoje}
                    color="#00FF88"
                    sub="Hoje"
                  />
                  <StatCard
                    icon="wifi-outline"
                    label="LEITORES"
                    value={stats.dispositivos_online}
                    color="#FFB800"
                    sub="Online"
                  />
                </View>
              </View>
            )}

            {/* Módulos de Campo */}
            <View style={styles.section}>
              <ThemedText style={styles.sectionTitle}>MÓDULOS DE CAMPO</ThemedText>
              <View style={styles.buttonRow}>
                <View style={styles.actionItem}>
                  <TouchableOpacity
                    style={[styles.iconButton, { borderColor: theme.secondary }]}
                    onPress={() => router.push('/scanner')}
                  >
                    <Ionicons name="qr-code-outline" size={32} color={theme.secondary} />
                  </TouchableOpacity>
                  <ThemedText style={styles.actionLabel}>SCANNER</ThemedText>
                </View>

                <View style={styles.actionItem}>
                  <TouchableOpacity
                    style={[styles.iconButton, { borderColor: theme.primary }]}
                    onPress={() => router.push('/face-id')}
                  >
                    <Ionicons name="scan-outline" size={32} color={theme.primary} />
                  </TouchableOpacity>
                  <ThemedText style={styles.actionLabel}>BIO-LINK</ThemedText>
                </View>

                {!isOperador && (
                  <View style={styles.actionItem}>
                    <TouchableOpacity
                      style={[styles.iconButton, { borderColor: '#FFB800' }]}
                      onPress={() => router.push('/devices')}
                    >
                      <Ionicons name="hardware-chip-outline" size={32} color="#FFB800" />
                    </TouchableOpacity>
                    <ThemedText style={styles.actionLabel}>SISTEMAS</ThemedText>
                  </View>
                )}
              </View>
            </View>
          </>
        )}
      </ScrollView>

      <A2QRCodeModal
        visible={qrVisible}
        onClose={() => setQrVisible(false)}
        value={user?.id || 'NO_USER_ID'}
        title="TOKEN DE IDENTIFICAÇÃO"
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  scrollContent: { padding: 24, paddingBottom: 48 },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 32,
    marginTop: 16,
  },
  brandingText: {
    fontSize: 10, color: '#00D4FF',
    fontFamily: 'Orbitron-Bold', letterSpacing: 2,
  },
  mainTitle: {
    fontSize: 28, fontFamily: 'Orbitron-Black',
    color: '#FFFFFF', marginTop: 4,
  },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  subtitle: {
    fontSize: 10, color: '#90A4AE',
    letterSpacing: 1, marginTop: 4, fontWeight: '700',
  },
  statusIndicator: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: 'rgba(0, 255, 136, 0.1)',
    paddingHorizontal: 8, paddingVertical: 4, borderRadius: 4, gap: 6,
  },
  statusDot: { width: 6, height: 6, borderRadius: 3 },
  statusText: {
    fontSize: 8, fontWeight: '900', color: '#00FF88', letterSpacing: 1,
  },
  heroCard: {
    marginBottom: 32, borderWidth: 1,
    borderColor: 'rgba(0, 212, 255, 0.1)',
  },
  cardHeader: {
    flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 16,
  },
  cardTag: {
    fontSize: 10, fontWeight: '900', color: '#00D4FF', letterSpacing: 1.5,
  },
  eventTitle: {
    fontSize: 22, fontFamily: 'Orbitron-Bold',
    color: '#FFFFFF', marginBottom: 16,
  },
  infoRow: {
    flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8,
  },
  infoText: { fontSize: 12, color: '#90A4AE', fontWeight: '600' },
  section: { marginBottom: 36 },
  sectionTitle: {
    fontSize: 12, fontFamily: 'Orbitron-Bold',
    color: '#FFFFFF', letterSpacing: 2, marginBottom: 20,
  },
  statsGrid: {
    flexDirection: 'row', flexWrap: 'wrap', gap: 12,
  },
  statCard: {
    flex: 1, minWidth: '44%',
    borderRadius: 16, borderWidth: 1,
    padding: 16, alignItems: 'center',
    overflow: 'hidden', position: 'relative',
    backgroundColor: 'rgba(255,255,255,0.02)',
  },
  statValue: {
    fontSize: 28, fontFamily: 'Orbitron-Black', fontWeight: '900',
  },
  statLabel: {
    fontSize: 9, color: '#90A4AE',
    fontWeight: '800', letterSpacing: 1.5, marginTop: 4,
  },
  statSub: {
    fontSize: 9, color: 'rgba(255,255,255,0.3)', marginTop: 2,
  },
  buttonRow: {
    flexDirection: 'row', justifyContent: 'space-between', gap: 16,
  },
  actionItem: { alignItems: 'center', flex: 1 },
  iconButton: {
    width: 64, height: 64, borderRadius: 32, borderWidth: 1,
    backgroundColor: 'rgba(255,255,255,0.02)',
    justifyContent: 'center', alignItems: 'center', marginBottom: 8,
  },
  actionLabel: {
    fontSize: 9, fontWeight: '900', color: '#90A4AE', letterSpacing: 1,
  },
});
