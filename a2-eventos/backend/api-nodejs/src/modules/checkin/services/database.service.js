const { supabase } = require('../../../config/supabase');
const logger = require('../../../services/logger');
const websocketService = require('../../../services/websocketService');
const queueService = require('../../../services/queue.service');

class DatabaseService {
    async logDeniedAccess(evento_id, pessoa_id, metodo, dispositivo_id, created_by, motivo) {
        logger.warn(`🛑 ACESSO NEGADO: ID ${pessoa_id} - Motivo: ${motivo}`);
        const logId = require('uuid').v4();
        const logNegado = {
            id: logId, evento_id, pessoa_id, tipo: 'negado',
            metodo, dispositivo_id,
            created_by, observacao: motivo,
            created_at: new Date().toISOString()
        };

        const { error } = await supabase.from('logs_acesso').insert([logNegado]);
        if (error) logger.error('Erro ao salvar log negado no Supabase:', error);

        await queueService.publishLogToCloud(logNegado);
        websocketService.emit('new_access', logNegado, evento_id);
    }

    async registerAccessTransaction(logId, timestamp, payload, pessoa, new_status) {
        const { evento_id, pessoa_id, tipo, metodo, dispositivo_id, confianca, foto_capturada, created_by, sync_id } = payload;
        
        let rpcResult = { success: true };

        const logPayload = {
            id: logId, evento_id, pessoa_id, tipo, metodo, dispositivo_id,
            confianca, foto_capturada, created_by, sync_id, created_at: timestamp
        };

        try {
            const { error: insertErr } = await supabase
                .from('logs_acesso')
                .insert([{
                    id: logId, evento_id, pessoa_id, tipo, metodo,
                    dispositivo_id, confianca, foto_capturada,
                    created_at: timestamp.toISOString(),
                    created_by
                }]);

            // Ignorar erro de duplicidade (ON CONFLICT equivalente)
            if (insertErr && insertErr.code !== '23505') throw insertErr;
            if (insertErr?.code === '23505') return { success: true, already_done: true };

            if (pessoa.status_acesso !== new_status) {
                await supabase
                    .from('pessoas')
                    .update({ status_acesso: new_status, atualizado_em: new Date().toISOString() })
                    .eq('id', pessoa_id);
            }
        } catch (error) {
            if (error.code === '23505') return { success: true, already_done: true };
            throw error;
        }

        rpcResult.log_id = logId;
        rpcResult.new_status = new_status;

        // Publica no Redis Stream para o Cloud Worker assumir de forma desacoplada
        await queueService.publishLogToCloud(logPayload);
        logger.info(`💾 Log ${logId} salvo na Nuvem e encaminhado ao Redis Queue.`);

        return rpcResult;
    }
}

module.exports = new DatabaseService();
