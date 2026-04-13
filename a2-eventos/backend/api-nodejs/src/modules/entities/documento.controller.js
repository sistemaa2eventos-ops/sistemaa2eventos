const { supabase } = require('../../config/supabase');
const logger = require('../../services/logger');
const documentoService = require('./documento.service');
const ApiResponse = require('../../utils/apiResponse');
const auditService = require('../../services/audit.service');

const _s = (val) => val?.toString()?.trim() || null;

class DocumentoController {
    /**
     * Upload genérico de documento para Empresas ou Pessoas
     */
    async uploadDocumento(req, res) {
        try {
            const { entityType, entityId } = req.params;
            const { titulo, tipo_doc } = req.body;

            const safeEntityId = _s(entityId);

            if (!safeEntityId) return ApiResponse.error(res, 'ID da entidade é obrigatório.', 400);
            if (!req.file) return ApiResponse.error(res, 'Nenhum arquivo enviado.', 400);
            if (!titulo || !tipo_doc) return ApiResponse.error(res, 'Título e Tipo de Documento são obrigatórios.', 400);

            // Backend processa o upload com service_role (a verificação de permissão já ocorreu na rota)
            const supabaseClient = supabase;
            const data = await documentoService.uploadDocumento(supabaseClient, {
                entityType, entityId: safeEntityId, titulo, tipo_doc, file: req.file
            });

            return ApiResponse.success(res, data, 201);
        } catch (error) {
            logger.error('Erro na submissão de documento:', error.message);
            return ApiResponse.error(res, error.message);
        }
    }

    /**
     * Aprovar ou Rejeitar um documento
     */
    async auditarDocumento(req, res) {
        try {
            const { entityType, docId } = req.params;
            const auditorId = req.user?.id;
            const supabaseClient = req.supabase || supabase;
            const safeDocId = _s(docId);

            if (!safeDocId) return ApiResponse.error(res, 'ID do documento inválido', 400);

            const data = await documentoService.auditarDocumento(supabaseClient, entityType, safeDocId, req.body, auditorId);
            
            // Auditoria de Sistema
            await auditService.logEntity(req, 'AUDIT_DOCUMENT', entityType.toUpperCase(), docId, { 
                status: req.body.status, 
                notas: req.body.notas_auditoria 
            });

            return ApiResponse.success(res, data);
        } catch (error) {
            logger.error('Erro ao auditar documento:', error.message);
            return ApiResponse.error(res, error.message);
        }
    }

    /**
     * Auditoria em Lote (Bulk Audit)
     */
    async batchAudit(req, res) {
        try {
            const auditorId = req.user?.id;
            const supabaseClient = req.supabase || supabase;

            await documentoService.batchAudit(supabaseClient, req.body, auditorId);

            // Auditoria de Sistema
            await auditService.logEntity(req, 'BATCH_AUDIT_DOCUMENTS', 'DOCUMENTOS', null, { 
                status: req.body.status, 
                quantidade: req.body.documentos?.length 
            });

            return ApiResponse.success(res, { message: 'Auditoria em lote finalizada com sucesso.' });
        } catch (error) {
            logger.error('Erro no Batch Audit:', error.message);
            return ApiResponse.error(res, error.message);
        }
    }

    /**
     * Listar Anexos de uma entidade
     */
    async listarDocumentos(req, res) {
        try {
            const { entityType, entityId } = req.params;
            const supabaseClient = req.supabase || supabase;
            const safeEntityId = _s(entityId);

            const data = await documentoService.listDocumentos(supabaseClient, entityType, safeEntityId);

            return ApiResponse.success(res, data);
        } catch (error) {
            logger.error('Erro ao buscar documentos:', error.message);
            return ApiResponse.error(res, 'Erro ao buscar arquivos anexados.');
        }
    }

    /**
     * Listar todos os documentos PENDENTES para a fila do Analista
     */
    async listarPendentes(req, res) {
        try {
            const supabaseClient = req.supabase || supabase;
            const { page = 1, limit = 20, search = '' } = req.query;
            const eventoId = req.headers['x-evento-id'] || req.query.evento_id;

            const result = await documentoService.listPendentes(supabaseClient, {
                evento_id: eventoId,
                page: parseInt(page),
                limit: parseInt(limit),
                search
            });

            return ApiResponse.success(res, result.data, 200, { total: result.total });
        } catch (error) {
            logger.error('Erro ao listar documentos pendentes:', error.message);
            return ApiResponse.error(res, 'Erro ao buscar fila de auditoria documental.');
        }
    }
}

module.exports = new DocumentoController();
