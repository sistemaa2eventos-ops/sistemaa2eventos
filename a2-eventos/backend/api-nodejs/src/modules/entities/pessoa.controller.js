const { supabase } = require('../../config/supabase');
const logger = require('../../services/logger');
const pessoaService = require('./pessoa.service');
const ApiResponse = require('../../utils/apiResponse');
const emailService = require('../../services/emailService');
const auditService = require('../../services/audit.service');


class PessoaController {
    async list(req, res) {
        try {
            const tenantId = req.tenantId || req.event?.id || null;
            if (!tenantId) {
                return ApiResponse.error(res, 'Contexto de evento não encontrado. Refaça o login.', 400);
            }
            const { page = 1, limit = 50, busca, empresa_id, status } = req.query;

            const result = await pessoaService.listByEvent(supabase, tenantId, {
                page: parseInt(page),
                limit: parseInt(limit),
                busca,
                empresa_id,
                status
            });

            return ApiResponse.success(res, result);
        } catch (error) {
            logger.error('Erro ao listar pessoas:', error);
            return ApiResponse.error(res, error.message);
        }
    }

    async search(req, res) {
        try {
            const { q, empresa_id, status } = req.query;
            const evId = req.event?.id;

            if (!evId) {
                return ApiResponse.error(res, 'Evento não identificado', 400);
            }

            const supabaseClient = req.supabase || supabase;
            const data = await pessoaService.searchPessoas(supabaseClient, evId, q, empresa_id, status);

            return ApiResponse.success(res, data);
        } catch (error) {
            logger.error('Erro na busca de pessoas:', error);
            return ApiResponse.error(res, 'Erro interno ao realizar busca');
        }
    }

    async generateUploadUrl(req, res) {
        try {
            const eventoId = req.event?.id;
            const cpfBody = req.body.cpf;
            
            // Backend processa Storage URL via Admin (service_role) para evitar problemas com RLS no Storage
            // A autorização de quem pode gerar a URL já foi feita pela rota/RBAC
            const supabaseClient = supabase;

            if (!cpfBody) return ApiResponse.error(res, 'CPF é obrigatório para upload de foto.', 400);

            const cpfLimpo = cpfBody.replace(/[^\d]/g, '');
            const filePath = `event_${eventoId}/${cpfLimpo}_${Date.now()}.jpg`;

            const { data, error } = await supabaseClient.storage
                .from('selfies')
                .createSignedUploadUrl(filePath);

            if (error) throw error;

            const publicUrlData = supabaseClient.storage.from('selfies').getPublicUrl(filePath);

            return ApiResponse.success(res, {
                uploadUrl: data.signedUrl,
                path: filePath,
                publicUrl: publicUrlData.data.publicUrl
            });
        } catch (error) {
            logger.error('Erro ao gerar URL pre-assinada (Admin):', error);
            return ApiResponse.error(res, 'Erro ao gerar upload URL');
        }
    }

    async create(req, res) {
        try {
            const supabaseClient = req.supabase || supabase;
            const result = await pessoaService.createPessoa(supabaseClient, req.body, req.user);

            // Auditoria
            await auditService.logEntity(req, 'CREATE_PERSON', 'PESSOAS', result.id, { 
                nome: req.body.nome, 
                cpf: req.body.cpf 
            });

            return ApiResponse.success(res, result, 201);
        } catch (error) {
            logger.error('Erro ao criar pessoa:', error);
            return ApiResponse.error(res, error.message);
        }
    }

    async toggleBlock(req, res) {
        try {
            const { id } = req.params;
            const { bloqueado, motivo_bloqueio } = req.body;
            const supabaseClient = req.supabase || supabase;
            const tenantId = req.tenantId || req.event?.id || null;
            if (!tenantId) return ApiResponse.error(res, 'Contexto de evento não encontrado.', 400);

            const data = await pessoaService.toggleBlock(supabaseClient, id, !!bloqueado, motivo_bloqueio, req.user?.id, tenantId);

            // Auditoria
            await auditService.logEntity(req, 'BLOCK_PERSON', 'PESSOAS', id, { 
                bloqueado: !!bloqueado, 
                motivo: motivo_bloqueio 
            });

            return ApiResponse.success(res, data);
        } catch (error) {
            logger.error('Erro ao alternar bloqueio:', error);
            return ApiResponse.error(res, error.message);
        }
    }

    async getById(req, res) {
        try {
            const { id } = req.params;
            const supabaseClient = req.supabase || supabase;
            const tenantId = req.tenantId || req.event?.id || null;
            if (!tenantId) return ApiResponse.error(res, 'Contexto de evento não encontrado.', 400);
            
            const data = await pessoaService.getById(supabaseClient, id, tenantId);

            return ApiResponse.success(res, data);
        } catch (error) {
            logger.error('Erro ao buscar pessoa por ID:', error);
            return ApiResponse.error(res, 'Registro não encontrado', 404);
        }
    }

    async update(req, res) {
        try {
            const { id } = req.params;
            const supabaseClient = req.supabase || supabase;
            const tenantId = req.tenantId || req.event?.id || null;
            if (!tenantId) return ApiResponse.error(res, 'Contexto de evento não encontrado.', 400);

            const data = await pessoaService.update(supabaseClient, id, req.body, tenantId);

            // Auditoria
            await auditService.logEntity(req, 'UPDATE_PERSON', 'PESSOAS', id, req.body);

            return ApiResponse.success(res, data);
        } catch (error) {
            logger.error('Erro ao atualizar pessoa:', error);
            return ApiResponse.error(res, error.message);
        }
    }

    async delete(req, res) {
        try {
            const { id } = req.params;
            const supabaseClient = req.supabase || supabase;
            const tenantId = req.tenantId || req.event?.id || null;
            if (!tenantId) return ApiResponse.error(res, 'Contexto de evento não encontrado.', 400);

            await pessoaService.delete(supabaseClient, id, tenantId);

            // Auditoria
            await auditService.logEntity(req, 'DELETE_PERSON', 'PESSOAS', id);

            return ApiResponse.success(res, { message: 'Participante removido com sucesso.' });
        } catch (error) {
            logger.error('Erro ao deletar pessoa:', error);
            return ApiResponse.error(res, 'Erro ao remover participante');
        }
    }

    async generateQRCode(req, res) {
        try {
            const { id } = req.params;
            const supabaseClient = req.supabase || supabase;
            const tenantId = req.tenantId || req.event?.id || null;
            if (!tenantId) return ApiResponse.error(res, 'Contexto de evento não encontrado.', 400);

            const data = await pessoaService.generateQRCode(supabaseClient, id, tenantId);

            return ApiResponse.success(res, data);
        } catch (error) {
            logger.error('Erro ao gerar QR Code:', error);
            return ApiResponse.error(res, error.message);
        }
    }

    async updateStatus(req, res) {
        try {
            const { id } = req.params;
            const { status } = req.body;
            const supabaseClient = req.supabase || supabase;
            const tenantId = req.tenantId || req.event?.id || null;

            const validStatus = ['ATIVO', 'PENDENTE', 'REJEITADO', 'BLOQUEADO'];
            if (!validStatus.includes(status)) {
                return ApiResponse.error(res, 'Status inválido.', 400);
            }

            const newStatus = status.toLowerCase();

            // 1. Buscar dados atuais para saber se mudou e para quem enviar e-mail
            const { data: currentPessoa, error: findError } = await supabaseClient
                .from('pessoas')
                .select('id, nome, status_acesso, empresa_id, empresas(nome, email)')
                .eq('id', id)
                .single();

            if (findError || !currentPessoa) {
                return ApiResponse.error(res, 'Colaborador não encontrado.', 404);
            }

            // 2. Atualizar Status
            const { data, error } = await supabaseClient
                .from('pessoas')
                .update({ 
                    status_acesso: newStatus, 
                    updated_at: new Date() 
                })
                .eq('id', id)
                .eq('evento_id', tenantId)
                .select()
                .single();

            if (error) {
                logger.error('Erro no updateStatus:', error);
                return ApiResponse.error(res, 'Erro ao atualizar status.', 500);
            }

            // 3. Notificar Empresa se for APROVAÇÃO (de pendente para ativo)
            if (newStatus === 'ativo' && currentPessoa.status_acesso !== 'ativo') {
                const empresa = currentPessoa.empresas;
                if (empresa && empresa.email) {
                    try {
                        await emailService.sendApprovalNotification(
                            empresa.email,
                            currentPessoa.nome,
                            empresa.nome
                        );
                        logger.info(`E-mail de aprovação enviado para ${empresa.email} (Colaborador: ${currentPessoa.nome})`);
                    } catch (emailErr) {
                        logger.error('Falha ao enviar e-mail de aprovação:', emailErr);
                    }
                }
            }

            return ApiResponse.success(res, { success: true, data });
        } catch (error) {
            logger.error('Erro catch no updateStatus:', error);
            return ApiResponse.error(res, error.message, 500);
        }
    }
}


module.exports = new PessoaController();
