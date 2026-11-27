'use strict';

// Situação de uma pessoa para a Fiscalização de áreas:
// - credenciada? dentro do evento (último movimento de hoje é entrada)?
// - pulseira em uso HOJE, com tipo e quando foi colocada;
// - pulseira de OUTRO DIA que não foi devolvida (aparece, com data e forma do check-in; se a pessoa
//   ainda não saiu, o fiscal é orientado a levá-la ao credenciamento);
// - movimentos de hoje, com a forma de cada entrada/saída (facial, manual com o operador, pulseira...).
// Pulseira descredenciada (devolvida, perdida ou saída real) não aparece.

const pulseiraService = require('../pulseiras/pulseira.service');
const { inicioDiaOperacao } = require('../../utils/diaOperacao');

// Situações que não credenciam (pendente, recusada, em verificação ou bloqueada)
const SITUACOES_NAO_CREDENCIADAS = ['pendente', 'recusado', 'verificacao', 'bloqueado'];

const FORMA_DO_METODO = {
    facial: 'Facial',
    manual: 'Manual',
    pulseira: 'Pulseira',
    qrcode: 'QR do crachá',
    barcode: 'Leitor de código',
    scanner: 'Leitor de código',
    camera_qr: 'Câmera',
    lpr: 'Placa de veículo',
};

// created_at do banco é UTC sem marcador de fuso: sem o "Z" a data sai 3 h errada
const comoIsoUtc = (valor) => {
    if (!valor) return null;
    const texto = String(valor);
    const comFuso = /[zZ]|[+-]\d\d:?\d\d$/.test(texto) ? texto : `${texto}Z`;
    const data = new Date(comFuso);
    return Number.isNaN(data.getTime()) ? null : data.toISOString();
};

async function buscarTipoPulseira(client, tipoId) {
    if (!tipoId) return null;
    const { data } = await client.from('evento_tipos_pulseira')
        .select('nome_tipo, cor_hex')
        .eq('id', tipoId)
        .maybeSingle();
    return data || null;
}

async function nomesDeUsuarios(client, ids) {
    const unicos = [...new Set((ids || []).filter(Boolean))];
    if (!unicos.length) return new Map();
    const { data } = await client.from('perfis').select('id, nome_completo').in('id', unicos);
    return new Map((data || []).map(p => [p.id, p.nome_completo]));
}

// Forma do registro e, no manual, quem fez (o operador). Facial não tem operador: só o horário e a forma.
function descreverRegistro(linha, nomes) {
    if (!linha) return null;
    const metodo = linha.metodo || null;
    let usuario_nome = null;
    if (metodo === 'manual') {
        usuario_nome = linha.created_by
            ? (nomes.get(linha.created_by) || 'Operador não encontrado')
            : 'Operador não identificado';
    }
    return {
        horario: comoIsoUtc(linha.created_at),
        metodo,
        forma: FORMA_DO_METODO[metodo] || (metodo ? metodo : 'Forma não informada'),
        usuario_nome,
    };
}

// Pulseira de outro dia que não foi devolvida (buscarStatusPulseira já descartou as devolvidas/perdidas e as saídas reais)
async function situacaoPulseiraAnterior(client, eventoId, pessoaId, pendencia) {
    const { data: entradas } = await client.from('logs_acesso')
        .select('created_at, metodo, created_by')
        .eq('evento_id', eventoId)
        .eq('pessoa_id', pessoaId)
        .eq('tipo', 'checkin')
        .eq('numero_pulseira', pendencia.numero)
        .order('created_at', { ascending: false })
        .limit(5);
    const lista = entradas || [];
    const entrada = lista.find(e => comoIsoUtc(e.created_at) === pendencia.dataCheckin) || lista[0] || null;

    let saiuEm = null;
    if (entrada) {
        const { data: saidas } = await client.from('logs_acesso')
            .select('created_at')
            .eq('evento_id', eventoId)
            .eq('pessoa_id', pessoaId)
            .eq('tipo', 'checkout')
            .gt('created_at', entrada.created_at)
            .order('created_at', { ascending: true })
            .limit(1);
        saiuEm = comoIsoUtc(saidas?.[0]?.created_at);
    }
    return { entrada, saiuEm };
}

/**
 * @returns {Promise<{
 *   credenciado: boolean, motivo_nao_credenciado: string|null,
 *   dentro_do_evento: boolean, ultimo_evento_hoje: 'checkin'|'checkout'|null,
 *   entrada_hoje: object|null,
 *   pulseira: object|null,
 *   pulseira_anterior: object|null,
 *   historico_hoje: Array<object>
 * }>}
 */
async function situacaoFiscal(client, eventoId, pessoa) {
    // 1. Credencial: cadastro ativo e situação que credencia
    let motivoNaoCredenciado = null;
    if (pessoa.ativo === false) motivoNaoCredenciado = 'Cadastro desativado neste evento';
    else if (SITUACOES_NAO_CREDENCIADAS.includes(pessoa.status_acesso)) motivoNaoCredenciado = `Situação: ${pessoa.status_acesso}`;
    else if (pessoa.bloqueado) motivoNaoCredenciado = 'Bloqueada';

    // 2. Movimentos do dia de operação (desde o horario_reset do evento; 00:00 por padrão)
    const inicioDia = await inicioDiaOperacao(eventoId);
    const { data: movimentos, error } = await client.from('logs_acesso')
        .select('tipo, created_at, numero_pulseira, metodo, observacao, created_by, evento_areas(nome_area)')
        .eq('evento_id', eventoId)
        .eq('pessoa_id', pessoa.id)
        .in('tipo', ['checkin', 'checkout'])
        .gte('created_at', inicioDia)
        .order('created_at', { ascending: true });
    if (error) throw error;
    const hoje = movimentos || [];
    const ultimoEvento = hoje.length ? hoje[hoje.length - 1].tipo : null;

    // 3. Pulseira em uso hoje e pulseira de outro dia ainda não devolvida
    const status = await pulseiraService.buscarStatusPulseira(eventoId, pessoa.id);
    const numero = status?.emUso ? String(status.emUso) : null;
    const pendencia = !numero && status?.pendencia ? status.pendencia : null;
    const anterior = pendencia ? await situacaoPulseiraAnterior(client, eventoId, pessoa.id, pendencia) : null;

    const entradaDaPulseira = numero
        ? [...hoje].reverse().find(m => m.tipo === 'checkin' && String(m.numero_pulseira || '').trim() === numero)
        : null;
    const ultimaEntradaHoje = [...hoje].reverse().find(m => m.tipo === 'checkin') || null;

    const nomes = await nomesDeUsuarios(client, [
        ...hoje.map(m => m.created_by),
        entradaDaPulseira?.created_by,
        ultimaEntradaHoje?.created_by,
        anterior?.entrada?.created_by,
    ]);
    const tipo = numero || pendencia ? await buscarTipoPulseira(client, pessoa.tipo_pulseira_id) : null;

    const registroAtual = descreverRegistro(entradaDaPulseira, nomes);
    const registroHoje = descreverRegistro(ultimaEntradaHoje, nomes);

    return {
        credenciado: motivoNaoCredenciado === null,
        motivo_nao_credenciado: motivoNaoCredenciado,
        dentro_do_evento: ultimoEvento === 'checkin',
        ultimo_evento_hoje: ultimoEvento,
        entrada_hoje: registroHoje ? { ...registroHoje, numero_pulseira: ultimaEntradaHoje.numero_pulseira || null } : null,
        pulseira: numero ? {
            numero,
            tipo_nome: tipo?.nome_tipo || null,
            cor_hex: tipo?.cor_hex || null,
            colocada_em: registroAtual?.horario || null,
            forma: registroAtual?.forma || null,
            usuario_nome: registroAtual?.usuario_nome || null,
        } : null,
        pulseira_anterior: pendencia ? {
            numero: pendencia.numero,
            tipo_nome: tipo?.nome_tipo || null,
            cor_hex: tipo?.cor_hex || null,
            colocada_em: pendencia.dataCheckin,
            forma: descreverRegistro(anterior.entrada, nomes)?.forma || null,
            usuario_nome: descreverRegistro(anterior.entrada, nomes)?.usuario_nome || null,
            // Ainda não saiu: está no evento com a pulseira de outro dia. Saiu (fim de turno): saiu_em traz a hora.
            ainda_dentro: !anterior.saiuEm,
            saiu_em: anterior.saiuEm,
        } : null,
        historico_hoje: hoje.map(m => ({
            tipo: m.tipo,
            ...descreverRegistro(m, nomes),
            numero_pulseira: m.numero_pulseira || null,
            area_nome: m.evento_areas?.nome_area || null,
            observacao: m.observacao || null,
        })),
    };
}

// Áreas que a pessoa pode acessar: diretas e pelo lote da pulseira
async function areasDaPessoa(client, eventoId, pessoa) {
    const [diretas, porLote] = await Promise.all([
        client.from('pessoa_areas_acesso').select('area_id, evento_areas(id, nome_area)').eq('pessoa_id', pessoa.id).eq('evento_id', eventoId),
        pessoa.tipo_pulseira_id
            ? client.from('pulseira_areas_permitidas').select('area_id, evento_areas(id, nome_area)').eq('tipo_pulseira_id', pessoa.tipo_pulseira_id)
            : Promise.resolve({ data: [] }),
    ]);
    const mapa = new Map();
    for (const item of [...(diretas.data || []), ...(porLote.data || [])]) {
        if (item.area_id) mapa.set(item.area_id, item.evento_areas?.nome_area || 'Área');
    }
    return [...mapa.entries()].map(([id, nome_area]) => ({ id, nome_area }));
}

module.exports = { situacaoFiscal, areasDaPessoa, SITUACOES_NAO_CREDENCIADAS, comoIsoUtc, FORMA_DO_METODO };
