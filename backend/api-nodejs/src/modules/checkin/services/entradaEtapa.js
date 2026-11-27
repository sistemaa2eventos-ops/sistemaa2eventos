'use strict';

/**
 * Entrada única por etapa: não entrar de novo enquanto estiver DENTRO.
 *
 * Regra de portão (migrations 20261119_controle_entrada_portao e 20261119f_area_geral_livre): só em área que
 * CONTROLA entrada (evento_areas.controla_entrada = true). A área geral (area_id nulo) é LIVRE: não controla
 * entrada, então a pessoa pode sair e voltar nela quantas vezes quiser. Em área que controla, uma pessoa não entra de novo na mesma
 * etapa (fase do lote), no mesmo dia civil (America/Sao_Paulo) e na mesma área:
 *   - se está DENTRO (último registro de passagem é entrada): 409, liberavel=false;
 *   - se SAIU (último é saída): 409, liberavel=true, até o controlador liberar (liberacoes_reentrada,
 *     com criado_em posterior à saída);
 *   - sem registro anterior na etapa/dia/área: entrada livre.
 * Área que não controla e área geral (sem área): nada é bloqueado. Vale para todos os caminhos (leitor rápido, pulseira,
 * facial, câmera, manual). Credenciamento NÃO tem regra própria: é entrada/saída comum (conta como
 * passagem, entra na regra de entrada única, na reentrada com liberação, nas contagens e no anti-passback).
 *
 * Etapa = fase do lote que vale agora (montagem, evento, desmontagem). "showday" é a fase "evento"
 * (mesma normalização do loteSelecao.js). Lote sem fase = 'todas'.
 *
 * Banco: a gravação de passagem com etapa passa pela função registrar_acesso_etapa (migration
 * 20261118b_entrada_aberta.sql), que faz a checagem com bloqueio consultivo (corrida entre duas leituras).
 * A função cobre toda entrada com etapa, inclusive credenciamento (migration 20261119).
 */
const { supabase } = require('../../../config/supabase');
const { formatarDataLocal, getHojeLocal, parseUtcSemFuso } = require('../../../utils/dateUtils');
const logger = require('../../../services/logger');
const { emLotes } = require('../../../utils/lotes');

const INDICE_ENTRADA = 'uq_logs_entrada_etapa_dia';          // removido pela 20261118b (índice antigo)
const SAIDA_FORCADA_CRON = 'CHECKOUT_FORCADO_CRON';          // saída do fechamento de turno (cron.controller)
const AREA_GERAL = '00000000-0000-0000-0000-000000000000';
const CODIGO_ENTRADA_ABERTA = 'P0409';                         // RAISE EXCEPTION ... ERRCODE 'P0409' da função
/** codigo do 409 de bloqueio de entrada (o painel usa com o campo liberavel para mostrar o botão de liberação) */
const CODIGO_ENTRADA_BLOQUEADA = 'ENTRADA_BLOQUEADA';
/** codigo do 409 de passagem recusada pelo banco por registro duplicado de outro índice (não liberável) */
const CODIGO_ENTRADA_DUPLICADA = 'ENTRADA_DUPLICADA';
const TABELA_LIBERACOES = 'liberacoes_reentrada';             // criada pela 20261119_controle_entrada_portao

/** Coluna que o banco não tem (migration ainda não aplicada). Mesma regra de loteSelecao.colunaInexistente */
const colunaInexistente = (error) => !!error && (error.code === '42703' || error.code === 'PGRST204' || /column|coluna/i.test(error.message || ''));

/**
 * Função registrar_acesso_etapa ainda não existe no banco (migration 20261118b não aplicada).
 * PGRST202 = PostgREST não encontra a função no cache de esquema; 42883 = undefined_function do Postgres.
 */
const ehFuncaoAusente = (error) => !!error && (
    error.code === '42883' || error.code === 'PGRST202'
    || /could not find the function|function .* does not exist/i.test(error.message || '')
);

/** Passagem recusada pela função porque a pessoa já está dentro (P0409) */
const ehEntradaAberta = (error) => !!error && error.code === CODIGO_ENTRADA_ABERTA;

/** Fase do lote → etapa (showday = evento). Sem fase vira 'todas'. */
function normalizarEtapa(fase) {
    if (!fase || fase === 'todas') return 'todas';
    return fase === 'showday' ? 'evento' : fase;
}

/** Etapa de um lote de pulseira (objeto com fase opcional) */
const etapaDoLote = (lote) => (lote ? normalizarEtapa(lote.fase) : null);

/** Dia civil local (YYYY-MM-DD) do instante do acesso */
const diaDoAcesso = (instante) => getHojeLocal(instante);

/** Instante vindo do banco (UTC sem fuso) ou do JS (Date). Hora sempre em America/Sao_Paulo na mensagem. */
const instanteUtc = (valor) => (valor instanceof Date ? valor : parseUtcSemFuso(valor));
const horaLocal = (valor) => formatarDataLocal(instanteUtc(valor), { hour: '2-digit', minute: '2-digit' });

/** Mensagem da entrada recusada porque a pessoa ainda está dentro (exibida ao operador) */
const mensagemEntradaAberta = (instante) => `Pessoa já está dentro desde ${horaLocal(instante)} (America/Sao_Paulo)`;

/** Mensagem do credenciamento repetido na mesma etapa/dia/área (e de índice antigo sem última passagem) */
const mensagemEntradaDuplicada = (createdAt) =>
    `Entrada já registrada nesta etapa hoje às ${horaLocal(createdAt)}`;

/** Mensagem da entrada recusada porque a pessoa saiu e não tem liberação do controlador (área de portão) */
const mensagemSaidaSemLiberacao = (instante) =>
    `Saída registrada às ${horaLocal(instante)}. Reentrada precisa de liberação do controlador.`;

/** Erro 409 para a resposta da API (pessoa ainda dentro). liberavel = false: a liberação não resolve. */
function erroEntradaAberta(instante) {
    const erro = new Error(mensagemEntradaAberta(instante));
    erro.status = 409;
    erro.is_entrada_duplicada = true;
    erro.codigo = CODIGO_ENTRADA_BLOQUEADA;
    erro.liberavel = false;
    return erro;
}

/** Erro 409: saiu e não há liberação posterior à saída (área de portão). liberavel = true: o controlador pode liberar. */
function erroSaidaSemLiberacao(instante) {
    const erro = new Error(mensagemSaidaSemLiberacao(instante));
    erro.status = 409;
    erro.is_entrada_duplicada = true;
    erro.codigo = CODIGO_ENTRADA_BLOQUEADA;
    erro.liberavel = true;
    return erro;
}

/** Erro 409 de entrada repetida sem última passagem conhecida (fallback de corrida no índice antigo) */
function erroEntradaDuplicada(createdAt) {
    const erro = new Error(mensagemEntradaDuplicada(createdAt));
    erro.status = 409;
    erro.is_entrada_duplicada = true;
    erro.codigo = CODIGO_ENTRADA_BLOQUEADA;
    erro.liberavel = false;
    return erro;
}

/**
 * Erro 409 de passagem que o banco recusou por um 23505 de OUTRO índice (não o de entrada) e cujo id não
 * está gravado. Nada foi registrado: o operador não pode ver "ok". Não é liberável: a liberação do
 * controlador não resolve um registro duplicado desconhecido.
 */
function erroRegistroDuplicado() {
    const erro = new Error('Passagem não gravada: o banco recusou um registro duplicado. Nada foi registrado; tente de novo ou avise a coordenação.');
    erro.status = 409;
    erro.is_entrada_duplicada = true;
    erro.codigo = CODIGO_ENTRADA_DUPLICADA;
    erro.liberavel = false;
    return erro;
}

/**
 * Erro do P0409 da função registrar_acesso_etapa. HINT no formato 'liberavel|instante' (migration 20261119):
 * 'true|...' = saiu sem liberação; 'false|...' = dentro. HINT sem prefixo (função da 20261118b) = dentro.
 */
function erroDoBloqueioDoBanco(hint, fallback) {
    const m = /^(true|false)\|(.+)$/.exec(hint || '');
    if (m) return m[1] === 'true' ? erroSaidaSemLiberacao(m[2]) : erroEntradaAberta(m[2]);
    return erroEntradaAberta(hint || fallback);
}

/** A violação de unicidade veio do índice antigo de entrada (uq_logs_entrada_etapa_dia, antes da 20261118b)? */
function ehViolacaoEntrada(erro) {
    if (!erro || erro.code !== '23505') return false;
    const texto = `${erro.message || ''} ${erro.details || ''}`;
    return texto.includes(INDICE_ENTRADA);
}

/**
 * Último registro de passagem (checkin ou checkout) da pessoa na etapa/dia/área. Credenciamento é
 * passagem comum: é ele que diz se a pessoa está dentro.
 * @returns {Promise<{ id: string, tipo: string, created_at: string } | null>} null também se a migration
 *          ainda não foi aplicada (colunas ausentes): a checagem fica desligada e registra aviso.
 */
async function buscarUltimoRegistroNaEtapa(client, { evento_id, pessoa_id, etapa, dia, area_id }) {
    let q = (client || supabase).from('logs_acesso')
        .select('id, tipo, created_at, observacao')
        .eq('evento_id', evento_id)
        .eq('pessoa_id', pessoa_id)
        .eq('etapa', etapa)
        .eq('dia_civil', dia)
        .order('created_at', { ascending: false })
        .limit(1);
    q = area_id ? q.eq('area_id', area_id) : q.is('area_id', null);
    q = q.in('tipo', ['checkin', 'checkout']);

    const { data, error } = await q.maybeSingle();
    if (error) {
        if (colunaInexistente(error)) {
            logger.warn('[Entrada] Colunas etapa/dia_civil ausentes em logs_acesso: rode a migration 20261118_logs_entrada_etapa.sql. Entrada única por etapa desligada.');
            return null;
        }
        throw error;
    }
    return data || null;
}

/** A pessoa está dentro? O último registro de passagem é uma entrada (checkin). */
const estaDentro = (ultimo) => !!ultimo && ultimo.tipo === 'checkin';

/** Tabela de liberações ausente (migration 20261119 não aplicada) */
const ehTabelaAusente = (error) => !!error && (
    error.code === '42P01' || error.code === 'PGRST205'
    || /liberacoes_reentrada|could not find the table|relation .* does not exist/i.test(error.message || '')
);

/**
 * A área controla entrada (portão)? Área geral (sem área, areaId nulo) é LIVRE: não controla (migration
 * 20261119f). Área informada que não se acha, ou coluna ausente (migration não aplicada), controla: é o
 * comportamento de antes. Só controla_entrada = false libera a área informada.
 * @param {Map} [cache] leitura por requisição: área → boolean
 */
async function areaControlaEntrada(client, areaId, cache = null) {
    if (!areaId) return false;
    if (cache && cache.has(areaId)) return cache.get(areaId);
    const { data, error } = await (client || supabase).from('evento_areas')
        .select('controla_entrada').eq('id', areaId).maybeSingle();
    let controla = true;
    if (error) {
        if (!colunaInexistente(error)) logger.warn(`[Entrada] Área não lida para o controle de entrada: ${error.message}`);
    } else if (data?.controla_entrada === false) {
        controla = false;
    }
    if (cache) cache.set(areaId, controla);
    return controla;
}

/**
 * Há liberação do controlador para a pessoa/etapa/dia/área criada DEPOIS da saída (instante `depois`)?
 * @returns {Promise<boolean|null>} null = tabela ausente (migration não aplicada): a regra fica desligada
 */
async function existeLiberacaoDepois(client, { evento_id, pessoa_id, etapa, dia, area_id, depois }) {
    let q = (client || supabase).from(TABELA_LIBERACOES).select('id')
        .eq('evento_id', evento_id).eq('pessoa_id', pessoa_id).eq('etapa', etapa).eq('dia_civil', dia)
        .gt('criado_em', depois.toISOString()).limit(1);
    q = area_id ? q.eq('area_id', area_id) : q.is('area_id', null);
    const { data, error } = await q.maybeSingle();
    if (error) {
        if (ehTabelaAusente(error) || colunaInexistente(error)) return null;
        throw error;
    }
    return !!data;
}

/** A linha com este id já está gravada? (reenvio do mesmo acesso) */
async function idGravado(client, logId) {
    const { data } = await (client || supabase).from('logs_acesso').select('id').eq('id', logId).maybeSingle();
    return !!data;
}

/**
 * Regra de entrada (passo 4b da validação). Retorna o erro 409 de bloqueio, ou null se pode entrar.
 * Vale igual para credenciamento e para passagem comum (não há tratamento especial):
 * - Em área que CONTROLA entrada:
 *     · dentro (último registro é entrada) → 409 liberavel=false;
 *     · saiu (último é saída) sem liberação posterior à saída → 409 liberavel=true;
 *     · sem registro anterior na etapa/dia/área → livre.
 * - Área que não controla e área geral (sem área): nada é bloqueado.
 * - Reenvio do mesmo id (já gravado) nunca bloqueia.
 * @param {Object} p  { evento_id, pessoa_id, etapa, dia, area_id, logId, cache }
 */
async function bloqueioDeEntrada(client, { evento_id, pessoa_id, etapa, dia, area_id, logId, cache = null }) {
    // Área geral é livre (20261119f): nem consulta o último registro
    if (!area_id) return null;
    const ultimo = await buscarUltimoRegistroNaEtapa(client, { evento_id, pessoa_id, etapa, dia, area_id });
    if (!ultimo || (logId && ultimo.id === logId)) return null;

    let erro = null;
    if (await areaControlaEntrada(client, area_id, cache)) {
        if (estaDentro(ultimo)) {
            erro = erroEntradaAberta(ultimo.created_at);
        } else if (ultimo.tipo === 'checkout' && ultimo.observacao !== SAIDA_FORCADA_CRON) {
            // Saída forçada do fechamento de turno não exige liberação de reentrada
            const liberada = await existeLiberacaoDepois(client, {
                evento_id, pessoa_id, etapa, dia, area_id, depois: parseUtcSemFuso(ultimo.created_at)
            });
            if (liberada === false) erro = erroSaidaSemLiberacao(ultimo.created_at);
            if (liberada === null) logger.warn('[Entrada] Tabela liberacoes_reentrada ausente: regra de saída sem liberação desligada. Rode a migration 20261119_controle_entrada_portao.sql.');
        }
    }
    if (!erro) return null;
    // Reenvio: o mesmo id já gravado não é uma segunda entrada
    if (logId && await idGravado(client, logId)) return null;
    erro.etapa = etapa; // B8: a liberação precisa saber em qual etapa o bloqueio aconteceu
    return erro;
}

/**
 * Etapa da pessoa para o acesso sem lote conhecido (leitor de CPF/QR, facial, câmera) ou para a saída:
 * fase do lote do tipo de pulseira dela. Sem lote = 'todas'. Erro ao ler a fase cai em 'todas'
 * (não bloqueia o acesso).
 */
async function etapaDaPessoa(client, pessoa) {
    if (!pessoa?.tipo_pulseira_id) return 'todas';
    const { data, error } = await (client || supabase).from('evento_tipos_pulseira')
        .select('fase').eq('id', pessoa.tipo_pulseira_id).maybeSingle();
    if (error) {
        if (!colunaInexistente(error)) logger.warn(`[Entrada] Fase do lote não lida: ${error.message}`);
        return 'todas';
    }
    return normalizarEtapa(data?.fase);
}

/**
 * Etapa de várias pessoas de uma vez (fechamento de turno, saídas automáticas). Mesma regra de
 * etapaDaPessoa: sem lote = 'todas'; erro ao ler a fase cai em 'todas' (não bloqueia a saída).
 * @returns {Promise<Map<string, string>>} pessoa_id → etapa
 */
async function etapasDasPessoas(client, pessoaIds) {
    const cliente = client || supabase;
    const ids = [...new Set((pessoaIds || []).filter(Boolean))];
    const etapas = new Map(ids.map(id => [id, 'todas']));
    if (ids.length === 0) return etapas;

    const tipoDaPessoa = new Map();
    for (const lote of emLotes(ids, 200)) {
        const { data, error } = await cliente.from('pessoas').select('id, tipo_pulseira_id').in('id', lote);
        if (error) {
            logger.warn(`[Entrada] Lote de pessoas não lido para a etapa: ${error.message}`);
            return etapas;
        }
        for (const p of data || []) if (p.tipo_pulseira_id) tipoDaPessoa.set(p.id, p.tipo_pulseira_id);
    }

    const tipos = [...new Set(tipoDaPessoa.values())];
    const faseDoTipo = new Map();
    for (const lote of emLotes(tipos, 200)) {
        const { data, error } = await cliente.from('evento_tipos_pulseira').select('id, fase').in('id', lote);
        if (error) {
            if (!colunaInexistente(error)) logger.warn(`[Entrada] Fase dos lotes não lida: ${error.message}`);
            return etapas;
        }
        for (const t of data || []) faseDoTipo.set(t.id, normalizarEtapa(t.fase));
    }

    for (const [pessoaId, tipoId] of tipoDaPessoa) {
        if (faseDoTipo.has(tipoId)) etapas.set(pessoaId, faseDoTipo.get(tipoId));
    }
    return etapas;
}

module.exports = {
    etapaDaPessoa,
    etapasDasPessoas,
    INDICE_ENTRADA,
    AREA_GERAL,
    CODIGO_ENTRADA_ABERTA,
    normalizarEtapa,
    etapaDoLote,
    diaDoAcesso,
    mensagemEntradaAberta,
    mensagemEntradaDuplicada,
    erroEntradaAberta,
    erroEntradaDuplicada,
    erroRegistroDuplicado,
    erroSaidaSemLiberacao,
    erroDoBloqueioDoBanco,
    CODIGO_ENTRADA_BLOQUEADA,
    CODIGO_ENTRADA_DUPLICADA,
    TABELA_LIBERACOES,
    ehViolacaoEntrada,
    ehFuncaoAusente,
    ehEntradaAberta,
    ehTabelaAusente,
    buscarUltimoRegistroNaEtapa,
    areaControlaEntrada,
    existeLiberacaoDepois,
    bloqueioDeEntrada,
    estaDentro,
    colunaInexistente
};
