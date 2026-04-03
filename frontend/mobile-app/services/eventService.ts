import { supabase } from './supabase';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { BACKEND_URL } from '@/config/api';

const STORAGE_KEY_ACTIVE_EVENT = '@a2_active_event';

export interface Event {
    id: string;
    nome: string;
    descricao: string;
    data_inicio: string;
    local: string;
    dates?: string[];
    image_url?: string;
    tipo?: string;
}

export const eventService = {
    /**
     * Busca todos os eventos ativos via API Node.js
     */
    async getEvents(): Promise<Event[]> {
        try {
            const { data: { session } } = await supabase.auth.getSession();
            if (!session) return [];

            const response = await fetch(`${BACKEND_URL}/eventos`, {
                headers: {
                    'Authorization': `Bearer ${session.access_token}`
                }
            });

            const result = await response.json();
            if (!response.ok) throw new Error(result.error);

            return result.data || [];
        } catch (error) {
            console.error('Erro ao buscar eventos do Node API:', error);
            return [];
        }
    },

    /**
     * Busca um evento específico pelo ID
     */
    async getEventById(id: string): Promise<Event | null> {
        try {
            const { data: { session } } = await supabase.auth.getSession();
            if (!session) return null;

            const response = await fetch(`${BACKEND_URL}/eventos/${id}`, {
                headers: {
                    'Authorization': `Bearer ${session.access_token}`
                }
            });

            const result = await response.json();
            if (!response.ok) throw new Error(result.error);

            return result.data || null;
        } catch (error) {
            console.error('Erro ao buscar evento por ID do Node API:', error);
            return null;
        }
    },

    /**
     * Busca o próximo evento do usuário.
     * CIRURGIA 2: Agora persiste o evento ativo no AsyncStorage
     * para que o app saiba o evento_id mesmo estando offline.
     */
    async getNextEvent(): Promise<Event | null> {
        try {
            const events = await this.getEvents();
            // Filtrar apenas eventos ATIVOS — ignorar rascunhos, encerrados e duplicatas
            const activeEvents = events.filter((e: any) => e.status === 'ativo');
            if (activeEvents.length > 0) {
                const activeEvent = activeEvents[0];
                await this.cacheActiveEvent(activeEvent);
                return activeEvent;
            }
            // Se não há evento ativo, limpar cache antigo para evitar dados obsoletos
            console.log('⚠️ Nenhum evento com status "ativo" encontrado.');
        } catch (error) {
            console.error('Erro ao buscar próximo evento (online):', error);
        }

        // Fallback: retorna do cache local se a chamada HTTP falhou
        return await this.getActiveEventCached();
    },

    /**
     * Salva o evento ativo no AsyncStorage.
     * Chamado automaticamente por getNextEvent() quando online.
     */
    async cacheActiveEvent(event: Event): Promise<void> {
        try {
            await AsyncStorage.setItem(STORAGE_KEY_ACTIVE_EVENT, JSON.stringify(event));
            console.log(`✅ Evento ativo cacheado: ${event.nome} (${event.id})`);
        } catch (e) {
            console.error('Falha ao cachear evento ativo:', e);
        }
    },

    /**
     * Recupera o evento ativo do AsyncStorage.
     * Usado como fallback quando o app está OFFLINE.
     */
    async getActiveEventCached(): Promise<Event | null> {
        try {
            const cached = await AsyncStorage.getItem(STORAGE_KEY_ACTIVE_EVENT);
            if (cached) {
                const event = JSON.parse(cached) as Event;
                console.log(`📦 Evento ativo carregado do cache: ${event.nome} (${event.id})`);
                return event;
            }
        } catch (e) {
            console.error('Falha ao ler evento do cache:', e);
        }
        return null;
    }
};
