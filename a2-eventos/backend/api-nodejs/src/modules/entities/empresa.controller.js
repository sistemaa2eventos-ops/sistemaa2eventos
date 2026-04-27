const { supabase } = require('../../config/supabase');
const logger = require('../../services/logger');
const ApiResponse = require('../../utils/apiResponse');
const empresaService = require('./empresa.service');
const emailService = require('../../services/emailService');

class EmpresaController {
    async list(req, res) {
        try {
            const { search, page = 1, limit = 10, evento_id } = req.query;
            const evId = evento_id || req.event?.id;

            // Se não houver evento_id, retorna lista vazia
            if (!evId) {
                return res.json({ success: true, data: [], total: 0 });
            }

            const supabaseClient = req.supabase || supabase;
            let query = supabaseClient.from('empresas').select('*', { count: 'exact' }).eq('evento_id', evId);

            if (search) {
                query = query.or(`nome.ilike.%${search}%,cnpj.ilike.%${search}%,servico.ilike.%${search}%`);
            }

            const from = (page - 1) * limit;
            query = query.range(from, from + parseInt(limit) - 1).order('created_at', { ascending: false });

            const { data, error, count } = await query;

            if (error) throw error;
            return res.json({ success: true, data, total: count });
        } catch (error) {
            logger.error('Erro ao listar empresas:', error);
            return ApiResponse.error(res, error.message);
        }
    }

    async search(req, res) {
        try {
            const { q } = req.query;
            const evId = req.event?.id;

            if (!evId) {
                return ApiResponse.error(res, 'Evento não identificado', 400);
            }

            const supabaseClient = req.supabase || supabase;
            const data = await empresaService.searchEmpresas(supabaseClient, evId, q);

            return ApiResponse.success(res, data);
        } catch (error) {
            logger.error('Erro na busca de empresas:', error);
            return ApiResponse.error(res, 'Erro interno ao realizar busca');
        }
    }

    async create(req, res) {
        try {
            const evento_id = req.event?.id;
            
            if (!evento_id) {
                return ApiResponse.error(res, 'Evento não identificado', 400);
            }

            const supabaseClient = req.supabase || supabase;
            const empresaData = { ...req.body, evento_id };
            
            const data = await empresaService.createEmpresa(supabaseClient, empresaData, req.user?.id);

            return ApiResponse.success(res, data, 201);
        } catch (error) {
            logger.error('Erro ao criar empresa:', error.message);
            return ApiResponse.error(res, error.message);
        }
    }

    async getById(req, res) {
        try {
            const { id } = req.params;
            const supabaseClient = req.supabase || supabase;
            const data = await empresaService.getById(supabaseClient, id, req.tenantId);

            return ApiResponse.success(res, data);
        } catch (error) {
            logger.error('Erro ao buscar empresa:', error);
            return ApiResponse.error(res, error.message, 404);
        }
    }

    async update(req, res) {
        try {
            const { id } = req.params;
            const supabaseClient = req.supabase || supabase;
            const data = await empresaService.updateEmpresa(supabaseClient, id, req.body, req.tenantId);

            return ApiResponse.success(res, data);
        } catch (error) {
            logger.error('Erro ao atualizar empresa:', error);
            return ApiResponse.error(res, error.message);
        }
    }

    async delete(req, res) {
        try {
            const { id } = req.params;
            const supabaseClient = req.supabase || supabase;
            await empresaService.deleteEmpresa(supabaseClient, id, req.tenantId);

            return ApiResponse.success(res, { message: 'Empresa removida com sucesso.' });
        } catch (error) {
            logger.error('Erro ao deletar empresa:', error);
            return ApiResponse.error(res, error.message, 400);
        }
    }

    async refreshToken(req, res) {
        try {
            const { id } = req.params;
            const supabaseClient = req.supabase || supabase;
            const result = await empresaService.refreshToken(supabaseClient, id, req.tenantId);

            return ApiResponse.success(res, result);
        } catch (error) {
            logger.error('Erro ao dar refresh no token da empresa:', error);
        }
    }

    async gerarConvite(req, res) {
        try {
            const { id } = req.params;
            const crypto = require('crypto');
            const token = crypto.randomUUID();
            const expires = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 dias

            const supabaseClient = req.supabase || supabase;
            
            // 1. Obter dados da empresa (nome e email)
            const { data: empresa, error: fetchError } = await supabaseClient
                .from('empresas')
                .select('nome, email')
                .eq('id', id)
                .single();
            
            if (fetchError || !empresa) return res.status(404).json({ error: 'Empresa não encontrada' });

            // 2. Atualizar Token no Banco
            const { error: updateError } = await supabaseClient
                .from('empresas')
                .update({
                    registration_token: token,
                    registration_token_expires_at: null // Token válido permanentemente
                })
                .eq('id', id);

            if (updateError) return res.status(500).json({ error: 'Erro ao gerar convite no banco' });

            // 3. Enviar e-mail real via EmailService (Assíncrono para performance)
            const portalUrl = process.env.PUBLIC_PORTAL_URL || 'http://localhost:3002';
            const link = `${portalUrl}/register/${token}`;
            
            if (empresa.email) {
                emailService.sendCompanyInvite(empresa.email, empresa.nome, link)
                    .catch(e => logger.error('❌ Erro silencioso ao enviar convite B2B:', e));
            } else {
                logger.warn(`⚠️ Empresa ${id} (${empresa.nome}) não possui e-mail cadastrado.`);
            }

            logger.info(`🔗 Convite de onboarding enviado para empresa ${empresa.nome} (${empresa.email})`);
            res.json({ success: true, link, token });
        } catch (error) {
            logger.error('Erro geral ao gerar convite:', error);
            res.status(500).json({ error: 'Falha interna' });
        }
    }

}

module.exports = new EmpresaController();