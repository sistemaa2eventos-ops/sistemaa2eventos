'use strict';
/**
 * Operadores da Central de Monitoramento local e registro de quem operou (LGPD/LAI).
 *
 * - O painel cadastra os operadores do evento (só admin). A senha vira hash scrypt; nunca é guardada.
 * - O agente do evento recebe os operadores ativos (com o hash) para o login funcionar no PC mesmo sem
 *   internet, e devolve o registro de atividades (entrar, assistir, girar, falar, controle).
 * - Cada registro tem um uid gerado no PC: reenvio depois de queda de internet não duplica.
 */
const { supabase } = require('../../config/supabase');
const { gerarHashSenha } = require('../producao/producaoPortalAuth');
const logger = require('../../services/logger');

const LOGIN_VALIDO = /^[a-z0-9._-]{3,40}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const UID_REGISTRO = /^[A-Za-z0-9_-]{8,64}$/;
const SENHA_MIN = 8;
const LOTE_MAX = 500;
const CAMPOS_PUBLICOS = 'id, nome, login, ativo, ultimo_acesso, created_at, updated_at';

/** Ações que a Central registra (o resto é descartado) */
const ACOES = new Set([
    'entrar', 'entrar_falhou', 'sair', 'assistir', 'ouvir', 'falar',
    'assumir_controle', 'liberar_controle', 'girar', 'ir_posicao', 'gravar_posicao', 'senha_app_camera'
]);

function erro(msg, status = 400) {
    const e = new Error(msg);
    e.status = status;
    return e;
}

function validarNome(nome) {
    const n = String(nome || '').trim();
    if (n.length < 2 || n.length > 80) throw erro('O nome precisa ter de 2 a 80 caracteres.');
    return n;
}

function validarLogin(login) {
    const l = String(login || '').trim().toLowerCase();
    if (!LOGIN_VALIDO.test(l)) throw erro('Login: de 3 a 40 caracteres, só letras minúsculas, números, ponto, hífen ou sublinhado.');
    return l;
}

function validarSenha(senha) {
    const s = String(senha || '');
    if (s.trim().length < SENHA_MIN) throw erro(`A senha precisa ter pelo menos ${SENHA_MIN} caracteres.`);
    if (s.length > 128) throw erro('A senha pode ter no máximo 128 caracteres.');
    return s;
}

function validarId(id) {
    if (!UUID.test(String(id || ''))) throw erro('Operador não encontrado.', 404);
    return id;
}

async function listar(eventoId) {
    const { data, error } = await supabase.from('central_operadores').select(CAMPOS_PUBLICOS)
        .eq('evento_id', eventoId).order('nome');
    if (error) throw error;
    return data || [];
}

async function criar(eventoId, dados = {}, criadoPor = null) {
    const linha = {
        evento_id: eventoId,
        nome: validarNome(dados.nome),
        login: validarLogin(dados.login),
        senha_hash: gerarHashSenha(validarSenha(dados.senha)),
        ativo: dados.ativo !== false,
        criado_por: UUID.test(String(criadoPor || '')) ? criadoPor : null
    };
    const { data, error } = await supabase.from('central_operadores').insert(linha).select(CAMPOS_PUBLICOS).single();
    if (error?.code === '23505') throw erro('Já existe um operador com esse login neste evento.', 409);
    if (error) throw error;
    return data;
}

async function atualizar(eventoId, id, dados = {}) {
    validarId(id);
    const mudancas = { updated_at: new Date().toISOString() };
    if (dados.nome !== undefined) mudancas.nome = validarNome(dados.nome);
    if (dados.ativo !== undefined) mudancas.ativo = dados.ativo === true;
    if (dados.senha !== undefined && dados.senha !== '') mudancas.senha_hash = gerarHashSenha(validarSenha(dados.senha));
    if (Object.keys(mudancas).length === 1) throw erro('Nada para alterar.');
    const { data, error } = await supabase.from('central_operadores').update(mudancas)
        .eq('evento_id', eventoId).eq('id', id).select(CAMPOS_PUBLICOS).maybeSingle();
    if (error) throw error;
    if (!data) throw erro('Operador não encontrado.', 404);
    return data;
}

async function excluir(eventoId, id) {
    validarId(id);
    const { data, error } = await supabase.from('central_operadores').delete()
        .eq('evento_id', eventoId).eq('id', id).select('id, login').maybeSingle();
    if (error) throw error;
    if (!data) throw erro('Operador não encontrado.', 404);
    return data;
}

/** Registro de atividades do evento, mais recentes primeiro */
async function auditoria(eventoId, filtros = {}) {
    const limite = Math.min(Math.max(Number(filtros.limite) || 300, 1), 1000);
    let q = supabase.from('central_auditoria')
        .select('id, operador_id, operador_nome, operador_login, acao, camera_id, detalhe, ocorrido_em')
        .eq('evento_id', eventoId).order('ocorrido_em', { ascending: false }).limit(limite);
    if (filtros.operador_id && UUID.test(filtros.operador_id)) q = q.eq('operador_id', filtros.operador_id);
    if (filtros.acao && ACOES.has(filtros.acao)) q = q.eq('acao', filtros.acao);
    const de = filtros.de ? new Date(filtros.de) : null;
    const ate = filtros.ate ? new Date(filtros.ate) : null;
    if (de && !isNaN(de)) q = q.gte('ocorrido_em', de.toISOString());
    if (ate && !isNaN(ate)) q = q.lte('ocorrido_em', ate.toISOString());
    const { data, error } = await q;
    if (error) throw error;
    return data || [];
}

/** Para o agente do evento: só os ativos, com o hash (o login no PC funciona sem internet) */
async function paraAgente(eventoId) {
    if (!eventoId) return [];
    const { data, error } = await supabase.from('central_operadores').select('id, nome, login, senha_hash')
        .eq('evento_id', eventoId).eq('ativo', true);
    if (error) throw error;
    return data || [];
}

/**
 * Converte um item enviado pelo agente numa linha do registro, ou null se inválido.
 * O evento vem do token do agente, nunca do item.
 */
function linhaDoItem(item, agentInfo, operadoresDoEvento) {
    if (!item || typeof item !== 'object') return null;
    if (!UID_REGISTRO.test(String(item.uid || ''))) return null;
    const acao = String(item.acao || '');
    if (!ACOES.has(acao)) return null;
    const quando = new Date(item.ocorrido_em);
    if (isNaN(quando) || quando.getTime() > Date.now() + 24 * 3600 * 1000) return null;
    let detalhe = item.detalhe && typeof item.detalhe === 'object' && !Array.isArray(item.detalhe) ? item.detalhe : {};
    if (JSON.stringify(detalhe).length > 2000) detalhe = {};
    // Operador de outro evento não entra: o nome fica, a ligação com a conta não
    const operadorId = operadoresDoEvento.has(String(item.operador_id || '')) ? item.operador_id : null;
    return {
        uid: item.uid,
        evento_id: agentInfo.evento_id,
        agente_id: UUID.test(String(agentInfo.id || '')) ? agentInfo.id : null,
        operador_id: operadorId,
        operador_nome: String(item.operador_nome || 'desconhecido').slice(0, 80),
        operador_login: item.operador_login ? String(item.operador_login).slice(0, 40) : null,
        acao,
        camera_id: item.camera_id ? String(item.camera_id).slice(0, 64) : null,
        detalhe,
        ocorrido_em: quando.toISOString()
    };
}

async function registrarAuditoria(agentInfo = {}, itens = []) {
    if (!agentInfo.evento_id) return { ok: false, erro: 'agente sem evento' };
    if (!Array.isArray(itens) || !itens.length) return { ok: true, n: 0 };
    const { data: ops, error: errOps } = await supabase.from('central_operadores').select('id')
        .eq('evento_id', agentInfo.evento_id);
    if (errOps) throw errOps;
    const operadoresDoEvento = new Set((ops || []).map(o => o.id));
    const linhas = itens.slice(0, LOTE_MAX).map(i => linhaDoItem(i, agentInfo, operadoresDoEvento)).filter(Boolean);
    if (linhas.length) {
        const { error } = await supabase.from('central_auditoria').upsert(linhas, { onConflict: 'uid', ignoreDuplicates: true });
        if (error) throw error;
    }
    // Último acesso de quem entrou (o mais recente de cada operador no lote)
    const entradas = new Map();
    for (const l of linhas) {
        if (l.acao === 'entrar' && l.operador_id && (!entradas.has(l.operador_id) || entradas.get(l.operador_id) < l.ocorrido_em)) {
            entradas.set(l.operador_id, l.ocorrido_em);
        }
    }
    for (const [id, quando] of entradas) {
        supabase.from('central_operadores').update({ ultimo_acesso: quando }).eq('id', id).eq('evento_id', agentInfo.evento_id)
            .then(({ error }) => error && logger.debug(`[Central] último acesso: ${error.message}`));
    }
    // O agente apaga da fila todos os itens do lote, inclusive os inválidos (não adianta reenviar)
    return { ok: true, n: linhas.length };
}

module.exports = {
    listar, criar, atualizar, excluir, auditoria, paraAgente, registrarAuditoria,
    _linhaDoItem: linhaDoItem, ACOES
};
