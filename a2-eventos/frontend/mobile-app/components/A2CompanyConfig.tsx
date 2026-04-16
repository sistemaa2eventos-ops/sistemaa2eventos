import React, { useState } from 'react';
import { StyleSheet, View, Modal, ScrollView, TouchableOpacity, Share } from 'react-native';
import { ThemedText } from './themed-text';
import { ThemedView } from './themed-view';
import { A2Button } from './A2Button';
import { A2Input } from './A2Input';
import { Colors } from '@/constants/Colors';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { companyService } from '@/services/companyService';

interface Props {
    visible: boolean;
    onClose: () => void;
    company: any;
    eventDates: string[]; // Datas disponíveis do evento
    onUpdate: (updatedCompany: any) => void;
}

export function A2CompanyConfig({ visible, onClose, company, eventDates, onUpdate }: Props) {
    const [maxColaboradores, setMaxColaboradores] = useState(company?.max_colaboradores?.toString() || '0');
    const [selectedDates, setSelectedDates] = useState<string[]>(company?.datas_presenca || []);
    const [loading, setLoading] = useState(false);

    const colorScheme = useColorScheme() ?? 'light';
    const theme = Colors[colorScheme];

    const handleToggleDate = (date: string) => {
        if (selectedDates.includes(date)) {
            setSelectedDates(selectedDates.filter(d => d !== date));
        } else {
            setSelectedDates([...selectedDates, date]);
        }
    };

    const handleSave = async () => {
        setLoading(true);
        try {
            const updated = await companyService.updateCompany(company.id, {
                max_colaboradores: parseInt(maxColaboradores),
                datas_presenca: selectedDates
            });
            onUpdate(updated);
            onClose();
        } catch (error) {
            console.error(error);
        } finally {
            setLoading(false);
        }
    };

    const shareLink = async () => {
        const link = `https://a2eventos.com.br/public/register/${company.registration_token}`;
        try {
            await Share.share({
                message: `Olá! Segue o link para cadastro de colaboradores da empresa ${company.nome}: ${link}`,
                title: 'Link de Cadastro NZT'
            });
        } catch (error) {
            console.error(error);
        }
    };

    return (
        <Modal visible={visible} animationType="slide" transparent>
            <View style={styles.overlay}>
                <ThemedView style={styles.container}>
                    <ThemedText type="subtitle" style={styles.title}>Configurar Empresa: {company?.nome}</ThemedText>

                    <ScrollView style={styles.scroll}>
                        <View style={styles.section}>
                            <ThemedText type="defaultSemiBold">Limite de Colaboradores</ThemedText>
                            <A2Input
                                placeholder="Ex: 50"
                                keyboardType="numeric"
                                value={maxColaboradores}
                                onChangeText={setMaxColaboradores}
                            />
                            <ThemedText style={styles.hint}>0 para ilimitado</ThemedText>
                        </View>

                        <View style={styles.section}>
                            <ThemedText type="defaultSemiBold">Datas de Presença</ThemedText>
                            <View style={styles.dateList}>
                                {eventDates.map(date => (
                                    <TouchableOpacity
                                        key={date}
                                        style={[
                                            styles.dateItem,
                                            selectedDates.includes(date) && { backgroundColor: theme.tint }
                                        ]}
                                        onPress={() => handleToggleDate(date)}
                                    >
                                        <ThemedText style={[
                                            styles.dateText,
                                            selectedDates.includes(date) && { color: '#FFF' }
                                        ]}>
                                            {new Date(date).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })}
                                        </ThemedText>
                                    </TouchableOpacity>
                                ))}
                            </View>
                        </View>

                        <View style={styles.section}>
                            <ThemedText type="defaultSemiBold">Link de Cadastro Externo</ThemedText>
                            <A2Button
                                title="Compartilhar Link"
                                variant="outline"
                                onPress={shareLink}
                                style={styles.shareButton}
                            />
                        </View>
                    </ScrollView>

                    <View style={styles.footer}>
                        <A2Button title="Cancelar" variant="outline" onPress={onClose} style={styles.footerButton} />
                        <A2Button title="Salvar" onPress={handleSave} loading={loading} style={styles.footerButton} />
                    </View>
                </ThemedView>
            </View>
        </Modal>
    );
}

const styles = StyleSheet.create({
    overlay: {
        flex: 1,
        backgroundColor: 'rgba(0,0,0,0.5)',
        justifyContent: 'flex-end',
    },
    container: {
        borderTopLeftRadius: 24,
        borderTopRightRadius: 24,
        padding: 24,
        maxHeight: '80%',
    },
    title: {
        marginBottom: 24,
    },
    scroll: {
        marginBottom: 16,
    },
    section: {
        marginBottom: 24,
        gap: 8,
    },
    hint: {
        fontSize: 12,
        opacity: 0.5,
    },
    dateList: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 8,
        marginTop: 8,
    },
    dateItem: {
        paddingHorizontal: 16,
        paddingVertical: 8,
        borderRadius: 20,
        borderWidth: 1,
        borderColor: 'rgba(0,0,0,0.1)',
    },
    dateText: {
        fontSize: 14,
    },
    shareButton: {
        marginTop: 8,
    },
    footer: {
        flexDirection: 'row',
        gap: 12,
    },
    footerButton: {
        flex: 1,
    },
});
