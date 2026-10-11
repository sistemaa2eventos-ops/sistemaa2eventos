const { supabase } = require('../../config/supabase');
const logger = require('../../services/logger');
const cacheService = require('../../services/cacheService');
const { getHojeLocal } = require('../../utils/dateUtils');

const FUNCAO_PADRAO = '*';
const AVISO_VENCIMENTO_PADRAO = 15;

/** Função normalizada: maiúsculas e espaços simples ("  produtor " → "PRODUTOR"). */
const normalizarFuncao = (funcao) => String(funcao || '').trim().replace(/\s+/g, ' ').toUpperCase();

/**
 * Documentos obrigatórios por função e avaliação da situação documental de cada pessoa.
 *
 * Sem regras cadastradas no evento vale a lógica anterior (todos os documentos
 * enviados aprovados e ao menos um), para nada mudar até a configuração existir.
 */
class DocumentoRequisitosService {
    /**
     * Catálogo de tipos, regras por função e antecedência do aviso de vencimento do evento.
     * Cache de 30 s (invalidado ao salvar a configuração).
     */
    async getConfig(eventoId) {
        const cacheKey = `doc_config_${eventoId}`;
        const cached = cacheService.get(cacheKey);
        if (cached) return cached;

        const [tiposRes, regrasRes, eventoRes] = await Promise.all([
            supabase.from('evento_tipos_documento').select('*').eq('evento_id', eventoId).order('ordem'),
            supabase.from('evento_documentos_funcao').select('funcao, tipo_documento_id').eq('evento_id', eventoId),
            supabase.from('eventos').select('config, horario_reset').eq('id', eventoId).maybeSingle()
        ]);

        if (tiposRes.error) logger.warn(`[DocRequisitos] Catálogo indisponível (${tiposRes.error.message}). Migração aplicada?`);

        const regras = {};
        for (const r of regrasRes.data || []) {
            (regras[r.funcao] = regras[r.funcao] || []).push(r.tipo_documento_id);
        }

        const config = {
            tipos: tiposRes.data || [],
            regras,
            aviso_vencimento_dias: Number(eventoRes.data?.config?.aviso_vencimento_dias) || AVISO_VENCIMENTO_PADRAO,
            horario_reset: eventoRes.data?.horario_reset || '00:00:00'
        };
        cacheService.set(cacheKey, config, 30000);
        return config;
    }

    invalidarConfig(eventoId) {
        cacheService.delete(`doc_config_${eventoId}`);
    }

    /** Tipos exigidos de uma pessoa: regra da função + regra padrão. */
    exigidosPara(config, funcao) {
        const ids = new Set([
            ...(config.regras[FUNCAO_PADRAO] || []),
            ...(config.regras[normalizarFuncao(funcao)] || [])
        ]);
        return config.tipos.filter(t => t.ativo !== false && ids.has(t.id));
    }

    temRegras(config) {
        return Object.values(config.regras).some(lista => lista.length > 0);
    }

    /** Documento aprovado e dentro da validade (ou sem validade). */
    documentoValido(doc, hoje = getHojeLocal()) {
        return doc.status === 'aprovado' && (!doc.data_validade || doc.data_validade >= hoje);
    }

    /**
     * Avalia a situação documental.
     * @returns {{ status_documentos: string, pendencias: Array, vencendo: Array, exigidos: Array }}
     */
    avaliar(config, pessoa, docs) {
        const hoje = getHojeLocal();
        const limiteAviso = new Date(Date.now() + config.aviso_vencimento_dias * 86400000).toISOString().slice(0, 10);
        const vencendo = docs.filter(d => d.status === 'aprovado' && d.data_validade && d.data_validade >= hoje && d.data_validade <= limiteAviso);

        // Sem regras: comportamento anterior
        if (!this.temRegras(config)) {
            let status = 'pendente';
            if (docs.some(d => d.status === 'rejeitado' || d.status === 'reprovado')) status = 'reprovado';
            else if (docs.some(d => d.status === 'reenvio_solicitado')) status = 'reenvio_solicitado';
            else if (docs.length > 0 && docs.every(d => this.documentoValido(d, hoje))) status = 'aprovado';
            else if (docs.some(d => d.status === 'pendente' || d.status === 'em_analise')) status = 'em_analise';
            return { status_documentos: status, pendencias: [], vencendo, exigidos: [], regras_ativas: false };
        }

        const exigidos = this.exigidosPara(config, pessoa.funcao);
        const pendencias = [];

        for (const tipo of exigidos) {
            const doTipo = docs.filter(d => d.tipo_documento_id === tipo.id);
            if (doTipo.some(d => this.documentoValido(d, hoje))) continue;

            let motivo = 'nao_enviado';
            if (doTipo.some(d => d.status === 'pendente' || d.status === 'em_analise')) motivo = 'em_analise';
            else if (doTipo.some(d => d.status === 'reenvio_solicitado')) motivo = 'reenvio_solicitado';
            else if (doTipo.some(d => d.status === 'aprovado' || d.status === 'vencido')) motivo = 'vencido';
            else if (doTipo.some(d => d.status === 'reprovado' || d.status === 'rejeitado')) motivo = 'reprovado';

            pendencias.push({ tipo_documento_id: tipo.id, nome: tipo.nome, motivo });
        }

        let status = 'aprovado';
        if (pendencias.length > 0) {
            const motivos = new Set(pendencias.map(p => p.motivo));
            if (motivos.has('reprovado')) status = 'reprovado';
            else if (motivos.has('reenvio_solicitado')) status = 'reenvio_solicitado';
            else if (motivos.has('em_analise')) status = 'em_analise';
            else status = 'pendente';
        }

        return { status_documentos: status, pendencias, vencendo, exigidos, regras_ativas: true };
    }

    /** Busca config + documentos e avalia uma pessoa. */
    async avaliarPessoa(pessoa) {
        const [config, docsRes] = await Promise.all([
            this.getConfig(pessoa.evento_id),
            supabase.from('pessoa_documentos').select('*').eq('pessoa_id', pessoa.id)
        ]);
        return this.avaliar(config, pessoa, docsRes.data || []);
    }
}

module.exports = new DocumentoRequisitosService();
module.exports.normalizarFuncao = normalizarFuncao;
module.exports.FUNCAO_PADRAO = FUNCAO_PADRAO;
