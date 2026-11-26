import api from '../../services/api';

/** Salva no computador a planilha que a API devolveu (nome vem do Content-Disposition). */
const salvarArquivo = (resp, nomePadrao) => {
    const cabecalho = resp.headers?.['content-disposition'] || '';
    const nome = /filename="?([^";]+)"?/i.exec(cabecalho)?.[1] || nomePadrao;
    const url = window.URL.createObjectURL(new Blob([resp.data]));
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', nome);
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.URL.revokeObjectURL(url);
};

/** Erro de download em blob: a mensagem da API vem dentro do Blob. */
const mensagemDeErro = async (err, padrao) => {
    try {
        const texto = await err.response?.data?.text?.();
        return JSON.parse(texto || '{}').error || padrao;
    } catch {
        return padrao;
    }
};

/** Modelo em branco do evento; com empresa, o nome dela vai no cabeçalho. */
export const baixarModeloPlanilha = async (empresaId = null) => {
    try {
        const resp = await api.get('/planilha/modelo/arquivo', {
            params: empresaId ? { empresa_id: empresaId } : {},
            responseType: 'blob'
        });
        salvarArquivo(resp, 'Modelo_participantes.xlsx');
    } catch (err) {
        throw new Error(await mensagemDeErro(err, 'Erro ao baixar o modelo da planilha.'));
    }
};

/** Participantes da empresa só com as colunas do modelo do evento. */
export const exportarPlanilhaEmpresa = async (empresa) => {
    try {
        const resp = await api.get(`/planilha/empresas/${empresa.id}/exportar`, { responseType: 'blob' });
        salvarArquivo(resp, `Participantes_${empresa.nome || 'empresa'}.xlsx`);
    } catch (err) {
        throw new Error(await mensagemDeErro(err, 'Erro ao exportar a planilha da empresa.'));
    }
};
