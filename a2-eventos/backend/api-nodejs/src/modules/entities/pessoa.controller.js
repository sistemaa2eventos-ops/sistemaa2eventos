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
            logger.error(
                { err: error, event_id: req.event?.id },
                'Error listing people'
            );
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
            logger.error(
                { err: error, search_query: req.query.q, event_id: req.event?.id },
                'Error searching people'
            );
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
            logger.error(
                { err: error, event_id: req.event?.id },
                'Error generating presigned URL'
            );
            return ApiResponse.error(res, 'Erro ao gerar upload URL');
        }
    }

    async create(req, res) {
        try {
            // Sempre usar service_role para operações de escrita (criar/editar)
            // O req.supabase usa anon_key e passa pelas políticas RLS, que podem bloquear operações administrativas
            const supabaseClient = supabase;
            const result = await pessoaService.createPessoa(supabaseClient, req.body, req.user);

            // Auditoria
            await auditService.logEntity(req, 'CREATE_PERSON', 'PESSOAS', result.id, { 
                nome: req.body.nome_completo, 
                cpf: req.body.cpf 
            });

            return ApiResponse.success(res, result, 201);
        } catch (error) {
            logger.error(
                { err: error, person_name: req.body?.nome_completo, event_id: req.event?.id },
                'Error creating person'
            );
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
            logger.error(
                { err: error, person_id: req.params.id, blocked: req.body?.bloqueado },
                'Error toggling person block status'
            );
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
            logger.error(
                { err: error, person_id: req.params.id },
                'Error fetching person by ID'
            );
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
            logger.error(
                { err: error, person_id: req.params.id, event_id: req.event?.id },
                'Error updating person'
            );
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
            logger.error(
                { err: error, person_id: req.params.id },
                'Error deleting person'
            );
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
            logger.error(
                { err: error, person_id: req.params.id },
                'Error generating QR code'
            );
            // Se for erro de validação (ex: pendente), retorna 400, senão 500
            const status = error.message.includes('pendente') || error.message.includes('vinculada') ? 400 : 500;
            return ApiResponse.error(res, error.message, status);
        }
    }

    async updateStatus(req, res) {
        try {
            const { id } = req.params;
            let { status } = req.body;
            const supabaseClient = req.supabase || supabase;
            const tenantId = req.tenantId || req.event?.id || null;

            if (!status) return ApiResponse.error(res, 'Status é obrigatório.', 400);

            // Normalização e Aliases (Robustez)
            status = status.toLowerCase();
            if (status === 'ativo') status = 'autorizado';
            if (status === 'rejeitado') status = 'recusado';

            // Novos status (inclui verificação)
            const validStatus = ['pendente', 'autorizado', 'recusado', 'bloqueado', 'verificacao', 'checkin_feito', 'checkout_feito'];
            if (!validStatus.includes(status)) {
                return ApiResponse.error(res, `Status inválido: ${status}`, 400);
            }

            // 1. Buscar dados atuais
            const { data: currentPessoa, error: findError } = await supabaseClient
                .from('pessoas')
                .select('id, nome_completo, cpf, status_acesso, empresa_id, evento_id, empresas(nome, email)')
                .eq('id', id)
                .single();

            if (findError || !currentPessoa) {
                return ApiResponse.error(res, 'Pessoa não encontrada.', 404);
            }

            // 2. Preparar dados de atualização
            const updateData = { 
                status_acesso: status, 
                updated_at: new Date() 
            };

            // 3. Se status mudará para 'autorizado', gerar QR Code
            if (status === 'autorizado' && currentPessoa.status_acesso !== 'autorizado') {
                const qrGenerator = require('../../utils/qrGenerator');
                const cpf = currentPessoa.cpf || id;
                const qrData = await qrGenerator.generate(cpf);
                updateData.qr_code = qrData.code;
                logger.info('QR code generated', {
                    person_id: id,
                    person_name: currentPessoa.nome_completo,
                    event_id: req.event?.id
                });
            }

            // 4. Atualizar Status
            const { data, error } = await supabaseClient
                .from('pessoas')
                .update(updateData)
                .eq('id', id)
                .eq('evento_id', tenantId)
                .select()
                .single();

            if (error) {
                logger.error(
                    { err: error, person_id: pessoa.id },
                    'Error in updateStatus'
                );
                return ApiResponse.error(res, 'Erro ao atualizar status.', 500);
            }

            // 5. Notificar por e-mail se for APROVAÇÃO
            if (status === 'autorizado' && currentPessoa.status_acesso !== 'autorizado') {
                const empresa = currentPessoa.empresas;
                if (empresa?.email) {
                    try {
                        await emailService.sendApprovalNotification(
                            empresa.email,
                            currentPessoa.nome_completo,
                            empresa.nome,
                            updateData.qr_code
                        );
                        logger.info('Approval email sent', {
                            company_id: empresa.id,
                            company_email: empresa.email
                        });
                    } catch (emailErr) {
                        logger.error(
                            { err: emailErr, company_email: empresa.email },
                            'Failed to send approval email'
                        );
                    }
                }
            }

            return ApiResponse.success(res, { success: true, data });
        } catch (error) {
            logger.error(
                { err: error, person_id: req.params.id },
                'Error in updateStatus catch'
            );
            return ApiResponse.error(res, error.message, 500);
        }
    }

    /**
     * Aprovar pessoa (gera QR Code + sincroniza com dispositivos por área)
     */
    async approve(req, res) {
        try {
            const { id } = req.params;
            const { areas_autorizadas } = req.body; // Array de UUIDs de áreas selecionadas
            const supabaseClient = req.supabase || supabase;
            const tenantId = req.tenantId || req.event?.id || null;

            if (!tenantId) {
                return ApiResponse.error(res, 'Contexto de evento não encontrado.', 400);
            }

            const { data: pessoa, error: findError } = await supabaseClient
                .from('pessoas')
                .select('id, nome_completo, cpf, qr_code, status_acesso')
                .eq('id', id)
                .eq('evento_id', tenantId)
                .single();

            if (findError || !pessoa) {
                return ApiResponse.error(res, 'Pessoa não encontrado.', 404);
            }

            // 🔐 REGRA 5: Validar que pessoa tem pelo menos uma área (se áreas estiverem em uso)
            if (areas_autorizadas && Array.isArray(areas_autorizadas) && areas_autorizadas.length === 0) {
                return ApiResponse.error(res, 'Atenção: Selecione pelo menos uma área de acesso antes de aprovar.', 400);
            }

            // 1. Aprovar na pivottable
            const { error: pivotError } = await supabaseClient
                .from('pessoa_evento_empresa')
                .update({ status_aprovacao: 'aprovado', atualizado_em: new Date() })
                .eq('pessoa_id', id)
                .eq('evento_id', tenantId);

            if (pivotError) {
                logger.error(
                    { err: pivotError, person_id: pessoa.id },
                    'Error approving pivot'
                );
            }

            // 2. Gerar QR Code apenas se não existir
            let qrCodeGenerated = null;
            if (!pessoa.qr_code) {
                const qrGenerator = require('../../utils/qrGenerator');
                const qrSource = pessoa.cpf || pessoa.id;
                const qrData = await qrGenerator.generate(qrSource);

                await supabaseClient
                    .from('pessoas')
                    .update({ qr_code: qrData.code, status_acesso: 'autorizado', updated_at: new Date() })
                    .eq('id', id);

                qrCodeGenerated = qrData;
                logger.info('QR code generated on approval', {
                    person_id: pessoa.id,
                    person_name: pessoa.nome_completo
                });
            } else {
                // Apenas atualizar status
                await supabaseClient
                    .from('pessoas')
                    .update({ status_acesso: 'autorizado', updated_at: new Date() })
                    .eq('id', id);
            }

            // 3. 🆕 VINCULAR ÁREAS DE ACESSO (novo fluxo)
            if (areas_autorizadas && Array.isArray(areas_autorizadas) && areas_autorizadas.length > 0) {
                logger.info('Linking authorized areas on approval', {
                    person_id: pessoa.id,
                    person_name: pessoa.nome_completo,
                    area_count: areas_autorizadas.length
                });

                // Limpar áreas antigas (se houver)
                await supabaseClient
                    .from('pessoa_areas_acesso')
                    .delete()
                    .eq('pessoa_id', id)
                    .eq('evento_id', tenantId);

                // Inserir novas áreas
                const areaVinculos = areas_autorizadas.map(areaId => ({
                    pessoa_id: id,
                    area_id: areaId,
                    evento_id: tenantId,
                    criado_por: req.user?.id
                }));

                const { error: vinculoError } = await supabaseClient
                    .from('pessoa_areas_acesso')
                    .insert(areaVinculos);

                if (vinculoError) {
                    logger.error(
                    { err: vinculoError, person_id: pessoa.id },
                    'Error linking areas'
                );
                    return ApiResponse.error(res, 'Erro ao vincular áreas de acesso', 500);
                }

                // 4. 🆕 DISPARAR SINCRONIZAÇÃO INTELIGENTE POR ÁREA
                const syncService = require('../devices/sync.service');
                setImmediate(async () => {
                    try {
                        const result = await syncService.syncEnrollmentByArea(id);
                        logger.info('Area sync completed on approval', {
                            registered: result.cadastrados,
                            removed: result.removidos,
                            person_id: pessoa.id
                        });
                    } catch (err) {
                        logger.error(
                            { err, person_id: pessoa.id },
                            'Error syncing by area on approval'
                        );
                    }
                });

                logger.info('Areas linked and sync started on approval', {
                    area_count: areas_autorizadas.length,
                    person_id: pessoa.id,
                    async: true
                });
            }

            await auditService.logEntity(req, 'APPROVE_PERSON', 'PESSOAS', id, {
                nome: pessoa.nome_completo,
                areas: areas_autorizadas?.length || 0
            });

            return ApiResponse.success(res, {
                success: true,
                message: 'Pessoa aprovada com sucesso e sincronizada aos dispositivos',
                qr_code: qrCodeGenerated || pessoa.qr_code,
                areas_sincronizadas: areas_autorizadas?.length || 0
            });
        } catch (error) {
            logger.error(
                { err: error, person_id: req.params.id },
                'Error approving person'
            );
            return ApiResponse.error(res, error.message, 500);
        }
    }

    /**
     * Reprovar pessoa
     */
    async reject(req, res) {
        try {
            const { id } = req.params;
            const { justificativa } = req.body;
            const supabaseClient = req.supabase || supabase;
            const tenantId = req.tenantId || req.event?.id || null;

            if (!tenantId) {
                return ApiResponse.error(res, 'Contexto de evento não encontrado.', 400);
            }

            const { data: pessoa, error: findError } = await supabaseClient
                .from('pessoas')
                .select('id, nome_completo')
                .eq('id', id)
                .eq('evento_id', tenantId)
                .single();

            if (findError || !pessoa) {
                return ApiResponse.error(res, 'Pessoa não encontrada.', 404);
            }

            await supabaseClient
                .from('pessoa_evento_empresa')
                .update({ status_aprovacao: 'recusado', atualizado_em: new Date() })
                .eq('pessoa_id', id)
                .eq('evento_id', tenantId);

            await supabaseClient
                .from('pessoas')
                .update({ 
                    status_acesso: 'recusado', 
                    motivo_bloqueio: justificativa || 'Reprovado pelo administrador',
                    updated_at: new Date() 
                })
                .eq('id', id);

            await auditService.logEntity(req, 'REJECT_PERSON', 'PESSOAS', id, { nome: pessoa.nome_completo, justificativa });

            return ApiResponse.success(res, { 
                success: true, 
                message: 'Pessoa reprovada com sucesso'
            });
        } catch (error) {
            logger.error(
                { err: error, person_id: req.params.id },
                'Error rejecting person'
            );
            return ApiResponse.error(res, error.message, 500);
        }
    }
}


module.exports = new PessoaController();
