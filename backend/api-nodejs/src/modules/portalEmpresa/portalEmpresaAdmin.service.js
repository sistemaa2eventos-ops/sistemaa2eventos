'use strict';

const { supabase, deleteImage } = require('../../config/supabase');
const logger = require('../../services/logger');
const { caminhoDeStorage, BUCKETS_DOCUMENTO } = require('../../services/storageSeguro');
const pessoaService = require('../entities/pessoa.service');
const documentoService = require('../entities/documento.service');
const auth = require('./portalEmpresaAuth');
const {
    CAMPOS_EMPRESA_SOLICITACAO, CAMPOS_PESSOA_SOLICITACAO, filtrarCampos, validarCamposPessoa
} = require('./portalEmpresa.service');

const erroHttp = (mensagem, status) => Object.assign(new Error(mensagem), { status });
const URL_PORTAL = () => process.env.PORTAL_EMPRESA_URL || 'https://empresa.nzt.app.br';

/**
 * Lado do painel do portal da empresa: chave de acesso do responsável e decisão das solicitações.
 */
class PortalEmpresaAdminService {
    async _empresa(eventoId, empresaId, colunas = 'id, nome, email, portal_chave_cifrada, portal_chave_gerada_em, portal_ultimo_acesso') {
        const { data, error } = await supabase.from('empresas').select(colunas).eq('id', empresaId).eq('evento_id', eventoId).maybeSingle();
        if (error) throw error;
        if (!data) throw erroHttp('Empresa não encontrada neste evento.', 404);
        return data;
    }

    /** Acesso ao portal: login (e-mail do responsável), chave atual e endereço. */
    async obterAcesso(eventoId, empresaId) {
        const e = await this._empresa(eventoId, empresaId);
        return {
            url: URL_PORTAL(),
            login: e.email || null,
            chave: e.portal_chave_cifrada ? auth.decifrarChave(e.portal_chave_cifrada) : null,
            gerada_em: e.portal_chave_gerada_em || null,
            ultimo_acesso: e.portal_ultimo_acesso || null
        };
    }

    /** Gera (ou troca) a chave. Trocar encerra as sessões abertas no portal. */
    async gerarChave(eventoId, empresaId) {
        const e = await this._empresa(eventoId, empresaId);
        if (!e.email) throw erroHttp('Cadastre o e-mail do responsável da empresa: ele é o login do portal.', 400);
        const { chave, colunas } = auth.novaChave();
        const { error } = await supabase.from('empresas').update(colunas).eq('id', empresaId).eq('evento_id', eventoId);
        if (error) throw error;
        logger.info(`[PortalEmpresa] Chave de acesso gerada para ${e.nome}`);
        return { url: URL_PORTAL(), login: e.email, chave, gerada_em: colunas.portal_chave_gerada_em, ultimo_acesso: e.portal_ultimo_acesso || null };
    }

    async listarSolicitacoes(eventoId, { status = 'pendente', empresaId = null } = {}) {
        let q = supabase.from('empresa_solicitacoes')
            .select('id, empresa_id, tipo, alvo_tipo, alvo_id, alvo_resumo, dados, motivo, status, resposta, decidida_por, decidida_em, created_at, empresas(nome)')
            .eq('evento_id', eventoId).order('created_at', { ascending: status === 'pendente' }).limit(300);
        if (status && status !== 'todas') q = q.eq('status', status);
        if (empresaId) q = q.eq('empresa_id', empresaId);
        const { data, error } = await q;
        if (error) throw error;
        return (data || []).map(({ empresas, ...s }) => ({ ...s, empresa_nome: empresas?.nome || null }));
    }

    async contarPendentes(eventoId) {
        const { count, error } = await supabase.from('empresa_solicitacoes').select('id', { count: 'exact', head: true })
            .eq('evento_id', eventoId).eq('status', 'pendente');
        if (error) throw error;
        return count || 0;
    }

    async _solicitacaoPendente(eventoId, id) {
        const { data, error } = await supabase.from('empresa_solicitacoes').select('*')
            .eq('id', id).eq('evento_id', eventoId).maybeSingle();
        if (error) throw error;
        if (!data) throw erroHttp('Solicitação não encontrada.', 404);
        if (data.status !== 'pendente') throw erroHttp(`Esta solicitação já foi ${data.status}.`, 409);
        return data;
    }

    async _pessoaDaEmpresa(s) {
        const { data } = await supabase.from('pessoas').select('id').eq('id', s.alvo_id)
            .eq('empresa_id', s.empresa_id).eq('evento_id', s.evento_id).maybeSingle();
        if (!data) throw erroHttp('O participante não existe mais nesta empresa.', 409);
    }

    /** Executa o que a solicitação pede. Só roda depois da aprovação de um operador com permissão. */
    async _aplicar(s) {
        switch (s.tipo) {
        case 'excluir_participante':
            await this._pessoaDaEmpresa(s);
            // Mesma exclusão do painel: apaga fotos e documentos do storage (LGPD)
            await pessoaService.delete(supabase, s.alvo_id, s.evento_id);
            return;
        case 'editar_participante': {
            await this._pessoaDaEmpresa(s);
            const dados = filtrarCampos(s.dados, CAMPOS_PESSOA_SOLICITACAO);
            const erro = validarCamposPessoa(dados);
            if (erro) throw erroHttp(erro, 400);
            const { error } = await supabase.from('pessoas').update({ ...dados, updated_at: new Date().toISOString() })
                .eq('id', s.alvo_id).eq('empresa_id', s.empresa_id);
            if (error) throw error.code === '23505' ? erroHttp('Já existe outro participante com esse CPF neste evento.', 409) : error;
            return;
        }
        case 'excluir_documento': {
            const ehEmpresa = s.alvo_tipo === 'documento_empresa';
            const tabela = ehEmpresa ? 'empresa_documentos' : 'pessoa_documentos';
            const { data: doc } = await supabase.from(tabela).select('*').eq('id', s.alvo_id).maybeSingle();
            if (!doc) return; // já não existe: nada a fazer
            if (ehEmpresa ? doc.empresa_id !== s.empresa_id : false) throw erroHttp('Documento de outra empresa.', 409);
            if (!ehEmpresa) await this._pessoaDaEmpresa({ ...s, alvo_id: doc.pessoa_id });
            const ref = caminhoDeStorage(doc.url_arquivo, { buckets: BUCKETS_DOCUMENTO });
            if (ref) await deleteImage(ref.bucket, ref.path);
            const { error } = await supabase.from(tabela).delete().eq('id', doc.id);
            if (error) throw error;
            if (!ehEmpresa) await documentoService.sincronizarStatusPessoa(null, doc.pessoa_id);
            return;
        }
        case 'editar_empresa': {
            const dados = filtrarCampos(s.dados, CAMPOS_EMPRESA_SOLICITACAO);
            if ('nome' in dados && !dados.nome) throw erroHttp('O nome da empresa não pode ficar vazio.', 400);
            const { error } = await supabase.from('empresas').update({ ...dados, updated_at: new Date().toISOString() })
                .eq('id', s.empresa_id).eq('evento_id', s.evento_id);
            if (error) throw error;
            return;
        }
        default:
            // "outro": a organização faz o que for preciso e só registra a decisão
        }
    }

    async aprovar(eventoId, id, { usuarioId, resposta = null }) {
        const s = await this._solicitacaoPendente(eventoId, id);
        await this._aplicar(s);
        const { data, error } = await supabase.from('empresa_solicitacoes').update({
            status: 'aprovada', resposta: resposta ? String(resposta).slice(0, 1000) : null,
            decidida_por: usuarioId || null, decidida_em: new Date().toISOString()
        }).eq('id', id).eq('status', 'pendente').select('id, tipo, status, alvo_resumo, empresa_id').single();
        if (error) throw error;
        logger.info(`[PortalEmpresa] Solicitação ${s.tipo} (${s.alvo_resumo || s.id}) aprovada por ${usuarioId}`);
        return data;
    }

    async recusar(eventoId, id, { usuarioId, resposta }) {
        const texto = String(resposta || '').trim();
        if (texto.length < 3) throw erroHttp('Explique para a empresa por que a solicitação foi recusada.', 400);
        await this._solicitacaoPendente(eventoId, id);
        const { data, error } = await supabase.from('empresa_solicitacoes').update({
            status: 'recusada', resposta: texto.slice(0, 1000), decidida_por: usuarioId || null, decidida_em: new Date().toISOString()
        }).eq('id', id).eq('status', 'pendente').select('id, tipo, status, alvo_resumo, empresa_id').single();
        if (error) throw error;
        return data;
    }
}

module.exports = new PortalEmpresaAdminService();
