/**
 * Registro do evento antes da exclusão definitiva (Eventos > Excluir).
 *
 * O painel baixa este JSON no PC do admin e só então libera o botão de excluir. Aqui só se lê:
 * nada é apagado. Tabelas e colunas são as reais do código (logs_acesso, pulseira_vinculos,
 * central_auditoria etc.). Colunas são lidas com select('*') e filtradas por padrão de nome:
 * face/encoding, token, senha, chave, QR e fotos NÃO saem no arquivo.
 */
const { buscarTodos, buscarPorIdsEmLotes, LIMITE_SEGURANCA } = require('../../utils/buscarTodos');

const VERSAO_REGISTRO = 1;
const PROFUNDIDADE_MAX = 8;
// Chaves que nunca vão para o arquivo (biometria, credenciais, QR de acesso, fotos)
const CHAVES_SIGILOSAS = /face|biometri|embedding|encoding|token|senha|password|secret|chave|api_?key|qr_code|foto|selfie|snapshot|imagem/i;
// Tabela que pode não existir em algum banco (migration não aplicada): a seção fica indisponível, sem derrubar o registro
const CODIGOS_TABELA_AUSENTE = new Set(['42P01', 'PGRST205']);

function erro(mensagem, status = 500) {
    const e = new Error(mensagem);
    e.status = status;
    return e;
}

/** Remove, em qualquer profundidade, as chaves sigilosas (config do evento pode ser um JSON grande) */
function limpar(valor, profundidade = 0) {
    if (Array.isArray(valor)) return valor.map(v => limpar(v, profundidade + 1));
    if (valor && typeof valor === 'object') {
        if (profundidade > PROFUNDIDADE_MAX) return null;
        const saida = {};
        for (const [chave, v] of Object.entries(valor)) {
            if (CHAVES_SIGILOSAS.test(chave)) continue;
            saida[chave] = limpar(v, profundidade + 1);
        }
        return saida;
    }
    return valor;
}

function tabelaAusente(error) {
    return CODIGOS_TABELA_AUSENTE.has(error?.code) || /could not find the table|does not exist/i.test(error?.message || '');
}

/**
 * Lê uma tabela inteira do evento. Seção opcional com a tabela ausente vira "indisponivel";
 * qualquer outro erro, ou um volume que bata no teto de leitura (dados cortados), interrompe a exportação.
 */
async function secao(nome, query, { opcional = false } = {}) {
    const { data, error } = await buscarTodos(query);
    if (error) {
        if (opcional && tabelaAusente(error)) return { nome, disponivel: false, linhas: [] };
        throw erro(`Não foi possível ler ${nome}: ${error.message}`, 500);
    }
    const linhas = data || [];
    if (linhas.length >= LIMITE_SEGURANCA) {
        throw erro(`${nome} tem volume acima do limite de exportação (${LIMITE_SEGURANCA} linhas). Exportação bloqueada para não gerar registro incompleto.`, 413);
    }
    return { nome, disponivel: true, linhas: linhas.map(l => limpar(l)) };
}

/**
 * Monta o registro completo do evento.
 * @param supabaseClient cliente da requisição (ou o de serviço)
 * @param eventoId id do evento a ser excluído
 * @param opcoes.geradoPor nome de quem gerou (sem e-mail)
 */
async function montarRegistroEncerramento(supabaseClient, eventoId, { geradoPor = null } = {}) {
    if (!eventoId) throw erro('Evento não informado.', 400);

    const { data: evento, error: errEvento } = await supabaseClient
        .from('eventos').select('*').eq('id', eventoId).maybeSingle();
    if (errEvento) throw erro(`Não foi possível ler o evento: ${errEvento.message}`, 500);
    if (!evento) throw erro('Evento não encontrado.', 404);

    const [empresas, pessoasDoEvento, vinculoEmpresa, acessos, pulseirasVinculos, pulseirasPendencia, auditoriaCentral] = await Promise.all([
        secao('empresas', supabaseClient.from('empresas').select('*').eq('evento_id', eventoId)),
        secao('pessoas', supabaseClient.from('pessoas').select('*').eq('evento_id', eventoId)),
        secao('pessoa_evento_empresa', supabaseClient.from('pessoa_evento_empresa').select('*').eq('evento_id', eventoId), { opcional: true }),
        secao('logs_acesso', supabaseClient.from('logs_acesso').select('*').eq('evento_id', eventoId)),
        secao('pulseira_vinculos', supabaseClient.from('pulseira_vinculos').select('*').eq('evento_id', eventoId), { opcional: true }),
        secao('pulseiras_pendencia', supabaseClient.from('pulseiras_pendencia').select('*').eq('evento_id', eventoId), { opcional: true }),
        secao('central_auditoria', supabaseClient.from('central_auditoria').select('*').eq('evento_id', eventoId), { opcional: true }),
    ]);

    // Pessoas vinculadas ao evento pela tabela pivô, mesmo com cadastro principal em outro evento
    const idsJaLidos = new Set(pessoasDoEvento.linhas.map(p => p.id));
    const idsPivo = [...new Set(vinculoEmpresa.linhas.map(v => v.pessoa_id).filter(Boolean))]
        .filter(id => !idsJaLidos.has(id));
    let pessoasPivo = [];
    if (idsPivo.length) {
        const { data, error } = await buscarPorIdsEmLotes(idsPivo, lote =>
            supabaseClient.from('pessoas').select('*').in('id', lote));
        if (error) throw erro(`Não foi possível ler pessoas do pivô: ${error.message}`, 500);
        pessoasPivo = (data || []).map(p => limpar(p));
    }
    const pessoas = [...pessoasDoEvento.linhas, ...pessoasPivo];

    const secoes = {
        empresas: empresas.linhas,
        pessoas,
        pessoa_evento_empresa: vinculoEmpresa.linhas,
        logs_acesso: acessos.linhas,
        pulseira_vinculos: pulseirasVinculos.linhas,
        pulseiras_pendencia: pulseirasPendencia.linhas,
        central_auditoria: auditoriaCentral.linhas,
    };
    const indisponiveis = [vinculoEmpresa, pulseirasVinculos, pulseirasPendencia, auditoriaCentral]
        .filter(s => !s.disponivel).map(s => s.nome);

    return {
        formato: 'nzt-registro-encerramento',
        versao: VERSAO_REGISTRO,
        gerado_em: new Date().toISOString(),
        gerado_por: geradoPor,
        evento: limpar(evento),
        contagens: Object.fromEntries(Object.entries(secoes).map(([k, v]) => [k, v.length])),
        secoes_indisponiveis: indisponiveis,
        secoes,
    };
}

module.exports = { montarRegistroEncerramento, limpar, CHAVES_SIGILOSAS };
