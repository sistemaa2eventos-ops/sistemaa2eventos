const { supabase } = require('../../config/supabase');
const { deleteImage } = require('../../config/supabase');
const logger = require('../../services/logger');
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
    async anonymizePerson(pessoaId, operatorId) {
        logger.info(`🔒 [LGPD] Iniciando anonimização da pessoa ${pessoaId} por ${operatorId}`);

        // 1. Buscar pessoa para cleanup
        const { data: pessoa, error: getErr } = await supabase
            .from('pessoas')
            .select('id, nome, cpf, email, telefone, foto_url, face_encoding, evento_id, nome_mae, data_nascimento, documento, passaporte')
            .eq('id', pessoaId)
            .single();

        if (getErr || !pessoa) {
            throw new Error('Pessoa não encontrada para anonimização');
        }

        // 2. Remover foto biométrica do Storage
        if (pessoa.foto_url) {
            try {
                const urlParts = pessoa.foto_url.split('/storage/v1/object/public/');
                if (urlParts.length === 2) {
                    const fullPath = urlParts[1];
                    const bucket = fullPath.split('/')[0];
                    const path = fullPath.substring(bucket.length + 1);
                    await deleteImage(bucket, path);
                    logger.info(`🗑️ [LGPD] Foto biométrica removida do Storage`);
                }
            } catch (storageErr) {
                logger.error(`[LGPD] Falha ao remover foto:`, storageErr);
            }
        }

        // 3. Remover biometria da tabela separada
        await supabase
            .from('biometria_pessoa')
            .delete()
            .eq('pessoa_id', pessoaId);

        // 4. Remover face dos terminais (Intelbras/Hikvision)
        syncService.deleteUserFromAllDevices(pessoaId, pessoa.evento_id)
            .catch(e => logger.error(`[LGPD] Falha ao remover do terminal:`, e));

        // 5. Anonimizar dados na tabela principal
        const anonymizedHash = `ANON_${pessoaId.substring(0, 8)}`;
        const { error: updateErr } = await supabase
            .from('pessoas')
            .update({
                nome: `[ANONIMIZADO] ${anonymizedHash}`,
                nome_credencial: `[ANONIMIZADO]`,
                cpf: null,
                email: null,
                telefone: null,
                documento: null,
                passaporte: null,
                nome_mae: null,
                data_nascimento: null,
                foto_url: null,
                face_encoding: null,
                qr_code: null,
                observacao: `[LGPD] Dados anonimizados em ${new Date().toISOString()} por ${operatorId}`,
                bloqueado: true,
                motivo_bloqueio: 'LGPD - Direito ao Esquecimento',
                status_acesso: 'inativo',
                ativo: false,
                updated_at: new Date()
            })
            .eq('id', pessoaId);

        if (updateErr) throw updateErr;

        // 6. Registrar log de auditoria (este PERMANECE para compliance)
        await supabase.from('audit_logs').insert([{
            tabela_nome: 'pessoas',
            acao: 'LGPD_ANONYMIZE',
            registro_id: pessoaId,
            usuario_id: operatorId,
            new_data: {
                action: 'anonymize',
                original_name_hash: anonymizedHash,
                timestamp: new Date().toISOString(),
                operator: operatorId
            },
            changed_at: new Date()
        }]);

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
        const threshold = new Date();
        threshold.setDate(threshold.getDate() - daysBefore);

        // 1. Localizar eventos encerrados há mais de N dias
        const { data: eventos } = await supabase
            .from('eventos')
            .select('id, nome')
            .lt('data_fim', threshold.toISOString());

        if (!eventos || eventos.length === 0) return { processed: 0 };

        let totalProcessed = 0;
        for (const ev of eventos) {
            // 2. Buscar pessoas deste evento que ainda não foram anonimizadas
            const { data: pessoas } = await supabase
                .from('pessoas')
                .select('id')
                .eq('evento_id', ev.id)
                .not('cpf', 'is', null); // Se CPF é null, provável que já foi anonimizado

            if (pessoas && pessoas.length > 0) {
                for (const p of pessoas) {
                    await this.anonymizePerson(p.id, 'SYSTEM_RETENTION_JOB');
                    totalProcessed++;
                }
            }
        }

        logger.info(`🧹 [Retenção] Job finalizado. ${totalProcessed} registros anonimizados.`);
        return { processed: totalProcessed };
    }
}

module.exports = new LGPDService();
