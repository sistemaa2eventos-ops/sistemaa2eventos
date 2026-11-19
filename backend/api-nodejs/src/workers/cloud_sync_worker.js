const logger = require('../services/logger');
const queueService = require('../services/queue.service');
const { supabase } = require('../config/supabase');
const { ehFuncaoAusente, erroDoBloqueioDoBanco } = require('../modules/checkin/services/entradaEtapa');

// Erros do Postgres que nunca vão se resolver tentando de novo (dado inválido ou recusa de regra)
const ERROS_PERMANENTES = new Set([
    '23502', // not null
    '23503', // foreign key (pessoa/evento não existe)
    '23505', // duplicidade: id já gravado ou índice de entrada (não muda com nova tentativa)
    '23514', // check constraint
    '22P02', // tipo inválido (uuid etc.)
    'P0409', // registrar_acesso_etapa: pessoa já está dentro na etapa/dia/área (entrada recusada)
    'PGRST204' // coluna inexistente
]);

// Motivo legível do registro recusado (aparece no log do servidor)
const MOTIVO_RECUSA = {
    P0409: 'entrada recusada: pessoa já está dentro nesta etapa, área e dia',
    '23505': 'duplicidade recusada: id já gravado ou entrada repetida na etapa'
};

// Recusas que vão para a lista visível do painel (tabela acessos_recusados), e não só para o log do servidor
const RECUSAS_LISTADAS = new Set(['P0409', '23505']);
const TABELA_RECUSADOS = 'acessos_recusados'; // migration 20261119c_acessos_recusados.sql

const RECUPERAR_PENDENTES_MS = 60 * 1000; // mensagens sem ACK há mais de 1 min voltam a ser processadas

/** Tabela de recusas ausente (migration 20261119c não aplicada) */
const tabelaRecusadosAusente = (error) => !!error && (
    error.code === '42P01' || error.code === 'PGRST205' || new RegExp(TABELA_RECUSADOS).test(error.message || '')
);

/** Motivo legível da recusa: o banco diz se a pessoa estava dentro (hint 'false|instante') ou saiu sem liberação ('true|instante') */
function motivoDaRecusa(logData, error) {
    if (error.code === 'P0409') {
        const instante = logData.created_at || new Date();
        return `Recusado ao gravar da fila: ${erroDoBloqueioDoBanco(error.hint, instante).message}`;
    }
    return 'Recusado ao gravar da fila: duplicidade (já existe registro com este id, ou entrada repetida nesta etapa, área e dia)';
}

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

            // Passagem com etapa (entrada/saída; credenciamento é passagem comum): mesma gravação do backend, com a regra de
            // entrada única. Sem etapa (negado, log antigo): upsert direto como antes.
            if (cloudPayload.etapa != null || cloudPayload.dia_civil != null) {
                await this.gravarPassagem(cloudPayload);
            } else {
                await this.gravarDireto(cloudPayload);
            }

            // Acesso liberado que caiu na fila: aplica também o status da pessoa
            // (só se não houver acesso mais novo dela — senão desfaria uma saída posterior).
            if (_status_pessoa && cloudPayload.pessoa_id) await this.aplicarStatusPessoa(cloudPayload, _status_pessoa);

            await this.client.xAck(queueService.UP_STREAM_KEY, queueService.CONSUMER_GROUP, id);
            logger.info(`✅ [CloudSyncWorker] Log ${logData.id} regravado no Supabase.`);
        } catch (error) {
            const permanente = !logData || ERROS_PERMANENTES.has(error.code);
            if (permanente) {
                // Dado inválido ou recusa de regra: confirmar (ack) para não reprocessar para sempre.
                // Fica registrado no log com o motivo.
                const motivo = MOTIVO_RECUSA[error.code] || (logData ? 'dado inválido' : 'payload não lido');
                logger.error(`❌ [CloudSyncWorker] Log recusado (msg ${id}, erro ${error.code || 'parse'}, motivo: ${motivo}): ${error.message}`, { log: logData });

                // Recusa de passagem que o operador já viu como "ok": vai para a lista do painel antes do ack.
                // Falha temporária ao gravar a recusa: sem ack, volta na retentativa (a passagem não se perde).
                if (logData && RECUSAS_LISTADAS.has(error.code)) {
                    try {
                        await this.registrarRecusa(logData, error);
                    } catch (errRecusa) {
                        logger.warn(`⚠️ [CloudSyncWorker] Recusa não gravada na lista (msg ${id}), nova tentativa em ~1 min: ${errRecusa.message}`);
                        return;
                    }
                }
                await this.client.xAck(queueService.UP_STREAM_KEY, queueService.CONSUMER_GROUP, id).catch(() => {});
            } else {
                // Falha temporária: sem ACK, volta via recuperarPendentes()
                logger.warn(`⚠️ [CloudSyncWorker] Falha temporária no log (msg ${id}), nova tentativa em ~1 min: ${error.message}`);
            }
        }
    }

    /** Passagem com etapa: pela função do banco (entrada única). Sem a função, grava direto e avisa. */
    async gravarPassagem(linha) {
        const { error } = await supabase.rpc('registrar_acesso_etapa', { p_row: linha });
        if (!error) return;
        if (ehFuncaoAusente(error)) {
            logger.warn('[CloudSyncWorker] função registrar_acesso_etapa ausente: rode a migration 20261118b_entrada_aberta.sql. Gravando direto, sem a regra de entrada única.');
            return this.gravarDireto(linha);
        }
        throw error;
    }

    /**
     * Grava a recusa na lista do painel (acessos_recusados). Sem a tabela, ou com erro permanente nela, só
     * avisa e segue (não trava a fila). Erro temporário é lançado: a mensagem fica sem ACK para nova tentativa.
     */
    async registrarRecusa(logData, error) {
        // 23505 com o id já gravado em logs_acesso é REENVIO do mesmo acesso (ack, sem recusa na lista).
        // Só é recusa de verdade quando o id não existe. Erro ao consultar: lança (sem ack, volta na retentativa).
        if (error.code === '23505' && logData.id) {
            const { data: jaGravado, error: erroConsulta } = await supabase
                .from('logs_acesso').select('id').eq('id', logData.id).maybeSingle();
            if (erroConsulta) throw erroConsulta;
            if (jaGravado) {
                logger.info(`[CloudSyncWorker] Reenvio do log ${logData.id} (já gravado): sem recusa.`);
                return;
            }
        }
        const linha = {
            evento_id: logData.evento_id || null,
            pessoa_id: logData.pessoa_id || null,
            area_id: logData.area_id || null,
            etapa: logData.etapa || null,
            tipo: logData.tipo || null,
            metodo: logData.metodo || null,
            motivo: motivoDaRecusa(logData, error),
            dados: { codigo: error.code, log_id: logData.id || null, dia_civil: logData.dia_civil || null, created_at: logData.created_at || null }
        };
        const { error: errInsert } = await supabase.from(TABELA_RECUSADOS).insert([linha]);
        if (!errInsert) return;
        if (tabelaRecusadosAusente(errInsert)) {
            logger.warn('[CloudSyncWorker] Tabela acessos_recusados ausente: rode a migration 20261119c_acessos_recusados.sql. Recusa só no log.');
            return;
        }
        if (ERROS_PERMANENTES.has(errInsert.code)) {
            logger.warn(`[CloudSyncWorker] Recusa não gravada na lista (erro ${errInsert.code}): ${errInsert.message}`);
            return;
        }
        throw errInsert;
    }

    /** Gravação direta (idempotente pelo id), como antes da função de etapa. */
    async gravarDireto(linha) {
        const { error } = await supabase.from('logs_acesso').upsert(linha, {
            onConflict: 'id',
            ignoreDuplicates: true
        });
        if (error) throw error;
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
