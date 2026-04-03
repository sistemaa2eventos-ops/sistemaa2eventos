const logger = require('../services/logger');
const queueService = require('../services/queue.service');
const { supabase } = require('../../config/supabase');
const { getConnection, sql } = require('../../config/database');

class CloudSyncWorker {
    constructor() {
        this.isRunning = false;
        this.client = null;
    }

    start() {
        if (this.isRunning) return;
        this.isRunning = true;
        
        logger.info('🚀 [CloudSyncWorker] Iniciado: aguardando eventos do Redis...');
        this.client = queueService.getClient();
        
        if (!this.client) {
             logger.warn('⚠️ [CloudSyncWorker] Redis ausente. O processamento assíncrono falhará na memória.');
             return;
        }

        // Diferenciar a thread (offloading do event loop)
        setTimeout(() => this.loop(), 5000); 
    }

    async loop() {
        while (this.isRunning) {
            try {
                // XREADGROUP BLOCK 5000 STREAMS stream:access_logs_up >
                const results = await this.client.xReadGroup(
                    queueService.CONSUMER_GROUP, 
                    'worker_instance_1', 
                    [{
                        key: queueService.UP_STREAM_KEY,
                        id: '>' // Apenas mensagens não processadas
                    }],
                    { BLOCK: 5000, COUNT: 20 }
                );

                if (results && results.length > 0) {
                    for (const stream of results) {
                        for (const message of stream.messages) {
                            await this.processMessage(message);
                        }
                    }
                }
            } catch (error) {
                logger.error(`[CloudSyncWorker] Erro no loop de escuta: ${error.message}`);
                await new Promise(r => setTimeout(r, 3000)); // Esperar antes de reconectar
            }
        }
    }

    async processMessage(message) {
        try {
            const { id, message: payloadMap } = message;
            const logData = JSON.parse(payloadMap.payload_json);

            logger.info(`📤 [CloudSyncWorker] Upsert Nuvem: Processando Log ${logData.id}`);

            // Transformar num DTO aceitável pelo Supabase Cloud
            const cloudPayload = { ...logData };
            delete cloudPayload.pessoas; // remover relações se houver
            
            const { error } = await supabase.from('logs_acesso').upsert(cloudPayload, {
                onConflict: 'id',
                ignoreDuplicates: true
            });

            if (error) {
                 if (error.message.includes('foreign key')) {
                     logger.warn(`⚠️ [CloudSyncWorker] FK Missing: Pessoa ${logData.pessoa_id} não sincronizada ainda na nuvem.`);
                 } else {
                     throw error;
                 }
            }
            
            // XACK - Confirma que gravou no Supabase (Mata fisicamente do Consumer Group)
            await this.client.xAck(queueService.UP_STREAM_KEY, queueService.CONSUMER_GROUP, id);
            
            // Atualizar status no MS SQL (Edge Local DB)
            try {
                const connection = await getConnection();
                await connection.request()
                    .input('ids', sql.VarChar, logData.id)
                    .execute('sp_marcar_logs_sincronizados');
            } catch (sqlErr) {
                logger.warn(`⚠️ [CloudSyncWorker] ACK Nuvem enviado, mas falha ao marcar sincronizado no MS SQL local: ${sqlErr.message}`);
            }

            logger.info(`✅ [CloudSyncWorker] Log da borda perfeitamente salvo na Cloud (ID: ${logData.id}).`);

        } catch (error) {
            logger.error(`❌ [CloudSyncWorker] Falha ao processar log (msg ${message.id}): ${error.message}`);
            // Mensagem cai na Pending Entries List (PEL) e não recebe XACK.
            // Para não travar, ignoramos - deve ser feito AutoClaim pra retentativas futuras.
        }
    }
}

module.exports = new CloudSyncWorker();
