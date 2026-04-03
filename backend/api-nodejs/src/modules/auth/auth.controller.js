const { supabase, supabasePublic } = require('../../config/supabase');
const { getConnection } = require('../../config/database');
const logger = require('../../services/logger');
const cacheService = require('../../services/cacheService');
const policyService = require('../checkin/policy.service');

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

            // Buscar permissões de menu granulares
            const { data: menuPerms } = await supabase
                .from('perfil_permissoes')
                .select('web_admin, mobile_app, public_web')
                .eq('nivel_acesso', perfil?.nivel_acesso || 'operador')
                .maybeSingle();

            logger.info(`✅ Login bem-sucedido: ${email} (${perfil?.nivel_acesso || 'operador'})`);

            res.json({
                success: true,
                session: data.session,
                user: {
                    id: data.user.id,
                    email: data.user.email,
                    permissions: permissions,
                    menu_permissions: menuPerms || null,
                    ...perfil
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

    /**
     * Registro de novo usuário
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
            const { page = 1, limit = 20 } = req.query;
            const offset = (page - 1) * limit;

            const { data, error, count } = await supabase
                .from('perfis')
                .select('*, eventos(nome)', { count: 'exact' })
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
     * Alterar nível de acesso e vínculo de evento (admin apenas)
     */
    async updateUser(req, res) {
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
                    user_metadata: { nivel_acesso: nivel_acesso } // Keep sync
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
     * Define o evento ativo para o usuário (Nexus Link)
     */
    async setActiveEvent(req, res) {
        try {
            const userId = req.user.id;
            const { evento_id } = req.body;

            if (!evento_id) {
                return res.status(400).json({ error: 'evento_id é obrigatório' });
            }

            const { data, error } = await supabase
                .from('perfis')
                .update({ evento_id, updated_at: new Date() })
                .eq('id', userId)
                .select()
                .single();

            if (error) throw error;

            logger.info(`🔗 Evento vinculado ao usuário: ${userId} -> ${evento_id}`);

            res.json({
                success: true,
                message: 'Nexus vinculado com sucesso',
                user: data
            });

        } catch (error) {
            logger.error('Erro ao vincular evento:', error);
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
            const { data, error } = await supabase
                .from('perfil_permissoes')
                .select('*')
                .order('nivel_acesso');

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
    async getPermissions(req, res) {
        try {
            const { role } = req.params;
            const { data, error } = await supabase
                .from('perfil_permissoes')
                .select('*')
                .eq('nivel_acesso', role)
                .maybeSingle();

            if (error) throw error;
            res.json({ success: true, data: data || null });
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
            const { web_admin, mobile_app, public_web } = req.body;

            const validRoles = ['admin', 'supervisor', 'operador', 'op_atendimento', 'op_monitoramento', 'op_analista', 'empresa', 'cliente'];
            if (!validRoles.includes(role)) {
                return res.status(400).json({ error: `Role inválido. Válidos: ${validRoles.join(', ')}` });
            }

            const { data, error } = await supabase
                .from('perfil_permissoes')
                .upsert({
                    nivel_acesso: role,
                    web_admin: web_admin || [],
                    mobile_app: mobile_app || [],
                    public_web: public_web || [],
                    updated_at: new Date(),
                    updated_by: req.user?.id || null
                }, { onConflict: 'nivel_acesso' })
                .select()
                .single();

            if (error) throw error;

            logger.info(`✅ Permissões do role '${role}' atualizadas por ${req.user?.email}`);
            res.json({ success: true, data });
        } catch (error) {
            logger.error('Erro ao salvar permissões:', error);
            res.status(500).json({ error: 'Erro ao salvar permissões' });
        }
    }
}

module.exports = new AuthController();