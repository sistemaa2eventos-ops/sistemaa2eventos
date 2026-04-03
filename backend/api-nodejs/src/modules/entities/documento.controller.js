const { supabase, uploadImage } = require('../../config/supabase');
const logger = require('../../services/logger');

class DocumentoController {
    /**
     * Upload genérico de documento para Empresas ou Pessoas
     * Requer multipart/form-data via Multer
     */
    async uploadDocumento(req, res) {
        try {
            const { targetUrl } = req; // Ex: /api/documentos/empresa/:id
            const { entityType, entityId } = req.params; // entityType: 'empresa' | 'pessoa'
            const { titulo, tipo_doc } = req.body;

            if (!req.file) {
                return res.status(400).json({ error: 'Nenhum arquivo enviado.' });
            }

            if (!titulo || !tipo_doc) {
                return res.status(400).json({ error: 'Título e Tipo de Documento são obrigatórios.' });
            }

            // Validação de Magic Numbers (File Signature) para prevenir Mimetype Spoofing
            const buffer = req.file.buffer;
            const hex = buffer.toString('hex', 0, 4).toUpperCase();
            let isSafe = false;

            if (req.file.mimetype === 'application/pdf' && hex.startsWith('25504446')) isSafe = true;
            else if (req.file.mimetype === 'image/jpeg' && hex.startsWith('FFD8FF')) isSafe = true;
            else if (req.file.mimetype === 'image/png' && hex.startsWith('89504E47')) isSafe = true;

            if (!isSafe) {
                logger.warn(`Tentativa de Upload Malicioso bloqueada. Mimetype: ${req.file.mimetype}, Assinatura real: ${hex}`);
                return res.status(400).json({ error: 'Arquivo corrompido ou formato forjado (Spoofing detectado).' });
            }

            const BUCKET_NAME = 'documentos_operacionais';
            const fileExt = req.file.originalname.split('.').pop();
            const fileName = `${entityType}_${entityId}_${Date.now()}.${fileExt}`;
            const filePath = `${entityType}s/${entityId}/${fileName}`;

            // Upload to Supabase Storage
            const uploadResult = await uploadImage(BUCKET_NAME, filePath, req.file.buffer, req.file.mimetype);

            if (!uploadResult.success) {
                throw new Error(`Falha no upload do Supabase: ${uploadResult.error}`);
            }

            // Inserir registro no Banco de Dados correspondente
            let dbData, dbError;

            if (entityType === 'empresa') {
                const result = await supabase.from('empresa_documentos')
                    .insert([{
                        empresa_id: entityId,
                        titulo,
                        tipo_doc,
                        url_arquivo: uploadResult.url,
                        status: 'pendente'
                    }]).select().single();

                dbData = result.data;
                dbError = result.error;
            } else if (entityType === 'pessoa') {
                const result = await supabase.from('pessoa_documentos')
                    .insert([{
                        pessoa_id: entityId,
                        titulo,
                        tipo_doc,
                        url_arquivo: uploadResult.url,
                        status: 'pendente'
                    }]).select().single();

                dbData = result.data;
                dbError = result.error;
            } else {
                return res.status(400).json({ error: 'Entidade inválida. Use empresa ou pessoa.' });
            }

            if (dbError) throw dbError;

            logger.info(`📄 Documento '${tipo_doc}' submetido para aprovação (${entityType}: ${entityId})`);

            res.status(201).json({
                success: true,
                message: 'Documento enviado com sucesso, aguardando aprovação.',
                data: dbData
            });

        } catch (error) {
            logger.error('Erro na submissão de documento:', error);
            res.status(500).json({ error: 'Erro interno ao processar arquivo.' });
        }
    }

    /**
     * Aprovar ou Rejeitar um documento operado pelo Analista
     */
    async auditarDocumento(req, res) {
        try {
            const { entityType, docId } = req.params;
            const { status, notas_auditoria, data_emissao, data_validade } = req.body; // status: 'aprovado' | 'rejeitado'
            const auditorId = req.user.id;

            if (!['aprovado', 'rejeitado'].includes(status)) {
                return res.status(400).json({ error: 'Status de auditoria inválido.' });
            }

            const tableName = entityType === 'empresa' ? 'empresa_documentos' : 'pessoa_documentos';

            let updatePayload = {
                status,
                notas_auditoria: notas_auditoria || null,
                revisado_por_user_id: auditorId,
                data_revisao: new Date().toISOString()
            };

            if (status === 'aprovado') {
                if (data_emissao) updatePayload.data_emissao = data_emissao;
                if (data_validade) updatePayload.data_validade = data_validade;
            }

            const { data, error } = await supabase
                .from(tableName)
                .update(updatePayload)
                .eq('id', docId)
                .select()
                .single();

            if (error) throw error;

            logger.info(`👨‍⚖️ Documento [${docId}] auditado por ${auditorId} -> ${status.toUpperCase()}`);

            // AUTOMAÇÃO DE STATUS DO PARTICIPANTE
            if (entityType === 'pessoa') {
                const pessoaId = data.pessoa_id;

                // Buscar todos os documentos da pessoa
                const { data: todosDocs, error: errDocs } = await supabase
                    .from('pessoa_documentos')
                    .select('status')
                    .eq('pessoa_id', pessoaId);

                if (!errDocs && todosDocs) {
                    let novoStatus = 'pendente'; // Default fallback

                    const temRejeitado = todosDocs.some(d => d.status === 'rejeitado');
                    const todosAprovados = todosDocs.every(d => d.status === 'aprovado');

                    if (temRejeitado) {
                        novoStatus = 'recusado';
                    } else if (todosAprovados) {
                        novoStatus = 'autorizado';
                    }

                    // Atualizar status da pessoa
                    await supabase
                        .from('pessoas')
                        .update({ status_acesso: novoStatus })
                        .eq('id', pessoaId);

                    logger.info(`🔄 Status da Pessoa [${pessoaId}] sincronizado para: ${novoStatus.toUpperCase()}`);
                }
            }

            res.json({
                success: true,
                message: `Documento marcado como ${status}.`,
                data
            });

        } catch (error) {
            logger.error('Erro ao auditar documento:', error);
            res.status(500).json({ error: 'Falha interna na auditoria.' });
        }
    }

    /**
     * Aprovar ou Rejeitar documentos em Lote (Bulk Audit)
     * Payload esperado: { documentos: [{id, tipo_entidade}], status: 'aprovado'|'rejeitado', notas_auditoria, data_emissao, data_validade }
     */
    async batchAudit(req, res) {
        try {
            const { documentos, status, notas_auditoria, data_emissao, data_validade } = req.body;
            const auditorId = req.user.id;

            if (!Array.isArray(documentos) || documentos.length === 0) {
                return res.status(400).json({ error: 'Lista de documentos ausente ou vazia.' });
            }

            if (!['aprovado', 'rejeitado'].includes(status)) {
                return res.status(400).json({ error: 'Status de auditoria inválido.' });
            }

            logger.info(`👨‍⚖️ Iniciando Auditoria em Lote (${documentos.length} docs) por ${auditorId} -> ${status.toUpperCase()}`);

            let empDocs = [];
            let pesDocs = [];

            // Separar por tabela para updates bulk
            documentos.forEach(doc => {
                if (doc.tipo_entidade === 'empresa') empDocs.push(doc.id);
                else if (doc.tipo_entidade === 'pessoa') pesDocs.push(doc.id);
            });

            let updatePayload = {
                status,
                revisado_por_user_id: auditorId,
                data_revisao: new Date().toISOString()
            };

            if (notas_auditoria) updatePayload.notas_auditoria = notas_auditoria;

            if (status === 'aprovado') {
                if (data_emissao) updatePayload.data_emissao = data_emissao;
                if (data_validade) updatePayload.data_validade = data_validade;
            }

            const promises = [];

            if (empDocs.length > 0) {
                const empPromise = supabase
                    .from('empresa_documentos')
                    .update(updatePayload)
                    .in('id', empDocs);
                promises.push(empPromise);
            }

            if (pesDocs.length > 0) {
                const pesPromise = supabase
                    .from('pessoa_documentos')
                    .update(updatePayload)
                    .in('id', pesDocs);
                promises.push(pesPromise);
            }

            const results = await Promise.allSettled(promises);
            const errors = results.filter(r => r.status === 'rejected' || (r.value && r.value.error));

            if (errors.length > 0) {
                const detailErrors = errors.map(e => e.reason || e.value?.error);
                logger.error('Erros parciais no Batch Audit:', JSON.stringify(detailErrors));
                return res.status(500).json({ error: 'Algumas atualizações falharam. Parte da fila pode não ter sido atualizada.', details: detailErrors });
            }

            logger.info(`✅ Auditoria em Lote Finalizada com Sucesso (${documentos.length} docs).`);

            // AUTOMAÇÃO DE STATUS EM LOTE PARA PESSOAS
            if (pesDocs.length > 0) {
                try {
                    // 1. Identificar quais pessoas foram afetadas
                    const { data: afetados } = await supabase
                        .from('pessoa_documentos')
                        .select('pessoa_id')
                        .in('id', pesDocs);

                    if (afetados) {
                        const uniquePessoaIds = [...new Set(afetados.map(a => a.pessoa_id))];

                        // 2. Para cada pessoa, reavaliar o status global
                        for (const pId of uniquePessoaIds) {
                            const { data: todosDocs } = await supabase
                                .from('pessoa_documentos')
                                .select('status')
                                .eq('pessoa_id', pId);

                            if (todosDocs) {
                                let novoStatus = 'pendente';
                                const temRejeitado = todosDocs.some(d => d.status === 'rejeitado');
                                const todosAprovados = todosDocs.every(d => d.status === 'aprovado');

                                if (temRejeitado) novoStatus = 'recusado';
                                else if (todosAprovados) novoStatus = 'autorizado';

                                await supabase
                                    .from('pessoas')
                                    .update({ status_acesso: novoStatus })
                                    .eq('id', pId);

                                logger.info(`🔄 [Batch] Status da Pessoa [${pId}] -> ${novoStatus.toUpperCase()}`);
                            }
                        }
                    }
                } catch (batchStatusErr) {
                    logger.error('Erro na automação de status pos-batch:', batchStatusErr);
                }
            }

            res.json({
                success: true,
                message: `${documentos.length} documentos marcados como ${status}.`
            });

        } catch (error) {
            logger.error('Erro no Batch Audit:', error);
            res.status(500).json({ error: 'Falha interna durante a auditoria em lote.' });
        }
    }

    /**
     * Listar Anexos (Usado pela tela de Auditoria)
     */
    async listarDocumentos(req, res) {
        try {
            const { entityType, entityId } = req.params;
            const tableName = entityType === 'empresa' ? 'empresa_documentos' : 'pessoa_documentos';
            let queryIdCol = entityType === 'empresa' ? 'empresa_id' : 'pessoa_id';

            let query = supabase.from(tableName).select('*').order('data_inclusao', { ascending: false });

            if (entityId) {
                query = query.eq(queryIdCol, entityId);
            }

            const { data, error } = await query;

            if (error) throw error;

            res.json({ success: true, data });
        } catch (error) {
            logger.error('Erro ao buscar documentos:', error);
            res.status(500).json({ error: 'Erro ao buscar arquivos anexados.' });
        }
    }

    /**
     * Listar todos os documentos PENDENTES (Empresa e Pessoas) para a fila do Analista
     */
    async listarPendentes(req, res) {
        try {
            // Buscar pendentes de empresas
            const { data: empDocs, error: err1 } = await supabase
                .from('empresa_documentos')
                .select('*, empresas(nome, cnpj)')
                .eq('status', 'pendente');

            if (err1) throw err1;

            // Buscar pendentes de pessoas
            const { data: pesDocs, error: err2 } = await supabase
                .from('pessoa_documentos')
                .select('*, pessoas(nome, cpf, empresas(nome))')
                .eq('status', 'pendente');

            if (err2) throw err2;

            const formatadosEmp = empDocs.map(d => ({
                id: d.id,
                tipo_entidade: 'empresa',
                entidade_nome: d.empresas?.nome,
                entidade_doc: d.empresas?.cnpj,
                titulo: d.titulo,
                tipo_doc: d.tipo_doc,
                url_arquivo: d.url_arquivo,
                status: d.status,
                data_inclusao: d.data_inclusao,
                empresa_id: d.empresa_id
            }));

            const formatadosPes = pesDocs.map(d => ({
                id: d.id,
                tipo_entidade: 'pessoa',
                entidade_nome: d.pessoas?.nome,
                entidade_doc: d.pessoas?.cpf,
                empresa_vinculada: d.pessoas?.empresas?.nome,
                titulo: d.titulo,
                tipo_doc: d.tipo_doc,
                url_arquivo: d.url_arquivo,
                status: d.status,
                data_inclusao: d.data_inclusao,
                pessoa_id: d.pessoa_id
            }));

            const todos = [...formatadosEmp, ...formatadosPes].sort((a, b) => new Date(a.data_inclusao) - new Date(b.data_inclusao));

            res.json({ success: true, data: todos });
        } catch (error) {
            logger.error('Erro ao listar documentos pendentes:', error);
            res.status(500).json({ error: 'Erro ao buscar fila de auditoria documental.' });
        }
    }
}

module.exports = new DocumentoController();
