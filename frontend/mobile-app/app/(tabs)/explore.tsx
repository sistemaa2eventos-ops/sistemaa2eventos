import React, { useEffect, useState } from 'react';
import { StyleSheet, FlatList, ActivityIndicator, SafeAreaView, View, TouchableOpacity } from 'react-native';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { A2Card } from '@/components/A2Card';
import { A2Button } from '@/components/A2Button';
import { Colors } from '@/constants/Colors';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { eventService, Event } from '@/services/eventService';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';

export default function EventsScreen() {
  const [events, setEvents] = useState<Event[]>([]);
  const [loading, setLoading] = useState(true);
  const colorScheme = useColorScheme() ?? 'dark';
  const theme = Colors[colorScheme];
  const router = useRouter();

  useEffect(() => {
    async function loadEvents() {
      const data = await eventService.getEvents();
      setEvents(data);
      setLoading(false);
    }
    loadEvents();
  }, []);

  const renderEvent = ({ item }: { item: Event }) => (
    <A2Card style={styles.card}>
      <View style={styles.cardHeader}>
        <View style={styles.iconContainer}>
          <Ionicons name="flash-outline" size={20} color="#00D4FF" />
        </View>
        <View style={styles.headerText}>
          <ThemedText style={styles.eventTitle}>{item.nome.toUpperCase()}</ThemedText>
          <ThemedText style={styles.eventDate}>
            {formatDate(item.data_inicio)}
          </ThemedText>
        </View>
      </View>

      <ThemedText numberOfLines={2} style={styles.description}>
        {item.descricao || 'Nenhuma descrição técnica disponível para este nexus.'}
      </ThemedText>

      <View style={styles.footer}>
        <View style={styles.locationContainer}>
          <Ionicons name="location-outline" size={14} color="rgba(0, 212, 255, 0.5)" />
          <ThemedText style={styles.location}>{item.local.toUpperCase()}</ThemedText>
        </View>
        <TouchableOpacity
          style={styles.detailsBtn}
          onPress={() => router.push(`/event/${item.id}`)}
        >
          <ThemedText style={styles.detailsBtnText}>DETALHES</ThemedText>
          <Ionicons name="chevron-forward" size={14} color="#00FF88" />
        </TouchableOpacity>
      </View>
    </A2Card>
  );

  const formatDate = (dateStr: string) => {
    const d = new Date(dateStr);
    return d.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' }).toUpperCase() + ' • ' + d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  };

  return (
    <LinearGradient
      colors={['#050B18', '#0A1628']}
      style={styles.container}
    >
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.header}>
          <View style={styles.titleRow}>
            <View style={styles.neonDot} />
            <ThemedText style={styles.title}>NEXUS EXPLORER</ThemedText>
          </View>
          <ThemedText style={styles.subtitle}>SENTINELA DE EVENTOS DISPONÍVEIS</ThemedText>
        </View>

        {loading ? (
          <View style={styles.loader}>
            <ActivityIndicator size="large" color="#00D4FF" />
          </View>
        ) : (
          <FlatList
            data={events}
            renderItem={renderEvent}
            keyExtractor={(item) => item.id}
            contentContainerStyle={styles.listContent}
            showsVerticalScrollIndicator={false}
            ListEmptyComponent={
              <View style={styles.empty}>
                <Ionicons name="search-outline" size={48} color="rgba(144, 164, 174, 0.2)" />
                <ThemedText style={styles.emptyText}>VARREDURA COMPLETA: NENHUM NEXUS ATIVO.</ThemedText>
              </View>
            }
          />
        )}
      </SafeAreaView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  safeArea: {
    flex: 1,
  },
  header: {
    padding: 24,
    paddingTop: 60,
    paddingBottom: 16,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 4,
  },
  neonDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#00FF88',
    shadowColor: '#00FF88',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.8,
    shadowRadius: 5,
  },
  title: {
    fontSize: 24,
    fontFamily: 'Orbitron-Bold',
    color: '#00D4FF',
    letterSpacing: 2,
  },
  subtitle: {
    fontSize: 10,
    fontFamily: 'Orbitron-Bold',
    color: 'rgba(144, 164, 174, 0.6)',
    letterSpacing: 1,
  },
  loader: {
    flex: 1,
    justifyContent: 'center',
  },
  listContent: {
    padding: 24,
    gap: 20,
    paddingBottom: 100,
  },
  card: {
    padding: 20,
  },
  cardHeader: {
    flexDirection: 'row',
    gap: 16,
    marginBottom: 16,
  },
  iconContainer: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: 'rgba(0, 212, 255, 0.1)',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(0, 212, 255, 0.2)',
  },
  headerText: {
    flex: 1,
    justifyContent: 'center',
  },
  eventTitle: {
    fontSize: 14,
    fontFamily: 'Orbitron-Bold',
    color: '#FFFFFF',
    marginBottom: 4,
  },
  eventDate: {
    fontSize: 10,
    fontFamily: 'Orbitron-Bold',
    color: '#7B2FBE',
    letterSpacing: 1,
  },
  description: {
    fontSize: 13,
    color: 'rgba(255, 255, 255, 0.6)',
    lineHeight: 20,
    marginBottom: 20,
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255, 255, 255, 0.05)',
  },
  locationContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flex: 1,
  },
  location: {
    fontSize: 10,
    fontFamily: 'Orbitron-Bold',
    color: 'rgba(144, 164, 174, 0.5)',
  },
  detailsBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  detailsBtnText: {
    fontSize: 10,
    fontFamily: 'Orbitron-Bold',
    color: '#00FF88',
    letterSpacing: 1,
  },
  empty: {
    alignItems: 'center',
    marginTop: 100,
    opacity: 0.5,
  },
  emptyText: {
    fontSize: 10,
    fontFamily: 'Orbitron-Bold',
    color: '#90A4AE',
    marginTop: 16,
    textAlign: 'center',
    paddingHorizontal: 40,
  }
});
