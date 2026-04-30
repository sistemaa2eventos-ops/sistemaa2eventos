import { supabase } from './supabase';
import { offlineService } from './offlineService';
import * as Crypto from 'expo-crypto';
import NetInfo from '@react-native-community/netinfo';
import { eventService } from './eventService';
import { BACKEND_URL } from '@/config/api';

export const apiService = {
    /**
     * Validar QR Code e retornar dados do funcionário
     */
    async validateQRCode(qrCode: string) {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) throw new Error('Não autenticado');

        const event = await eventService.getNextEvent();

        const response = await fetch(`${BACKEND_URL}/access/validate/qrcode`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${session.access_token}`,
                ...(event?.id ? { 'x-evento-id': event.id } : {})
            },
            body: JSON.stringify({ qrCode })
        });

        const result = await response.json();
        if (!response.ok) throw new Error(result.error || 'Credencial inválida');
        return result.data;
    },

    /**
     * Realizar Check-in via QR Code
     */
    async checkinQRCode(qrCode: string, dispositivoId?: string) {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) throw new Error('Não autenticado');

        const event = await eventService.getNextEvent();

        try {
            const response = await fetch(`${BACKEND_URL}/access/checkin/qrcode`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${session.access_token}`,
                    ...(event?.id ? { 'x-evento-id': event.id } : {})
                },
                body: JSON.stringify({ qrCode, dispositivoId })
            });

            const result = await response.json();
            if (!response.ok) {
                // Se for 503 (Serviço Indisponível) ou Gateway Timeout, tratar como falha de rede para fallback
                if (response.status === 503 || response.status >= 500) {
                    throw new Error('Servidor indisponível (HTTP_5XX)');
                }
                throw new Error(result.error || 'Erro no check-in');
            }
            return result;
        } catch (error: any) {
            // Se o erro foi de rede ou erro de servidor 5xx, entra no fallback offline
            const isNetworkError = error.message === 'Failed to fetch' ||
                error.message.includes('Network request failed') ||
                error.message.includes('HTTP_5XX');
            if (isNetworkError) {
                console.log('⚡ Rede falhou, usando modo OFFLINE para QR Code');

                // CIRURGIA 2: Buscar evento ativo do cache AsyncStorage
                const cachedEvent = await eventService.getActiveEventCached();
                if (!cachedEvent) {
                    throw new Error('Nenhum evento ativo no cache. Conecte-se à rede ao menos uma vez.');
                }
                const eventoId = cachedEvent.id;

                const pessoa: any = await offlineService.findPessoaByQRCode(qrCode, eventoId);

                if (!pessoa) {
                    throw new Error('Credencial não encontrada no cache offline.');
                }

                if (pessoa.status_acesso === 'checkin') {
                    throw new Error('Pessoa já realizou check-in (Offline Cache)');
                }

                // Cria o registro na Fila Oflfline
                const action = {
                    sync_id: Crypto.randomUUID(),
                    pessoa_id: pessoa.id,
                    evento_id: eventoId,
                    tipo: 'checkin',
                    metodo: 'qrcode',
                    dispositivo_id: dispositivoId,
                    offline_timestamp: new Date().toISOString()
                };

                await offlineService.enqueueAction(action);

                return {
                    success: true,
                    message: 'Check-in (Offline) realizado.',
                    data: { pessoa_id: pessoa.id, ...pessoa, offline: true }
                };
            }
            throw error;
        }
    },

    /**
     * Realizar Checkout
     */
    async checkout(pessoaId: string, dispositivoId?: string) {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) throw new Error('Não autenticado');

        const event = await eventService.getNextEvent();

        try {
            const response = await fetch(`${BACKEND_URL}/access/checkout`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${session.access_token}`,
                    ...(event?.id ? { 'x-evento-id': event.id } : {})
                },
                body: JSON.stringify({ pessoa_id: pessoaId, dispositivoId })
            });

            const result = await response.json();
            if (!response.ok) {
                if (response.status === 503 || response.status >= 500) {
                    throw new Error('Servidor indisponível (HTTP_5XX)');
                }
                throw new Error(result.error || 'Erro no checkout');
            }
            return result;
        } catch (error: any) {
            const isNetworkError = error.message === 'Failed to fetch' ||
                error.message.includes('Network request failed') ||
                error.message.includes('HTTP_5XX');
            if (isNetworkError) {
                console.log('⚡ Rede falhou, usando modo OFFLINE para Checkout');

                // CIRURGIA 2: Buscar evento ativo do cache AsyncStorage
                const cachedEvent = await eventService.getActiveEventCached();
                if (!cachedEvent) {
                    throw new Error('Nenhum evento ativo no cache. Conecte-se à rede ao menos uma vez.');
                }
                const eventoId = cachedEvent.id;

                const pessoa: any = await offlineService.getPessoaById(pessoaId);

                if (!pessoa) {
                    throw new Error('Credencial não encontrada no cache offline.');
                }

                if (pessoa.status_acesso !== 'checkin') {
                    throw new Error('Pessoa não está com entrada ativa (Offline Cache)');
                }

                const action = {
                    sync_id: Crypto.randomUUID(),
                    pessoa_id: pessoaId,
                    evento_id: eventoId,
                    tipo: 'checkout',
                    metodo: 'qrcode', // assumindo que mobile checkouts também usem a base do qrcode para esta função
                    dispositivo_id: dispositivoId,
                    offline_timestamp: new Date().toISOString()
                };

                await offlineService.enqueueAction(action);

                return {
                    success: true,
                    message: 'Checkout (Offline) realizado.',
                    data: { pessoa_id: pessoa.id, ...pessoa, offline: true }
                };
            }
            throw error;
        }
    },

    /**
     * Buscar logs recentes do evento
     */
    async getRecentLogs(limit: number = 20) {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) throw new Error('Não autenticado');

        const event = await eventService.getNextEvent();

        const response = await fetch(`${BACKEND_URL}/access/logs?limit=${limit}`, {
            headers: {
                'Authorization': `Bearer ${session.access_token}`,
                ...(event?.id ? { 'x-evento-id': event.id } : {})
            }
        });

        const result = await response.json();
        if (!response.ok) throw new Error(result.error || 'Erro ao buscar logs');
        return result.data;
    },

    /**
     * Buscar estatísticas do Dashboard
     */
    async getDashboardStats() {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) throw new Error('Não autenticado');

        const event = await eventService.getNextEvent();

        const response = await fetch(`${BACKEND_URL}/monitor/dashboard`, {
            headers: {
                'Authorization': `Bearer ${session.access_token}`,
                ...(event?.id ? { 'x-evento-id': event.id } : {})
            }
        });

        const result = await response.json();
        if (!response.ok) throw new Error(result.error || 'Erro ao buscar stats');
        return result.data;
    },

    /**
     * CIRURGIA 3: Pré-carregar pessoas do evento ativo no SQLite local.
     * Deve ser chamado uma vez após login (no _layout.tsx).
     * Permite que o scanner offline encontre credenciais sem internet.
     */
    async prefetchPessoasForOffline(): Promise<void> {
        try {
            const { data: { session } } = await supabase.auth.getSession();
            if (!session) return;

            const event = await eventService.getNextEvent();
            if (!event) {
                console.log('⚠️ Prefetch ignorado: nenhum evento ativo encontrado.');
                return;
            }

            console.log(`📥 Prefetch: Baixando pessoas do evento "${event.nome}"...`);

            const response = await fetch(`${BACKEND_URL}/pessoas?evento_id=${event.id}`, {
                headers: {
                    'Authorization': `Bearer ${session.access_token}`,
                    'x-evento-id': event.id
                }
            });

            const result = await response.json();
            if (!response.ok) {
                console.error('Prefetch falhou:', result.error);
                return;
            }

            const pessoas = result.data || [];
            if (pessoas.length > 0) {
                await offlineService.savePessoas(pessoas.map((p: any) => ({
                    id: p.id,
                    nome: p.nome,
                    cpf: p.cpf,
                    qr_code: p.qr_code,
                    barcode: p.barcode || null,
                    rfid_tag: p.rfid_tag || null,
                    status_acesso: p.status_acesso,
                    evento_id: event.id,
                    updated_at: p.updated_at || new Date().toISOString()
                })));
                console.log(`✅ Prefetch concluído: ${pessoas.length} pessoas salvas no SQLite.`);
            } else {
                console.log('ℹ️ Prefetch: Nenhuma pessoa encontrada para este evento.');
            }
        } catch (error) {
            console.error('❌ Erro no prefetch offline:', error);
        }
    }
};
