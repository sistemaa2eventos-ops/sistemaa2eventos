const { supabase } = require('../../config/supabase');
const { normalizarFuncao } = require('../entities/documentoRequisitos.service');

/**
 * Regras de remuneração do evento: diária, meia diária, horas extras ou dobra.
 * A empresa tem uma regra padrão e pode ter uma regra por função (empresas.regras_por_funcao).
 * Tabela e cálculo documentados em supabase/migrations/20261029_regras_remuneracao.sql.
 */

const MODOS_EXCEDENTE = ['nenhum', 'horas_extras', 'dobra'];

const CAMPOS = [
    'nome', 'jornada_horas', 'valor_diaria', 'horas_minimas_diaria', 'meia_diaria', 'horas_minimas_meia',
    'excedente_modo', 'percentual_hora_extra', 'valor_hora_extra', 'horas_para_dobra', 'tolerancia_minutos',
    'observacao', 'ativo'
];

const numero = (v, padrao = null) => {
    if (v === null || v === undefined || v === '') return padrao;
    const n = Number(String(v).replace(',', '.'));
    return Number.isFinite(n) ? n : NaN;
};

/** Valida e normaliza o corpo vindo da tela. Lança Error com mensagem para o usuário. */
function normalizarRegra(body = {}) {
    const r = {};
    for (const c of CAMPOS) if (body[c] !== undefined) r[c] = body[c];

    if (r.nome !== undefined) {
        r.nome = String(r.nome || '').trim();
        if (!r.nome) throw new Error('Dê um nome para a regra.');
    }
    const numericos = {
        jornada_horas: 'Jornada', valor_diaria: 'Valor da diária', horas_minimas_diaria: 'Horas mínimas da diária',
        horas_minimas_meia: 'Horas mínimas da meia diária', percentual_hora_extra: 'Percentual da hora extra',
        valor_hora_extra: 'Valor da hora extra', horas_para_dobra: 'Horas para dobra', tolerancia_minutos: 'Tolerância'
    };
    for (const [campo, rotulo] of Object.entries(numericos)) {
        if (r[campo] === undefined) continue;
        const opcional = campo === 'valor_hora_extra' || campo === 'horas_para_dobra';
        const n = numero(r[campo], opcional ? null : 0);
        if (Number.isNaN(n) || (n !== null && n < 0)) throw new Error(`${rotulo}: informe um número válido.`);
        r[campo] = n;
    }
    if (r.jornada_horas !== undefined && (r.jornada_horas <= 0 || r.jornada_horas > 24)) {
        throw new Error('Jornada: informe entre 0 e 24 horas.');
    }
    if (r.tolerancia_minutos !== undefined) r.tolerancia_minutos = Math.round(r.tolerancia_minutos);
    if (r.horas_para_dobra === 0) r.horas_para_dobra = null;
    if (r.excedente_modo !== undefined && !MODOS_EXCEDENTE.includes(r.excedente_modo)) {
        throw new Error('Escolha o que fazer com as horas acima da jornada.');
    }
    if (r.meia_diaria !== undefined) r.meia_diaria = r.meia_diaria === true || r.meia_diaria === 'true';
    if (r.ativo !== undefined) r.ativo = r.ativo !== false && r.ativo !== 'false';
    if (r.observacao !== undefined) r.observacao = r.observacao ? String(r.observacao) : null;
    return r;
}

/**
 * Calcula um dia trabalhado.
 * @param {number} minutos horas do turno em minutos (check-in → check-out)
 * @param {object} regra linha de regras_remuneracao
 * @returns {{ diarias:number, codigo:string, extras_minutos:number, valor_diarias:number, valor_extras:number, valor_total:number }}
 *   codigo: '1', '½', 'D' (dobra) ou '0' (abaixo do mínimo)
 */
function calcularDia(minutos, regra) {
    const jornadaMin = Number(regra.jornada_horas) * 60;
    const tolerancia = Number(regra.tolerancia_minutos) || 0;
    const valorDiaria = Number(regra.valor_diaria) || 0;
    const horas = minutos / 60;

    let diarias = 0;
    if (horas >= Number(regra.horas_minimas_diaria || 0)) diarias = 1;
    else if (regra.meia_diaria && horas >= Number(regra.horas_minimas_meia || 0)) diarias = 0.5;

    let extrasMin = 0;
    if (diarias > 0 && regra.excedente_modo === 'dobra') {
        const limite = (Number(regra.horas_para_dobra) || Number(regra.jornada_horas)) * 60;
        if (minutos > limite + tolerancia) diarias = 2;
    } else if (diarias > 0 && regra.excedente_modo === 'horas_extras') {
        const excedente = minutos - jornadaMin;
        if (excedente > tolerancia) extrasMin = excedente;
    }

    const valorHora = regra.valor_hora_extra !== null && regra.valor_hora_extra !== undefined
        ? Number(regra.valor_hora_extra)
        : (valorDiaria / Number(regra.jornada_horas)) * (1 + (Number(regra.percentual_hora_extra) || 0) / 100);
    const centavos = (v) => Math.round(v * 100) / 100;
    const valorDiarias = centavos(diarias * valorDiaria);
    const valorExtras = centavos((extrasMin / 60) * valorHora);

    return {
        diarias,
        codigo: diarias === 2 ? 'D' : diarias === 1 ? '1' : diarias === 0.5 ? '½' : '0',
        extras_minutos: extrasMin,
        valor_diarias: valorDiarias,
        valor_extras: valorExtras,
        valor_total: centavos(valorDiarias + valorExtras)
    };
}

/** Regra que vale para a pessoa: a da função na empresa, senão a padrão da empresa. */
function regraDaPessoa(pessoa, empresa, regrasPorId) {
    if (!empresa) return null;
    const porFuncao = empresa.regras_por_funcao || {};
    const idFuncao = porFuncao[normalizarFuncao(pessoa.funcao)];
    return regrasPorId[idFuncao] || regrasPorId[empresa.regra_remuneracao_id] || null;
}

/** Texto curto da regra, para planilha e tela */
function descreverRegra(r) {
    const partes = [`${Number(r.jornada_horas)}h • R$ ${Number(r.valor_diaria).toFixed(2).replace('.', ',')}/diária`];
    if (Number(r.horas_minimas_diaria) > 0) partes.push(`diária a partir de ${Number(r.horas_minimas_diaria)}h`);
    if (r.meia_diaria) partes.push(`½ a partir de ${Number(r.horas_minimas_meia)}h`);
    if (r.excedente_modo === 'horas_extras') {
        partes.push(r.valor_hora_extra !== null && r.valor_hora_extra !== undefined
            ? `hora extra R$ ${Number(r.valor_hora_extra).toFixed(2).replace('.', ',')}`
            : `hora extra +${Number(r.percentual_hora_extra)}%`);
    }
    if (r.excedente_modo === 'dobra') partes.push(`dobra acima de ${Number(r.horas_para_dobra) || Number(r.jornada_horas)}h`);
    if (r.excedente_modo !== 'nenhum' && Number(r.tolerancia_minutos) > 0) partes.push(`tolerância ${r.tolerancia_minutos} min`);
    return partes.join(' • ');
}

class RemuneracaoService {
    async listar(eventoId) {
        const { data, error } = await supabase
            .from('regras_remuneracao')
            .select('*')
            .eq('evento_id', eventoId)
            .order('nome');
        if (error) throw error;
        return (data || []).map(r => ({ ...r, descricao: descreverRegra(r) }));
    }

    async criar(eventoId, body) {
        const regra = normalizarRegra({ jornada_horas: 8, ...body });
        if (!regra.nome) throw new Error('Dê um nome para a regra.');
        const { data, error } = await supabase
            .from('regras_remuneracao')
            .insert([{ ...regra, evento_id: eventoId }])
            .select()
            .single();
        if (error) throw this._erroAmigavel(error);
        return data;
    }

    async atualizar(eventoId, id, body) {
        const regra = normalizarRegra(body);
        const { data, error } = await supabase
            .from('regras_remuneracao')
            .update({ ...regra, updated_at: new Date().toISOString() })
            .eq('id', id)
            .eq('evento_id', eventoId)
            .select()
            .single();
        if (error) throw this._erroAmigavel(error);
        return data;
    }

    /** Não apaga regra em uso: a empresa ficaria sem cálculo sem ninguém perceber */
    async excluir(eventoId, id) {
        const { data: empresas, error: empErr } = await supabase
            .from('empresas')
            .select('nome, regra_remuneracao_id, regras_por_funcao')
            .eq('evento_id', eventoId);
        if (empErr) throw empErr;
        const emUso = (empresas || []).filter(e =>
            e.regra_remuneracao_id === id || Object.values(e.regras_por_funcao || {}).includes(id));
        if (emUso.length > 0) {
            const nomes = emUso.slice(0, 3).map(e => e.nome).join(', ');
            throw new Error(`Regra em uso por ${emUso.length} empresa(s) (${nomes}${emUso.length > 3 ? '...' : ''}). Troque a regra delas antes de excluir.`);
        }
        const { error } = await supabase.from('regras_remuneracao').delete().eq('id', id).eq('evento_id', eventoId);
        if (error) throw error;
    }

    /** Funções em uso nas pessoas do evento (ou de uma empresa), já normalizadas */
    async funcoes(eventoId, empresaId = null) {
        let q = supabase.from('pessoas').select('funcao').eq('evento_id', eventoId);
        if (empresaId) q = q.eq('empresa_id', empresaId);
        const { data, error } = await q;
        if (error) throw error;
        return [...new Set((data || []).map(p => normalizarFuncao(p.funcao)).filter(Boolean))].sort();
    }

    _erroAmigavel(error) {
        if (error.code === '23505') return new Error('Já existe uma regra com esse nome neste evento.');
        if (error.code === '42P01' || /regras_remuneracao/.test(error.message || '')) {
            return new Error('Tabela de regras ainda não criada: rode a migration 20261029_regras_remuneracao.sql.');
        }
        return error;
    }
}

module.exports = new RemuneracaoService();
module.exports.calcularDia = calcularDia;
module.exports.regraDaPessoa = regraDaPessoa;
module.exports.descreverRegra = descreverRegra;
module.exports.normalizarRegra = normalizarRegra;
