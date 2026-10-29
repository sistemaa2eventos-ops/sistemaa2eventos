const logger = require('../services/logger');
const queueService = require('../services/queue.service');
const { supabase } = require('../config/supabase');

// Erros do Postgres que nunca vão se resolver tentando de novo (dado inválido)
const ERROS_PERMANENTES = new Set([
    '23502', // not null
    '23503', // foreign key (pessoa/evento não existe)
    '23514', // check constraint
    '22P02', // tipo inválido (uuid etc.)
    'PGRST204' // coluna inexistente
]);

const RECUPERAR_PENDENTES_MS = 60 * 1000; // mensagens sem ACK há mais de 1 min voltam a ser processadas

/**
 * Retentativa de logs de acesso que NÃO conseguiram ser gravados direto no Supabase
 * (database.service publica no stream só quando a gravação direta falha).
 */
class CloudSyncWorker {
    constructor() {
        this.isRunning = false;
        this.client = null;
        this.falhasSeguidas = 0;
        this.ultimaRecuperacao = 0;
    }

    start() {
        if (this.isRunning) return;
        this.isRunning = true;

        logger.info('🚀 [CloudSyncWorker] Iniciado: aguardando logs para retentativa no Redis...');
        const shared = queueService.getClient();

        if (!shared) {
            logger.warn('⚠️ [CloudSyncWorker] Redis ausente. Retentativa de logs desativada.');
            return;
        }

        // Conexão PRÓPRIA para o XREADGROUP BLOCK: na conexão compartilhada, a espera
        // bloqueante (5 s) segurava cada XADD de log de acesso — e a resposta à porta.
        setTimeout(async () => {
            try {
                this.client = shared.duplicate();
                this.client.on('error', (err) => logger.debug(`[CloudSyncWorker] Redis: ${err.message}`));
                await this.client.connect();
            } catch (err) {
                logger.warn(`[CloudSyncWorker] Falha ao abrir conexão dedicada, usando a compartilhada: ${err.message}`);
                this.client = shared;
            }
            this.loop();
        }, 5000);
    }

    async loop() {
        while (this.isRunning) {
            try {
                if (Date.now() - this.ultimaRecuperacao > RECUPERAR_PENDENTES_MS) {
                    this.ultimaRecuperacao = Date.now();
                    await this.recuperarPendentes();
                }

                const results = await this.client.xReadGroup(
                    queueService.CONSUMER_GROUP,
                    'worker_instance_1',
                    [{ key: queueService.UP_STREAM_KEY, id: '>' }],
                    { BLOCK: 5000, COUNT: 20 }
                );

                for (const stream of results || []) {
                    for (const message of stream.messages) {
                        await this.processMessage(message);
                    }
                }
                this.falhasSeguidas = 0;
            } catch (error) {
                this.falhasSeguidas++;
                // Com o Redis fora do ar, registra a 1ª falha e depois só a cada 20 (antes: uma linha a cada 3 s)
                if (this.falhasSeguidas === 1 || this.falhasSeguidas % 20 === 0) {
                    logger.error(`[CloudSyncWorker] Erro no loop de escuta (${this.falhasSeguidas}x): ${error.message}`);
                }
                const espera = Math.min(3000 * this.falhasSeguidas, 60000);
                await new Promise(r => setTimeout(r, espera));
            }
        }
    }

    /** Reprocessa mensagens que ficaram sem ACK (falha temporária numa tentativa anterior). */
    async recuperarPendentes() {
        let inicio = '0-0';
        do {
            const reply = await this.client.xAutoClaim(
                queueService.UP_STREAM_KEY, queueService.CONSUMER_GROUP, 'worker_instance_1',
                RECUPERAR_PENDENTES_MS, inicio, { COUNT: 20 }
            );
            for (const message of reply.messages || []) {
                if (message) await this.processMessage(message);
            }
            inicio = reply.nextId;
        } while (inicio && inicio !== '0-0');
    }

    async processMessage(message) {
        const { id, message: payloadMap } = message;
        let logData = null;
        try {
            logData = JSON.parse(payloadMap.payload_json);
            const { pessoas, _status_pessoa, ...cloudPayload } = logData; // remover relações e metadados

            const { error } = await supabase.from('logs_acesso').upsert(cloudPayload, {
                onConflict: 'id',
                ignoreDuplicates: true
            });
            if (error) throw error;

            // Acesso liberado que caiu na fila: aplica também o status da pessoa
            // (só se não houver acesso mais novo dela — senão desfaria uma saída posterior).
            if (_status_pessoa && cloudPayload.pessoa_id) await this.aplicarStatusPessoa(cloudPayload, _status_pessoa);

            await this.client.xAck(queueService.UP_STREAM_KEY, queueService.CONSUMER_GROUP, id);
            logger.info(`✅ [CloudSyncWorker] Log ${logData.id} regravado no Supabase.`);
        } catch (error) {
            const permanente = !logData || ERROS_PERMANENTES.has(error.code);
            if (permanente) {
                // Dado inválido: confirmar para não reprocessar para sempre (fica registrado no log)
                logger.error(`❌ [CloudSyncWorker] Log descartado (msg ${id}, erro ${error.code || 'parse'}): ${error.message}`, { log: logData });
                await this.client.xAck(queueService.UP_STREAM_KEY, queueService.CONSUMER_GROUP, id).catch(() => {});
            } else {
                // Falha temporária: sem ACK, volta via recuperarPendentes()
                logger.warn(`⚠️ [CloudSyncWorker] Falha temporária no log (msg ${id}), nova tentativa em ~1 min: ${error.message}`);
            }
        }
    }

    async aplicarStatusPessoa(log, status) {
        const { data: maisNovo, error: buscaErr } = await supabase
            .from('logs_acesso')
            .select('id')
            .eq('pessoa_id', log.pessoa_id)
            .neq('tipo', 'negado')
            .gt('created_at', log.created_at)
            .limit(1);
        if (buscaErr) throw buscaErr;
        if (maisNovo?.length) return;

        const { error: statusErr } = await supabase
            .from('pessoas')
            .update({ status_acesso: status, atualizado_em: new Date().toISOString() })
            .eq('id', log.pessoa_id);
        if (statusErr) throw statusErr;
    }
}

module.exports = new CloudSyncWorker();
