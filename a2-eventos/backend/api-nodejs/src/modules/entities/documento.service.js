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
     * Regra de negócio: Sincroniza o status global da pessoa baseado nos seus documentos
     */
    async sincronizarStatusPessoa(supabaseClient, pessoaId) {
        const { data: docs, error } = await supabaseClient
            .from('pessoa_documentos')
            .select('status')
            .eq('pessoa_id', pessoaId);

        if (error || !docs) return;

        let novoStatus = 'pendente';
        const temRejeitado = docs.some(d => d.status === 'rejeitado');
        const todosAprovados = docs.every(d => d.status === 'aprovado');

        if (temRejeitado) novoStatus = 'recusado';
        else if (todosAprovados && docs.length > 0) novoStatus = 'autorizado';

        await supabaseClient.from('pessoas').update({ status_acesso: novoStatus }).eq('id', pessoaId);
        logger.info(`🔄 Status da Pessoa [${pessoaId}] sincronizado para: ${novoStatus.toUpperCase()}`);
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
            .select('*', { count: 'exact' });

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

}

module.exports = new DocumentoService();
