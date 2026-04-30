import api from './api';
import { db } from './db';
import { v4 as uuidv4 } from 'uuid';

class LocalCheckinService {
    /**
     * Tenta realizar o checkin direto na API. Se falhar por timeout ou erro de rede, salva localmente.
     * @param {Object} payload Dados do QRCode ou manual
     * @param {string} tipoOperacao 'qrcode', 'manual', 'rfid'
     * @returns {Object} Resultado com status atual (sincronizado ou local)
     */
    async realizarCheckin(payload, tipoOperacao) {
        if (!navigator.onLine) {
            return await this.salvarNaFila(payload, tipoOperacao);
        }

        try {
            // Se o payload for só a string, mapeamos conforme o endpoint
            let endpoint = `/access/checkin/${tipoOperacao}`;
            let data = payload;

            const sync_id = uuidv4();
            if (typeof data === 'object') {
                data.sync_id = sync_id;
            } else {
                data = { [tipoOperacao === 'qrcode' ? 'qrCode' : 'busca']: payload, sync_id };
            }

            // Tenta enviar para a API estourando o timeout num limite rápido
            const response = await api.post(endpoint, data, { timeout: 4000 });
            return {
                status: 'sincronizado',
                message: response.data.message || 'Check-in realizado com sucesso!',
                data: response.data
            };
        } catch (error) {
            const isNetworkError = !error.response || error.code === 'ECONNABORTED' || error.message === 'Network Error';

            if (isNetworkError) {
                console.warn('[LocalCheckinService] Falha de rede. Salvando check-in localmente.');
                return await this.salvarNaFila(payload, tipoOperacao);
            }

            // Se for um erro da própria regra de negócios (400, 403, 404), deve propagar o erro
            throw error;
        }
    }

    /**
     * Salva o registro na fila do IndexedDB
     */
    async salvarNaFila(payload, tipoOperacao) {
        const item = {
            payload,
            tipo_operacao: tipoOperacao,
            data_criacao: new Date().toISOString(),
            status: 'pendente'
        };

        await db.filaSincronizacao.add(item);
        window.dispatchEvent(new CustomEvent('sync-status-changed', { detail: { count: await this.getPendenteCount() } }));

        return {
            status: 'local',
            message: 'Aparelho Offline. Check-in salvo na fila e será sincronizado quando houver internet.',
            data: item
        };
    }

    /**
     * Processa a fila caso a internet volte
     */
    async sincronizarFila() {
        if (!navigator.onLine) return; // Segurança

        const pendentes = await db.filaSincronizacao.where('status').equals('pendente').toArray();
        if (pendentes.length === 0) return;

        console.log(`[LocalCheckinService] Iniciando sincronização de ${pendentes.length} registros...`);

        for (const item of pendentes) {
            try {
                let endpoint = `/access/checkin/${item.tipo_operacao}`;
                let data = item.payload;

                if (typeof Object(data) !== 'object') {
                    data = { [item.tipo_operacao === 'qrcode' ? 'qrCode' : 'busca']: item.payload };
                }

                // Adiciona a flag retroativa do momento do bip offline (Isso injeta a feature de offline_timestamp no endpoint registrarAcesso do Backend)
                data.offline_timestamp = item.data_criacao;

                await api.post(endpoint, data);

                // Sucesso: deleta ou marca como concluído
                await db.filaSincronizacao.delete(item.id);
            } catch (error) {
                // Se der erro de rede de novo, pula o resto da fila porque caiu novamente
                const isNetworkError = !error.response || error.code === 'ECONNABORTED' || error.message === 'Network Error';
                if (isNetworkError) {
                    console.warn('[LocalCheckinService] Conexão caiu durante o sync. Parando fila.');
                    break;
                } else if (error.response && error.response.status >= 400 && error.response.status < 500) {
                    // Erro de lógica (ex: Já estava com check-in ou QR Inválido). Marcamos para não travar a fila.
                    await db.filaSincronizacao.update(item.id, { status: 'erro_negocio', observacao: error.response.data.error });
                }
            }
        }

        window.dispatchEvent(new CustomEvent('sync-status-changed', { detail: { count: await this.getPendenteCount() } }));
        console.log('[LocalCheckinService] Sincronização finalizada.');
    }

    /**
     * Adiciona Observer Global no arquivo App/Main 
     */
    iniciarListenerConexao(onSyncStart, onSyncEnd) {
        window.addEventListener('online', async () => {
            console.log('[LocalCheckinService] Conexão restaurada.');
            const pendentes = await db.filaSincronizacao.where('status').equals('pendente').count();

            if (pendentes > 0) {
                if (onSyncStart) onSyncStart(pendentes);
                await this.sincronizarFila();
                if (onSyncEnd) onSyncEnd();
            }
        });
    }

    /**
     * Analise manual de quantos registros faltam syncar para a UI
     */
    async getPendenteCount() {
        return await db.filaSincronizacao.where('status').equals('pendente').count();
    }
}

export default new LocalCheckinService();
