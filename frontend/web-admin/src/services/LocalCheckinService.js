import { v4 as uuidv4 } from 'uuid';
import { db } from './db';
import api from './api';

const log = process.env.NODE_ENV === 'development' ? console.log : () => {};
const warn = process.env.NODE_ENV === 'development' ? console.warn : () => {};

const RETENTATIVA_MS = 30000;

/**
 * Sem resposta, timeout ou servidor fora (502/503/504 do nginx/Cloudflare) é "offline":
 * o acesso vai para a fila. 4xx é regra de negócio e volta para a tela.
 */
const ehFalhaDeConexao = (error) => {
    if (!error.response || error.code === 'ECONNABORTED' || error.message === 'Network Error') return true;
    return [0, 502, 503, 504].includes(error.response.status);
};

/**
 * LocalCheckinService: Gerenciamento offline-first de registros de acesso.
 * O sync_id único vira o id do log no servidor: o reenvio da fila não duplica o acesso.
 */
class LocalCheckinService {
    constructor() {
        this._sincronizando = false;
        this._timerRetentativa = null;
    }

    /**
     * Tenta realizar o checkin direto na API. Se falhar por timeout ou erro de rede, salva localmente.
     * @param {Object} payload Dados do QRCode ou busca manual + metadados (tipo, dispositivo_id)
     * @param {string} metodo 'qrcode', 'manual', 'rfid'
     * @returns {Object} Resultado com status atual (sincronizado ou local)
     */
    async realizarCheckin(payload, metodo) {
        return this.enviar(`/access/checkin/${metodo}`, { ...payload, metodo }, metodo);
    }

    /**
     * Envia um acesso para qualquer rota (/access/leitor-rapido, /access/credenciar-pulseira...)
     * com a mesma garantia: sem servidor, fica na fila e sobe sozinho depois.
     */
    async enviar(endpoint, payload, tipoOperacao = 'manual') {
        // Garantir sync_id único para prevenção de duplicidade no backend
        const data = { ...payload, sync_id: payload.sync_id || uuidv4() };

        if (!navigator.onLine) {
            return await this.salvarNaFila(endpoint, data, tipoOperacao);
        }

        try {
            const response = await api.post(endpoint, data, { timeout: 5000, hideDefaultError: true });
            return {
                status: 'sincronizado',
                message: response.data.message || 'Acesso registrado com sucesso!',
                data: response.data
            };
        } catch (error) {
            if (ehFalhaDeConexao(error)) {
                warn('[LocalCheckinService] Servidor indisponível. Salvando acesso localmente.');
                return await this.salvarNaFila(endpoint, data, tipoOperacao);
            }

            // Propaga erros de negócio (403 Proibido, 404 Não Encontrado, etc)
            throw error;
        }
    }

    /**
     * Salva o registro na fila do IndexedDB
     */
    async salvarNaFila(endpoint, data, tipoOperacao) {
        const item = {
            payload: data,
            endpoint,
            tipo_operacao: tipoOperacao,
            data_criacao: new Date().toISOString(),
            status: 'pendente'
        };

        await db.filaSincronizacao.add(item);
        this._agendarRetentativa();

        // Notifica a UI sobre a mudança no contador de pendências
        window.dispatchEvent(new CustomEvent('sync-status-changed', {
            detail: { count: await this.getPendenteCount() }
        }));

        return {
            status: 'local',
            message: 'Sem conexão com o servidor. Acesso salvo neste aparelho e será enviado assim que a conexão voltar.',
            data: item
        };
    }

    /**
     * Processa a fila caso a internet volte (uma sincronização por vez)
     */
    async sincronizarFila() {
        if (!navigator.onLine || this._sincronizando) return;
        this._sincronizando = true;

        try {
            const pendentes = await db.filaSincronizacao.where('status').equals('pendente').toArray();
            if (pendentes.length === 0) return;

            log(`[LocalCheckinService] Sincronizando ${pendentes.length} registros pendentes...`);

            for (const item of pendentes) {
                try {
                    const endpoint = item.endpoint || `/access/checkin/${item.tipo_operacao}`;
                    const data = {
                        ...item.payload,
                        offline_timestamp: item.data_criacao // Injeta timestamp do momento real do bip
                    };

                    await api.post(endpoint, data, { hideDefaultError: true });

                    // Sucesso: deleta da fila local
                    await db.filaSincronizacao.delete(item.id);
                } catch (error) {
                    if (ehFalhaDeConexao(error)) {
                        warn('[LocalCheckinService] Conexão perdida durante sync. Interrompendo fila.');
                        break;
                    } else if (error.response && error.response.status >= 400 && error.response.status < 500) {
                        // Erro de lógica (ex: Já estava com check-in). Marcamos para não travar a fila.
                        await db.filaSincronizacao.update(item.id, {
                            status: 'erro_negocio',
                            observacao: error.response.data?.error
                        });
                    }
                }
            }

            window.dispatchEvent(new CustomEvent('sync-status-changed', {
                detail: { count: await this.getPendenteCount() }
            }));

            // F-02: Notifica UI de que os dados mudaram (necessário refresh de listas)
            window.dispatchEvent(new CustomEvent('offline-sync-completed'));
        } finally {
            this._sincronizando = false;
            if (await this.getPendenteCount() > 0) this._agendarRetentativa();
        }
    }

    /**
     * Wi-Fi ligado com servidor fora não dispara o evento 'online':
     * enquanto houver pendências, tenta de novo a cada 30 s.
     */
    _agendarRetentativa() {
        if (this._timerRetentativa) return;
        this._timerRetentativa = setTimeout(async () => {
            this._timerRetentativa = null;
            await this.sincronizarFila();
        }, RETENTATIVA_MS);
    }

    /**
     * Listener para monitorar a conexão globalmente
     */
    iniciarListenerConexao(onSyncStart, onSyncEnd) {
        // Remover listener anterior se existir
        if (this._onlineHandler) {
            window.removeEventListener('online', this._onlineHandler);
        }

        this._onlineHandler = async () => {
            log('[LocalCheckinService] Conexão restaurada.');
            const count = await this.getPendenteCount();
            if (count > 0) {
                if (onSyncStart) onSyncStart(count);
                await this.sincronizarFila();
                if (onSyncEnd) onSyncEnd();
            }
        };

        window.addEventListener('online', this._onlineHandler);

        // Pendências de uma sessão anterior (aba fechada sem conexão) sobem sozinhas
        this.getPendenteCount().then((count) => { if (count > 0) this._agendarRetentativa(); }).catch(() => {});
    }

    pararListenerConexao() {
        if (this._onlineHandler) {
            window.removeEventListener('online', this._onlineHandler);
            this._onlineHandler = null;
        }
    }

    async getPendenteCount() {
        return await db.filaSincronizacao.where('status').equals('pendente').count();
    }
}

export default new LocalCheckinService();
