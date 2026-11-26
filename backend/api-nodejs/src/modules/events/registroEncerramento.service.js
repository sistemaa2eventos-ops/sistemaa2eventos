/**
 * Registro do evento antes da exclusão definitiva (Eventos > Excluir).
 *
 * O painel baixa um .zip no PC do admin e só então libera o botão de excluir. Dentro do zip:
 *   empresas.csv, pessoas.csv, veiculos.csv, documentos.csv, relatorios.csv, evento.json e LEIA-ME.txt
 * Aqui só se lê: nada é apagado. Colunas são lidas com select('*') e filtradas por padrão de nome:
 * face/encoding, token, senha, chave, QR e fotos NÃO saem no arquivo.
 */
const { buscarTodos, buscarPorIdsEmLotes, LIMITE_SEGURANCA } = require('../../utils/buscarTodos');
const { criarZip } = require('../../utils/zipSimples');

const VERSAO_REGISTRO = 2;
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

function verificarTeto(nome, linhas) {
    if (linhas.length >= LIMITE_SEGURANCA) {
        throw erro(`${nome} tem volume acima do limite de exportação (${LIMITE_SEGURANCA} linhas). Exportação bloqueada para não gerar registro incompleto.`, 413);
    }
}

/**
 * Lê uma seção do evento. Tabela opcional ausente vira "indisponivel"; qualquer outro erro, ou volume
 * no teto de leitura (dados cortados), interrompe a exportação.
 * @param buscar função (sem argumentos) que devolve { data, error }
 */
async function secao(nome, buscar, { opcional = false } = {}) {
    const { data, error } = await buscar();
    if (error) {
        if (opcional && tabelaAusente(error)) return { nome, disponivel: false, linhas: [] };
        throw erro(`Não foi possível ler ${nome}: ${error.message}`, 500);
    }
    const linhas = data || [];
    verificarTeto(nome, linhas);
    return { nome, disponivel: true, linhas: linhas.map(l => limpar(l)) };
}

/** Mesma regra da secao(), para consultas feitas em lotes por lista de ids (ex.: documentos das pessoas) */
async function secaoPorIds(nome, ids, montar, { opcional = false } = {}) {
    if (!ids.length) return { nome, disponivel: true, linhas: [] };
    const { data, error } = await buscarPorIdsEmLotes(ids, montar);
    if (error) {
        if (opcional && tabelaAusente(error)) return { nome, disponivel: false, linhas: [] };
        throw erro(`Não foi possível ler ${nome}: ${error.message}`, 500);
    }
    const linhas = data || [];
    verificarTeto(nome, linhas);
    return { nome, disponivel: true, linhas: linhas.map(l => limpar(l)) };
}

/**
 * Monta o registro do evento (só as áreas pedidas pela administração).
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

    const [empresas, pessoasDoEvento, vinculoEmpresa, relatorios] = await Promise.all([
        secao('empresas', () => supabaseClient.from('empresas').select('*').eq('evento_id', eventoId)),
        secao('pessoas', () => supabaseClient.from('pessoas').select('*').eq('evento_id', eventoId)),
        // Só para achar pessoas de outro evento que estão vinculadas a este pela tabela pivô
        secao('pessoa_evento_empresa', () => supabaseClient.from('pessoa_evento_empresa').select('pessoa_id').eq('evento_id', eventoId), { opcional: true }),
        secao('relatorios_diarios_fechados', () => supabaseClient.from('relatorios_diarios_fechados').select('*').eq('evento_id', eventoId), { opcional: true }),
    ]);

    // Pessoas vinculadas ao evento pela tabela pivô, mesmo com cadastro principal em outro evento
    const idsJaLidos = new Set(pessoasDoEvento.linhas.map(p => p.id));
    const idsPivo = [...new Set(vinculoEmpresa.linhas.map(v => v.pessoa_id).filter(Boolean))]
        .filter(id => !idsJaLidos.has(id));
    const pessoasPivo = await secaoPorIds('pessoas (vínculo de outro evento)', idsPivo,
        lote => supabaseClient.from('pessoas').select('*').in('id', lote));
    const pessoas = [...pessoasDoEvento.linhas, ...pessoasPivo.linhas];
    const idsPessoas = pessoas.map(p => p.id);

    // Veículos não têm evento_id: ficam ligados às empresas do evento
    const idsEmpresas = empresas.linhas.map(e => e.id);
    const veiculos = await secaoPorIds('veiculos', idsEmpresas,
        lote => supabaseClient.from('veiculos').select('*').in('empresa_id', lote), { opcional: true });

    // Documentos das pessoas (todas as pessoas do registro, inclusive as do vínculo de outro evento)
    const documentos = await secaoPorIds('pessoa_documentos', idsPessoas,
        lote => supabaseClient.from('pessoa_documentos').select('*').in('pessoa_id', lote), { opcional: true });

    const secoes = {
        empresas: empresas.linhas,
        pessoas,
        veiculos: veiculos.linhas,
        documentos: documentos.linhas,
        relatorios: relatorios.linhas,
    };
    const indisponiveis = [veiculos, documentos, relatorios, vinculoEmpresa]
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

/** CSV para Excel: separador ;, UTF-8 com BOM, objetos viram JSON texto */
function paraCsv(linhas) {
    const colunas = [];
    const vistos = new Set();
    for (const l of linhas) {
        for (const k of Object.keys(l)) {
            if (!vistos.has(k)) { vistos.add(k); colunas.push(k); }
        }
    }
    const celula = (v) => {
        if (v === null || v === undefined) return '""';
        const texto = typeof v === 'object' ? JSON.stringify(v) : String(v);
        return `"${texto.replace(/"/g, '""')}"`;
    };
    const corpo = linhas.map(l => colunas.map(c => celula(l[c])).join(';'));
    return '﻿' + [colunas.map(celula).join(';'), ...corpo].join('\r\n');
}

// chave da seção -> [arquivo no zip, rótulo no LEIA-ME, tabela no banco]
const ROTULOS = {
    empresas: ['empresas.csv', 'Empresas', 'empresas'],
    pessoas: ['pessoas.csv', 'Pessoas (cadastro e vínculos do evento)', 'pessoas'],
    veiculos: ['veiculos.csv', 'Veículos das empresas do evento', 'veiculos'],
    documentos: ['documentos.csv', 'Documentos das pessoas', 'pessoa_documentos'],
    relatorios: ['relatorios.csv', 'Relatórios diários fechados', 'relatorios_diarios_fechados'],
};

function leiaMe(registro, nomeEvento) {
    const linhas = [
        'REGISTRO DE ENCERRAMENTO DO EVENTO',
        `Evento: ${nomeEvento}`,
        `Gerado em: ${new Date(registro.gerado_em).toLocaleString('pt-BR')}`,
        `Gerado por: ${registro.gerado_por || '—'}`,
        '',
        'Conteúdo:',
    ];
    for (const [chave, [arquivo, rotulo, tabela]] of Object.entries(ROTULOS)) {
        const indisp = registro.secoes_indisponiveis.includes(tabela);
        linhas.push(`- ${arquivo}: ${rotulo} (${registro.contagens[chave]} registros${indisp ? ' - TABELA NÃO DISPONÍVEL NESTE BANCO' : ''})`);
    }
    linhas.push('- evento.json: dados cadastrais do evento e configurações (sem chaves nem senhas)');
    linhas.push('', 'Os CSV abrem no Excel (separador ponto e vírgula).',
        'Este registro contém dados pessoais (nome, CPF, contatos). Guarde com o cuidado da LGPD.',
        'Não contém fotos, dados biométricos, QR codes, tokens nem senhas.');
    return linhas.join('\r\n');
}

/** Nome do arquivo .zip: registro-encerramento_<evento>_<data-hora>.zip */
function nomeDoArquivo(nomeEvento, data = new Date()) {
    const base = String(nomeEvento || 'evento').normalize('NFD').replace(/[̀-ͯ]/g, '')
        .replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60) || 'evento';
    const p = (n) => String(n).padStart(2, '0');
    const stamp = `${data.getFullYear()}-${p(data.getMonth() + 1)}-${p(data.getDate())}_${p(data.getHours())}-${p(data.getMinutes())}`;
    return `registro-encerramento_${base}_${stamp}.zip`;
}

/** Monta o .zip (Buffer) com a pasta de dados do evento */
function gerarPacoteZip(registro) {
    const nomeEvento = registro.evento?.nome || 'evento';
    const arquivos = [{ nome: 'LEIA-ME.txt', conteudo: leiaMe(registro, nomeEvento) }];
    arquivos.push({ nome: 'evento.json', conteudo: JSON.stringify(registro.evento, null, 2) });
    for (const [chave, [arquivo]] of Object.entries(ROTULOS)) {
        // Sem dados (ou tabela ausente) o CSV sai só com o cabeçalho vazio; o LEIA-ME avisa
        arquivos.push({ nome: arquivo, conteudo: paraCsv(registro.secoes[chave] || []) });
    }
    return criarZip(arquivos);
}

module.exports = { montarRegistroEncerramento, gerarPacoteZip, nomeDoArquivo, limpar, paraCsv, CHAVES_SIGILOSAS };
