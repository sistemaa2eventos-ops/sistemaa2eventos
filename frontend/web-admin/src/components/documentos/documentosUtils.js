import api from '../../services/api';

/** Status de documento (único lugar para rótulo e cor). 'rejeitado' é o nome legado de 'reprovado'. */
export const STATUS_DOCUMENTO = {
    pendente: { label: 'Pendente', color: '#FFB800' },
    em_analise: { label: 'Em análise', color: '#FFB800' },
    aprovado: { label: 'Aprovado', color: '#00FF88' },
    reprovado: { label: 'Reprovado', color: '#FF3366' },
    rejeitado: { label: 'Reprovado', color: '#FF3366' },
    reenvio_solicitado: { label: 'Reenvio solicitado', color: '#00D4FF' },
    vencido: { label: 'Vencido', color: '#FF3366' }
};

/** Situação documental da pessoa (status_documentos / avaliação) */
export const SITUACAO_DOCUMENTAL = {
    aprovado: { label: 'Documentação OK', color: '#00FF88' },
    pendente: { label: 'Pendente', color: '#FFB800' },
    em_analise: { label: 'Em análise', color: '#FFB800' },
    reenvio_solicitado: { label: 'Reenvio solicitado', color: '#00D4FF' },
    reprovado: { label: 'Reprovado', color: '#FF3366' }
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

/** URL assinada temporária (funciona com bucket público ou privado). */
export const obterUrlDocumento = async (doc) => {
    const entidade = doc.tipo_entidade || (doc.empresa_id ? 'empresa' : 'pessoa');
    try {
        const resp = await api.get(`/documentos/${entidade}/${doc.id}/url`);
        return resp.data?.data?.url || doc.url_arquivo;
    } catch {
        return doc.url_arquivo;
    }
};
