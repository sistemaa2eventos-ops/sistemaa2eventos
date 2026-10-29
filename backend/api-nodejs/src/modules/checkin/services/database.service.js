const { supabase } = require('../../../config/supabase');
const logger = require('../../../services/logger');
const websocketService = require('../../../services/websocketService');
const queueService = require('../../../services/queue.service');

class DatabaseService {
    /**
     * Grava o acesso negado e emite UM aviso 'new_access' para o painel.
     * @param {Object} [extras] dados só para exibição em tempo real e área do log:
     *   { pessoa, area_id, area_nome, dispositivo_nome }
     */
    async logDeniedAccess(evento_id, pessoa_id, metodo, dispositivo_id, created_by, motivo, extras = {}) {
        logger.warn(`🛑 ACESSO NEGADO: ID ${pessoa_id} - Motivo: ${motivo}`);
        const logId = require('uuid').v4();
        const logNegado = {
            id: logId, evento_id, pessoa_id, tipo: 'negado',
            status_log: 'rejeitado',
            metodo, dispositivo_id,
            created_by, observacao: motivo,
            area_id: extras.area_id || null,
            created_at: new Date().toISOString()
        };

        const { error } = await supabase.from('logs_acesso').insert([logNegado]);
        if (error) {
            logger.error('Erro ao salvar log negado no Supabase (vai para a fila de retentativa):', error);
            // Plano B: o CloudSyncWorker regrava quando o Supabase voltar
            await queueService.publishLogToCloud(logNegado);
        }
        const p = extras.pessoa;
        websocketService.emit('new_access', {
            ...logNegado,
            tipo_acesso: 'negado',
            erro: motivo,
            pessoa_nome: p?.nome_completo || null,
            pessoas: p ? { id: p.id, nome_completo: p.nome_completo, cpf: p.cpf, foto_url: p.foto_url } : null,
            area_nome: extras.area_nome || null,
            dispositivo_nome: extras.dispositivo_nome || null
        }, evento_id);
    }

    async registerAccessTransaction(logId, timestamp, payload, pessoa, new_status) {
        const { evento_id, pessoa_id, tipo, metodo, dispositivo_id, confianca, foto_capturada, created_by, area_id, observacao } = payload;
        
        let rpcResult = { success: true };

        const numero_pulseira = pessoa?.numero_pulseira || payload?.numero_pulseira || null;
        const log = {
            id: logId, evento_id, pessoa_id, tipo, metodo,
            dispositivo_id, confianca, foto_capturada, area_id,
            numero_pulseira,
            observacao: observacao || null,
            created_at: timestamp.toISOString(),
            created_by
        };

        let insertErr = null;
        try {
            ({ error: insertErr } = await supabase.from('logs_acesso').insert([log]));
        } catch (error) {
            insertErr = error; // timeout/rede
        }

        // Ignorar erro de duplicidade (ON CONFLICT equivalente)
        if (insertErr?.code === '23505') return { success: true, already_done: true };

        if (insertErr) {
            // Plano B: acesso já validado não pode se perder porque o Supabase oscilou.
            // O CloudSyncWorker regrava o log e aplica o status da pessoa quando ele voltar.
            const naFila = await queueService.publishLogToCloud({ ...log, _status_pessoa: new_status });
            if (!naFila) throw insertErr;
            logger.error(`Log ${logId} não gravado no Supabase; foi para a fila de retentativa: ${insertErr.message}`);
            rpcResult.na_fila = true;
        } else if (pessoa.status_acesso !== new_status) {
            const { error: statusErr } = await supabase
                .from('pessoas')
                .update({ status_acesso: new_status, atualizado_em: new Date().toISOString() })
                .eq('id', pessoa_id);
            if (statusErr) logger.error(`Falha ao atualizar status da pessoa ${pessoa_id} para ${new_status}: ${statusErr.message}`);
        }

        rpcResult.log_id = logId;
        rpcResult.new_status = new_status;

        // Saída encerra a liberação manual do turno e reavalia a documentação
        // (quem saiu com pendência volta a "pendente" para a próxima entrada).
        if (tipo === 'checkout') {
            (async () => {
                const liberacaoManual = require('../../entities/liberacaoManual.service');
                await liberacaoManual.encerrar(pessoa_id, 'checkout');
                await require('../../entities/documento.service').sincronizarStatusPessoa(null, pessoa_id);
            })().catch(e => logger.warn(`[Checkout] Falha ao encerrar liberação/reavaliar ${pessoa_id}: ${e.message}`));
        }

        // O log já foi gravado direto no Supabase acima; republicar no Redis só o regravava.
        logger.debug(`💾 Log ${logId} salvo.`);

        return rpcResult;
    }
}

module.exports = new DatabaseService();
