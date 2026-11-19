import { v4 as uuidv4 } from 'uuid';
import { db } from './db';
import api from './api';
import { ehCodigoLeitor } from '../utils/codigoLeitor';

const log = process.env.NODE_ENV === 'development' ? console.log : () => {};
const warn = process.env.NODE_ENV === 'development' ? console.warn : () => {};

// Intervalo entre as novas tentativas de um acesso que não recebeu resposta do servidor
const RETENTATIVA_MS = 30000;
// Depois de tantas falhas sem resposta, o acesso sai da fila e vai para "recusados" (não trava a fila)
const MAX_TENTATIVAS = 3;
const MOTIVO_SEM_RESPOSTA = 'Não aceito: o servidor não respondeu (ou deu erro) em 3 tentativas.';

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
 *
 * Estados da fila (filaSincronizacao.status):
 * - pendente: aguarda envio (tentativas = falhas sem resposta até agora; proxima_tentativa = quando tentar de novo)
 * - erro_negocio: "recusado" — o servidor recusou (4xx) ou não respondeu em MAX_TENTATIVAS. Sai da fila até o operador dispensar.
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

        // Com rede, a fila sobe antes da leitura nova (FIFO): uma saída antiga não pode ficar atrás de
        // uma entrada nova. Só entra no fim da fila o que ainda NÃO foi tentado (o servidor não chegou a
        // responder). Acesso que já falhou (em nova tentativa) ou foi recusado não segura a leitura nova.
        if (await this.getPendenteCount() > 0) {
            await this.sincronizarFila();
            if (await this.contarPendentesNaoTentados() > 0) {
                return await this.salvarNaFila(endpoint, data, tipoOperacao);
            }
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
        // Texto que não é código não vai para a fila: o servidor recusaria depois, e o operador precisa saber agora
        const valorLido = data.codigo ?? data.numero_pulseira;
        if (valorLido != null && !ehCodigoLeitor(valorLido)) {
            return { status: 'invalido', message: 'Não é um código válido', data: null };
        }

        const item = {
            payload: data,
            endpoint,
            tipo_operacao: tipoOperacao,
            data_criacao: new Date().toISOString(),
            status: 'pendente',
            tentativas: 0,
            proxima_tentativa: 0,
            ultimo_erro: null
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
     * Processa a fila (uma sincronização por vez), na ordem em que os acessos foram lidos.
     * - Recusa do servidor (4xx): vai para "recusados" na hora e não segura a fila.
     * - Sem resposta, timeout ou erro 5xx: conta uma tentativa; depois de MAX_TENTATIVAS vai para "recusados".
     *   Enquanto espera a nova tentativa, o acesso é pulado e não bloqueia os seguintes.
     * - Servidor fora (sem resposta/502-504): a fila para aqui e volta a tentar depois.
     * Devolve { conexaoFalhou }: true quando o servidor não respondeu e a fila parou.
     */
    async sincronizarFila() {
        if (!navigator.onLine || this._sincronizando) return { conexaoFalhou: false };
        this._sincronizando = true;
        let conexaoFalhou = false;

        try {
            const agora = Date.now();
            const pendentes = (await db.filaSincronizacao.where('status').equals('pendente').toArray())
                .filter((item) => (item.proxima_tentativa || 0) <= agora);
            if (pendentes.length === 0) return { conexaoFalhou };

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
                    const status = error.response?.status;
                    if (status >= 400 && status < 500) {
                        // Regra de negócio (ex: já estava com check-in): recusado, sem travar a fila
                        await this._marcarRecusado(item, error.response.data?.error);
                        continue;
                    }

                    // Sem resposta, timeout ou erro do servidor: conta a tentativa
                    await this._registrarFalha(item, error);

                    if (ehFalhaDeConexao(error)) {
                        conexaoFalhou = true;
                        warn('[LocalCheckinService] Conexão perdida durante sync. Interrompendo fila.');
                        break;
                    }
                }
            }

            window.dispatchEvent(new CustomEvent('sync-status-changed', {
                detail: { count: await this.getPendenteCount() }
            }));

            // F-02: Notifica UI de que os dados mudaram (necessário refresh de listas)
            window.dispatchEvent(new CustomEvent('offline-sync-completed'));
            return { conexaoFalhou };
        } finally {
            this._sincronizando = false;
            if (await this.getPendenteCount() > 0) this._agendarRetentativa();
        }
    }

    async _marcarRecusado(item, motivo) {
        await db.filaSincronizacao.update(item.id, {
            status: 'erro_negocio',
            observacao: motivo || 'Recusado pelo servidor'
        });
    }

    async _registrarFalha(item, error) {
        const tentativas = (item.tentativas || 0) + 1;
        const ultimo_erro = error.response?.data?.error || error.message || 'Sem resposta do servidor';
        if (tentativas >= MAX_TENTATIVAS) {
            await db.filaSincronizacao.update(item.id, {
                status: 'erro_negocio',
                tentativas,
                ultimo_erro,
                observacao: MOTIVO_SEM_RESPOSTA
            });
            return;
        }
        await db.filaSincronizacao.update(item.id, {
            tentativas,
            ultimo_erro,
            proxima_tentativa: Date.now() + RETENTATIVA_MS
        });
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

    /** Só o que está aguardando envio (status pendente). Recusados não entram aqui. */
    async getPendenteCount() {
        return await db.filaSincronizacao.where('status').equals('pendente').count();
    }

    /** Pendentes que ainda não receberam nenhuma resposta do servidor: só eles seguram a ordem de uma leitura nova */
    async contarPendentesNaoTentados() {
        return await db.filaSincronizacao.where('status').equals('pendente')
            .filter((item) => !(item.tentativas > 0))
            .count();
    }

    /** Acessos que o servidor recusou (ou não respondeu em MAX_TENTATIVAS) ao sincronizar, até o operador dispensar */
    async listarRecusados() {
        return await db.filaSincronizacao.where('status').equals('erro_negocio').toArray();
    }

    async dispensarRecusado(id) {
        await db.filaSincronizacao.delete(id);
        window.dispatchEvent(new CustomEvent('sync-status-changed', {
            detail: { count: await this.getPendenteCount() }
        }));
    }
}

export default new LocalCheckinService();
