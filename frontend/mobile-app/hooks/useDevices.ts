import { useState, useEffect, useCallback } from 'react';
import { Alert } from 'react-native';
import { deviceService } from '@/services/deviceService';
import { supabase } from '@/services/supabase';

export const useDevices = () => {
    const [devices, setDevices] = useState([]);
    const [loading, setLoading] = useState(false);

    // Form States
    const [name, setName] = useState('');
    const [brand, setBrand] = useState<'intelbras' | 'hikvision'>('intelbras');
    const [ip, setIp] = useState('');
    const [port, setPort] = useState('80');
    const [user, setUser] = useState('admin');
    const [password, setPassword] = useState('');

    const getSessionToken = async () => {
        const { data: { session } } = await supabase.auth.getSession();
        return session?.access_token || 'token_placeholder';
    };

    const loadDevices = useCallback(async () => {
        try {
            setLoading(true);
            const token = await getSessionToken();
            const data = await deviceService.getDevices(token);
            setDevices(data || []);
        } catch (error) {
            console.error('Erro ao buscar dispositivos:', error);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        loadDevices();
    }, [loadDevices]);

    const handleSave = async () => {
        if (!name || !ip || !port) {
            Alert.alert('AVISO', 'CAMPOS OBRIGATÓRIOS NÃO PREENCHIDOS.');
            return;
        }

        setLoading(true);
        try {
            const token = await getSessionToken();
            await deviceService.addDevice(token, {
                nome: name,
                marca: brand,
                tipo: 'facial_reader',
                ip_address: ip,
                porta: parseInt(port),
                user,
                password
            });

            Alert.alert('SUCESSO', 'PROTOCOLO DE DISPOSITIVO REGISTRADO.');
            setName('');
            setIp('');
            setPassword('');
            loadDevices();
        } catch (error) {
            Alert.alert('ERRO', 'FALHA NA SINCRONIZAÇÃO COM O DISPOSITIVO.');
        } finally {
            setLoading(false);
        }
    };

    const handleTest = async () => {
        setLoading(true);
        try {
            const token = await getSessionToken();
            const result = await deviceService.testConnection(token, {
                ip_address: ip,
                porta: parseInt(port)
            });

            if (result.success) {
                Alert.alert('TESTE DE CONEXÃO', `PING: OK - ${brand.toUpperCase()} EM ${ip}:${port}`);
            } else {
                Alert.alert('TESTE DE CONEXÃO', `FALHA: ${result.error || 'NÃO ALCANÇÁVEL'}`);
            }
        } catch (error) {
            Alert.alert('ERRO', 'ERRO AO EXECUTAR PING.');
        } finally {
            setLoading(false);
        }
    };

    const handleDelete = async (id: string) => {
        try {
            setLoading(true);
            const token = await getSessionToken();
            const success = await deviceService.deleteDevice(token, id);
            if (success) {
                loadDevices();
            }
        } catch (error) {
            Alert.alert('ERRO', 'FALHA AO REMOVER DISPOSITIVO.');
        } finally {
            setLoading(false);
        }
    };

    return {
        devices,
        loading,
        name, setName,
        brand, setBrand,
        ip, setIp,
        port, setPort,
        user, setUser,
        password, setPassword,
        handleSave,
        handleTest,
        handleDelete,
        refresh: loadDevices
    };
};
