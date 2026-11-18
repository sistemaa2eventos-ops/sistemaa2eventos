const { supabase } = require('../../config/supabase');
const { deleteImage } = require('../../config/supabase');
const logger = require('../../services/logger');
const {
    caminhoDeStorage, assinarLinhas, arquivoUsadoPorOutraPessoa, BUCKETS_FOTO, BUCKETS_DOCUMENTO
} = require('../../services/storageSeguro');

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
// Portabilidade: o titular recebe por e-mail; os links dos documentos valem 7 dias
const VALIDADE_LINK_PORTABILIDADE_S = 7 * 24 * 3600;
// Retenção: tempo máximo esperando a remoção de uma pessoa nos leitores
const TIMEOUT_LEITORES_MS = 30000;
const motorIa = require('../../services/motorIa');
const { buscarTodos } = require('../../utils/buscarTodos');
const syncService = require('../devices/sync.service');

/**
 * Serviço de conformidade LGPD
 * Implementa o "Direito ao Esquecimento" (Art. 18, VI da LGPD)
 * Anonimiza dados pessoais mantendo apenas logs de auditoria técnica
 */
class LGPDService {
    /**
     * Anonimiza uma pessoa: Substitui dados pessoais por hashes irreversíveis
     * Mantém o registro na tabela para integridade de logs e relatórios
     */
    /** Valores gravados em pessoas na anonimização (todas as colunas existem no schema atual). */
    dadosAnonimizados(anonymizedHash, operatorId) {
        return {
            nome_completo: `[ANONIMIZADO] ${anonymizedHash}`,
            nome_credencial: `[ANONIMIZADO]`,
            cpf: null,
            email: null,
            telefone: null,
            documento: null,
            documento_foto: null,
            passaporte: null,
            nome_mae: null,
            data_nascimento: null,
            foto_url: null,
            face_encoding: null,
            qr_code: null,
            observacao: `[LGPD] Dados anonimizados em ${new Date().toISOString()} por ${operatorId}`,
            bloqueado: true,
            motivo_bloqueio: 'LGPD - Direito ao Esquecimento',
            status_acesso: 'bloqueado',
            ativo: false,
            updated_at: new Date().toISOString()
        };
    }

    /**
     * Apaga os arquivos (buckets de documento) e as linhas de pessoa_documentos da pessoa.
     * Falha vira log: a anonimização dos dados cadastrais segue.
     */
    async apagarDocumentos(pessoaId) {
        try {
            const { data: docs, error } = await supabase
                .from('pessoa_documentos')
                .select('id, url_arquivo')
                .eq('pessoa_id', pessoaId);
            if (error) throw error;
            if (!docs || docs.length === 0) return { arquivos: 0, linhas: 0 };

            // Agrupado por bucket: uma remoção por bucket
            const porBucket = new Map();
            for (const d of docs) {
                const ref = caminhoDeStorage(d.url_arquivo, { buckets: BUCKETS_DOCUMENTO });
                if (!ref) continue;
                if (!porBucket.has(ref.bucket)) porBucket.set(ref.bucket, []);
                porBucket.get(ref.bucket).push(ref.path);
            }
            let arquivos = 0;
            for (const [bucket, caminhos] of porBucket) {
                const { error: rmErr } = await supabase.storage.from(bucket).remove(caminhos);
                if (rmErr) logger.error(`[LGPD] Falha ao apagar ${caminhos.length} documento(s) do bucket ${bucket}`);
                else arquivos += caminhos.length;
            }

            const { error: delErr } = await supabase.from('pessoa_documentos').delete().eq('pessoa_id', pessoaId);
            if (delErr) throw delErr;
            logger.info(`🗑️ [LGPD] Pessoa ${pessoaId}: ${arquivos} arquivo(s) e ${docs.length} documento(s) apagados`);
            return { arquivos, linhas: docs.length };
        } catch (err) {
            logger.error(`[LGPD] Falha ao apagar documentos da pessoa ${pessoaId}: ${err.message}`);
            return { arquivos: 0, linhas: 0, erro: err.message };
        }
    }

    /**
     * @param {string} pessoaId
     * @param {string} operatorId usuário ou origem (SELF_REQUEST, SYSTEM_RETENTION_JOB)
     * @param {{ aguardarLeitores?: boolean, timeoutLeitoresMs?: number }} [opcoes]
     *   aguardarLeitores: espera a remoção nos leitores (com limite por pessoa) antes de seguir
     */
    async anonymizePerson(pessoaId, operatorId, { aguardarLeitores = false, timeoutLeitoresMs = TIMEOUT_LEITORES_MS } = {}) {
        logger.info(`🔒 [LGPD] Iniciando anonimização da pessoa ${pessoaId} por ${operatorId}`);

        // 1. Buscar pessoa para cleanup (colunas do schema atual: 'nome' virou 'nome_completo' em 20260415)
        const { data: pessoa, error: getErr } = await supabase
            .from('pessoas')
            .select('id, nome_completo, cpf, email, telefone, foto_url, documento_foto, face_encoding, evento_id, nome_mae, data_nascimento, documento, passaporte')
            .eq('id', pessoaId)
            .single();

        if (getErr || !pessoa) {
            throw new Error('Pessoa não encontrada para anonimização');
        }

        // 2. Remover do Storage a foto biométrica e a foto do documento (URL public, sign ou authenticated)
        const arquivos = [
            { valor: pessoa.foto_url, buckets: BUCKETS_FOTO, nome: 'Foto biométrica' },
            { valor: pessoa.documento_foto, buckets: [...BUCKETS_FOTO, ...BUCKETS_DOCUMENTO], nome: 'Foto do documento' }
        ];
        for (const arq of arquivos) {
            if (!arq.valor) continue;
            try {
                const ref = caminhoDeStorage(arq.valor, { buckets: arq.buckets });
                if (ref && await arquivoUsadoPorOutraPessoa(arq.valor, pessoaId)) {
                    // Outra pessoa usa o mesmo arquivo: só o campo desta é limpo (no update abaixo)
                    logger.warn(`[LGPD] ${arq.nome} da pessoa ${pessoaId} é usada por outro cadastro; arquivo mantido, só o campo será limpo`);
                } else if (ref) {
                    const r = await deleteImage(ref.bucket, ref.path);
                    if (r?.success) logger.info(`🗑️ [LGPD] ${arq.nome} removida do Storage`);
                    else logger.error(`[LGPD] Falha ao remover ${arq.nome.toLowerCase()} do Storage (bucket ${ref.bucket})`);
                } else if (!/^data:/i.test(arq.valor)) {
                    logger.warn(`[LGPD] ${arq.nome} da pessoa ${pessoaId} fora do armazenamento do sistema; nada a apagar no Storage`);
                }
            } catch (storageErr) {
                logger.error(`[LGPD] Falha ao remover ${arq.nome.toLowerCase()}:`, storageErr);
            }
        }

        // 2b. Documentos da pessoa (RG, ASO, comprovantes): arquivos do Storage e linhas de pessoa_documentos
        await this.apagarDocumentos(pessoaId);

        // 3. Remover biometria da tabela separada
        await supabase
            .from('biometria_pessoa')
            .delete()
            .eq('pessoa_id', pessoaId);

        // 4. Remover face dos terminais (Intelbras/Hikvision). Nas rotas, segue em segundo plano; no job de
        // retenção (aguardarLeitores), espera com tempo limite, senão o process.exit do job cortava a remoção.
        const remocaoLeitores = syncService.deleteUserFromAllDevices(pessoa, pessoa.evento_id)
            .then(() => 'ok')
            .catch(e => { logger.error(`[LGPD] Falha ao remover do terminal:`, e); return 'erro'; });
        if (aguardarLeitores) {
            let timer;
            const limite = new Promise(ok => { timer = setTimeout(() => ok('tempo'), timeoutLeitoresMs); });
            const r = await Promise.race([remocaoLeitores, limite]);
            clearTimeout(timer);
            if (r === 'tempo') logger.warn(`[LGPD] Pessoa ${pessoaId}: remoção nos leitores passou de ${Math.round(timeoutLeitoresMs / 1000)} s`);
        }

        // 5. Anonimizar dados na tabela principal.
        // Colunas conferidas com o schema (01_initial_schema, 08_iam_ecm_expansion, 20260415_refactor_pessoas).
        // status_acesso: o CHECK aceita pendente/autorizado/recusado/bloqueado/verificacao/checkin_feito/
        // checkout_feito ('inativo' era recusado pelo banco); 'bloqueado' mantém a pessoa fora dos leitores.
        const anonymizedHash = `ANON_${pessoaId.substring(0, 8)}`;
        const { error: updateErr } = await supabase
            .from('pessoas')
            .update(this.dadosAnonimizados(anonymizedHash, operatorId))
            .eq('id', pessoaId);

        if (updateErr) throw updateErr;

        // 6. Tirar o vetor facial do motor de IA (memória do motor e agentes). Se falhar, só registra:
        // a anonimização já foi gravada, e o motor também remove a pessoa no próximo ciclo de sincronização.
        try {
            const r = await motorIa.removerPessoasDoMotor([pessoaId]);
            if (r.enviados === 0) {
                logger.warn(`[LGPD] Pessoa ${pessoaId}: nenhum motor de IA recebeu a remoção (${r.falhas} falha(s)); sai do índice no próximo ciclo de sincronização`);
            } else if (r.falhas > 0) {
                logger.warn(`[LGPD] Pessoa ${pessoaId}: remoção do motor de IA com ${r.falhas} falha(s) (${r.enviados} envio(s) ok)`);
            } else {
                logger.info(`[LGPD] Pessoa ${pessoaId} removida do motor de IA (${r.enviados} envio(s))`);
            }
        } catch (iaErr) {
            logger.error(`[LGPD] Falha ao remover pessoa ${pessoaId} do motor de IA:`, iaErr);
        }

        // 7. Registrar log de auditoria (este PERMANECE para compliance). Mesmo formato do audit.service:
        // o CHECK de audit_logs.acao só aceita INSERT/UPDATE/DELETE e user_id é UUID (o job e o pedido do
        // titular não têm usuário: vão em detalhes).
        const { error: auditErr } = await supabase.from('audit_logs').insert([{
            evento_id: pessoa.evento_id || null,
            user_id: UUID.test(String(operatorId)) ? operatorId : null,
            nivel_acesso: 'lgpd',
            acao: 'UPDATE',
            recurso: 'PESSOAS',
            recurso_id: pessoaId,
            tabela_nome: 'pessoas',
            registro_id: pessoaId,
            detalhes: {
                _acao_original: 'LGPD_ANONYMIZE',
                original_name_hash: anonymizedHash,
                operador: operatorId,
                timestamp: new Date().toISOString()
            },
            created_at: new Date().toISOString()
        }]);
        if (auditErr) logger.error(`[LGPD] Falha ao gravar auditoria da anonimização de ${pessoaId}: ${auditErr.message}`);

        logger.info(`✅ [LGPD] Pessoa ${pessoaId} completamente anonimizada. Registros de auditoria preservados.`);

        return {
            success: true,
            message: 'Dados pessoais anonimizados com sucesso (LGPD Art. 18)',
            pessoa_id: pessoaId,
            hash: anonymizedHash
        };
    }
    
    /**
     * Registra evidência de consentimento na tabela dedicada
     */
    async recordConsent(pessoaId, eventoId, reqData) {
        try {
            const { error } = await supabase.from('consent_records').insert([{
                pessoa_id: pessoaId,
                evento_id: eventoId,
                policy_version: '1.0', // Pode ser dinâmico no futuro
                ip_address: reqData.ip,
                user_agent: reqData.userAgent,
                accepted_at: new Date()
            }]);
            if (error) throw error;
        } catch (error) {
            logger.error(`[LGPD] Falha ao registrar consentimento para ${pessoaId}:`, error);
        }
    }

    /**
     * Consolida todos os dados de um titular para Portabilidade (Art. 18, V)
     */
    async exportUserData(pessoaId) {
        // 1. Dados cadastrais
        const { data: pessoa } = await supabase.from('pessoas').select('*').eq('id', pessoaId).single();
        // 2. Registros de consentimento
        const { data: consentimentos } = await supabase.from('consent_records').select('*').eq('pessoa_id', pessoaId);
        // 3. Documentos vinculados
        const { data: documentos } = await supabase.from('pessoa_documentos').select('*').eq('pessoa_id', pessoaId);
        // Links dos arquivos assinados na hora; vão por e-mail, então valem 7 dias
        await assinarLinhas(documentos || [], { segundos: VALIDADE_LINK_PORTABILIDADE_S });
        // 4. Logs de auditoria (apenas os relacionados a este ID)
        const { data: logs } = await supabase.from('audit_logs').select('*').eq('recurso_id', pessoaId);

        return {
            gerado_em: new Date().toISOString(),
            base_legal: 'Consentimento (Art. 7, I)',
            titular: {
                ...pessoa,
                consentimentos,
                documentos,
                auditoria: logs
            }
        };
    }

    /**
     * Processa anonimização em lote para eventos encerrados (Retenção)
     */
    async processRetentionBatch(daysBefore = 90) {
        const dias = Number(daysBefore) || 90;
        const threshold = new Date();
        threshold.setDate(threshold.getDate() - dias);

        // 1. Localizar eventos encerrados há mais de N dias
        const { data: eventos, error: evErr } = await supabase
            .from('eventos')
            .select('id, nome')
            .lt('data_fim', threshold.toISOString());
        if (evErr) throw evErr;

        if (!eventos || eventos.length === 0) return { processed: 0, falhas: 0 };

        let totalProcessed = 0;
        let falhas = 0;
        for (const ev of eventos) {
            // 2. Pessoas deste evento que ainda têm CPF (sem CPF, provável que já foi anonimizada).
            // buscarTodos: o PostgREST corta em 1000 linhas.
            const { data: pessoas, error: pErr } = await buscarTodos(
                supabase.from('pessoas').select('id').eq('evento_id', ev.id).not('cpf', 'is', null)
            );
            if (pErr) throw pErr;

            for (const p of pessoas || []) {
                // Uma falha não interrompe o job: a pessoa fica para a próxima execução
                try {
                    // Espera os leitores: o job sai com process.exit logo depois do lote
                    await this.anonymizePerson(p.id, 'SYSTEM_RETENTION_JOB', { aguardarLeitores: true });
                    totalProcessed++;
                } catch (err) {
                    falhas++;
                    logger.error(`[Retenção] Falha ao anonimizar pessoa ${p.id}: ${err.message}`);
                }
            }
        }

        logger.info(`🧹 [Retenção] Job finalizado. ${totalProcessed} registros anonimizados, ${falhas} falhas.`);
        return { processed: totalProcessed, falhas };
    }
}

module.exports = new LGPDService();
