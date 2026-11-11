const { supabase } = require('../../config/supabase');
const logger = require('../../services/logger');
const { normalizarFuncao } = require('./documentoRequisitos.service');

/**
 * Regra de remuneração padrão e regras por função ({ "FUNÇÃO": regra_id }), normalizadas.
 * Só devolve o que veio no corpo (atualização parcial não apaga o que já existe).
 */
function camposRemuneracao({ regra_remuneracao_id, regras_por_funcao } = {}) {
    const out = {};
    if (regra_remuneracao_id !== undefined) out.regra_remuneracao_id = regra_remuneracao_id || null;
    if (regras_por_funcao !== undefined) {
        const limpo = {};
        Object.entries(regras_por_funcao || {}).forEach(([funcao, regraId]) => {
            const f = normalizarFuncao(funcao);
            if (f && regraId) limpo[f] = regraId;
        });
        out.regras_por_funcao = limpo;
    }
    return out;
}

class EmpresaController {
    async list(req, res) {
        try {
            const eventoId = req.event?.id;
            if (!eventoId) return res.status(400).json({ error: 'Selecione um evento para continuar.' });

            const { data, error } = await supabase
                .from('empresas')
                .select('*')
                .eq('evento_id', eventoId);

            if (error) throw error;
            res.json({ success: true, data });
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    }

    async search(req, res) {
        try {
            const { q } = req.query;
            const evId = req.event?.id;
            if (!evId) return res.status(400).json({ error: 'Selecione um evento para continuar.' });

            let query = supabase.from('empresas').select('*').eq('evento_id', evId);

            if (q) {
                query = query.or(`nome.ilike.%${q}%,cnpj.ilike.%${q}%`);
            }

            const { data, error } = await query.limit(50);
            if (error) throw error;

            res.json({ success: true, data });
        } catch (error) {
            logger.error('Erro na busca de empresas:', error);
            res.status(500).json({ error: 'Erro interno ao realizar busca' });
        }
    }

    async create(req, res) {
        try {
            const { nome, cnpj, servico, email, email_convite, responsavel, telefone } = req.body;
            
            // --- NEXUS CONTEXT FALLBACK (v24.0) ---
            const evento_id = req.event?.id || req.body.evento_id || req.user?.evento_id || req.headers['x-evento-id'];

            if (!evento_id) {
                return res.status(400).json({ error: 'Falta vincular evento ativo para criar empresa.' });
            }

            const token = require('crypto').randomUUID();
            const emailPrincipal = email || email_convite || '';

            const { data, error } = await supabase
                .from('empresas')
                .insert([{
                    nome,
                    cnpj,
                    servico,
                    email: emailPrincipal,
                    telefone: telefone || null,
                    responsavel,
                    evento_id,
                    max_colaboradores: req.body.max_colaboradores || 0,
                    datas_presenca: req.body.datas_presenca || [],
                    observacao: req.body.observacao || '',
                    ...camposRemuneracao(req.body),
                    registration_token: token,
                    created_by: req.user?.id
                }])
                .select();

            if (error) throw error;
            const novaEmpresa = data[0];

            // Se houver e-mail cadastrado para o responsável, envia automaticamente o convite com os 2 links (colaboradores + documentação da empresa)
            const emailDestino = (email_convite || email || '').trim();
            if (emailDestino && novaEmpresa?.registration_token) {
                const portalBase = (process.env.PUBLIC_PORTAL_URL || 'https://cadastro.nzt.app.br').replace(/\/+$/, '');
                const linkEquipe = `${portalBase}/register/${novaEmpresa.registration_token}`;
                const linkDocsEmpresa = `${portalBase}/empresa/${novaEmpresa.registration_token}`;
                const emailService = require('../../services/emailService');
                emailService.sendCompanyInvite(
                    emailDestino,
                    novaEmpresa.nome,
                    linkEquipe,
                    linkDocsEmpresa,
                    novaEmpresa.responsavel,
                    req.event?.nome || null
                ).catch(err => logger.warn(`⚠️ [EmpresaCreate] Falha ao enviar e-mail de convite automático: ${err.message}`));
            }

            res.status(201).json({ success: true, data: novaEmpresa });
        } catch (error) {
            logger.error('Erro ao criar empresa:', error.message);
            res.status(500).json({ error: error.message });
        }
    }

    // Buscar empresa por ID
    async getById(req, res) {
        try {
            const { id } = req.params;
            const { data, error } = await supabase
                .from('empresas')
                .select('*')
                .eq('id', id)
                .single();
            if (error) throw error;
            res.json({ success: true, data });
        } catch (error) {
            logger.error('Erro ao buscar empresa:', error);
            res.status(500).json({ error: error.message });
        }
    }

    // Atualizar empresa
    async update(req, res) {
        try {
            const { id } = req.params;
            const camposPermitidos = [
                'nome', 'cnpj', 'servico', 'tipo_operacao', 'email',
                'responsavel', 'responsavel_legal', 'telefone',
                'max_colaboradores', 'datas_presenca', 'observacao', 'ativo'
            ];
            const filtrados = {};
            camposPermitidos.forEach(campo => {
                if (req.body[campo] !== undefined) filtrados[campo] = req.body[campo];
            });
            if (!filtrados.email && req.body.email_convite) {
                filtrados.email = req.body.email_convite;
            }
            const updates = { ...filtrados, ...camposRemuneracao(req.body) };
            const { data, error } = await supabase
                .from('empresas')
                .update(updates)
                .eq('id', id)
                .select();
            if (error) throw error;
            res.json({ success: true, data: data[0] });
        } catch (error) {
            logger.error('Erro ao atualizar empresa:', error);
            res.status(500).json({ error: error.message });
        }
    }

    // Deletar empresa
    async delete(req, res) {
        try {
            const { id } = req.params;
            const { error } = await supabase
                .from('empresas')
                .delete()
                .eq('id', id);
            if (error) throw error;
            res.json({ success: true, message: 'Empresa deletada com sucesso' });
        } catch (error) {
            logger.error('Erro ao deletar empresa:', error);
            res.status(500).json({ error: error.message });
        }
    }

    /**
     * Gerar novo link de cadastro para a empresa
     */
    async refreshToken(req, res) {
        try {
            const { id } = req.params;
            const newToken = require('crypto').randomUUID();

            const { data, error } = await supabase
                .from('empresas')
                .update({ registration_token: newToken })
                .eq('id', id)
                .select()
                .single();

            if (error) throw error;
            res.json({ success: true, token: newToken, data });
        } catch (error) {
            res.status(500).json({ error: 'Erro ao gerar token' });
        }
    }

    /**
     * Enviar convite por e-mail para o responsável da empresa (com link de colaboradores + link de documentação da empresa)
     */
    async sendInviteEmail(req, res) {
        try {
            const { id } = req.params;
            const { data: empresa, error } = await supabase
                .from('empresas')
                .select('*, eventos(nome)')
                .eq('id', id)
                .single();

            if (error || !empresa) {
                return res.status(404).json({ error: 'Empresa não encontrada.' });
            }

            const emailDestino = (req.body?.email || empresa.email || '').trim();
            if (!emailDestino) {
                return res.status(400).json({ error: 'Esta empresa não possui e-mail cadastrado. Informe um e-mail no cadastro da empresa.' });
            }

            let token = empresa.registration_token;
            if (!token) {
                token = require('crypto').randomUUID();
                await supabase.from('empresas').update({ registration_token: token }).eq('id', id);
            }

            const portalBase = (process.env.PUBLIC_PORTAL_URL || 'https://cadastro.nzt.app.br').replace(/\/+$/, '');
            const linkEquipe = `${portalBase}/register/${token}`;
            const linkDocsEmpresa = `${portalBase}/empresa/${token}`;

            const emailService = require('../../services/emailService');
            const enviado = await emailService.sendCompanyInvite(
                emailDestino,
                empresa.nome,
                linkEquipe,
                linkDocsEmpresa,
                empresa.responsavel,
                empresa.eventos?.nome || req.event?.nome || null
            );

            if (!enviado) {
                return res.status(502).json({ error: 'Não foi possível enviar o e-mail pelo servidor SMTP. Verifique as configurações de e-mail.' });
            }

            res.json({
                success: true,
                message: `Convite enviado com sucesso para ${emailDestino}!`,
                link: linkEquipe,
                link_documentos: linkDocsEmpresa
            });
        } catch (error) {
            logger.error('Erro ao enviar convite por e-mail:', error);
            res.status(500).json({ error: 'Erro ao enviar convite por e-mail.' });
        }
    }
}

module.exports = new EmpresaController();
