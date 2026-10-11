const { supabase, supabasePublic } = require('../../config/supabase');
const logger = require('../../services/logger');
const perfilAcesso = require('./perfilAcesso.service');
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
                .maybeSingle();

            if (perfilError) {
                logger.error(`Erro ao buscar perfil: ${perfilError.message}`);
            }

            // Verificar status do usuário
            const userStatus = perfil?.status || 'pendente';
            if (userStatus === 'inativo') {
                await supabase.auth.admin.signOut(data.session?.access_token, 'local').catch(() => {});
                return res.status(403).json({
                    error: 'Usuário inativo. Entre em contato com o administrador.'
                });
            }

            if (userStatus === 'pendente') {
                await supabase.auth.admin.signOut(data.session?.access_token, 'local').catch(() => {});
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

            // nivel_acesso vem diretamente de perfis (admin_master | operador)
            const nivel = perfil?.nivel_acesso || 'operador';

            // admin_master é o único perfil administrador (acesso total)
            const isAdminMaster = nivel === 'admin_master';

            logger.info(`✅ Login bem-sucedido: ${email} (${nivel}, status: ${userStatus})`);

            // Normalizar vínculos e permissões granulares por evento
            const rawPermissions = perfil?.permissions || {};
            const vinculoTipo = perfil?.vinculo_tipo || rawPermissions.vinculo_tipo || (perfil?.evento_id ? 'especifico' : 'global');
            const eventosPermitidos = perfil?.eventos_permitidos || rawPermissions.eventos_permitidos || (perfil?.evento_id ? [perfil.evento_id] : []);
            const eventosPermissoes = perfil?.eventos_permissoes || rawPermissions.eventos_permissoes || {};

            let effectivePermissions = permissions;
            if (perfil?.evento_id && eventosPermissoes[perfil.evento_id]) {
                effectivePermissions = { ...permissions, ...eventosPermissoes[perfil.evento_id] };
            }

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
                    vinculo_tipo: vinculoTipo,
                    eventos_permitidos: eventosPermitidos,
                    eventos_permissoes: eventosPermissoes,
                    permissions: isAdminMaster ? {
                        dashboard: true,
                        empresas: true,
                        pessoas: true,
                        auditoria_documentos: true,
                        relatorios: true,
                        veiculos: true,
                        checkin: true,
                        checkout: true,
                        fiscalizacao: true,
                        monitoramento: true,
                        usuarios: true
                    } : effectivePermissions
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
            const {
                email, nome_completo, telefone,
                vinculo_tipo = 'especifico',
                eventos_permitidos = [],
                eventos_permissoes = {},
                evento_id,
                permissions
            } = req.body;

            // Só admin_master pode criar convites
            const isCallerAdminMaster = req.user?.nivel_acesso === 'admin_master';
            if (!isCallerAdminMaster) {
                return res.status(403).json({
                    error: 'Apenas admin_master pode criar operadores.'
                });
            }

            // Validações de campos obrigatórios
            const isEspecifico = vinculo_tipo === 'especifico';
            const permitidosList = Array.isArray(eventos_permitidos) ? eventos_permitidos : [];
            const eventoIdFinal = evento_id || (permitidosList.length > 0 ? permitidosList[0] : null);

            if (!email || !nome_completo) {
                return res.status(400).json({
                    error: 'Email e nome completo são obrigatórios.'
                });
            }

            if (isEspecifico && permitidosList.length === 0 && !evento_id) {
                return res.status(400).json({
                    error: 'Para vínculo específico, selecione pelo menos um evento disponível.'
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

            // Validar que evento_id existe se fornecido
            if (eventoIdFinal) {
                const { data: eventoExists, error: eventoError } = await supabase
                    .from('eventos')
                    .select('id')
                    .eq('id', eventoIdFinal)
                    .single();

                if (eventoError || !eventoExists) {
                    return res.status(400).json({
                        error: 'Evento não encontrado. Verifique o evento selecionado.'
                    });
                }
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
            const finalEventosPermitidos = isEspecifico
                ? (permitidosList.length > 0 ? permitidosList : [eventoIdFinal])
                : [];

            // Ponto de partida: o modelo do perfil "operador" (Configurações → Perfis de Acesso)
            let basePermissions = {
                ...(await perfilAcesso.modulosDoPerfil('operador')),
                usuarios: false
            };

            if (permissions && typeof permissions === 'object') {
                basePermissions = { ...basePermissions, ...permissions, dashboard: true };
            }

            const finalPermissions = {
                ...basePermissions,
                dashboard: true,
                vinculo_tipo: isEspecifico ? 'especifico' : 'global',
                eventos_permitidos: finalEventosPermitidos,
                eventos_permissoes: eventos_permissoes || {}
            };

            // 1. Criar usuário no Supabase Auth (sem enviar email automático)
            const { data, error } = await supabase.auth.admin.createUser({
                email: normalizedEmail,
                email_confirm: false,
                user_metadata: {
                    nome_completo,
                    nivel_acesso: 'operador',
                    evento_id: eventoIdFinal,
                    vinculo_tipo: isEspecifico ? 'especifico' : 'global',
                    eventos_permitidos: finalEventosPermitidos,
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
            const { error: perfilError } = await supabase
                .from('perfis')
                .insert({
                    id: data.user.id,
                    email: normalizedEmail,
                    nome_completo: nome_completo.trim(),
                    telefone: telefone ? telefone.replace(/[^\d]/g, '') : null,
                    nivel_acesso: 'operador',
                    evento_id: eventoIdFinal,
                    status: 'ativo',
                    status_aprovacao: 'aprovado',
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
            const isCallerAdminMaster = req.user?.nivel_acesso === 'admin_master';
            if (!isCallerAdminMaster) {
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
            const { permissions, vinculo_tipo, eventos_permitidos, eventos_permissoes } = req.body;

            // Só admin_master pode alterar permissões
            const isCallerAdminMaster = req.user?.nivel_acesso === 'admin_master';
            if (!isCallerAdminMaster) {
                return res.status(403).json({
                    error: 'Apenas admin_master pode alterar permissões.'
                });
            }

            const { data: existingPerfil } = await supabase
                .from('perfis')
                .select('permissions')
                .eq('id', userId)
                .maybeSingle();

            const currentPerms = existingPerfil?.permissions || {};
            const safePermissions = {
                ...currentPerms,
                ...(permissions || {}),
                dashboard: true
            };

            if (vinculo_tipo !== undefined) safePermissions.vinculo_tipo = vinculo_tipo;
            if (eventos_permitidos !== undefined) safePermissions.eventos_permitidos = eventos_permitidos;
            if (eventos_permissoes !== undefined) safePermissions.eventos_permissoes = eventos_permissoes;

            const updateData = {
                permissions: safePermissions,
                updated_at: new Date()
            };

            if (vinculo_tipo === 'especifico' && Array.isArray(eventos_permitidos) && eventos_permitidos.length > 0) {
                updateData.evento_id = eventos_permitidos[0];
            }

            const { data, error } = await supabase
                .from('perfis')
                .update(updateData)
                .eq('id', userId)
                .select()
                .single();

            if (error) throw error;

            logger.info(`✅ Permissões atualizadas para: ${userId}`);

            res.json({
                success: true,
                message: 'Permissões atualizadas com sucesso',
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
            // Encerra esta sessão no Supabase (antes passava o id do usuário, e a chamada falhava em silêncio)
            const token = req.headers.authorization?.replace('Bearer ', '');
            if (token) {
                await supabase.auth.admin.signOut(token, 'local').catch((e) => logger.warn(`Logout: falha ao encerrar sessão: ${e.message}`));
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

                const usersFallback = filtered.map(u => {
                    const vinculoTipo = u.permissions?.vinculo_tipo || (u.evento_id ? 'especifico' : 'global');
                    const permitidos = u.permissions?.eventos_permitidos || (u.evento_id ? [u.evento_id] : []);
                    const permissoesPorEvento = u.permissions?.eventos_permissoes || {};
                    return {
                        ...u,
                        email: u.email || '',
                        telefone: u.telefone ? formatPhone(u.telefone) : null,
                        eventos: vinculoTipo === 'global' ? { nome: 'Todos os Eventos' } : { nome: 'Específico' },
                        vinculo_tipo: vinculoTipo,
                        eventos_permitidos: permitidos,
                        eventos_permissoes: permissoesPorEvento
                    };
                });

                return res.json({
                    success: true,
                    users: usersFallback,
                    data: usersFallback
                });
            }

            logger.info(`[listUsers] ✅ Query principal sucesso: ${data?.length || 0} usuários`);

            // Enriquecer dados e aplicar filtro de busca
            const enrichedUsers = data
                .map(user => {
                    const vinculoTipo = user.permissions?.vinculo_tipo || (user.evento_id ? 'especifico' : 'global');
                    const permitidos = user.permissions?.eventos_permitidos || (user.evento_id ? [user.evento_id] : []);
                    const permissoesPorEvento = user.permissions?.eventos_permissoes || {};

                    return {
                        ...user,
                        email: user.email || '',
                        telefone: user.telefone ? formatPhone(user.telefone) : null,
                        eventos: user.eventos?.[0] || (vinculoTipo === 'global' ? { nome: 'Todos os Eventos' } : { nome: 'Específico' }),
                        vinculo_tipo: vinculoTipo,
                        eventos_permitidos: permitidos,
                        eventos_permissoes: permissoesPorEvento
                    };
                })
                .filter(user => {
                    if (!searchTerm) return true;
                    const nameMatch = user.nome_completo?.toLowerCase().includes(searchTerm);
                    return nameMatch;
                });

            logger.info(`[listUsers] ✅ Após filtro de busca: ${enrichedUsers.length} usuários`);
            res.json({
                success: true,
                users: enrichedUsers,
                data: enrichedUsers
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
            const { userId } = req.params;
            const {
                nome_completo,
                telefone,
                evento_id,
                permissions,
                vinculo_tipo,
                eventos_permitidos,
                eventos_permissoes
            } = req.body;

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

            // Atualizar permissões e vínculos (APENAS admin_master pode)
            if (isAdminMaster && (permissions || vinculo_tipo !== undefined || eventos_permitidos !== undefined || eventos_permissoes !== undefined)) {
                const { data: existingPerfil } = await supabase
                    .from('perfis')
                    .select('permissions, evento_id')
                    .eq('id', userId)
                    .maybeSingle();

                const currentPerms = existingPerfil?.permissions || {};
                const basePerms = permissions ? { ...permissions } : { ...currentPerms };

                const updatedPerms = {
                    ...currentPerms,
                    ...basePerms,
                    dashboard: true
                };

                if (vinculo_tipo !== undefined) updatedPerms.vinculo_tipo = vinculo_tipo;
                if (eventos_permitidos !== undefined) updatedPerms.eventos_permitidos = eventos_permitidos;
                if (eventos_permissoes !== undefined) updatedPerms.eventos_permissoes = eventos_permissoes;

                updateData.permissions = updatedPerms;

                if (vinculo_tipo === 'especifico' && Array.isArray(eventos_permitidos) && eventos_permitidos.length > 0) {
                    updateData.evento_id = eventos_permitidos[0];
                } else if (evento_id) {
                    updateData.evento_id = evento_id;
                }

                // Sincronizar metadata do auth do Supabase se aplicável
                await supabase.auth.admin.updateUserById(userId, {
                    user_metadata: {
                        ...(nome_completo ? { nome_completo } : {}),
                        ...(vinculo_tipo ? { vinculo_tipo } : {}),
                        ...(eventos_permitidos ? { eventos_permitidos } : {}),
                        ...(updateData.evento_id ? { evento_id: updateData.evento_id } : {})
                    }
                }).catch(err => logger.warn(`[updateUser] Erro ao sincronizar user_metadata: ${err.message}`));
            } else if (isAdminMaster && req.body.hasOwnProperty('evento_id') && evento_id) {
                updateData.evento_id = evento_id;
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
            const isCallerAdminMaster = req.user?.nivel_acesso === 'admin_master';
            if (!isCallerAdminMaster) {
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

            // Inativo: bloqueia a conta no Supabase (derruba a renovação de sessão, inclusive
            // acessos diretos ao Supabase). Reativado: remove o bloqueio.
            // O backend já recusa o perfil inativo na próxima requisição (middleware authenticate).
            if (status === 'inativo') {
                await supabase.auth.admin.updateUserById(userId, { ban_duration: '876000h' })
                    .catch((e) => logger.warn(`Falha ao bloquear sessão de ${userId}: ${e.message}`));
            } else {
                await supabase.auth.admin.updateUserById(userId, { ban_duration: 'none' })
                    .catch((e) => logger.warn(`Falha ao desbloquear ${userId}: ${e.message}`));
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

            const activeEventId = data.evento_id || req.user.evento_id;
            const vinculoTipo = req.user?.vinculo_tipo || data.permissions?.vinculo_tipo || (data.evento_id ? 'especifico' : 'global');
            const eventosPermitidos = req.user?.eventos_permitidos || data.permissions?.eventos_permitidos || (data.evento_id ? [data.evento_id] : []);
            const eventosPermissoes = req.user?.eventos_permissoes || data.permissions?.eventos_permissoes || {};
            const effectivePermissions = (req.user && typeof req.user.getEffectivePermissions === 'function')
                ? req.user.getEffectivePermissions(activeEventId)
                : (data.permissions || {});

            res.json({
                success: true,
                user: {
                    ...data,
                    vinculo_tipo: vinculoTipo,
                    eventos_permitidos: eventosPermitidos,
                    eventos_permissoes: eventosPermissoes,
                    effectivePermissions
                }
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

            // Validar se o usuário tem permissão para acessar este evento
            if (req.user && typeof req.user.isAllowedEvent === 'function' && !req.user.isAllowedEvent(evento_id)) {
                return res.status(403).json({
                    error: 'Acesso negado. Você não possui permissão para operar este evento.'
                });
            }

            // --- AUTO-CURA SOBERANA (v19.0) ---
            // Se o perfil não existir (ex: após Clean Ground), o UPSERT cria o registro físico.
            const { error } = await supabase
                .from('perfis')
                .upsert({
                    id: req.user.id,
                    evento_id,
                    nome_completo: req.user.nome || req.user.email,
                    nivel_acesso: req.user.role || 'operador',
                    updated_at: new Date()
                }, { onConflict: 'id' });

            if (error) throw error;

            const effectivePermissions = (req.user && typeof req.user.getEffectivePermissions === 'function')
                ? req.user.getEffectivePermissions(evento_id)
                : {};

            logger.info(`🔄 Contexto de evento alterado: ${req.user.email} -> ${evento_id}`);

            res.json({
                success: true,
                message: 'Evento ativo atualizado',
                evento_id,
                effectivePermissions
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
            const isCallerAdminMaster = req.user?.nivel_acesso === 'admin_master';
            if (!isCallerAdminMaster) {
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
     * Atualizar email de um operador (admin_master only)
     * Atualiza simultaneamente no Supabase Auth e na tabela perfis.
     */
    async updateEmail(req, res) {
        try {
            const { userId } = req.params;
            const { email: newEmail } = req.body;

            const isCallerAdminMaster = req.user?.nivel_acesso === 'admin_master';
            if (!isCallerAdminMaster) {
                return res.status(403).json({
                    error: 'Apenas admin_master pode alterar o email de usuários.'
                });
            }

            if (!newEmail || !validateEmail(newEmail.trim())) {
                return res.status(400).json({ error: 'Email inválido.' });
            }

            const emailLimpo = newEmail.trim().toLowerCase();

            // Verificar se email já está em uso por outro usuário
            const { data: emailExiste } = await supabase
                .from('perfis')
                .select('id')
                .eq('email', emailLimpo)
                .neq('id', userId)
                .maybeSingle();

            if (emailExiste) {
                return res.status(409).json({ error: 'Este email já está em uso por outro usuário.' });
            }

            // Atualizar no Supabase Auth (fonte de verdade da identidade)
            const { error: authError } = await supabase.auth.admin.updateUserById(userId, {
                email: emailLimpo
            });

            if (authError) {
                logger.error(`Erro ao atualizar email no Supabase Auth: ${authError.message}`);
                return res.status(400).json({ error: 'Erro ao atualizar email no sistema de autenticação.' });
            }

            // Atualizar na tabela perfis (mantém consistência)
            const { error: dbError } = await supabase
                .from('perfis')
                .update({ email: emailLimpo, updated_at: new Date() })
                .eq('id', userId);

            if (dbError) throw dbError;

            logger.info(`📧 Email atualizado: ${userId} → ${emailLimpo} por ${req.user.id}`);

            res.json({
                success: true,
                message: 'Email atualizado com sucesso'
            });

        } catch (error) {
            logger.error('Erro ao atualizar email:', error);
            res.status(500).json({ error: 'Erro interno ao atualizar email' });
        }
    }

    /**
     * Deletar usuário (operador)
     */
    async deleteUser(req, res) {
        try {
            const { userId } = req.params;

            // Só admin_master pode deletar
            const isCallerAdminMaster = req.user?.nivel_acesso === 'admin_master';
            if (!isCallerAdminMaster) {
                return res.status(403).json({
                    error: 'Apenas admin_master pode deletar usuários.'
                });
            }

            // Não permitir deletar admin_master
            const { data: perfilData, error: perfilError } = await supabase
                .from('perfis')
                .select('nivel_acesso, email')
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

    /**
     * Registro de novo usuário (cria usuário com senha definida)
     * Usado pelo frontend Usuarios.jsx — cria usuário com senha definida.
     */
    async register(req, res) {
        try {
            const {
                email,
                password,
                nome_completo,
                cpf,
                nome_mae,
                data_nascimento,
                nivel_acesso = 'operador',
                evento_id,
                foto_url
            } = req.body;

            if (!email || !password || !nome_completo || !cpf || !nome_mae || !data_nascimento) {
                return res.status(400).json({
                    error: 'Email, senha, nome completo, CPF, nome da mãe e data de nascimento são obrigatórios'
                });
            }

            // Criar usuário no Supabase Auth
            const { data, error } = await supabase.auth.admin.createUser({
                email,
                password,
                email_confirm: true,
                user_metadata: {
                    nome_completo,
                    cpf,
                    nome_mae,
                    data_nascimento,
                    nivel_acesso,
                    evento_id,
                    foto_url
                }
            });

            if (error) {
                logger.error(`Erro ao criar usuário: ${error.message}`);
                return res.status(400).json({
                    error: error.message
                });
            }

            // Injeta a role no app_metadata para validação segura via JWT
            await supabase.auth.admin.updateUserById(data.user.id, {
                app_metadata: { role: nivel_acesso }
            });

            // Cria o perfil (sem ele o login novo bloqueia o acesso por status pendente)
            const { error: perfilError } = await supabase
                .from('perfis')
                .insert({
                    id: data.user.id,
                    email,
                    nome_completo,
                    cpf,
                    nome_mae,
                    data_nascimento,
                    nivel_acesso,
                    evento_id: evento_id || null,
                    foto_url: foto_url || null,
                    status: 'ativo',
                    created_at: new Date().toISOString()
                });

            if (perfilError) {
                logger.warn(`Usuário criado sem perfil: ${perfilError.message}`);
            }

            logger.info(`✅ Usuário criado: ${email} (${nivel_acesso}) e Claims injetadas no JWT.`);

            res.status(201).json({
                success: true,
                message: 'Usuário criado com sucesso',
                user: {
                    id: data.user.id,
                    email: data.user.email,
                    nome_completo,
                    cpf,
                    nivel_acesso
                }
            });

        } catch (error) {
            logger.error('Erro no registro:', error);
            res.status(500).json({ error: 'Erro interno no servidor' });
        }
    }

    /**
     * Atualizar perfil próprio (PUT /profile)
     */
    async updateProfile(req, res) {
        try {
            const userId = req.user.id;
            const { nome_completo, cpf, nome_mae, data_nascimento, telefone, documento, foto_url } = req.body;

            const { data, error } = await supabase
                .from('perfis')
                .update({
                    nome_completo,
                    cpf,
                    nome_mae,
                    data_nascimento,
                    telefone,
                    documento,
                    foto_url,
                    updated_at: new Date()
                })
                .eq('id', userId)
                .select()
                .single();

            if (error) {
                throw error;
            }

            logger.info(`✅ Perfil atualizado: ${userId}`);

            res.json({
                success: true,
                message: 'Perfil atualizado com sucesso',
                profile: data
            });

        } catch (error) {
            logger.error('Erro ao atualizar perfil:', error);
            res.status(500).json({ error: 'Erro interno no servidor' });
        }
    }

    /**
     * Alterar nível de acesso e vínculo de evento (PUT /users/:userId/role)
     */
    async updateUserRole(req, res) {
        try {
            const { userId } = req.params;
            const { nivel_acesso, evento_id } = req.body;

            const updateData = { updated_at: new Date() };

            if (nivel_acesso) {
                if (!['admin', 'supervisor', 'operador', 'op_atendimento', 'op_monitoramento', 'op_analista', 'empresa', 'cliente'].includes(nivel_acesso)) {
                    return res.status(400).json({ error: 'Nível de acesso inválido' });
                }
                updateData.nivel_acesso = nivel_acesso;

                // Força atualização no token da próxima vez que deslogar/logar
                await supabase.auth.admin.updateUserById(userId, {
                    app_metadata: { role: nivel_acesso },
                    user_metadata: { nivel_acesso: nivel_acesso }
                });
            }

            // Permite desvincular enviando null
            if (evento_id !== undefined) {
                updateData.evento_id = evento_id;
            }

            const { data, error } = await supabase
                .from('perfis')
                .update(updateData)
                .eq('id', userId)
                .select()
                .single();

            if (error) throw error;

            logger.info(`👤 Usuário atualizado: ${userId} (Role: ${nivel_acesso}, Evento: ${evento_id})`);

            res.json({
                success: true,
                message: 'Usuário atualizado com sucesso',
                user: data
            });

        } catch (error) {
            logger.error('Erro ao atualizar usuário:', error);
            res.status(500).json({ error: 'Erro interno no servidor' });
        }
    }

    /**
     * Perfis de Acesso (modelo de permissões por papel) — ver perfilAcesso.service.js
     */
    async listPermissions(req, res) {
        try {
            const data = await perfilAcesso.listar();
            res.json({ success: true, data, modulos: perfilAcesso.MODULOS });
        } catch (error) {
            logger.error('Erro ao listar perfis de acesso:', error);
            res.status(500).json({ error: 'Erro ao buscar perfis de acesso' });
        }
    }

    async getPermissions(req, res) {
        try {
            const data = await perfilAcesso.obter(req.params.role);
            if (!data) return res.status(404).json({ error: `Perfil inválido. Válidos: ${perfilAcesso.PERFIS.join(', ')}` });
            res.json({ success: true, data });
        } catch (error) {
            logger.error('Erro ao buscar perfil de acesso:', error);
            res.status(500).json({ error: 'Erro ao buscar perfil de acesso' });
        }
    }

    async savePermissions(req, res) {
        try {
            const data = await perfilAcesso.salvar(req.params.role, req.body?.modulos || {}, req.user);
            logger.info(`✅ Perfil de acesso '${req.params.role}' atualizado por ${req.user?.email}`);
            res.json({ success: true, data });
        } catch (error) {
            if (error.status === 400) return res.status(400).json({ error: error.message });
            logger.error('Erro ao salvar perfil de acesso:', error);
            res.status(500).json({ error: 'Erro ao salvar perfil de acesso' });
        }
    }

    /** Aplica o modelo do perfil a todos os usuários desse papel (só os módulos) */
    async applyPermissions(req, res) {
        try {
            const result = await perfilAcesso.aplicarATodos(req.params.role);
            logger.info(`✅ Perfil de acesso '${req.params.role}' aplicado a ${result.atualizados}/${result.total} usuários por ${req.user?.email}`);
            res.json({ success: true, data: result });
        } catch (error) {
            if (error.status === 400) return res.status(400).json({ error: error.message });
            logger.error('Erro ao aplicar perfil de acesso:', error);
            res.status(500).json({ error: 'Erro ao aplicar perfil de acesso' });
        }
    }

    /**
     * Atualizar avatar do operador logado
     */
    async updateAvatar(req, res) {
        try {
            const { avatar_url } = req.body;
            const userId = req.user?.id;
            if (!userId) return res.status(401).json({ error: 'Não autenticado' });

            const { data, error } = await supabase
                .from('perfis')
                .update({ 
                    avatar_url,
                    updated_at: new Date()
                })
                .eq('id', userId)
                .select('id, avatar_url')
                .maybeSingle();

            if (error) {
                logger.warn('Erro ao atualizar avatar_url na tabela perfis:', error.message);
            }

            logger.info(`🖼️ Avatar atualizado para o usuário: ${userId}`);

            res.json({
                success: true,
                message: 'Avatar atualizado com sucesso',
                avatar_url
            });

        } catch (error) {
            logger.error('Erro ao atualizar avatar:', error);
            res.status(500).json({ error: 'Erro ao atualizar avatar' });
        }
    }
}

module.exports = new AuthController();
