const { supabase } = require('../../config/supabase');
const logger = require('../../services/logger');
const documentoService = require('./documento.service');
const { STATUS_AUDITORIA } = require('./documento.service');

/** 'rejeitado' (legado) é aceito como 'reprovado'. */
const statusValido = (status) => STATUS_AUDITORIA.includes(status === 'rejeitado' ? 'reprovado' : status);
const eventoDaRequisicao = (req) => req.event?.id || req.headers['x-evento-id'] || req.query.evento_id;
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
            const { titulo, tipo_doc, tipo_documento_id } = req.body;

            if (entityType !== 'empresa' && entityType !== 'pessoa') {
                return ApiResponse.error(res, 'Entidade inválida. Use empresa ou pessoa.', 400);
            }

            const safeEntityId = _s(entityId);

            if (!safeEntityId) return ApiResponse.error(res, 'ID da entidade é obrigatório.', 400);
            if (!req.file) return ApiResponse.error(res, 'Nenhum arquivo enviado.', 400);
            if (!titulo || !tipo_doc) return ApiResponse.error(res, 'Título e Tipo de Documento são obrigatórios.', 400);

            // Backend processa o upload com service_role (a verificação de permissão já ocorreu na rota)
            const supabaseClient = req.supabase || supabase;
            const data = await documentoService.uploadDocumento(supabaseClient, {
                entityType, entityId: safeEntityId, titulo, tipo_doc, tipo_documento_id: _s(tipo_documento_id), file: req.file
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
            const { status } = req.body;
            const auditorId = req.user?.id;
            const supabaseClient = req.supabase || supabase;
            const safeDocId = _s(docId);

            if (!safeDocId) return ApiResponse.error(res, 'ID do documento inválido', 400);

            if (!statusValido(status)) {
                return ApiResponse.error(res, 'Status de auditoria inválido.', 400);
            }

            const data = await documentoService.auditarDocumento(supabaseClient, entityType, safeDocId, req.body, auditorId);

            // Auditoria de Sistema
            await auditService.logEntity(req, 'AUDIT_DOCUMENT', entityType.toUpperCase(), docId, {
                status: req.body.status,
                notas: req.body.notas_auditoria
            });

            return ApiResponse.success(res, data);
        } catch (error) {
            logger.error('Erro ao auditar documento:', error.message);
            return ApiResponse.error(res, error.message, error.status || 500);
        }
    }

    /**
     * Auditoria em Lote (Bulk Audit)
     */
    async batchAudit(req, res) {
        try {
            const { documentos, status } = req.body;
            const auditorId = req.user?.id;
            const supabaseClient = req.supabase || supabase;

            if (!Array.isArray(documentos) || documentos.length === 0) {
                return ApiResponse.error(res, 'Lista de documentos ausente ou vazia.', 400);
            }

            if (!statusValido(status)) {
                return ApiResponse.error(res, 'Status de auditoria inválido.', 400);
            }

            await documentoService.batchAudit(supabaseClient, req.body, auditorId);

            // Auditoria de Sistema
            await auditService.logEntity(req, 'BATCH_AUDIT_DOCUMENTS', 'DOCUMENTOS', null, {
                status: req.body.status,
                quantidade: req.body.documentos?.length
            });

            return ApiResponse.success(res, { message: 'Auditoria em lote finalizada com sucesso.' });
        } catch (error) {
            logger.error('Erro no Batch Audit:', error.message);
            return ApiResponse.error(res, error.message, error.status || 500);
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

            if (entityType !== 'empresa' && entityType !== 'pessoa') {
                return ApiResponse.error(res, 'Entidade inválida. Use empresa ou pessoa.', 400);
            }

            const data = await documentoService.listDocumentos(supabaseClient, entityType, safeEntityId);

            return ApiResponse.success(res, data);
        } catch (error) {
            logger.error('Erro ao buscar documentos:', error.message);
            return ApiResponse.error(res, 'Erro ao buscar arquivos anexados.');
        }
    }

    /**
     * Listar todos os documentos PENDENTES para a fila do Analista
     * Sem parâmetros de paginação: lista completa (formato de produção).
     * Com page/limit: paginação via view_documentos_pendentes.
     */
    async listarPendentes(req, res) {
        try {
            const supabaseClient = req.supabase || supabase;
            const { page, limit, search = '' } = req.query;
            const eventoId = eventoDaRequisicao(req);

            if (!eventoId) return ApiResponse.error(res, 'Selecione um evento para continuar.', 400);

            // Sem paginação: mesma consulta filtrada pelo evento (a antiga listava documentos de TODOS os
            // eventos e quebrava ao juntar empresa_documentos com empresas, que não têm relação no banco)
            if (page === undefined && limit === undefined) {
                const todos = await documentoService.listPendentes(supabaseClient, { evento_id: eventoId, page: 1, limit: 500, search });
                return ApiResponse.success(res, todos.data);
            }

            const result = await documentoService.listPendentes(supabaseClient, {
                evento_id: eventoId,
                page: parseInt(page) || 1,
                limit: parseInt(limit) || 20,
                search
            });

            return res.status(200).json({
                success: true,
                data: result.data,
                metadata: { total: result.total, page: result.page, limit: result.limit }
            });
        } catch (error) {
            logger.error('Erro ao listar documentos pendentes:', error.message);
            return ApiResponse.error(res, 'Erro ao buscar fila de auditoria documental.');
        }
    }

    /**
     * Colaboradores com documentos entregues, pendências e validade (busca por pessoa ou empresa)
     */
    async listarColaboradores(req, res) {
        try {
            const eventoId = eventoDaRequisicao(req);
            if (!eventoId) return ApiResponse.error(res, 'Evento não identificado', 400);
            const { search = '', page = 1, limit = 30, pendentes } = req.query;
            const result = await documentoService.listarColaboradores(eventoId, {
                search, page: parseInt(page) || 1, limit: Math.min(parseInt(limit) || 30, 100),
                somentePendentes: pendentes === '1' || pendentes === 'true'
            });
            return res.status(200).json({ success: true, data: result.data, metadata: { total: result.total, page: result.page, limit: result.limit } });
        } catch (error) {
            logger.error('Erro ao listar colaboradores (documentos):', error.message);
            return ApiResponse.error(res, 'Erro ao buscar colaboradores.');
        }
    }

    /**
     * Documentos vencidos e a vencer
     */
    async listarVencimentos(req, res) {
        try {
            const eventoId = eventoDaRequisicao(req);
            if (!eventoId) return ApiResponse.error(res, 'Evento não identificado', 400);
            const result = await documentoService.listarVencimentos(eventoId, req.query.dias);
            return ApiResponse.success(res, result);
        } catch (error) {
            logger.error('Erro ao listar vencimentos:', error.message);
            return ApiResponse.error(res, 'Erro ao buscar vencimentos.');
        }
    }

    /**
     * URL assinada temporária para visualizar o arquivo
     */
    async obterUrlArquivo(req, res) {
        try {
            const { entityType, docId } = req.params;
            if (entityType !== 'empresa' && entityType !== 'pessoa') {
                return ApiResponse.error(res, 'Entidade inválida. Use empresa ou pessoa.', 400);
            }
            const result = await documentoService.gerarUrlAssinada(entityType, _s(docId));
            return ApiResponse.success(res, result);
        } catch (error) {
            logger.error('Erro ao gerar URL do documento:', error.message);
            return ApiResponse.error(res, error.message, error.status || 500);
        }
    }

    /**
     * Configuração documental do evento (tipos, obrigatórios por função, aviso de vencimento)
     */
    async obterConfiguracao(req, res) {
        try {
            const eventoId = eventoDaRequisicao(req);
            if (!eventoId) return ApiResponse.error(res, 'Evento não identificado', 400);
            return ApiResponse.success(res, await documentoService.obterConfiguracao(eventoId));
        } catch (error) {
            logger.error('Erro ao obter configuração documental:', error.message);
            return ApiResponse.error(res, 'Erro ao carregar configuração documental.');
        }
    }

    async salvarConfiguracao(req, res) {
        try {
            const eventoId = eventoDaRequisicao(req);
            if (!eventoId) return ApiResponse.error(res, 'Evento não identificado', 400);
            const data = await documentoService.salvarConfiguracao(eventoId, req.body || {});
            await auditService.logEntity(req, 'UPDATE_DOC_REQUIREMENTS', 'EVENTO', eventoId, {
                tipos: req.body?.tipos?.length, funcoes: Object.keys(req.body?.regras || {}).length,
                aviso_vencimento_dias: req.body?.aviso_vencimento_dias
            });
            return ApiResponse.success(res, data);
        } catch (error) {
            logger.error('Erro ao salvar configuração documental:', error.message);
            return ApiResponse.error(res, error.message);
        }
    }

    /**
     * Obter estatísticas gerais da fila de auditoria (métricas para dashboard/cards)
     */
    async obterEstatisticas(req, res) {
        try {
            const supabaseClient = req.supabase || supabase;
            const eventoId = req.headers['x-evento-id'] || req.query.evento_id;

            const stats = await documentoService.obterEstatisticas(supabaseClient, eventoId);
            return ApiResponse.success(res, stats);
        } catch (error) {
            logger.error('Erro ao obter estatísticas de documentos:', error.message);
            return ApiResponse.error(res, 'Erro ao carregar estatísticas.');
        }
    }
}

module.exports = new DocumentoController();
