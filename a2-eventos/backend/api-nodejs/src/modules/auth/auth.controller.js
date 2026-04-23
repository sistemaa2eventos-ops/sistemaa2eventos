const { supabase, supabasePublic } = require('../../config/supabase');
const logger = require('../../services/logger');
const cacheService = require('../../services/cacheService');

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
     * Criar convite para novo usuário
     */
    async invite(req, res) {
        try {
            const {
                email,
                nome_completo,
                nivel_acesso = 'operador',
                evento_id
            } = req.body;

            // Só admin_master pode criar convites
            if (req.user?.nivel_acesso !== 'admin_master') {
                return res.status(403).json({
                    error: 'Apenas admin_master pode criar convites.'
                });
            }

            // Validar permissão para níveis superiores
            if (nivel_acesso !== 'operador' && req.user?.nivel_acesso !== 'admin_master') {
                return res.status(403).json({
                    error: 'Apenas admin_master pode criar usuários de nível superior.'
                });
            }

            // Validar campos obrigatórios (evento_id é opcional para níveis superiores/master)
            if (!email || !nome_completo || (nivel_acesso === 'operador' && !evento_id)) {
                return res.status(400).json({
                    error: 'Email, nome completo e evento (para operadores) são obrigatórios'
                });
            }

            // Criar convite no Supabase Auth com link de redirecionamento para o frontend
            const { data, error } = await supabase.auth.admin.inviteUserByEmail(email, {
                redirectTo: `${process.env.FRONTEND_URL || 'https://painel.nzt.app.br'}/reset-password`,
                data: {
                    nome_completo,
                    nivel_acesso,
                    evento_id: evento_id || null
                }
            });

            if (error) {
                logger.error(`Erro ao enviar convite: ${error.message}`);
                return res.status(400).json({
                    error: error.message
                });
            }

            // Criar perfil com status 'pendente' e permissões default
            const { error: perfilError } = await supabase
                .from('perfis')
                .insert({
                    id: data.user.id,
                    nome_completo,
                    nivel_acesso: nivel_acesso || 'operador',
                    evento_id: evento_id || null,
                    status: 'pendente',
                    permissions: {
                        dashboard: true,
                        empresas: nivel_acesso === 'master' || nivel_acesso === 'admin_master',
                        pessoas: nivel_acesso === 'master' || nivel_acesso === 'admin_master',
                        auditoria_documentos: nivel_acesso === 'master' || nivel_acesso === 'admin_master',
                        monitoramento: true,
                        relatorios: true,
                        checkin: true,
                        checkout: true
                    }
                });

            if (perfilError) {
                logger.error(`Erro ao criar perfil: ${perfilError.message}`);
            }

            logger.info(`✅ Convite enviado para: ${email} (operador, evento: ${evento_id})`);

            res.status(201).json({
                success: true,
                message: 'Convite enviado com sucesso',
                user: {
                    id: data.user.id,
                    email: data.user.email,
                    nome_completo,
                    nivel_acesso: 'operador',
                    status: 'pendente'
                }
            });

        } catch (error) {
            logger.error('Erro no convite:', error);
            res.status(500).json({ error: 'Erro interno no servidor' });
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
                .select(`id, nome_completo, nivel_acesso, status, evento_id, permissions, avatar_url, created_at, updated_at, eventos(nome)`)
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
                    .select('id, nome_completo, nivel_acesso, status, evento_id, avatar_url')
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
                        foto_url: u.avatar_url,
                        email: ''
                    }))
                });
            }

            logger.info(`[listUsers] ✅ Query principal sucesso: ${data?.length || 0} usuários`);

            // Enriquecer dados e aplicar filtro de busca
            const enrichedUsers = data
                .map(user => ({
                    ...user,
                    foto_url: user.avatar_url,
                    email: '',
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
     * Atualizar usuário
     */
    async updateUser(req, res) {
        try {
            const { userId } = req.params;
            const { nome_completo, foto_url } = req.body;

            // Só admin_master pode editar outros usuários
            if (req.user?.nivel_acesso !== 'admin_master' && userId !== req.user.id) {
                return res.status(403).json({
                    error: 'Apenas admin_master pode editar outros usuários.'
                });
            }

            const updateData = { updated_at: new Date() };
            if (nome_completo) updateData.nome_completo = nome_completo;
            if (foto_url) updateData.foto_url = foto_url;

            const { data, error } = await supabase
                .from('perfis')
                .update(updateData)
                .eq('id', userId)
                .select()
                .single();

            if (error) throw error;

            logger.info(`👤 Usuário atualizado: ${userId}`);

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
}

module.exports = new AuthController();