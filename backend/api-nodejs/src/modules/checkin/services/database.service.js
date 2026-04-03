const { supabase } = require('../../../config/supabase');
const { getConnection: getMsSql, sql } = require('../../../config/database');
const { getPgConnection } = require('../../../config/pgEdge');
const logger = require('../../../services/logger');
const websocketService = require('../../../services/websocketService');
const queueService = require('../../../services/queue.service');

class DatabaseService {
    async logDeniedAccess(evento_id, pessoa_id, metodo, dispositivo_id, created_by, motivo) {
        logger.warn(`🛑 ACESSO NEGADO: ID ${pessoa_id} - Motivo: ${motivo}`);
        
        const pool = await getPgConnection();
        const logId = require('uuid').v4();
        
        await pool.query(`
            INSERT INTO logs_acesso (id, evento_id, pessoa_id, tipo, metodo, dispositivo_id, created_at, created_by, sincronizado)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, false)
        `, [logId, evento_id, pessoa_id, 'negado', metodo, dispositivo_id, new Date(), created_by]);

        const logNegado = { id: logId, evento_id, pessoa_id, tipo: 'negado', metodo, dispositivo_id, is_alert: true, created_by, observacao: motivo };
        await queueService.publishLogToCloud(logNegado);
        websocketService.emit('new_access', logNegado, evento_id);
    }

    async registerAccessTransaction(logId, timestamp, payload, pessoa, new_status) {
        const { evento_id, pessoa_id, tipo, metodo, dispositivo_id, confianca, foto_capturada, created_by, sync_id } = payload;
        
        let rpcResult = { success: true };

        const logPayload = {
            id: logId, evento_id, pessoa_id, tipo, metodo, dispositivo_id,
            confianca, foto_capturada, created_by, sincronizado: false, sync_id, created_at: timestamp
        };

        // Fase 3 do Outbox Pattern: Borda Ultra-Rápida Postgres Edge
        // Latência da nuvem foi banida do processo de catraca.
        try {
            const pool = await getPgConnection();
            
            const insertQuery = `
                INSERT INTO logs_acesso (id, evento_id, pessoa_id, tipo, metodo, dispositivo_id, confianca, foto_capturada, created_at, created_by, sincronizado, sync_id)
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, false, $11)
                ON CONFLICT (id) DO NOTHING
            `;
            const values = [logId, evento_id, pessoa_id, tipo, metodo, dispositivo_id, confianca, foto_capturada, timestamp, created_by, sync_id];
            
            await pool.query(insertQuery, values);
                 
            if (pessoa.status_acesso !== new_status) {
                 await pool.query(
                     'UPDATE pessoas SET status_acesso = $1, atualizado_em = NOW() WHERE id = $2',
                     [new_status, pessoa_id]
                 );
            }
        } catch (error) {
            // Postgres unique violation code is 23505
            if (error.code === '23505') return { success: true, already_done: true };
            throw error;
        }

        rpcResult.log_id = logId;
        rpcResult.new_status = new_status;

        // Publica no Redis Stream para o Cloud Worker assumir de forma desacoplada
        await queueService.publishLogToCloud(logPayload);
        logger.info(`💾 Log ${logId} salvo Fisicamente na Borda e encaminhado ao Redis Queue (Latência 0).`);

        return rpcResult;
    }
}

module.exports = new DatabaseService();
