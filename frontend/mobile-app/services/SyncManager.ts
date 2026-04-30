import NetInfo from '@react-native-community/netinfo';
import { offlineService } from './offlineService';
import { supabase } from './supabase';
import { eventService } from './eventService';
import { BACKEND_URL } from '@/config/api';

/**
 * CIRURGIA 4: SyncManager refatorado.
 * - Envia ações offline em paralelo (Promise.allSettled) em vez de sequencial.
 * - Usa o evento_id do cache AsyncStorage (Cirurgia 2).
 * - Inclui header x-evento-id para satisfazer o middleware requireEvent.
 * - Deduplicação via sync_id no backend.
 */
export const SyncManager = {
    isSyncing: false,

    init() {
        console.log('🔄 Inicializando SyncManager v2 (batch mode)...');

        // Reset ações que ficaram travadas em "syncing"
        offlineService.resetSyncingActions();

        NetInfo.addEventListener(state => {
            console.log(`📡 Status da Rede: ${state.isConnected ? 'ONLINE' : 'OFFLINE'}`);
            if (state.isConnected && state.isInternetReachable !== false) {
                this.syncPendingActions();
            }
        });

        // Polling a cada 30s como fallback
        setInterval(() => {
            NetInfo.fetch().then(state => {
                if (state.isConnected && state.isInternetReachable !== false) {
                    this.syncPendingActions();
                }
            });
        }, 30000);
    },

    async syncPendingActions() {
        if (this.isSyncing) return;
        this.isSyncing = true;

        try {
            const pendingActions = await offlineService.getPendingActions();

            if (pendingActions.length === 0) {
                this.isSyncing = false;
                return;
            }

            console.log(`🚀 Sync batch: ${pendingActions.length} ações pendentes...`);

            const { data: { session } } = await supabase.auth.getSession();
            if (!session) {
                console.log('⚠️ Sync cancelado: Usuário não autenticado.');
                this.isSyncing = false;
                return;
            }

            // Buscar evento ativo do cache (Cirurgia 2)
            const cachedEvent = await eventService.getActiveEventCached();
            const eventoId = cachedEvent?.id;

            if (!eventoId) {
                console.log('⚠️ Sync cancelado: Nenhum evento ativo no cache.');
                this.isSyncing = false;
                return;
            }

            // Marcar todas como "syncing"
            for (const action of pendingActions) {
                await offlineService.markActionAsSyncing((action as any).sync_id);
            }

            // Enviar todas em paralelo
            const results = await Promise.allSettled(
                pendingActions.map((item: any) => this.sendAction(item, session.access_token, eventoId))
            );

            // Processar resultados
            let synced = 0;
            let failed = 0;
            for (let i = 0; i < results.length; i++) {
                const result = results[i];
                const action = pendingActions[i] as any;

                if (result.status === 'fulfilled' && result.value.success) {
                    await offlineService.removeActionFromQueue(action.sync_id);
                    synced++;
                } else {
                    failed++;
                    console.error(`❌ Falha ao sincronizar ${action.sync_id}:`,
                        result.status === 'rejected' ? result.reason : result.value?.error);
                }
            }

            // Reset ações que falharam para "pending"
            if (failed > 0) {
                await offlineService.resetSyncingActions();
            }

            console.log(`✅ Sync concluído: ${synced} OK, ${failed} falhas.`);

        } catch (error) {
            console.error('❌ Erro geral no SyncManager:', error);
            await offlineService.resetSyncingActions();
        } finally {
            this.isSyncing = false;
        }
    },

    /**
     * Envia uma ação individual para o backend.
     * Retorna { success: true } ou { success: false, error: string }
     */
    async sendAction(action: any, accessToken: string, eventoId: string): Promise<{ success: boolean; error?: string }> {
        let endpoint = '';

        if (action.tipo === 'checkin') {
            endpoint = '/access/checkin/qrcode';
        } else if (action.tipo === 'checkout') {
            endpoint = '/access/checkout';
        }

        if (!endpoint) {
            return { success: false, error: `Tipo desconhecido: ${action.tipo}` };
        }

        const body: any = {
            pessoa_id: action.pessoa_id,
            dispositivoId: action.dispositivo_id,
            sync_id: action.sync_id,
            offline_timestamp: action.offline_timestamp,
            offline_sync: true,
        };

        // Para checkin via qrcode, o backend espera qrCode no body
        if (action.tipo === 'checkin') {
            body.qrCode = action.pessoa_id; // O cache offline salva o ID da pessoa
        }

        const response = await fetch(`${BACKEND_URL}${endpoint}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${accessToken}`,
                'x-evento-id': eventoId
            },
            body: JSON.stringify(body)
        });

        // 200 = sucesso, 400/403 = "já feito" ou "bloqueado" — não vale retry
        if (response.ok || response.status === 400 || response.status === 403) {
            return { success: true };
        }

        const text = await response.text();
        return { success: false, error: `HTTP ${response.status}: ${text}` };
    }
};
