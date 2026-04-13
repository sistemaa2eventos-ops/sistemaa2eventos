import { useState, useEffect, useCallback } from 'react';
import { Alert } from 'react-native';
import NetInfo from '@react-native-community/netinfo';
import * as Crypto from 'expo-crypto';

import { supabase } from '@/services/supabase';
import { offlineService } from '@/services/offlineService';
import { apiService } from '@/services/apiService';
import { eventService } from '@/services/eventService';

export const useEmployee = (id: string, router: any) => {
    const [employee, setEmployee] = useState<any>(null);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [pulseira, setPulseira] = useState('');
    const [isOnline, setIsOnline] = useState(true);
    const [dataSource, setDataSource] = useState<'online' | 'offline'>('online');

    // 1. Monitorar Rede
    useEffect(() => {
        const unsubscribe = NetInfo.addEventListener(state => {
            setIsOnline(!!(state.isConnected && state.isInternetReachable !== false));
        });
        return () => unsubscribe();
    }, []);

    // 2. Carregamento Híbrido (Online -> Cache)
    const loadEmployee = useCallback(async () => {
        try {
            setLoading(true);

            // Tentar via Supabase
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

        // Fallback: SQLite
        try {
            const cached = await offlineService.getPessoaById(id);
            if (cached) {
                setEmployee(cached);
                setDataSource('offline');
            } else {
                Alert.alert('Erro', 'Cadastro não localizado.');
                router.back();
            }
        } catch (e) {
            Alert.alert('Erro', 'Falha ao acessar registros locais.');
            router.back();
        } finally {
            setLoading(false);
        }
    }, [id, router]);

    useEffect(() => {
        loadEmployee();
    }, [loadEmployee]);

    // 3. Vincular Pulseira
    const assignPulseira = async (numero: string) => {
        if (!numero.trim()) {
            Alert.alert('Atenção', 'Informe o identificador da pulseira.');
            return;
        }

        if (!isOnline) {
            Alert.alert('Offline', 'Vinculação de hardware requer conexão ativa.');
            return;
        }

        try {
            setSaving(true);
            const { error } = await supabase
                .from('pessoas')
                .update({ numero_pulseira: numero })
                .eq('id', id);

            if (error) throw error;
            setPulseira(numero);
            Alert.alert('Sucesso', 'Pulseira vinculada.');
            loadEmployee();
        } catch (error) {
            Alert.alert('Erro', 'Falha ao sincronizar pulseira.');
        } finally {
            setSaving(false);
        }
    };

    // 4. Executar Check-in
    const executeCheckin = async () => {
        try {
            setSaving(true);
            if (isOnline && employee.qr_code) {
                await apiService.checkinQRCode(employee.qr_code);
                Alert.alert('Sucesso', 'Check-in processado.', [{ text: 'OK', onPress: () => router.back() }]);
            } else {
                const cachedEvent = await eventService.getActiveEventCached();
                if (!cachedEvent) throw new Error('Evento expirado ou não localizado no cache.');

                await offlineService.enqueueAction({
                    sync_id: Crypto.randomUUID(),
                    pessoa_id: employee.id,
                    evento_id: cachedEvent.id,
                    tipo: 'checkin',
                    metodo: 'manual',
                    dispositivo_id: 'mobile-offline',
                    offline_timestamp: new Date().toISOString()
                });

                Alert.alert('Check-in Offline', 'Ação enfileirada para sincronização.', [{ text: 'OK', onPress: () => router.back() }]);
            }
        } catch (error: any) {
            Alert.alert('Erro', error.message || 'Falha na operação.');
        } finally {
            setSaving(false);
        }
    };

    return {
        employee,
        loading,
        saving,
        pulseira,
        setPulseira,
        isOnline,
        dataSource,
        assignPulseira,
        executeCheckin,
        refresh: loadEmployee
    };
};
