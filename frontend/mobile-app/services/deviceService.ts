import { supabase } from './supabase';
// Nota: Em um cenário real, o endpoint /api/devices seria chamado via axios/fetch 
// para aproveitar a lógica do backend (geração de RTSP).
// Aqui, para consistência com o resto do app, chamaremos via Supabase + Edge Function ou API direta.
// Vamos simular a chamada API através de um fetch direto para o backend se necessário, 
// ou inserir no Supabase e deixar o backend processar via triggers (mas o controller faz isso).

// Vamos usar fetch direto para a API Node.js para aproveitar o Controller
const API_URL = 'http://192.168.0.10:3001/api/devices'; // Ajustar IP conforme rede

export const deviceService = {

    async getDevices(token: string) {
        try {
            const response = await fetch(`${API_URL}`, {
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            });
            const json = await response.json();
            return json.data;
        } catch (error) {
            console.error('Erro ao buscar dispositivos:', error);
            return [];
        }
    },

    async addDevice(token: string, deviceData: any) {
        try {
            const response = await fetch(`${API_URL}`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify(deviceData)
            });
            return await response.json();
        } catch (error) {
            console.error('Erro ao adicionar dispositivo:', error);
            throw error;
        }
    },

    async testConnection(token: string, deviceData: { ip_address: string, porta: number }) {
        try {
            const response = await fetch(`${API_URL}/test`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify(deviceData)
            });
            return await response.json();
        } catch (error) {
            return { success: false, error: 'Falha na conexão' };
        }
    },

    async deleteDevice(token: string, id: string) {
        try {
            await fetch(`${API_URL}/${id}`, {
                method: 'DELETE',
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            });
            return true;
        } catch (error) {
            console.error(error);
            return false;
        }
    }
};
