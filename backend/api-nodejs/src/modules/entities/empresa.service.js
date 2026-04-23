const { supabase, deleteImage } = require('../../config/supabase');
const logger = require('../../services/logger');
const crypto = require('crypto');

class EmpresaService {
    /**
     * Lista todas as empresas de um evento
     */
    async listByEvent(supabaseClient, eventoId) {
        const { data, error } = await supabaseClient
            .from('empresas')
            .select('*')
            .eq('evento_id', eventoId);

        if (error) throw error;
        return data;
    }

    /**
     * Busca empresas com filtros por nome ou CNPJ
     */
    async searchEmpresas(supabaseClient, eventoId, queryText) {
        let query = supabaseClient.from('empresas').select('*').eq('evento_id', eventoId);

        if (queryText) {
            query = query.or(`nome.ilike.%${queryText}%,cnpj.ilike.%${queryText}%`);
        }

        const { data, error } = await query.limit(50);
        if (error) throw error;
        return data;
    }

    /**
     * Cria uma nova empresa e gera o token de registro único
     */
    async createEmpresa(supabaseClient, empresaData, creatorId) {
        const { 
            nome, 
            cnpj, 
            servico, 
            tipo_operacao,
            email, 
            responsavel,
            responsavel_legal,
            evento_id,
            max_colaboradores,
            datas_presenca,
            observacao
        } = empresaData;

        if (!evento_id) {
            throw new Error('Evento ID é obrigatório para criar uma empresa.');
        }

        const { data, error } = await supabaseClient
            .from('empresas')
            .insert([{
                nome,
                cnpj,
                servico: servico || tipo_operacao,
                tipo_operacao: tipo_operacao || servico,
                email,
                responsavel: responsavel || responsavel_legal,
                responsavel_legal: responsavel_legal || responsavel,
                evento_id,
                max_colaboradores: max_colaboradores || 0,
                datas_presenca: datas_presenca || [],
                observacao: observacao || '',
                registration_token: crypto.randomUUID(),
                registration_token_expires_at: null, // Token válido permanentemente para empresas
                created_by: creatorId
            }])
            .select()
            .single();

        if (error) throw error;
        return data;
    }

    async getById(supabaseClient, id, tenantId) {
        const { data, error } = await supabaseClient
            .from('empresas')
            .select('*')
            .eq('id', id)
            .eq('evento_id', tenantId)
            .single();

        if (error) throw new Error('Empresa não encontrada ou acesso negado.');
        return data;
    }

    /**
     * Atualiza dados da empresa com proteção de mass assignment
     */
    async updateEmpresa(supabaseClient, id, updateData, tenantId) {
        const allowedFields = ['nome', 'cnpj', 'servico', 'email', 'contato', 'telefone', 'max_colaboradores', 'ativo', 'datas_presenca', 'observacao'];
        const updates = {};
        
        allowedFields.forEach(field => {
            if (updateData[field] !== undefined) updates[field] = updateData[field];
        });
        
        updates.updated_at = new Date();

        const { data, error } = await supabaseClient
            .from('empresas')
            .update(updates)
            .eq('id', id)
            .eq('evento_id', tenantId)
            .select()
            .single();

        if (error) throw new Error('Falha ao atualizar empresa: Registro não encontrado ou acesso insuficiente.');
        return data;
    }

    /**
     * Exclui empresa e realiza cascade wipe de todos os colaboradores vinculados
     * (Limpa DB, Storage de Fotos e Terminais de Acesso)
     */
    async deleteEmpresa(supabaseClient, id, tenantId) {
        logger.warn(`🛑 [CascadeDelete] Iniciando WIPE TOTAL da empresa ${id} no evento ${tenantId}`);

        // 1. Obter dados da empresa (token) antes da exclusão para limpar o cache público
        const { data: empresa } = await supabaseClient
            .from('empresas')
            .select('registration_token')
            .eq('id', id)
            .single();

        const oldToken = empresa?.registration_token;

        // 2. Limpar Documentos da Empresa no Storage e DB
        try {
            const { data: empDocs } = await supabaseClient
                .from('empresa_documentos')
                .select('url_arquivo')
                .eq('empresa_id', id);

            if (empDocs && empDocs.length > 0) {
                for (const doc of empDocs) {
                    if (doc.url_arquivo) {
                        const urlParts = doc.url_arquivo.split('/storage/v1/object/public/');
                        if (urlParts.length === 2) {
                            const fullPath = urlParts[1];
                            const bucket = fullPath.split('/')[0];
                            const path = fullPath.substring(bucket.length + 1);
                            await deleteImage(bucket, path);
                        }
                    }
                }
                // Limpar registros do DB
                await supabaseClient.from('empresa_documentos').delete().eq('empresa_id', id);
                logger.info(`🗑️ Documentos de empresa ${id} removidos do Storage e DB`);
            }
        } catch (err) {
            logger.error(`[CascadeDelete] Erro ao limpar documentos da empresa:`, err);
        }

        // 3. Limpar Perfis de Acesso (Login Portal) vinculados a esta empresa
        await supabaseClient.from('perfis').delete().eq('empresa_id', id);

        // 4. Limpar Veículos (e garantir remoção de logs se necessário, embora logs costumem ser mantidos por auditoria)
        await supabaseClient.from('veiculos').delete().eq('empresa_id', id);

        // 5. Localizar todas as pessoas que estão vinculadas a esta empresa NESTE evento
        const pessoaService = require('./pessoa.service');
        const { data: pivots } = await supabaseClient
            .from('pessoa_evento_empresa')
            .select('pessoa_id')
            .eq('empresa_id', id)
            .eq('evento_id', tenantId);

        if (pivots && pivots.length > 0) {
            const pessoaIds = pivots.map(p => p.pessoa_id);
            logger.info(`👥 [CascadeDelete] Removendo ${pessoaIds.length} colaboradores vinculados...`);

            for (const pId of pessoaIds) {
                try {
                    // O delete da pessoa já limpa: Doc Storage, Foto Bio, Hardware e DB (via PessoaService atualizado)
                    await pessoaService.delete(supabaseClient, pId, tenantId);
                } catch (e) {
                    logger.error(`❌ Falha ao remover colaborador ${pId} durante cascade:`, e);
                }
            }
        }

        // 6. Limpar Pivots remanescentes (segurança extra)
        await supabaseClient.from('pessoa_evento_empresa').delete().eq('empresa_id', id);

        // 7. Finalmente deletar a empresa (Integridade referencial OK agora)
        const { error } = await supabaseClient
            .from('empresas')
            .delete()
            .eq('id', id)
            .eq('evento_id', tenantId);

        if (error) {
            logger.error('Erro ao deletar registro da empresa:', error);
            throw new Error('Falha ao excluir registro principal da empresa.');
        }

        // 8. Invalidação de Cache (Invalida o link público)
        if (oldToken) {
            try {
                const cacheService = require('../../services/cacheService');
                cacheService.delete(`company_${oldToken}`);
                logger.info(`🧹 Cache do link público invalidado para o token: ${oldToken}`);
            } catch (cacheErr) {
                logger.warn(`⚠️ Erro ao limpar cache do token ${oldToken}:`, cacheErr.message);
            }
        }

        logger.info(`✅ [CascadeDelete] WIPE concluído com sucesso para empresa ${id}`);
        return true;
    }

    /**
     * Gera um novo registration_token para link de cadastro externo
     */
    async refreshToken(supabaseClient, id, tenantId) {
        const newToken = crypto.randomUUID();

        const { data, error } = await supabaseClient
            .from('empresas')
            .update({ 
                registration_token: newToken,
                registration_token_expires_at: null // Token válido permanentemente
            })
            .eq('id', id)
            .eq('evento_id', tenantId)
            .select()
            .single();

        if (error) throw new Error('Falha ao rotacionar token: Empresa não encontrada ou acesso negado.');
        return { token: newToken, data };
    }
}

module.exports = new EmpresaService();
