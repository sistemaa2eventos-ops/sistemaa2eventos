const log = process.env.NODE_ENV === 'development' ? console.log : () => {};
const warn = process.env.NODE_ENV === 'development' ? console.warn : () => {};

/**
 * LocalCheckinService: Gerenciamento offline-first de registros de acesso.
 * Atualizado Fase 8: Suporte a Modo de Operação (Entrada/Saída/Auto) e SyncID.
 */
class LocalCheckinService {
    /**
     * Tenta realizar o checkin direto na API. Se falhar por timeout ou erro de rede, salva localmente.
     * @param {Object} payload Dados do QRCode ou busca manual + metadados (tipo, dispositivo_id)
     * @param {string} metodo 'qrcode', 'manual', 'rfid'
     * @returns {Object} Resultado com status atual (sincronizado ou local)
     */
    async realizarCheckin(payload, metodo) {
        // Garantir sync_id único para prevenção de duplicidade no backend
        const sync_id = payload.sync_id || uuidv4();
        const data = { ...payload, sync_id, metodo };

        if (!navigator.onLine) {
            return await this.salvarNaFila(data, metodo);
        }

        try {
            // Endpoint unificado /access agora lida com todos os métodos se o backend estiver pronto,
            // ou mantemos o mapeamento por método se preferir controle granular.
            // Para A2 Eventos, o endpoint registrarAcesso no CheckinService é o destino real.
            const endpoint = `/access/checkin/${metodo}`;

            const response = await api.post(endpoint, data, { timeout: 5000 });
            return {
                status: 'sincronizado',
                message: response.data.message || 'Acesso registrado com sucesso!',
                data: response.data
            };
        } catch (error) {
            const isNetworkError = !error.response || error.code === 'ECONNABORTED' || error.message === 'Network Error';

            if (isNetworkError) {
                warn('[LocalCheckinService] Falha de rede. Salvando acesso localmente.');
                return await this.salvarNaFila(data, metodo);
            }

            // Propaga erros de negócio (403 Proibido, 404 Não Encontrado, etc)
            throw error;
        }
    }

    /**
     * Salva o registro na fila do IndexedDB
     */
    async salvarNaFila(data, metodo) {
        const item = {
            payload: data,
            tipo_operacao: metodo, // qrcode, manual, rfid
            data_criacao: new Date().toISOString(),
            status: 'pendente'
        };

        await db.filaSincronizacao.add(item);
        
        // Notifica a UI sobre a mudança no contador de pendências
        window.dispatchEvent(new CustomEvent('sync-status-changed', { 
            detail: { count: await this.getPendenteCount() } 
        }));

        return {
            status: 'local',
            message: 'Aparelho Offline. Acesso salvo localmente e será sincronizado ao restaurar conexão.',
            data: item
        };
    }

    /**
     * Processa a fila caso a internet volte
     */
    async sincronizarFila() {
        if (!navigator.onLine) return;

        const pendentes = await db.filaSincronizacao.where('status').equals('pendente').toArray();
        if (pendentes.length === 0) return;

        log(`[LocalCheckinService] Sincronizando ${pendentes.length} registros pendentes...`);

        for (const item of pendentes) {
            try {
                const endpoint = `/access/checkin/${item.tipo_operacao}`;
                const data = { 
                    ...item.payload, 
                    offline_timestamp: item.data_criacao // Injeta timestamp do momento real do bip
                };

                await api.post(endpoint, data);

                // Sucesso: deleta da fila local
                await db.filaSincronizacao.delete(item.id);
            } catch (error) {
                const isNetworkError = !error.response || error.code === 'ECONNABORTED' || error.message === 'Network Error';
                if (isNetworkError) {
                    warn('[LocalCheckinService] Conexão perdida durante sync. Interrompendo fila.');
                    break;
                } else if (error.response && error.response.status >= 400 && error.response.status < 500) {
                    // Erro de lógica (ex: Já estava com check-in). Marcamos para não travar a fila.
                    await db.filaSincronizacao.update(item.id, { 
                        status: 'erro_negocio', 
                        observacao: error.response.data.error 
                    });
                }
            }
        }

        window.dispatchEvent(new CustomEvent('sync-status-changed', { 
            detail: { count: await this.getPendenteCount() } 
        }));

        // F-02: Notifica UI de que os dados mudaram (necessário refresh de listas)
        window.dispatchEvent(new CustomEvent('offline-sync-completed'));
    }

    /**
     * Listener para monitorar a conexão globalmente
     */
    iniciarListenerConexao(onSyncStart, onSyncEnd) {
        window.addEventListener('online', async () => {
            log('[LocalCheckinService] Conexão restaurada.');
            const count = await this.getPendenteCount();
            if (count > 0) {
                if (onSyncStart) onSyncStart(count);
                await this.sincronizarFila();
                if (onSyncEnd) onSyncEnd();
            }
        });
    }

    async getPendenteCount() {
        return await db.filaSincronizacao.where('status').equals('pendente').count();
    }
}

export default new LocalCheckinService();
