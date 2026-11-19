'use strict';

/**
 * Esvazia a fila de sincronização dos leitores faciais (tabela fila_sync_leitores, alimentada por
 * gatilhos do banco: migration 20261119_fila_sync_leitores.sql).
 *
 * Toda mudança que afeta o acesso de uma pessoa (expulsar, bloquear, desbloquear, recusar, trocar
 * pulseira, áreas da pessoa ou do lote, foto, troca de evento) entra na fila, venha de qualquer tela.
 * A cada CICLO_MS esta rotina pega as pendências e, para cada pessoa:
 *  - bloqueada/expulsa/recusada/inativa: sai de todos os leitores do evento;
 *  - senão: entra nos leitores das áreas dela e sai dos demais;
 *  - trocou de evento: sai também dos leitores do evento antigo.
 * Leitor fora do ar: o comando vai para a fila do próprio leitor (aplicada quando ele voltar).
 *
 * A pendência é marcada como processada ANTES de sincronizar: uma mudança que chegue durante a
 * sincronização cria pendência nova e não se perde.
 */
const { supabase } = require('../../config/supabase');
const logger = require('../../services/logger');

const CICLO_MS = Number(process.env.FILA_LEITORES_CICLO_MS || 3000);
const LOTE = 200;
const GUARDAR_PROCESSADOS_DIAS = 7;
const LOTE_GRANDE = 20; // a partir daqui carrega leitores e áreas do evento uma vez só

const estado = { timer: null, rodando: false, semTabela: false, ultimaLimpeza: 0, processados: 0, ultimoCiclo: null };

const tabelaInexistente = (err) => !!err && (err.code === '42P01' || err.code === 'PGRST205' || /does not exist|Could not find the table/i.test(err.message || ''));

/** Uma rodada: devolve quantas pessoas foram sincronizadas */
async function ciclo(syncService = require('./sync.service')) {
    if (estado.rodando) return 0;
    estado.rodando = true;
    try {
        const { data: pendentes, error } = await supabase.from('fila_sync_leitores')
            .select('id, pessoa_id, evento_id, evento_anterior, motivo')
            .is('processado_em', null)
            .order('id', { ascending: true })
            .limit(LOTE);
        if (error) {
            if (tabelaInexistente(error)) {
                if (!estado.semTabela) logger.warn('[Leitores] fila_sync_leitores não existe: aplique a migration 20261119_fila_sync_leitores.sql (até lá, só a varredura das 01:00 corrige os leitores)');
                estado.semTabela = true;
                return 0;
            }
            throw error;
        }
        estado.semTabela = false;
        if (!pendentes || pendentes.length === 0) return 0;

        // Marca antes de sincronizar (ver cabeçalho)
        const ids = pendentes.map(p => p.id);
        const { error: erroMarca } = await supabase.from('fila_sync_leitores')
            .update({ processado_em: new Date().toISOString() })
            .in('id', ids);
        if (erroMarca) throw erroMarca;

        // Contexto do evento (leitores e áreas) carregado uma vez quando o lote é grande (ex.: áreas de um lote)
        const porEvento = new Map();
        for (const p of pendentes) {
            if (!porEvento.has(p.evento_id)) porEvento.set(p.evento_id, []);
            porEvento.get(p.evento_id).push(p);
        }

        let feitos = 0;
        for (const [eventoId, lista] of porEvento) {
            let ctx = {};
            if (eventoId && lista.length >= LOTE_GRANDE && typeof syncService._carregarContextoSync === 'function') {
                ctx = (await syncService._carregarContextoSync(eventoId).catch(() => null)) || {};
            }
            for (const p of lista) {
                try {
                    if (p.evento_anterior && p.evento_anterior !== p.evento_id) {
                        await syncService.deleteUserFromAllDevices(p.pessoa_id, p.evento_anterior);
                    }
                    await syncService.syncUserToAllDevices(p.pessoa_id, ctx);
                    feitos++;
                } catch (err) {
                    logger.warn(`[Leitores] falha ao sincronizar pessoa ${p.pessoa_id} (${p.motivo}): ${err.message}`);
                    await supabase.from('fila_sync_leitores').update({ erro: String(err.message).slice(0, 300) }).eq('id', p.id);
                }
            }
        }
        estado.processados += feitos;
        logger.info(`[Leitores] ${feitos} pessoa(s) atualizada(s) nos leitores (${[...new Set(pendentes.map(p => p.motivo))].join(', ')})`);
        return feitos;
    } catch (err) {
        logger.error(`[Leitores] fila de sincronização: ${err.message}`);
        return 0;
    } finally {
        estado.ultimoCiclo = new Date().toISOString();
        estado.rodando = false;
        limparAntigos().catch(() => {});
    }
}

/** Uma vez por hora: apaga o histórico processado com mais de GUARDAR_PROCESSADOS_DIAS dias */
async function limparAntigos() {
    if (estado.semTabela || Date.now() - estado.ultimaLimpeza < 3600000) return;
    estado.ultimaLimpeza = Date.now();
    const limite = new Date(Date.now() - GUARDAR_PROCESSADOS_DIAS * 86400000).toISOString();
    await supabase.from('fila_sync_leitores').delete().lt('processado_em', limite);
}

function iniciar() {
    if (estado.timer) return;
    const rodar = async () => {
        await ciclo();
        // Sem a tabela, tenta de novo só a cada minuto (a migration pode ser aplicada com a API no ar)
        estado.timer = setTimeout(rodar, estado.semTabela ? 60000 : CICLO_MS);
    };
    estado.timer = setTimeout(rodar, 5000);
    logger.info(`[Leitores] fila de sincronização ativa (a cada ${CICLO_MS / 1000} s)`);
}

function parar() {
    clearTimeout(estado.timer);
    estado.timer = null;
}

const status = () => ({ ...estado, timer: undefined });

module.exports = { iniciar, parar, ciclo, status };
