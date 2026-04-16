import React, { useEffect, useState } from 'react';
import { StyleSheet, View, SafeAreaView, ScrollView, ActivityIndicator, Alert, TouchableOpacity } from 'react-native';
import { useLocalSearchParams, useRouter, Stack } from 'expo-router';
import { ThemedText } from '@/components/themed-text';
import { A2Button } from '@/components/A2Button';
import { Colors } from '@/constants/Colors';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { eventService, Event } from '@/services/eventService';
import { companyService } from '@/services/companyService';
import { A2CompanyConfig } from '@/components/A2CompanyConfig';

export default function EventDetailsScreen() {
    const { id } = useLocalSearchParams<{ id: string }>();
    const [event, setEvent] = useState<Event | null>(null);
    const [companies, setCompanies] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [configVisible, setConfigVisible] = useState(false);
    const [selectedCompany, setSelectedCompany] = useState<any>(null);
    const colorScheme = useColorScheme() ?? 'light';
    const theme = Colors[colorScheme];
    const router = useRouter();

    useEffect(() => {
        async function loadData() {
            if (id) {
                const [eventData, companiesData] = await Promise.all([
                    eventService.getEventById(id),
                    companyService.getCompanies(id)
                ]);
                setEvent(eventData);
                setCompanies(companiesData);
                if (companiesData.length > 0) setSelectedCompany(companiesData[0]);
            }
            setLoading(false);
        }
        loadData();
    }, [id]);

    if (loading) {
        return (
            <View style={[styles.centered, { backgroundColor: theme.background }]}>
                <ActivityIndicator size="large" color={theme.tint} />
            </View>
        );
    }

    if (!event) {
        return (
            <View style={[styles.centered, { backgroundColor: theme.background }]}>
                <ThemedText>Evento não encontrado.</ThemedText>
                <A2Button title="Voltar" onPress={() => router.back()} style={{ marginTop: 16 }} />
            </View>
        );
    }

    return (
        <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]}>
            <Stack.Screen options={{ title: 'Detalhes do Evento', headerShown: true }} />
            <ScrollView contentContainerStyle={styles.scrollContent}>
                <View style={[styles.imageContainer, { backgroundColor: theme.secondary }]}>
                    <ThemedText style={styles.imageIcon}>📸</ThemedText>
                    <ThemedText style={{ color: '#FFFFFF', opacity: 0.8 }}>Imagem do Evento</ThemedText>
                </View>

                <View style={styles.details}>
                    <ThemedText type="title" style={[styles.title, { color: theme.tint }]}>{event.nome}</ThemedText>

                    <View style={[styles.badge, { backgroundColor: theme.tint + '20' }]}>
                        <ThemedText style={{ color: theme.tint, fontWeight: 'bold', fontSize: 12 }}>Ativo</ThemedText>
                    </View>

                    <View style={styles.infoSection}>
                        <View style={styles.infoRow}>
                            <ThemedText type="defaultSemiBold" style={styles.label}>Data e Hora</ThemedText>
                            <ThemedText style={styles.value}>
                                {new Date(event.data_inicio).toLocaleDateString('pt-BR', {
                                    day: '2-digit',
                                    month: 'long',
                                    year: 'numeric',
                                    hour: '2-digit',
                                    minute: '2-digit'
                                })}
                            </ThemedText>
                        </View>

                        <View style={styles.infoRow}>
                            <ThemedText type="defaultSemiBold" style={styles.label}>Localização</ThemedText>
                            <ThemedText style={styles.value}>{event.local}</ThemedText>
                        </View>
                    </View>

                    <View style={styles.section}>
                        <ThemedText type="subtitle" style={styles.sectionTitle}>Sobre o Evento</ThemedText>
                        <ThemedText style={styles.description}>
                            {event.descricao || 'Nenhuma descrição disponível para este evento.'}
                        </ThemedText>
                    </View>

                    <View style={styles.actions}>
                        {companies.length > 1 && (
                            <View style={styles.companySelector}>
                                <ThemedText type="defaultSemiBold">Selecionar Empresa:</ThemedText>
                                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.companyScroll}>
                                    {companies.map(c => (
                                        <TouchableOpacity
                                            key={c.id}
                                            onPress={() => setSelectedCompany(c)}
                                            style={[
                                                styles.companyChip,
                                                selectedCompany?.id === c.id && { backgroundColor: theme.tint }
                                            ]}
                                        >
                                            <ThemedText style={selectedCompany?.id === c.id && { color: '#FFF' }}>{c.nome}</ThemedText>
                                        </TouchableOpacity>
                                    ))}
                                </ScrollView>
                            </View>
                        )}
                        <A2Button
                            title={`Gerenciar ${selectedCompany?.nome || 'Empresa'}`}
                            variant="secondary"
                            onPress={() => setConfigVisible(true)}
                            style={styles.actionButton}
                        />
                        <A2Button
                            title="Confirmar Presença"
                            onPress={() => Alert.alert('Presença', 'Sua presença foi confirmada!')}
                            style={styles.actionButton}
                        />
                        <A2Button
                            title="Voltar"
                            variant="outline"
                            onPress={() => router.back()}
                            style={styles.backButton}
                        />
                    </View>
                </View>

                {selectedCompany && (
                    <A2CompanyConfig
                        visible={configVisible}
                        onClose={() => setConfigVisible(false)}
                        company={selectedCompany}
                        eventDates={event.dates || []} // Supondo que o evento tenha array de dates
                        onUpdate={(updated) => {
                            setCompanies(companies.map(c => c.id === updated.id ? updated : c));
                            setSelectedCompany(updated);
                        }}
                    />
                )}
            </ScrollView>
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
    },
    centered: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
    },
    scrollContent: {
        flexGrow: 1,
    },
    imageContainer: {
        width: '100%',
        height: 250,
        justifyContent: 'center',
        alignItems: 'center',
        gap: 12,
    },
    imageIcon: {
        fontSize: 48,
    },
    details: {
        padding: 24,
        borderTopLeftRadius: 32,
        borderTopRightRadius: 32,
        marginTop: -32,
        backgroundColor: 'inherit', // Will be overridden by the wrapper background
    },
    title: {
        fontSize: 28,
        marginBottom: 8,
    },
    badge: {
        alignSelf: 'flex-start',
        paddingHorizontal: 12,
        paddingVertical: 4,
        borderRadius: 8,
        marginBottom: 24,
    },
    infoSection: {
        backgroundColor: 'rgba(0,0,0,0.03)',
        padding: 16,
        borderRadius: 16,
        gap: 16,
        marginBottom: 24,
    },
    infoRow: {
        gap: 4,
    },
    label: {
        fontSize: 14,
        opacity: 0.5,
    },
    value: {
        fontSize: 16,
    },
    section: {
        gap: 8,
        marginBottom: 32,
    },
    sectionTitle: {
        fontSize: 20,
    },
    description: {
        lineHeight: 24,
        opacity: 0.8,
    },
    actions: {
        gap: 12,
    },
    actionButton: {
        width: '100%',
    },
    companySelector: {
        marginVertical: 12,
        gap: 8,
    },
    companyScroll: {
        flexDirection: 'row',
    },
    companyChip: {
        paddingHorizontal: 12,
        paddingVertical: 6,
        borderRadius: 16,
        borderWidth: 1,
        borderColor: 'rgba(0,0,0,0.1)',
        marginRight: 8,
    },
    backButton: {
        width: '100%',
    }
});
