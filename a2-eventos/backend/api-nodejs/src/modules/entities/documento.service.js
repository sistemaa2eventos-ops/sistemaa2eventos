const { supabase, uploadImage } = require('../../config/supabase');
const logger = require('../../services/logger');

class DocumentoService {
    /**
     * Valida assinatura de arquivo (Magic Numbers)
     */
    isValidBuffer(buffer, mimetype) {
        const hex = buffer.toString('hex', 0, 4).toUpperCase();
        if (mimetype === 'application/pdf' && hex.startsWith('25504446')) return true;
        if (mimetype === 'image/jpeg' && hex.startsWith('FFD8FF')) return true;
        if (mimetype === 'image/png' && hex.startsWith('89504E47')) return true;
        return false;
    }

    /**
     * Upload e registro de documento
     */
    async uploadDocumento(supabaseClient, { entityType, entityId, titulo, tipo_doc, file }) {
        if (!this.isValidBuffer(file.buffer, file.mimetype)) {
            throw new Error('Arquivo corrompido ou formato forjado (Spoofing detectado).');
        }

        const BUCKET_NAME = 'documentos_operacionais';
        const fileExt = file.originalname.split('.').pop();
        const fileName = `${entityType}_${entityId}_${Date.now()}.${fileExt}`;
        const filePath = `${entityType}s/${entityId}/${fileName}`;

        // Upload to Storage
        const uploadResult = await uploadImage(BUCKET_NAME, filePath, file.buffer, file.mimetype);
        if (!uploadResult.success) throw new Error(`Falha no upload do Supabase: ${uploadResult.error}`);

        const tableName = entityType === 'empresa' ? 'empresa_documentos' : 'pessoa_documentos';
        const idCol = entityType === 'empresa' ? 'empresa_id' : 'pessoa_id';

        const { data, error } = await supabaseClient.from(tableName)
            .insert([{
                [idCol]: entityId,
                titulo,
                tipo_doc,
                url_arquivo: uploadResult.url,
                status: 'pendente'
            }]).select().single();

        if (error) throw error;
        logger.info(`📄 Documento '${tipo_doc}' submetido para aprovação (${entityType}: ${entityId})`);
        return data;
    }

    /**
     * Audita um único documento e sincroniza status do participante
     */
    async auditarDocumento(supabaseClient, entityType, docId, auditData, auditorId) {
        const { status, notas_auditoria, data_emissao, data_validade } = auditData;
        const tableName = entityType === 'empresa' ? 'empresa_documentos' : 'pessoa_documentos';

        const updatePayload = {
            status,
            notas_auditoria: notas_auditoria || null,
            revisado_por_user_id: auditorId,
            data_revisao: new Date().toISOString()
        };

        if (status === 'aprovado') {
            if (data_emissao) updatePayload.data_emissao = data_emissao;
            if (data_validade) updatePayload.data_validade = data_validade;
        }

        const { data, error } = await supabaseClient
            .from(tableName)
            .update(updatePayload)
            .eq('id', docId)
            .select()
            .single();

        if (error) throw error;

        // Automação de Status do Participante
        if (entityType === 'pessoa') {
            await this.sincronizarStatusPessoa(supabaseClient, data.pessoa_id);
        }

        return data;
    }

    /**
     * Auditoria em lote de documentos
     */
    async batchAudit(supabaseClient, { documentos, status, notas_auditoria, data_emissao, data_validade }, auditorId) {
        const empDocs = documentos.filter(d => d.tipo_entidade === 'empresa').map(d => d.id);
        const pesDocs = documentos.filter(d => d.tipo_entidade === 'pessoa').map(d => d.id);

        const updatePayload = {
            status,
            revisado_por_user_id: auditorId,
            data_revisao: new Date().toISOString(),
            notas_auditoria: notas_auditoria || null
        };

        if (status === 'aprovado') {
            if (data_emissao) updatePayload.data_emissao = data_emissao;
            if (data_validade) updatePayload.data_validade = data_validade;
        }

        const promises = [];
        if (empDocs.length > 0) promises.push(supabaseClient.from('empresa_documentos').update(updatePayload).in('id', empDocs));
        if (pesDocs.length > 0) promises.push(supabaseClient.from('pessoa_documentos').update(updatePayload).in('id', pesDocs));

        const results = await Promise.all(promises);
        const errors = results.filter(r => r.error).map(r => r.error);
        if (errors.length > 0) throw new Error('Algumas atualizações falharam no processamento em lote.');

        // Sincronizar status de pessoas afetadas
        if (pesDocs.length > 0) {
            const { data: afetados } = await supabaseClient.from('pessoa_documentos').select('pessoa_id').in('id', pesDocs);
            if (afetados) {
                const uniqueIds = [...new Set(afetados.map(a => a.pessoa_id))];
                for (const pId of uniqueIds) {
                    await this.sincronizarStatusPessoa(supabaseClient, pId);
                }
            }
        }

        return true;
    }

    /**
     * Regra de negócio: Sincroniza o status documental e de acesso da pessoa baseado nos seus documentos
     */
    async sincronizarStatusPessoa(supabaseClient, pessoaId) {
        if (!pessoaId) return;

        try {
            // 1. Obter status atual da pessoa
            const { data: pessoaAtual } = await supabaseClient
                .from('pessoas')
                .select('id, status_acesso, status_documentos')
                .eq('id', pessoaId)
                .single();

            const { data: docs, error } = await supabaseClient
                .from('pessoa_documentos')
                .select('status')
                .eq('pessoa_id', pessoaId);

            if (error || !docs) return;

            // 2. Determinar status documental
            let novoStatusDocs = 'pendente';
            const temReprovado = docs.some(d => d.status === 'rejeitado' || d.status === 'reprovado');
            const temReenvio = docs.some(d => d.status === 'reenvio_solicitado');
            const temPendente = docs.some(d => d.status === 'pendente' || d.status === 'em_analise');
            const todosAprovados = docs.length > 0 && docs.every(d => d.status === 'aprovado');

            if (temReprovado) {
                novoStatusDocs = 'reprovado';
            } else if (temReenvio) {
                novoStatusDocs = 'reenvio_solicitado';
            } else if (todosAprovados) {
                novoStatusDocs = 'aprovado';
            } else if (temPendente) {
                novoStatusDocs = 'em_analise';
            } else {
                novoStatusDocs = 'pendente';
            }

            // 3. Determinar status de acesso (preservando quem já entrou no evento)
            let novoStatusAcesso = pessoaAtual?.status_acesso || 'pendente';
            if (pessoaAtual?.status_acesso !== 'checkin_feito') {
                if (novoStatusDocs === 'aprovado') {
                    novoStatusAcesso = 'autorizado';
                } else if (novoStatusDocs === 'reprovado') {
                    novoStatusAcesso = 'recusado';
                } else if (novoStatusDocs === 'reenvio_solicitado' || novoStatusDocs === 'em_analise') {
                    novoStatusAcesso = 'pendente';
                }
            }

            const updatePayload = {
                status_documentos: novoStatusDocs,
                status_acesso: novoStatusAcesso,
                updated_at: new Date().toISOString()
            };

            const { error: updateErr } = await supabaseClient.from('pessoas').update(updatePayload).eq('id', pessoaId);
            if (updateErr) {
                // Fallback gracioso se a coluna status_documentos ainda não tiver sido criada
                await supabaseClient.from('pessoas').update({ status_acesso: novoStatusAcesso }).eq('id', pessoaId);
            }

            logger.info(`🔄 Pessoa [${pessoaId}] sincronizada: Docs=${novoStatusDocs.toUpperCase()} | Acesso=${novoStatusAcesso.toUpperCase()}`);
        } catch (err) {
            logger.warn(`⚠️ [DocumentoService] Falha ao sincronizar status da pessoa ${pessoaId}: ${err.message}`);
        }
    }

    async listDocumentos(supabaseClient, entityType, entityId) {
        const tableName = entityType === 'empresa' ? 'empresa_documentos' : 'pessoa_documentos';
        const idCol = entityType === 'empresa' ? 'empresa_id' : 'pessoa_id';

        let query = supabaseClient.from(tableName).select('*').order('data_inclusao', { ascending: false });
        if (entityId) query = query.eq(idCol, entityId);

        const { data, error } = await query;
        if (error) throw error;
        return data;
    }

    /**
     * Listar todos os documentos PENDENTES para a fila do Analista
     * Suporta paginação, busca e filtro por evento.
     */
    async listPendentes(supabaseClient, { evento_id, page = 1, limit = 20, search = '' }) {
        const from = (page - 1) * limit;
        const to = from + limit - 1;

        let query = supabaseClient
            .from('view_documentos_pendentes')
            .select('*, tipo_entidade:entity_type', { count: 'exact' });

        if (evento_id) {
            query = query.eq('evento_id', evento_id);
        }

        if (search) {
            query = query.or(`titulo.ilike.%${search}%,entidade_nome.ilike.%${search}%,tipo_doc.ilike.%${search}%`);
        }

        const { data, count, error } = await query
            .order('created_at', { ascending: true })
            .range(from, to);

        if (error) throw error;

        return {
            data: data || [],
            total: count || 0,
            page: parseInt(page),
            limit: parseInt(limit)
        };
    }

    /**
     * Estatísticas de auditoria documental para métricas do analista
     */
    async obterEstatisticas(supabaseClient, eventoId) {
        try {
            const [pRes, eRes] = await Promise.all([
                supabaseClient.from('pessoa_documentos').select('status'),
                supabaseClient.from('empresa_documentos').select('status')
            ]);

            const todosDocs = [...(pRes.data || []), ...(eRes.data || [])];

            return {
                total: todosDocs.length,
                pendentes: todosDocs.filter(d => d.status === 'pendente' || d.status === 'em_analise').length,
                aprovados: todosDocs.filter(d => d.status === 'aprovado').length,
                reprovados: todosDocs.filter(d => d.status === 'rejeitado' || d.status === 'reprovado').length,
                reenvio_solicitado: todosDocs.filter(d => d.status === 'reenvio_solicitado').length
            };
        } catch (err) {
            return { total: 0, pendentes: 0, aprovados: 0, reprovados: 0, reenvio_solicitado: 0 };
        }
    }
}

module.exports = new DocumentoService();
