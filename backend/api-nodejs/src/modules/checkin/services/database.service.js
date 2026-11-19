const { supabase } = require('../../../config/supabase');
const logger = require('../../../services/logger');
const websocketService = require('../../../services/websocketService');
const queueService = require('../../../services/queue.service');
const {
    ehViolacaoEntrada, ehFuncaoAusente, ehEntradaAberta,
    erroEntradaAberta, erroEntradaDuplicada, erroRegistroDuplicado, erroDoBloqueioDoBanco, buscarUltimoRegistroNaEtapa, estaDentro, colunaInexistente
} = require('./entradaEtapa');

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

    /**
     * Grava o acesso. Opções:
     * - atualizarStatus (default true): false no replay offline de um acesso mais antigo que o último
     *   evento da pessoa; o log fica como histórico e o status atual não muda.
     * - payload.etapa / payload.dia_civil: passagem com etapa (entrada ou saída). Entrada e saída,
     *   inclusive credenciamento (é passagem comum), gravam pela função registrar_acesso_etapa
     *   (migration 20261118b/20261119), que recusa entrada de quem está dentro ou saiu sem liberação (P0409).
     *   Sem a função no banco (migration não aplicada), grava direto e avisa no log.
     * Entrada recusada devolve { success: false, entrada_duplicada: true, erro } (409);
     * reenvio do mesmo id devolve already_done.
     */
    async registerAccessTransaction(logId, timestamp, payload, pessoa, new_status, opcoes = {}) {
        const { evento_id, pessoa_id, tipo, metodo, dispositivo_id, confianca, foto_capturada, created_by, area_id, observacao } = payload;
        const atualizarStatus = opcoes.atualizarStatus !== false;

        let rpcResult = { success: true };

        const numero_pulseira = pessoa?.numero_pulseira || payload?.numero_pulseira || null;
        const log = {
            id: logId, evento_id, pessoa_id, tipo, metodo,
            dispositivo_id, confianca, foto_capturada, area_id,
            numero_pulseira,
            observacao: observacao || null,
            created_at: timestamp.toISOString(),
            created_by,
            etapa: payload.etapa ?? null,
            dia_civil: payload.dia_civil ?? null
        };
        if (!atualizarStatus) {
            // Junta ao texto que já existe (ex.: CREDENCIAMENTO) em vez de substituí-lo: o aviso de replay continua
            const replay = 'Replay offline de acesso anterior ao último evento: status atual não alterado';
            log.observacao = log.observacao ? `${log.observacao} · ${replay}` : replay;
        }

        const comEtapa = log.etapa !== null || log.dia_civil !== null;
        const viaFuncao = comEtapa;

        const gravar = async (linha) => {
            try {
                return await supabase.from('logs_acesso').insert([linha]);
            } catch (error) {
                return { error }; // timeout/rede
            }
        };
        const gravarPelaFuncao = async (linha) => {
            try {
                return await supabase.rpc('registrar_acesso_etapa', { p_row: linha });
            } catch (error) {
                return { error }; // timeout/rede
            }
        };

        let insertErr;
        if (viaFuncao) {
            ({ error: insertErr } = await gravarPelaFuncao(log));
            if (insertErr && ehFuncaoAusente(insertErr)) {
                // Banco sem a migration 20261118b: grava direto. O índice antigo (se ainda existir) segue bloqueando reentrada.
                logger.warn('[Acesso] função registrar_acesso_etapa ausente: rode a migration 20261118b_entrada_aberta.sql. Gravando direto.');
                ({ error: insertErr } = await gravar(log));
            }
        } else {
            ({ error: insertErr } = await gravar(log));
        }

        if (insertErr && colunaInexistente(insertErr) && comEtapa) {
            // Banco sem a migration 20261118_logs_entrada_etapa: grava como antes (sem entrada única)
            logger.warn('[Acesso] logs_acesso sem colunas etapa/dia_civil: rode a migration 20261118_logs_entrada_etapa.sql');
            const { etapa, dia_civil, ...semEtapa } = log;
            ({ error: insertErr } = await gravar(semEtapa));
        }

        if (insertErr && ehEntradaAberta(insertErr)) {
            // Mesmo id já gravado = reenvio (idempotente). Outro id = a pessoa já está dentro (corrida ou repetição)
            const { data: mesmo } = await supabase.from('logs_acesso').select('id').eq('id', logId).maybeSingle();
            if (mesmo) return { success: true, already_done: true };
            // HINT 'liberavel|instante' (20261119): saiu sem liberação, ou dentro (sem prefixo = dentro)
            const erro = erroDoBloqueioDoBanco(insertErr.hint, timestamp);
            erro.etapa = log.etapa; // B8: etapa bloqueada vai no corpo do 409
            return { success: false, entrada_duplicada: true, erro };
        }

        if (insertErr?.code === '23505') {
            if (ehViolacaoEntrada(insertErr)) {
                // Índice antigo (antes da 20261118b, sem função no banco). Mesmo id já gravado = reenvio
                // (idempotente). Outro id = segunda entrada na etapa (corrida)
                const { data: mesmo } = await supabase.from('logs_acesso').select('id').eq('id', logId).maybeSingle();
                if (mesmo) return { success: true, already_done: true };
                const ultimo = await buscarUltimoRegistroNaEtapa(supabase, {
                    evento_id, pessoa_id, etapa: log.etapa, dia: log.dia_civil, area_id
                }).catch(() => null);
                const erro = estaDentro(ultimo)
                    ? erroEntradaAberta(ultimo.created_at)
                    : erroEntradaDuplicada(ultimo?.created_at || timestamp);
                erro.etapa = log.etapa;
                return { success: false, entrada_duplicada: true, erro };
            }
            // 23505 de OUTRO índice (ex.: registro de credenciamento). Antes devolvia "ok" sem gravar nada.
            // Só é reenvio se o próprio id já estiver gravado; senão a passagem NÃO foi registrada.
            const { data: jaGravado, error: erroConsulta } = await supabase
                .from('logs_acesso').select('id').eq('id', logId).maybeSingle();
            if (erroConsulta) {
                logger.error(`Passagem ${logId}: não foi possível confirmar se o id já existe (23505): ${erroConsulta.message}`);
                return { success: false };
            }
            if (jaGravado) return { success: true, already_done: true };
            const indice = /constraint "([^"]+)"/.exec(insertErr.message || '')?.[1] || 'desconhecido';
            logger.error(`Passagem ${logId} NÃO gravada: 23505 do índice ${indice} (id ausente em logs_acesso). Devolvida como recusa.`);
            const erro = erroRegistroDuplicado();
            erro.etapa = log.etapa;
            return { success: false, entrada_duplicada: true, erro };
        }

        if (insertErr) {
            // Plano B: acesso já validado não pode se perder porque o Supabase oscilou.
            // O CloudSyncWorker regrava o log e aplica o status da pessoa quando ele voltar.
            const naFila = await queueService.publishLogToCloud({ ...log, _status_pessoa: new_status });
            if (!naFila) throw insertErr;
            logger.error(`Log ${logId} não gravado no Supabase; foi para a fila de retentativa: ${insertErr.message}`);
            rpcResult.na_fila = true;
        } else if (atualizarStatus && pessoa.status_acesso !== new_status) {
            const { error: statusErr } = await supabase
                .from('pessoas')
                .update({ status_acesso: new_status, atualizado_em: new Date().toISOString() })
                .eq('id', pessoa_id);
            if (statusErr) logger.error(`Falha ao atualizar status da pessoa ${pessoa_id} para ${new_status}: ${statusErr.message}`);
        }

        rpcResult.log_id = logId;
        rpcResult.new_status = atualizarStatus ? new_status : pessoa.status_acesso;
        rpcResult.status_alterado = atualizarStatus;

        // Saída encerra a liberação manual do turno e reavalia a documentação
        // (quem saiu com pendência volta a "pendente" para a próxima entrada).
        // Replay antigo não encerra a liberação de hoje.
        if (tipo === 'checkout' && atualizarStatus) {
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
