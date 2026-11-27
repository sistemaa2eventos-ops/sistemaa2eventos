import api from '../../services/api';
import { cores } from '../../styles/tokens';

/** Status de documento (único lugar para rótulo e cor). 'rejeitado' é o nome legado de 'reprovado'. */
export const STATUS_DOCUMENTO = {
    pendente: { label: 'Pendente', color: cores.alerta },
    em_analise: { label: 'Em análise', color: cores.alerta },
    aprovado: { label: 'Aprovado', color: cores.sucesso },
    reprovado: { label: 'Reprovado', color: cores.erro },
    rejeitado: { label: 'Reprovado', color: cores.erro },
    reenvio_solicitado: { label: 'Reenvio solicitado', color: cores.primaria },
    vencido: { label: 'Vencido', color: cores.erro }
};

/** Situação documental da pessoa (status_documentos / avaliação) */
export const SITUACAO_DOCUMENTAL = {
    aprovado: { label: 'Documentação OK', color: cores.sucesso },
    pendente: { label: 'Pendente', color: cores.alerta },
    em_analise: { label: 'Em análise', color: cores.alerta },
    reenvio_solicitado: { label: 'Reenvio solicitado', color: cores.primaria },
    reprovado: { label: 'Reprovado', color: cores.erro }
};

/** Motivo de cada pendência (documento exigido sem versão válida) */
export const MOTIVO_PENDENCIA = {
    nao_enviado: 'não enviado',
    em_analise: 'em análise',
    reenvio_solicitado: 'reenvio solicitado',
    vencido: 'vencido',
    reprovado: 'reprovado'
};

export const chipSx = (color) => ({
    bgcolor: `${color}26`,
    color,
    fontWeight: 700,
    border: `1px solid ${color}55`
});

export const formatarData = (iso) => (iso ? String(iso).slice(0, 10).split('-').reverse().join('/') : '—');

/** Dias até a data (negativo = já passou) */
export const diasAte = (iso) => {
    if (!iso) return null;
    const hoje = new Date(new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' }));
    return Math.round((new Date(String(iso).slice(0, 10)) - hoje) / 86400000);
};

export const ehPdf = (url) => !!url && /\.pdf($|\?)|application\/pdf/i.test(url);

/**
 * URL assinada temporária (600 s) de um documento. Nunca usa url_arquivo direto:
 * o bucket é privado. Rejeita se o servidor não devolver a URL.
 * @param {'pessoa'|'empresa'} origem
 */
export const obterUrlDocumentoAssinada = async (origem, id) => {
    const resp = await api.get(`/documentos/${origem}/${id}/url`, { hideDefaultError: true });
    // Resposta: { success, data: { url, assinada, expira_em_segundos } }
    const url = resp.data?.data?.url;
    if (!url) throw new Error('URL do documento indisponível');
    return url;
};

/** Origem do documento para a rota de URL assinada ('pessoa' ou 'empresa'). */
export const origemDocumento = (doc) => doc.tipo_entidade || (doc.empresa_id ? 'empresa' : 'pessoa');

/** Versão para o visualizador: devolve null em erro (a tela mostra "Arquivo indisponível"). */
export const obterUrlDocumento = async (doc) => {
    try {
        return await obterUrlDocumentoAssinada(origemDocumento(doc), doc.id);
    } catch {
        return null;
    }
};
