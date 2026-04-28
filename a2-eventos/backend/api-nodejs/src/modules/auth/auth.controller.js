const { supabase, supabasePublic } = require('../../config/supabase');
const logger = require('../../services/logger');
const cacheService = require('../../services/cacheService');
const emailService = require('../../services/emailService');
const {
    validateEmail,
    validatePhone,
    validatePermissions,
    formatPhone,
    normalizeEmail,
    getDefaultPermissions
} = require('../../utils/validators');

class AuthController {
    /**
     * Login do usuário
     */
    async login(req, res) {
        try {
            const { email, password } = req.body;

            if (!email || !password) {
                return res.status(400).json({
                    error: 'Email e senha são obrigatórios'
                });
            }

            const { data, error } = await supabasePublic.auth.signInWithPassword({
                email,
                password
            });

            if (error) {
                logger.warn(`Falha no login: ${email} - ${error.message}`);
                return res.status(401).json({
                    error: 'Credenciais inválidas'
                });
            }

            // Buscar perfil do usuário
            const { data: perfil, error: perfilError } = await supabase
                .from('perfis')
                .select('*')
                .eq('id', data.user.id)
                .single();

            if (perfilError) {
                logger.error(`Erro ao buscar perfil: ${perfilError.message}`);
            }

            // Verificar status do usuário
            const userStatus = perfil?.status || 'pendente';
            if (userStatus === 'inativo') {
                await supabase.auth.admin.signOut(data.user.id);
                return res.status(403).json({
                    error: 'Usuário inativo. Entre em contato com o administrador.'
                });
            }

            if (userStatus === 'pendente') {
                await supabase.auth.admin.signOut(data.user.id);
                return res.status(403).json({
                    error: 'Aguarde aprovação do administrador para acessar o sistema.'
                });
            }

            // Usar permissões do JSONB ou padrão
            const permissions = perfil?.permissions || {
                dashboard: true,
                empresas: false,
                pessoas: false,
                auditoria_documentos: false,
                monitoramento: false,
                relatorios: false,
                checkin: false,
                checkout: false
            };

            // admin_master tem acesso total
            const nivel = perfil?.nivel_acesso || 'operador';
            const isAdminMaster = nivel === 'admin_master';

            logger.info(`✅ Login bem-sucedido: ${email} (${nivel}, status: ${userStatus})`);

            res.json({
                success: true,
                session: data.session,
                user: {
                    id: data.user.id,
                    email: data.user.email,
                    nivel_acesso: nivel,
                    evento_id: perfil?.evento_id,
                    nome_completo: perfil?.nome_completo,
                    avatar_url: perfil?.avatar_url,
                    status: userStatus,
                    permissions: isAdminMaster ? {
                        dashboard: true,
                        empresas: true,
                        pessoas: true,
                        auditoria_documentos: true,
                        monitoramento: true,
                        relatorios: true,
                        checkin: true,
                        checkout: true
                    } : permissions
                }
            });

        } catch (error) {
            logger.error('Erro no login:', error);

            if (error.code === 'ECONNREFUSED' || error.message.includes('fetch') || error.message.includes('network')) {
                return res.status(503).json({
                    error: 'Serviço de autenticação temporariamente indisponível. Verifique sua conexão.'
                });
            }

            res.status(500).json({ error: 'Erro interno no servidor' });
        }
    }

    /**
     * Criar convite para novo operador do painel
     * Apenas admin_master pode criar operadores
     * Permissões começam desligadas (tudo false) - admin_master ativa conforme precisa
     */
    async invite(req, res) {
        try {
            const { email, nome_completo, telefone, evento_id, permissions } = req.body;

            // Só admin_master pode criar convites
            if (req.user?.nivel_acesso !== 'admin_master') {
                return res.status(403).json({
                    error: 'Apenas admin_master pode criar operadores.'
                });
            }

            // Validações de campos obrigatórios
            if (!email || !nome_completo || !evento_id) {
                return res.status(400).json({
                    error: 'Email, nome completo e evento são obrigatórios.'
                });
            }

            // Validar formato de email
            const normalizedEmail = normalizeEmail(email);
            if (!validateEmail(normalizedEmail)) {
                return res.status(400).json({
                    error: 'Email inválido. Verifique o formato.'
                });
            }

            // Validar telefone se fornecido
            if (telefone && !validatePhone(telefone)) {
                return res.status(400).json({
                    error: 'Telefone inválido. Use formato: (XX) 9XXXX-XXXX ou (XX) XXXX-XXXX'
                });
            }

            // Validar que evento_id existe
            const { data: eventoExists, error: eventoError } = await supabase
                .from('eventos')
                .select('id')
                .eq('id', evento_id)
                .single();

            if (eventoError || !eventoExists) {
                return res.status(400).json({
                    error: 'Evento não encontrado. Verifique o evento_id.'
                });
            }

            // Verificar se email já existe como operador
            const { data: existingEmail, error: emailCheckError } = await supabase
                .from('perfis')
                .select('id')
                .eq('email', normalizedEmail)
                .limit(1);

            if (!emailCheckError && existingEmail && existingEmail.length > 0) {
                return res.status(409).json({
                    error: 'Este email já está cadastrado como operador.'
                });
            }

            // Validar e processar permissões (se fornecidas)
            let finalPermissions;
            if (permissions) {
                const permValidation = validatePermissions(permissions);
                if (!permValidation.valid) {
                    return res.status(400).json({
                        error: permValidation.reason
                    });
                }
                finalPermissions = permissions;
            } else {
                // PADRÃO: Tudo desligado - admin_master ativa conforme precisa
                finalPermissions = {
                    dashboard: true,        // Dashboard é obrigatório
                    empresas: false,
                    pessoas: false,
                    auditoria_documentos: false,
                    monitoramento: false,
                    relatorios: false,
                    checkin: false,
                    checkout: false,
                    dispositivos: false,
                    usuarios: false
                };
            }

            // 1. Criar usuário no Supabase Auth (sem enviar email automático)
            const { data, error } = await supabase.auth.admin.createUser({
                email: normalizedEmail,
                email_confirm: false,
                user_metadata: {
                    nome_completo,
                    nivel_acesso: 'operador',
                    evento_id,
                    telefone: telefone ? telefone.replace(/[^\d]/g, '') : null
                }
            });

            if (error) {
                logger.error(`Erro ao criar usuário: ${error.message}`);
                return res.status(400).json({
                    error: error.message || 'Erro ao criar usuário'
                });
            }

            // 2. Gerar link de ativação
            const { data: linkData, error: linkError } = await supabase.auth.admin.generateLink({
                type: 'invite',
                email: normalizedEmail,
                options: {
                    redirectTo: `${process.env.FRONTEND_URL || 'https://painel.nzt.app.br'}/reset-password`
                }
            });

            if (linkError) {
                logger.warn(`Erro ao gerar link de ativação: ${linkError.message}`);
            }

            // 3. Criar perfil com dados completos
            // Sempre nível_acesso = 'operador' (não 'admin_master')
            const { error: perfilError } = await supabase
                .from('perfis')
                .insert({
                    id: data.user.id,
                    email: normalizedEmail,
                    nome_completo: nome_completo.trim(),
                    telefone: telefone ? telefone.replace(/[^\d]/g, '') : null,
                    // ❌ CPF removido - é exclusivo de pessoas (participantes)
                    nivel_acesso: 'operador',  // ← SEMPRE operador
                    evento_id,
                    status: 'pendente',
                    permissions: finalPermissions,
                    created_at: new Date().toISOString()
                });

            if (perfilError) {
                logger.error(`Erro ao criar perfil: ${perfilError.message}`);
                return res.status(400).json({
                    error: 'Usuário criado no Supabase, mas houve erro ao salvar perfil.'
                });
            }

            // 4. Enviar email de convite via SMTP customizado
            const activationLink = linkData?.properties?.action_link;
            if (activationLink) {
                try {
                    await emailService.sendOperatorInvite(normalizedEmail, nome_completo, activationLink);
                } catch (emailError) {
                    logger.error(`Erro ao enviar email de convite: ${emailError.message}`);
                    // Não bloquear o fluxo se o email falhar - usuário foi criado
                }
            }

            logger.info(`✅ Operador criado: ${normalizedEmail} (evento: ${evento_id}, status: pendente) por ${req.user.id}`);

            res.status(201).json({
                success: true,
                message: 'Operador criado com sucesso. Email de convite enviado. Aguarde que ele defina a senha e então aprove.',
                user: {
                    id: data.user.id,
                    email: normalizedEmail,
                    nome_completo,
                    telefone: telefone ? formatPhone(telefone) : null,
                    nivel_acesso: 'operador',
                    status: 'pendente',
                    permissions: finalPermissions,
                    evento_id
                }
            });

        } catch (error) {
            logger.error('Erro ao criar operador:', error);
            res.status(500).json({ error: 'Erro interno ao criar operador' });
        }
    }

    /**
     * Aprovar usuário (admin_master)
     */
    async approveUser(req, res) {
        try {
            const { userId } = req.params;
            const { permissions, evento_id } = req.body;

            // Só admin_master pode aprovar
            if (req.user?.nivel_acesso !== 'admin_master') {
                return res.status(403).json({
                    error: 'Apenas admin_master pode aprovar usuários.'
                });
            }

            // Buscar perfil do usuário
            const { data: perfil, error: perfilError } = await supabase
                .from('perfis')
                .select('*')
                .eq('id', userId)
                .single();

            if (perfilError || !perfil) {
                return res.status(404).json({
                    error: 'Usuário não encontrado.'
                });
            }

            if (perfil.status === 'ativo') {
                return res.status(400).json({
                    error: 'Usuário já está ativo.'
                });
            }

            // Atualizar perfil
            const updateData = {
                status: 'ativo',
                aprovado_por: req.user.id,
                aprovado_em: new Date(),
                updated_at: new Date()
            };

            // Atualizar evento se fornecido
            if (evento_id) {
                updateData.evento_id = evento_id;
            }

            // Atualizar permissões se fornecidas
            if (permissions) {
                // Garantir que dashboard é sempre true
                updateData.permissions = {
                    ...permissions,
                    dashboard: true
                };
            }

            const { data, error } = await supabase
                .from('perfis')
                .update(updateData)
                .eq('id', userId)
                .select()
                .single();

            if (error) throw error;

            logger.info(`✅ Usuário aprovado: ${userId} por ${req.user.id}`);

            res.json({
                success: true,
                message: 'Usuário aprovado com sucesso',
                user: data
            });

        } catch (error) {
            logger.error('Erro ao aprovar usuário:', error);
            res.status(500).json({ error: 'Erro interno no servidor' });
        }
    }

    /**
     * Atualizar permissões do usuário
     */
    async updatePermissions(req, res) {
        try {
            const { userId } = req.params;
            const { permissions } = req.body;

            // Só admin_master pode alterar permissões
            if (req.user?.nivel_acesso !== 'admin_master') {
                return res.status(403).json({
                    error: 'Apenas admin_master pode alterar permissões.'
                });
            }

            // Garantir que dashboard é sempre true
            const safePermissions = {
                ...permissions,
                dashboard: true
            };

            const { data, error } = await supabase
                .from('perfis')
                .update({
                    permissions: safePermissions,
                    updated_at: new Date()
                })
                .eq('id', userId)
                .select()
                .single();

            if (error) throw error;

            logger.info(`✅ Permissões atualizadas para: ${userId}`);

            res.json({
                success: true,
                message: 'Permissões atualizadas',
                user: data
            });

        } catch (error) {
            logger.error('Erro ao atualizar permissões:', error);
            res.status(500).json({ error: 'Erro interno no servidor' });
        }
    }

    /**
     * Logout
     */
    async logout(req, res) {
        try {
            if (req.user?.id) {
                await supabase.auth.admin.signOut(req.user.id).catch(() => {});
            }

            logger.info(`✅ Logout: ${req.user?.email}`);

            res.json({
                success: true,
                message: 'Logout realizado com sucesso'
            });

        } catch (error) {
            logger.error('Erro no logout:', error);
            res.status(500).json({ error: 'Erro interno no servidor' });
        }
    }

    /**
     * Recuperar senha
     */
    async forgotPassword(req, res) {
        try {
            const { email } = req.body;

            if (!email) {
                return res.status(400).json({ error: 'Email é obrigatório' });
            }

            const { error } = await supabasePublic.auth.resetPasswordForEmail(email, {
                redirectTo: `${process.env.FRONTEND_URL}/reset-password`
            });

            if (error) throw error;

            logger.info(`📧 Email de recuperação enviado: ${email}`);

            res.json({
                success: true,
                message: 'Email de recuperação enviado'
            });

        } catch (error) {
            logger.error('Erro na recuperação de senha:', error);
            res.status(500).json({ error: 'Erro interno no servidor' });
        }
    }

    /**
     * Listar usuários com busca por nome, email ou CPF
     */
    async listUsers(req, res) {
        try {
            logger.info('📋 [listUsers] Iniciando...');
            const isAdminMaster = req.user?.nivel_acesso === 'admin_master';
            const searchTerm = req.query.search?.toLowerCase() || '';
            logger.info(`[listUsers] User level: ${req.user?.nivel_acesso}, Search: "${searchTerm}"`);

            // Query base: buscar perfis com campos disponíveis
            let query = supabase
                .from('perfis')
                .select(`id, email, nome_completo, telefone, nivel_acesso, status, evento_id, permissions, created_at, updated_at, eventos(nome)`)
                .order('nome_completo');

            // Se não for admin_master, filtra por evento
            if (!isAdminMaster && req.user?.evento_id) {
                logger.info(`[listUsers] Filtrando por evento: ${req.user.evento_id}`);
                query = query.eq('evento_id', req.user.evento_id);
            }

            logger.info('[listUsers] Executando query principal...');
            const { data, error } = await query;

            if (error) {
                logger.error('[listUsers] ❌ Erro na query principal:', { error: error.message, code: error.code });
                logger.info(`[listUsers] Detalhe do erro: ${JSON.stringify(error)}`);

                // Fallback simples: sem campos complexos
                logger.info('[listUsers] Tentando fallback sem eventos(nome)...');
                let fallbackQuery = supabase
                    .from('perfis')
                    .select('id, nome_completo, nivel_acesso, status, evento_id, telefone, permissions, email')
                    .order('nome_completo');

                if (!isAdminMaster && req.user?.evento_id) {
                    fallbackQuery = fallbackQuery.eq('evento_id', req.user.evento_id);
                }

                const { data: fallbackData, error: fallbackError } = await fallbackQuery;

                if (fallbackError) {
                    logger.error('[listUsers] ❌ Fallback também falhou:', { error: fallbackError.message, code: fallbackError.code });
                    throw fallbackError;
                }

                logger.info(`[listUsers] ✅ Fallback sucesso: ${fallbackData?.length || 0} usuários retornados`);

                // Aplicar busca em memória
                const filtered = fallbackData.filter(user => {
                    const name = user.nome_completo?.toLowerCase() || '';
                    return !searchTerm || name.includes(searchTerm);
                });

                return res.json({
                    success: true,
                    users: filtered.map(u => ({
                        ...u,
                        email: u.email || '',
                        telefone: u.telefone ? formatPhone(u.telefone) : null
                    }))
                });
            }

            logger.info(`[listUsers] ✅ Query principal sucesso: ${data?.length || 0} usuários`);

            // Enriquecer dados e aplicar filtro de busca
            const enrichedUsers = data
                .map(user => ({
                    ...user,
                    email: user.email || '',
                    telefone: user.telefone ? formatPhone(user.telefone) : null,
                    eventos: user.eventos?.[0] || { nome: 'Global' }
                }))
                .filter(user => {
                    if (!searchTerm) return true;
                    const nameMatch = user.nome_completo?.toLowerCase().includes(searchTerm);
                    return nameMatch;
                });

            logger.info(`[listUsers] ✅ Após filtro de busca: ${enrichedUsers.length} usuários`);
            res.json({
                success: true,
                users: enrichedUsers
            });

        } catch (error) {
            logger.error('[listUsers] ❌ ERRO FATAL:', { message: error?.message, code: error?.code });
            logger.info(`[listUsers] Stack trace: ${error?.stack}`);
            res.status(500).json({
                error: 'Erro ao buscar usuários',
                message: process.env.NODE_ENV === 'development' ? error.message : 'Erro ao listar usuários'
            });
        }
    }

    /**
     * Atualizar operador
     * Operadores podem atualizar apenas seus próprios dados básicos
     * Admin master pode atualizar qualquer operador e suas permissões
     */
    async updateUser(req, res) {
        try {
            const { id: userId } = req.params;
            const { nome_completo, telefone, evento_id, permissions } = req.body;

            // Só admin_master pode editar outros usuários
            // Operadores podem editar apenas seus próprios dados básicos (nome, telefone)
            const isSelf = userId === req.user.id;
            const isAdminMaster = req.user?.nivel_acesso === 'admin_master';

            if (!isSelf && !isAdminMaster) {
                return res.status(403).json({
                    error: 'Sem permissão. Operadores podem editar apenas seus próprios dados básicos.'
                });
            }

            const updateData = { updated_at: new Date() };

            // Qualquer um pode atualizar seu próprio nome e telefone
            if (nome_completo) {
                updateData.nome_completo = nome_completo.trim();
            }

            // Validar e atualizar telefone
            if (telefone !== undefined) {
                if (telefone && !validatePhone(telefone)) {
                    return res.status(400).json({
                        error: 'Telefone inválido. Use formato: (XX) 9XXXX-XXXX ou (XX) XXXX-XXXX'
                    });
                }
                updateData.telefone = telefone ? telefone.replace(/[^\d]/g, '') : null;
            }

            // ❌ CPF removido - não existe mais em perfis

            // Atualizar evento vinculado (apenas admin_master)
            if (isAdminMaster && req.body.hasOwnProperty('evento_id') && evento_id) {
                // Validar que evento_id existe
                const { data: eventoExists, error: eventoError } = await supabase
                    .from('eventos')
                    .select('id')
                    .eq('id', evento_id)
                    .single();

                if (eventoError || !eventoExists) {
                    return res.status(400).json({
                        error: 'Evento não encontrado. Verifique o evento_id.'
                    });
                }
                updateData.evento_id = evento_id;
            }

            // Atualizar permissões (APENAS admin_master pode)
            // Operadores NÃO podem alterar suas próprias permissões
            if (permissions) {
                if (!isAdminMaster) {
                    return res.status(403).json({
                        error: 'Operadores não podem alterar suas próprias permissões. Solicite ao admin_master.'
                    });
                }

                const permValidation = validatePermissions(permissions);
                if (!permValidation.valid) {
                    return res.status(400).json({
                        error: permValidation.reason
                    });
                }
                updateData.permissions = permissions;
            }

            const { data, error } = await supabase
                .from('perfis')
                .update(updateData)
                .eq('id', userId)
                .select()
                .single();

            if (error) throw error;

            logger.info(`👤 Operador atualizado: ${userId} por ${req.user.id}`);

            res.json({
                success: true,
                message: 'Operador atualizado com sucesso',
                user: {
                    ...data,
                    // ❌ CPF não retorna mais (não existe em perfis)
                    telefone: data.telefone ? formatPhone(data.telefone) : null
                }
            });

        } catch (error) {
            logger.error('Erro ao atualizar operador:', error);
            res.status(500).json({ error: 'Erro interno no servidor' });
        }
    }

    /**
     * Inativar usuário
     */
    async updateUserStatus(req, res) {
        try {
            const { userId } = req.params;
            const { status } = req.body;

            // Só admin_master pode inativar
            if (req.user?.nivel_acesso !== 'admin_master') {
                return res.status(403).json({
                    error: 'Apenas admin_master pode alterar status.'
                });
            }

            // Não pode inativar a si mesmo
            if (userId === req.user.id) {
                return res.status(400).json({
                    error: 'Você não pode inativar seu próprio usuário.'
                });
            }

            const { data, error } = await supabase
                .from('perfis')
                .update({ status, updated_at: new Date() })
                .eq('id', userId)
                .select()
                .single();

            if (error) throw error;

            // Se inativar, fazer logout do usuário
            if (status === 'inativo') {
                await supabase.auth.admin.signOut(userId).catch(() => {});
            }

            logger.info(`👤 Status alterado: ${userId} -> ${status}`);

            res.json({
                success: true,
                message: `Usuário ${status === 'inativo' ? 'inativado' : 'ativado'} com sucesso`,
                user: data
            });

        } catch (error) {
            logger.error('Erro ao alterar status:', error);
            res.status(500).json({ error: 'Erro interno no servidor' });
        }
    }

    /**
     * Alterar própria senha
     */
    async changeOwnPassword(req, res) {
        try {
            const { nova_senha, confirmar_senha } = req.body;

            if (!nova_senha || nova_senha.length < 6) {
                return res.status(400).json({
                    error: 'A senha deve ter pelo menos 6 caracteres.'
                });
            }

            if (nova_senha !== confirmar_senha) {
                return res.status(400).json({
                    error: 'As senhas não coincidem.'
                });
            }

            const { error } = await supabase.auth.updateUser({
                password: nova_senha
            });

            if (error) throw error;

            logger.info(`🔑 Senha alterada: ${req.user.email}`);

            res.json({
                success: true,
                message: 'Senha alterada com sucesso.'
            });

        } catch (error) {
            logger.error('Erro ao trocar senha:', error);
            res.status(500).json({ error: 'Erro interno no servidor' });
        }
    }

    /**
     * Get profile
     */
    async getProfile(req, res) {
        try {
            const { data, error } = await supabase
                .from('perfis')
                .select('*')
                .eq('id', req.user.id)
                .single();

            if (error) throw error;

            res.json({
                success: true,
                user: data
            });

        } catch (error) {
            logger.error('Erro ao buscar perfil:', error);
            res.status(500).json({ error: 'Erro interno no servidor' });
        }
    }

    /**
     * Definir evento ativo (troca de contexto)
     */
    async setActiveEvent(req, res) {
        try {
            const { evento_id } = req.body;

            if (!evento_id) {
                return res.status(400).json({ error: 'evento_id é obrigatório' });
            }

            // Opcional: Atualiza o último evento acessado no DB para conveniência
            await supabase
                .from('perfis')
                .update({ evento_id, updated_at: new Date() })
                .eq('id', req.user.id);

            logger.info(`🔄 Contexto de evento alterado: ${req.user.email} -> ${evento_id}`);

            res.json({
                success: true,
                message: 'Evento ativo atualizado'
            });

        } catch (error) {
            logger.error('Erro ao definir evento ativo:', error);
            res.status(500).json({ error: 'Erro interno no servidor' });
        }
    }

    /**
     * Admin: Resetar senha de um usuário
     */
    async adminResetPassword(req, res) {
        try {
            const { userId } = req.params;
            const { nova_senha, confirmar_senha } = req.body;

            // Só admin_master pode resetar senhas
            if (req.user?.nivel_acesso !== 'admin_master') {
                return res.status(403).json({
                    error: 'Apenas admin_master pode resetar senhas.'
                });
            }

            // Validação básica
            if (!nova_senha || nova_senha.length < 6) {
                return res.status(400).json({
                    error: 'A senha deve ter pelo menos 6 caracteres.'
                });
            }

            if (nova_senha !== confirmar_senha) {
                return res.status(400).json({
                    error: 'As senhas não coincidem.'
                });
            }

            // Não pode resetar senha de si mesmo
            if (userId === req.user.id) {
                return res.status(400).json({
                    error: 'Você não pode resetar sua própria senha desta forma. Use "Alterar Senha".'
                });
            }

            // Atualizar senha via Supabase Admin
            const { error } = await supabase.auth.admin.updateUserById(userId, {
                password: nova_senha
            });

            if (error) throw error;

            logger.info(`🔑 Senha resetada por admin: ${userId} por ${req.user.id}`);

            res.json({
                success: true,
                message: 'Senha resetada com sucesso'
            });

        } catch (error) {
            logger.error('Erro ao resetar senha:', error);
            res.status(500).json({
                error: 'Erro ao resetar senha',
                message: process.env.NODE_ENV === 'development' ? error.message : 'Erro interno'
            });
        }
    }

    /**
     * Deletar usuário (operador)
     */
    async deleteUser(req, res) {
        try {
            const { userId } = req.params;

            // Só admin_master pode deletar
            if (req.user?.nivel_acesso !== 'admin_master') {
                return res.status(403).json({
                    error: 'Apenas admin_master pode deletar usuários.'
                });
            }

            // Não permitir deletar admin_master
            const { data: perfilData, error: perfilError } = await supabase
                .from('perfis')
                .select('nivel_acesso')
                .eq('id', userId)
                .single();

            if (perfilError || !perfilData) {
                return res.status(404).json({
                    error: 'Usuário não encontrado.'
                });
            }

            if (perfilData.nivel_acesso === 'admin_master') {
                return res.status(403).json({
                    error: 'Não é possível deletar um admin_master.'
                });
            }

            // Deletar do Supabase Auth
            const { error: authError } = await supabase.auth.admin.deleteUser(userId);
            if (authError) {
                logger.warn(`Erro ao deletar usuário do Supabase Auth: ${authError.message}`);
            }

            // Deletar do perfis
            const { error: deleteError } = await supabase
                .from('perfis')
                .delete()
                .eq('id', userId);

            if (deleteError) throw deleteError;

            logger.info(`🗑️  Operador deletado: ${userId} por ${req.user.id}`);

            res.json({
                success: true,
                message: 'Operador deletado com sucesso'
            });

        } catch (error) {
            logger.error('Erro ao deletar usuário:', error);
            res.status(500).json({ error: 'Erro ao deletar usuário' });
        }
    }
}

module.exports = new AuthController();