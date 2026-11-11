const { supabase } = require('../../config/supabase');
const logger = require('../../services/logger');
const pessoaService = require('./pessoa.service');
const ApiResponse = require('../../utils/apiResponse');
const emailService = require('../../services/emailService');
const auditService = require('../../services/audit.service');
const syncService = require('../devices/sync.service');


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
            // Início do atendimento (marcado pelo painel): métrica, não campo da pessoa
            const { atendimento_inicio, ...dadosPessoa } = req.body;
            const result = await pessoaService.createPessoa(supabaseClient, dadosPessoa, req.user);
            const novaPessoa = result?.pessoa || result;
            if (atendimento_inicio && novaPessoa?.id) {
                require('../reports/atendimento.service').registrar({
                    evento_id: novaPessoa.evento_id || req.event?.id, operador_id: req.user?.id, pessoa_id: novaPessoa.id,
                    tipo: 'cadastro', inicio: atendimento_inicio
                });
            }

            // Auditoria
            await auditService.logEntity(req, 'CREATE_PERSON', 'PESSOAS', novaPessoa?.id, { 
                nome: req.body.nome_completo, 
                cpf: req.body.cpf 
            });

            return ApiResponse.success(res, novaPessoa, 201);
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
            const body = req.body || {};
            const isBlocking = body.acao !== undefined 
                ? (body.acao === 'bloquear') 
                : Boolean(body.bloqueado);
            const motivo = body.justificativa || body.motivo_bloqueio || (isBlocking ? 'Bloqueio administrativo' : 'Desbloqueio autorizado');
            const supabaseClient = req.supabase || supabase;
            const tenantId = req.tenantId || req.event?.id || req.headers['x-evento-id'] || req.query.evento_id || null;
            if (!tenantId) return ApiResponse.error(res, 'Contexto de evento não encontrado.', 400);

            const data = await pessoaService.toggleBlock(supabaseClient, id, isBlocking, motivo, req.user?.id || req.user?.email, tenantId);

            // Auditoria
            await auditService.logEntity(req, isBlocking ? 'BLOCK_PERSON' : 'UNBLOCK_PERSON', 'PESSOAS', id, { 
                bloqueado: isBlocking, 
                motivo: motivo,
                operador: req.user?.nome_completo || req.user?.email
            });

            return ApiResponse.success(res, data);
        } catch (error) {
            logger.error(
                { err: error, person_id: req.params.id, body: req.body },
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
            // Como no create: cliente do servidor. A autorização já foi feita na rota (módulo Pessoas +
            // evento permitido) e o update filtra por evento_id; o cliente com o token do operador
            // esbarrava no RLS (token sem app_metadata.role) e não alterava nada.
            const supabaseClient = supabase;
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
                    { err: error, person_id: currentPessoa.id },
                    'Error in updateStatus'
                );
                return ApiResponse.error(res, 'Erro ao atualizar status.', 500);
            }

            // O botão Aprovar/Recusar do painel usa esta rota (não /approve): sem refletir no vínculo
            // com a empresa, a pessoa ficava "autorizada" com o vínculo pendente (fora da cota e do
            // portal da empresa). Cliente de serviço: com o token do usuário o RLS ignorava em silêncio.
            const statusVinculo = { autorizado: 'aprovado', recusado: 'recusado', pendente: 'pendente' }[status];
            if (statusVinculo) {
                const { error: pivotError } = await supabase
                    .from('pessoa_evento_empresa')
                    .update({ status_aprovacao: statusVinculo, updated_at: new Date() })
                    .eq('pessoa_id', id)
                    .eq('evento_id', tenantId || currentPessoa.evento_id);
                if (pivotError) logger.error({ err: pivotError, person_id: id }, 'Error syncing pivot on status change');
            }

            // Sincronização com terminais: status ativo envia, status inativo remove
            const statusAtivo = ['autorizado', 'checkin_feito', 'checkout_feito'].includes(status);
            if (statusAtivo) {
                syncService.syncUserToAllDevices(data)
                    .then(r => logger.info(`[AutoSync] Resultado Status: ${JSON.stringify(r)}`))
                    .catch(e => logger.error('[AutoSync] Erro Status:', e));
            } else {
                syncService.deleteUserFromAllDevices(id, tenantId)
                    .then(r => logger.info(`[AutoDelete] Resultado Status: ${JSON.stringify(r)}`))
                    .catch(e => logger.error('[AutoDelete] Erro Status:', e));
            }

            // 5. Notificar por e-mail se for APROVAÇÃO (para a Empresa e DIRETAMENTE para a Pessoa)
            if (status === 'autorizado' && currentPessoa.status_acesso !== 'autorizado') {
                const qrFinal = updateData.qr_code || currentPessoa.qr_code;
                const empresa = currentPessoa.empresas;

                // E-mail para a pessoa cadastrada com seu QR Code de acesso
                if (currentPessoa.email) {
                    try {
                        await emailService.sendApprovalNotification(
                            currentPessoa.email,
                            currentPessoa.nome_completo,
                            empresa?.nome || 'A2 Eventos',
                            qrFinal
                        );
                        logger.info(`📧 [Approval] QR Code enviado ao participante: ${currentPessoa.email}`);
                    } catch (emailErr) {
                        logger.error({ err: emailErr, pessoa_email: currentPessoa.email }, 'Failed to send approval email to person');
                    }
                }

                // Notificar empresa também se tiver e-mail cadastrado
                if (empresa?.email && empresa.email !== currentPessoa.email) {
                    try {
                        await emailService.sendApprovalNotification(
                            empresa.email,
                            currentPessoa.nome_completo,
                            empresa.nome,
                            qrFinal
                        );
                        logger.info('Approval email sent to company', {
                            company_id: empresa.id,
                            company_email: empresa.email
                        });
                    } catch (emailErr) {
                        logger.error(
                            { err: emailErr, company_email: empresa.email },
                            'Failed to send approval email to company'
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
                .update({ status_aprovacao: 'aprovado', updated_at: new Date() })
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

            // 5. Notificar por e-mail com QR Code (pessoa e empresa)
            const qrParaEnvio = qrCodeGenerated?.code || pessoa.qr_code;
            if (pessoa.email) {
                emailService.sendApprovalNotification(
                    pessoa.email,
                    pessoa.nome_completo,
                    pessoa.empresas?.nome || 'A2 Eventos',
                    qrParaEnvio
                ).catch(err => logger.error({ err, email: pessoa.email }, 'Falha ao enviar QR Code ao participante'));
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
                .update({ status_aprovacao: 'recusado', updated_at: new Date() })
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

    /**
     * Liberação manual por turno (pessoa com documentação pendente).
     * Vale até o checkout ou o horário de reset do evento.
     */
    async liberarManual(req, res) {
        try {
            const liberacaoManual = require('./liberacaoManual.service');
            const result = await liberacaoManual.liberar({
                pessoaId: req.params.id,
                eventoId: req.event.id,
                operadorId: req.user?.id,
                motivo: req.body?.motivo
            });
            await auditService.logEntity(req, 'MANUAL_RELEASE_PERSON', 'PESSOAS', req.params.id, {
                ate: result.liberacao_manual_ate, motivo: req.body?.motivo || null
            });
            return ApiResponse.success(res, result);
        } catch (error) {
            logger.error(`Erro na liberação manual da pessoa ${req.params.id}: ${error.message}`);
            return ApiResponse.error(res, error.message, error.status || 500);
        }
    }

    async revogarLiberacaoManual(req, res) {
        try {
            const liberacaoManual = require('./liberacaoManual.service');
            const encerrada = await liberacaoManual.encerrar(req.params.id, 'revogada pelo operador');
            await auditService.logEntity(req, 'REVOKE_MANUAL_RELEASE', 'PESSOAS', req.params.id, {});
            return ApiResponse.success(res, { encerrada });
        } catch (error) {
            logger.error(`Erro ao revogar liberação manual da pessoa ${req.params.id}: ${error.message}`);
            return ApiResponse.error(res, error.message, 500);
        }
    }

    /**
     * Reenvia manualmente o e-mail contendo o QR Code de acesso ao participante.
     */
    async reenviarQRCode(req, res) {
        try {
            const { id } = req.params;
            const eventoId = req.event?.id;
            const supabaseClient = req.supabase || supabase;

            const { data: pessoa, error: pErr } = await supabaseClient
                .from('pessoas')
                .select('id, nome_completo, email, qr_code, cpf, empresas(nome)')
                .eq('id', id)
                .eq('evento_id', eventoId)
                .single();

            if (pErr || !pessoa) {
                return ApiResponse.error(res, 'Pessoa não encontrada neste evento.', 404);
            }

            if (!pessoa.email) {
                return ApiResponse.error(res, 'Participante não possui e-mail cadastrado.', 400);
            }

            // Se ainda não tiver QR Code, gera agora
            let qrCode = pessoa.qr_code;
            if (!qrCode) {
                const qrGenerator = require('../../utils/qrGenerator');
                const qrData = await qrGenerator.generate(pessoa.cpf || pessoa.id);
                qrCode = qrData.code;
                await supabaseClient.from('pessoas').update({ qr_code: qrCode }).eq('id', id);
            }

            await emailService.sendApprovalNotification(
                pessoa.email,
                pessoa.nome_completo,
                pessoa.empresas?.nome || 'A2 Eventos',
                qrCode
            );

            logger.info(`📧 QR Code reenviado com sucesso para ${pessoa.email}`);
            return ApiResponse.success(res, {
                success: true,
                message: `QR Code enviado com sucesso para ${pessoa.email}`
            });
        } catch (error) {
            logger.error(`Erro ao reenviar QR Code para pessoa ${req.params.id}: ${error.message}`);
            return ApiResponse.error(res, error.message || 'Erro ao enviar e-mail.', 500);
        }
    }
}


module.exports = new PessoaController();
