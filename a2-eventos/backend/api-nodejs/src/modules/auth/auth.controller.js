const { supabase, supabasePublic } = require('../../config/supabase');
const logger = require('../../services/logger');
const cacheService = require('../../services/cacheService');
const policyService = require('../checkin/policy.service');
const auditService = require('../../services/audit.service');

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

            const permissions = await policyService.getRolePermissions(perfil?.nivel_acesso || 'operador');

            // Buscar permissões de menu granulares da nova Matriz Unificada
            const menuPerms = await policyService.getUserMenu(perfil?.nivel_acesso || 'operador', perfil?.evento_id);

            logger.info(`✅ Login bem-sucedido: ${email} (${perfil?.nivel_acesso || 'operador'})`);

            res.json({
                success: true,
                session: data.session,
                user: {
                    id: data.user.id,
                    email: data.user.email,
                    permissions: permissions,
                    menu_permissions: menuPerms || null,
                    ...perfil,
                    nivel_acesso: perfil?.nivel_acesso || 'operador'
                }
            });

        } catch (error) {
            logger.error('Erro no login:', error);

            // Tratamento de falha de conexão / rede
            if (error.code === 'ECONNREFUSED' || error.message.includes('fetch') || error.message.includes('network')) {
                return res.status(503).json({
                    error: 'Serviço de autenticação temporariamente indisponível. Verifique sua conexão.'
                });
            }

            res.status(500).json({ error: 'Erro interno no servidor' });
        }
    }

    async invite(req, res) {
        try {
            const {
                email,
                nome_completo,
                cpf,
                data_nascimento,
                nivel_acesso = 'operador',
                evento_id,
                foto_url
            } = req.body;

            // --- 🛡️ BLINDAGEM DE HIERARQUIA (RBAC) v18.0 (Bi-Role) ---
            const roleWeights = { master: 2, operador: 1 };
            const currentUserRole = req.user?.role || 'operador';
            const requesterWeight = roleWeights[currentUserRole] ?? 0;
            const targetWeight = roleWeights[nivel_acesso] ?? 0;

            // Rejeitar role desconhecido
            if (targetWeight === 0) {
                return res.status(400).json({ error: `Nível de acesso inválido: '${nivel_acesso}'.` });
            }

            if (targetWeight > requesterWeight) {
                return res.status(403).json({ 
                    error: `Privilégio insuficiente para criar um usuário com nível '${nivel_acesso}'.` 
                });
            }

            if (nivel_acesso === 'master' && currentUserRole !== 'master') {
                return res.status(403).json({ error: 'Operação restrita à Soberania Master.' });
            }

            if (!email || !nome_completo || !cpf || !data_nascimento) {
                return res.status(400).json({
                    error: 'Email, nome completo, CPF e data de nascimento são obrigatórios'
                });
            }

            // Criar usuário via convite no Supabase Auth
            const { data, error } = await supabase.auth.admin.inviteUserByEmail(email, {
                data: {
                    nome_completo,
                    cpf,
                    data_nascimento,
                    nivel_acesso,
                    evento_id,
                    foto_url
                }
            });

            if (error) {
                logger.error(`Erro ao enviar convite: ${error.message}`);
                return res.status(400).json({
                    error: error.message
                });
            }

            // Injeta a role no app_metadata para validação segura via JWT
            await supabase.auth.admin.updateUserById(data.user.id, {
                app_metadata: { role: nivel_acesso }
            });

            logger.info(`✅ Convite enviado para: ${email} (${nivel_acesso}) e Claims injetadas no JWT.`);

            res.status(201).json({
                success: true,
                message: 'Convite enviado com sucesso',
                user: {
                    id: data.user.id,
                    email: data.user.email,
                    nome_completo,
                    cpf,
                    nivel_acesso
                }
            });

        } catch (error) {
            logger.error('Erro no convite:', error);
            res.status(500).json({ error: 'Erro interno no servidor' });
        }
    }

    /**
     * Logout
     */
    async logout(req, res) {
        try {
            // Usar admin API para invalidar a sessão do usuário no servidor Supabase
            if (req.user?.id) {
                await supabase.auth.admin.signOut(req.user.id).catch(() => {
                    // Fallback silencioso se admin signOut não estiver habilitado
                });
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

            if (error) {
                throw error;
            }

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
     * Atualizar perfil
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
     * Buscar perfil atual
     */
    async getProfile(req, res) {
        try {
            const userId = req.user.id;

            const { data, error } = await supabase
                .from('perfis')
                .select('*, eventos(*)')
                .eq('id', userId)
                .single();

            if (error) {
                throw error;
            }

            const permissions = await require('../checkin/policy.service').getRolePermissions(data.nivel_acesso || 'operador');

            res.json({
                success: true,
                profile: {
                    ...data,
                    permissions
                }
            });

        } catch (error) {
            logger.error('Erro ao buscar perfil:', error);
            res.status(500).json({ error: 'Erro interno no servidor' });
        }
    }

    /**
     * Listar usuários (admin apenas)
     */
    async listUsers(req, res) {
        try {
            const { page = 1, limit = 20, evento_id, search } = req.query;
            const offset = (page - 1) * limit;

            let query = supabase
                .from('perfis')
                .select('*, eventos(nome)', { count: 'exact' });

            if (evento_id) {
                query = query.eq('evento_id', evento_id);
            }

            if (search) {
                query = query.ilike('nome_completo', `%${search}%`);
            }

            const { data, error, count } = await query
                .range(offset, offset + limit - 1)
                .order('created_at', { ascending: false });

            if (error) {
                throw error;
            }

            res.json({
                success: true,
                data,
                pagination: {
                    page: parseInt(page),
                    limit: parseInt(limit),
                    total: count,
                    pages: Math.ceil(count / limit)
                }
            });

        } catch (error) {
            logger.error('Erro ao listar usuários:', error);
            res.status(500).json({ error: 'Erro interno no servidor' });
        }
    }

    /**
     * Lista todos os perfis (roles) do sistema
     */
    async listRoles(req, res) {
        try {
            const { data, error } = await supabase
                .from('sys_roles')
                .select('*')
                .order('nome');

            if (error) throw error;
            res.json({ success: true, data: data || [] });
        } catch (error) {
            logger.error('Erro ao listar perfis:', error);
            res.status(500).json({ error: 'Erro ao buscar perfis' });
        }
    }

    async updateUser(req, res) {
        try {
            const { userId } = req.params;
            const { nivel_acesso, evento_id, nome_completo, cpf, data_nascimento, foto_url } = req.body;

            // --- 🛡️ BLINDAGEM DE HIERARQUIA (RBAC) v18.0 (Bi-Role) ---
            const roleWeights = { master: 2, operador: 1 };
            const currentUserRole = req.user?.role || 'operador';
            const requesterWeight = roleWeights[currentUserRole] ?? 0;

            // 1. Verificar nível atual do alvo antes de permitir edição
            const { data: targetProfile } = await supabase.from('perfis').select('nivel_acesso').eq('id', userId).single();
            const targetCurrentWeight = roleWeights[targetProfile?.nivel_acesso] ?? 0;

            if (requesterWeight <= targetCurrentWeight && currentUserRole !== 'master' && userId !== req.user.id) {
                return res.status(403).json({ error: 'Privilégio insuficiente para modificar este perfil.' });
            }

            const updateData = { updated_at: new Date() };

            if (nivel_acesso) {
                const newRoleWeight = roleWeights[nivel_acesso] || 1;
                if (newRoleWeight > requesterWeight) {
                    return res.status(403).json({ error: `Você não tem permissão para elevar um usuário ao nível '${nivel_acesso}'.` });
                }

                updateData.nivel_acesso = nivel_acesso;

                await supabase.auth.admin.updateUserById(userId, {
                    app_metadata: { role: nivel_acesso },
                    user_metadata: { nivel_acesso: nivel_acesso } 
                });
            }

            // Permite desvincular enviando null
            if (evento_id !== undefined) {
                updateData.evento_id = evento_id;
            }

            // Persistir dados pessoais do perfil
            if (nome_completo !== undefined) updateData.nome_completo = nome_completo;
            if (cpf !== undefined) updateData.cpf = cpf;
            if (data_nascimento !== undefined) updateData.data_nascimento = data_nascimento;
            if (foto_url !== undefined) updateData.foto_url = foto_url;

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
     * Alternar status Ativo/Inativo de usuário
     */
    async updateUserStatus(req, res) {
        try {
            const { userId } = req.params;
            const { ativo } = req.body;

            // Impedir alteração no próprio usuário
            if (userId === req.user.id) {
                return res.status(400).json({ error: 'Você não pode alterar seu próprio status.' });
            }

            // Verificar se o usuário existe
            const { data: perfil, error: perfilErr } = await supabase
                .from('perfis')
                .select('nivel_acesso, nome_completo')
                .eq('id', userId)
                .single();

            if (perfilErr || !perfil) {
                return res.status(404).json({ error: 'Usuário não encontrado.' });
            }

            // Impedir alteração de status de masters por não masters
            if (perfil.nivel_acesso === 'master' && req.user?.role !== 'master') {
                return res.status(403).json({ error: 'Não é possível alterar o status de um usuário Master.' });
            }

            // Toggle Ativo
            const { error: updateErr } = await supabase
                .from('perfis')
                .update({ ativo: ativo, updated_at: new Date() })
                .eq('id', userId);

            if (updateErr) throw updateErr;

            // Banir/Desbanir na camada Auth
            try {
                if (!ativo) {
                    await supabase.auth.admin.updateUserById(userId, { ban_duration: '876000h' });
                } else {
                    await supabase.auth.admin.updateUserById(userId, { ban_duration: 'none' });
                }
            } catch (authErr) {
                logger.warn(`Aviso: Não foi possível atualizar o ban no auth user ${userId}:`, authErr.message);
            }

            logger.info(`🔄 Status do usuário alterado: ${perfil.nome_completo} para ${ativo ? 'Ativo' : 'Inativo'}`);

            res.json({
                success: true,
                message: `Usuário ${ativo ? 'ativado' : 'desativado'} com sucesso.`
            });

        } catch (error) {
            logger.error('Erro ao alterar status de usuário:', error);
            res.status(500).json({ error: 'Erro interno no servidor' });
        }
    }

    /**
     * Define o evento ativo para o usuário (Nexus Link)
     */
    async setActiveEvent(req, res) {
        try {
            const userId = req.user.id;
            const { evento_id } = req.body;

            const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

            if (!userId || !uuidRegex.test(userId)) {
                return res.status(400).json({ error: 'userId inválido ou indefinido.' });
            }
            if (!evento_id || !uuidRegex.test(evento_id)) {
                return res.status(400).json({ error: 'evento_id inválido ou indefinido.' });
            }

            // --- AUTO-CURA SOBERANA (v19.0) ---
            // Se o perfil não existir (ex: após Clean Ground), o UPSERT criará o registro físico.
            const { data, error } = await supabase
                .from('perfis')
                .upsert({ 
                    id: userId,
                    evento_id, 
                    nome_completo: req.user.nome_completo || req.user.email,
                    nivel_acesso: req.user.role || 'operador', // Failsafe 'master' via login middleware
                    updated_at: new Date() 
                }, { onConflict: 'id' })
                .select()
                .single();

            if (error) throw error;

            logger.info(`🔗 Evento vinculado com Auto-Cura: ${userId} -> ${evento_id}`);

            res.json({
                success: true,
                message: 'Nexus vinculado com sucesso',
                user: data
            });

        } catch (error) {
            logger.error('Erro ao vincular evento (Auto-Cura):', error);
            res.status(500).json({ error: 'Erro interno no servidor' });
        }
    }

    // ==========================================
    // PERMISSÕES DE MENU GRANULARES
    // ==========================================

    /**
     * Lista todas as permissões de menu (todos os roles)
     */
    async listPermissions(req, res) {
        try {
            // I08c: Migrado de perfil_permissoes (tabela legada) para sys_role_permissions
            const { data, error } = await supabase
                .from('sys_roles')
                .select(`
                    nome,
                    sys_role_permissions (
                        sys_permissions ( id, recurso, acao, nome_humanizado, is_menu_item, recurso_frontend )
                    )
                `)
                .order('nome');

            if (error) throw error;
            res.json({ success: true, data: data || [] });
        } catch (error) {
            logger.error('Erro ao listar permissões:', error);
            res.status(500).json({ error: 'Erro ao buscar permissões' });
        }
    }

    /**
     * Buscar permissões de um role específico
     */
    /**
     * Obtém todas as permissões disponíveis (Catalogo)
     */
    async getAvailablePermissions(req, res) {
        try {
            const { data, error } = await supabase
                .from('sys_permissions')
                .select('id, recurso, acao, descricao, is_menu_item, recurso_frontend, plataforma')
                .order('plataforma', { ascending: false })
                .order('recurso', { ascending: true })
                .order('acao', { ascending: true });

            if (error) throw error;
            res.json({ success: true, data: data || [] });
        } catch (error) {
            logger.error('Erro ao listar catálogo de permissões:', error);
            res.status(500).json({ error: 'Erro interno ao buscar permissões' });
        }
    }

    /**
     * Buscar permissões de um role específico
     */
    async getPermissions(req, res) {
        try {
            const { role } = req.params;
            
            // Faz o Join usando foreign keys configuradas na arquitetura RBAC
            const { data, error } = await supabase
                .from('sys_roles')
                .select(`
                    id, 
                    nome, 
                    sys_role_permissions (
                        sys_permissions (
                            id, recurso, acao, is_menu_item, recurso_frontend
                        )
                    )
                `)
                .eq('nome', role)
                .maybeSingle();

            if (error) throw error;

            let permissionsList = [];
            if (data && data.sys_role_permissions) {
                permissionsList = data.sys_role_permissions
                    .map(rp => rp.sys_permissions)
                    .filter(Boolean);
            }

            res.json({ success: true, data: permissionsList });
        } catch (error) {
            logger.error('Erro ao buscar permissões:', error);
            res.status(500).json({ error: 'Erro ao buscar permissões' });
        }
    }

    /**
     * Salvar/atualizar permissões de um role (upsert)
     */
    async savePermissions(req, res) {
        try {
            const { role } = req.params;
            const { permissionIds } = req.body; 

            const requesterRole = req.user?.role || 'operador';
            if (requesterRole !== 'master' && requesterRole !== 'admin') {
                 return res.status(403).json({ error: 'Apenas Master/Admin pode alterar permissões da hierarquia.'});
            }

            const { data: roleData, error: roleError } = await supabase
                .from('sys_roles')
                .select('id')
                .eq('nome', role)
                .single();
                
            if (roleError || !roleData) {
                return res.status(400).json({ error: 'Role inválido ou não encontrado no sistema.' });
            }
            const roleId = roleData.id;

            const { error: delError } = await supabase
                .from('sys_role_permissions')
                .delete()
                .eq('role_id', roleId);
            if (delError) throw delError;

            if (permissionIds && permissionIds.length > 0) {
                const inserts = permissionIds.map(pid => ({ role_id: roleId, permission_id: pid }));
                const { error: insError } = await supabase
                    .from('sys_role_permissions')
                    .insert(inserts);
                if (insError) throw insError;
            }

            /* 
            // -- LEGADO: removido em [09/04/2026]. Manter até confirmar rollback desnecessário.
            const { web_admin, mobile_app, public_web } = req.body;
            const validRoles = ['admin', 'supervisor', 'operador', 'op_atendimento', 'op_monitoramento', 'op_analista', 'empresa', 'cliente'];
            if (!validRoles.includes(role)) {
                return res.status(400).json({ error: `Role inválido. Válidos: ${validRoles.join(', ')}` });
            }
            const { data, error } = await supabase.from('perfil_permissoes').upsert({
                nivel_acesso: role, web_admin: web_admin || [], mobile_app: mobile_app || [], public_web: public_web || [], updated_at: new Date(), updated_by: req.user?.id || null
            }, { onConflict: 'nivel_acesso' });
            if (error) throw error;
            */

            logger.info(`✅ Banco de Permissões (RBAC) atualizado para o role '${role}' por ${req.user?.email}`);
            await auditService.logAuth(req, 'UPDATE_RBAC_PERMISSIONS', role, { permissionIds });

            res.json({ success: true, message: 'Permissões atualizadas com sucesso' });
        } catch (error) {
            logger.error('Erro ao salvar permissões:', error);
            res.status(500).json({ error: 'Erro ao salvar permissões' });
        }
    }
    /**
     * RESETAR SENHA DE USUÁRIO (Admin apenas)
     * Força uma nova senha para o operador via Admin API.
     */
    async adminResetPassword(req, res) {
        try {
            const { userId } = req.params;
            const { newPassword } = req.body;

            if (!newPassword || newPassword.length < 6) {
                return res.status(400).json({ error: 'Nova senha deve ter pelo menos 6 caracteres.' });
            }

            // Impedir reset de senha de master por admin comum
            const { data: targetUser } = await supabase.from('perfis').select('nivel_acesso').eq('id', userId).single();
            if (targetUser?.nivel_acesso === 'master' && req.user?.role !== 'master') {
                return res.status(403).json({ error: 'Somente um Master pode alterar a senha de outro Master.' });
            }

            // Fix: Chamar a função de atualização via Auth Admin API que havia sido cortada
            const { error } = await supabase.auth.admin.updateUserById(userId, {
                password: newPassword
            });

            if (error) throw error;

            logger.info(`🔐 Senha do usuário ${userId} resetada por ${req.user?.email}`);

            // Auditoria
            await auditService.logAuth(req, 'ADMIN_RESET_PASSWORD', userId);

            res.json({
                success: true,
                message: 'Senha alterada com sucesso pelo administrador.'
            });

        } catch (error) {
            logger.error('Erro ao resetar senha de usuário:', error);
            res.status(500).json({ error: 'Erro interno no servidor' });
        }
    }

    /**
     * TROCAR PRÓPRIA SENHA (Self-edit)
     */
    async changeOwnPassword(req, res) {
        try {
            const userId = req.user.id;
            const { newPassword } = req.body;

            if (!newPassword || newPassword.length < 6) {
                return res.status(400).json({ error: 'Nova senha deve ter pelo menos 6 caracteres.' });
            }

            const { error } = await supabase.auth.updateUser({
                password: newPassword
            });

            if (error) throw error;

            logger.info(`🔐 Senha alterada pelo próprio usuário: ${req.user?.email}`);

            // Auditoria
            await auditService.logAuth(req, 'CHANGE_OWN_PASSWORD', userId);

            res.json({
                success: true,
                message: 'Sua senha foi alterada com sucesso.'
            });

        } catch (error) {
            logger.error('Erro ao trocar a própria senha:', error);
            res.status(500).json({ error: 'Erro interno no servidor' });
        }
    }
    /**
     * Obter dados da empresa para Onboarding (Público via Token)
     */
    async getOnboardingData(req, res) {
        try {
            const { token } = req.params;

            const { data: empresa, error } = await supabase
                .from('empresas')
                .select('id, nome, email, registration_token_expires_at, evento_id, eventos(nome)')
                .eq('registration_token', token)
                .single();

            if (error || !empresa) {
                return res.status(404).json({ error: 'Token de onboarding inválido ou expirado.' });
            }

            // Validar expiração
            if (empresa.registration_token_expires_at && new Date(empresa.registration_token_expires_at) < new Date()) {
                return res.status(403).json({ error: 'Este link de onboarding expirou.' });
            }

            res.json({
                success: true,
                data: {
                    empresa_id: empresa.id,
                    nome_empresa: empresa.nome,
                    email: empresa.email,
                    evento_nome: empresa.eventos?.nome,
                    evento_id: empresa.evento_id
                }
            });
        } catch (error) {
            logger.error('Erro em getOnboardingData:', error);
            res.status(500).json({ error: 'Erro interno ao validar token.' });
        }
    }

    /**
     * Finalizar Onboarding da Empresa (Definir Senha e Perfil)
     */
    async completeOnboarding(req, res) {
        try {
            const { token } = req.params;
            const { password, nome_completo } = req.body;

            if (!password || password.length < 6) {
                return res.status(400).json({ error: 'A senha deve ter pelo menos 6 caracteres.' });
            }

            // 1. Validar Token e Empresa
            const { data: empresa, error: fetchError } = await supabase
                .from('empresas')
                .select('*')
                .eq('registration_token', token)
                .single();

            if (fetchError || !empresa) {
                return res.status(404).json({ error: 'Token inválido.' });
            }

            // 2. Criar Usuário no Auth do Supabase
            const { data: authUser, error: authError } = await supabase.auth.admin.createUser({
                email: empresa.email,
                password: password,
                email_confirm: true,
                user_metadata: { nome_completo: nome_completo || empresa.nome }
            });

            if (authError) {
                logger.error('Erro ao criar usuário auth no onboarding:', authError);
                return res.status(400).json({ error: authError.message });
            }

            // 3. Criar Perfil (perfis)
            const { error: perfilError } = await supabase
                .from('perfis')
                .insert({
                    id: authUser.user.id,
                    evento_id: empresa.evento_id,
                    empresa_id: empresa.id,
                    nome_completo: nome_completo || empresa.nome,
                    nivel_acesso: 'empresa',
                    ativo: true
                });

            if (perfilError) {
                await supabase.auth.admin.deleteUser(authUser.user.id);
                throw perfilError;
            }

            // 4. Injetar Role no Claim JWT
            await supabase.auth.admin.updateUserById(authUser.user.id, {
                app_metadata: { role: 'empresa' }
            });

            // 5. Consumir Token
            await supabase.from('empresas')
                .update({ registration_token: null, registration_token_expires_at: null })
                .eq('id', empresa.id);

            logger.info(`🏢 Onboarding concluído para empresa: ${empresa.nome} (${empresa.email})`);

            res.json({
                success: true,
                message: 'Acesso configurado com sucesso! Você já pode fazer login.'
            });

        } catch (error) {
            logger.error('Erro em completeOnboarding:', error);
            res.status(500).json({ error: 'Erro interno ao finalizar onboarding.' });
        }
    }
}

module.exports = new AuthController();