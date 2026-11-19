'use strict';

/**
 * Modelos de câmera (Configurações > Modelos de câmera): padrão de endereço RTSP de cada fabricante,
 * editável pela equipe sem mexer no código. Marcadores: {auth} {ip} {porta} {canal}.
 * Sem a migration 20261119b_modelos_camera: devolve os modelos de fábrica (só leitura).
 */
const { supabase } = require('../../config/supabase');

const MARCADORES = ['auth', 'ip', 'porta', 'canal'];

/** Os mesmos da migration: valem enquanto a tabela não existe */
const MODELOS_DE_FABRICA = [
    { nome: 'Mercusys / Tapo', porta_padrao: 554, rtsp_principal: 'rtsp://{auth}{ip}:{porta}/stream1', rtsp_sub: 'rtsp://{auth}{ip}:{porta}/stream2', observacoes: 'Usuário e senha são a "Conta da câmera" criada no app. Sub-stream em 720p e 8 a 10 fps.', ordem: 10 },
    { nome: 'Intelbras', porta_padrao: 554, rtsp_principal: 'rtsp://{auth}{ip}:{porta}/cam/realmonitor?channel={canal}&subtype=0', rtsp_sub: 'rtsp://{auth}{ip}:{porta}/cam/realmonitor?channel={canal}&subtype=1', observacoes: 'Também serve para leitores Intelbras usados como câmera.', ordem: 20 },
    { nome: 'Dahua', porta_padrao: 554, rtsp_principal: 'rtsp://{auth}{ip}:{porta}/cam/realmonitor?channel={canal}&subtype=0', rtsp_sub: 'rtsp://{auth}{ip}:{porta}/cam/realmonitor?channel={canal}&subtype=1', observacoes: null, ordem: 30 },
    { nome: 'Hikvision', porta_padrao: 554, rtsp_principal: 'rtsp://{auth}{ip}:{porta}/Streaming/Channels/{canal}01', rtsp_sub: 'rtsp://{auth}{ip}:{porta}/Streaming/Channels/{canal}02', observacoes: null, ordem: 40 },
    { nome: 'Genérica', porta_padrao: 554, rtsp_principal: null, rtsp_sub: null, observacoes: 'Informe o endereço RTSP completo no cadastro da câmera (manual do fabricante ou ONVIF Device Manager).', ordem: 90 }
].map(m => ({ ...m, id: null, ativo: true, de_fabrica: true }));

const tabelaInexistente = (err) => !!err && (err.code === '42P01' || err.code === 'PGRST205' || /does not exist|Could not find the table/i.test(err.message || ''));

class ErroValidacao extends Error {
    constructor(msg) { super(msg); this.status = 400; }
}

/** Confere um padrão de endereço: rtsp(s)://, com {ip}, só marcadores conhecidos, sem espaços */
function validarPadrao(padrao, campo) {
    if (padrao === null || padrao === undefined || padrao === '') return null;
    const p = String(padrao).trim();
    if (p.length > 300) throw new ErroValidacao(`${campo}: no máximo 300 caracteres`);
    if (!/^rtsps?:\/\//i.test(p)) throw new ErroValidacao(`${campo}: precisa começar com rtsp://`);
    if (/\s/.test(p)) throw new ErroValidacao(`${campo}: não pode ter espaços`);
    if (!p.includes('{ip}')) throw new ErroValidacao(`${campo}: precisa ter o marcador {ip}`);
    const desconhecidos = [...p.matchAll(/\{([^}]*)\}/g)].map(m => m[1]).filter(m => !MARCADORES.includes(m));
    if (desconhecidos.length) throw new ErroValidacao(`${campo}: marcador desconhecido {${desconhecidos[0]}} (use {auth}, {ip}, {porta}, {canal})`);
    // Senha não fica no modelo: ela vem de cada câmera pelo {auth}
    if (/^rtsps?:\/\/[^/{]*@/i.test(p)) throw new ErroValidacao(`${campo}: não coloque usuário e senha no modelo; use {auth}`);
    return p;
}

function validar(dados, parcial = false) {
    const saida = {};
    if (!parcial || dados.nome !== undefined) {
        const nome = String(dados.nome || '').trim();
        if (nome.length < 2 || nome.length > 60) throw new ErroValidacao('Nome: de 2 a 60 caracteres');
        if (/^rtsp \/ obs \/ webcam$/i.test(nome)) throw new ErroValidacao('Nome reservado para a webcam/OBS do PC do evento');
        saida.nome = nome;
    }
    if (!parcial || dados.porta_padrao !== undefined) {
        const porta = parseInt(dados.porta_padrao ?? 554, 10);
        if (!(porta >= 1 && porta <= 65535)) throw new ErroValidacao('Porta: de 1 a 65535');
        saida.porta_padrao = porta;
    }
    if (!parcial || dados.rtsp_principal !== undefined) saida.rtsp_principal = validarPadrao(dados.rtsp_principal, 'Endereço principal');
    if (!parcial || dados.rtsp_sub !== undefined) saida.rtsp_sub = validarPadrao(dados.rtsp_sub, 'Endereço do sub-stream');
    if (saida.rtsp_sub && saida.rtsp_principal === null) throw new ErroValidacao('Informe o endereço principal antes do sub-stream');
    if (!parcial || dados.observacoes !== undefined) {
        const obs = dados.observacoes ? String(dados.observacoes).trim() : null;
        if (obs && obs.length > 500) throw new ErroValidacao('Observações: no máximo 500 caracteres');
        saida.observacoes = obs || null;
    }
    if (dados.ativo !== undefined) saida.ativo = !!dados.ativo;
    if (dados.ordem !== undefined) saida.ordem = Math.max(0, Math.min(1000, parseInt(dados.ordem, 10) || 100));
    return saida;
}

/** @returns {{ modelos: object[], editavel: boolean }} editavel=false: migration não aplicada */
async function listar({ todos = false } = {}) {
    let q = supabase.from('modelos_camera').select('*').order('ordem', { ascending: true }).order('nome', { ascending: true });
    if (!todos) q = q.eq('ativo', true);
    const { data, error } = await q;
    if (error) {
        if (tabelaInexistente(error)) return { modelos: MODELOS_DE_FABRICA, editavel: false };
        throw error;
    }
    return { modelos: data || [], editavel: true };
}

async function criar(dados) {
    const linha = validar(dados);
    const { data, error } = await supabase.from('modelos_camera').insert(linha).select('*').single();
    if (error) {
        if (error.code === '23505') throw new ErroValidacao('Já existe um modelo com esse nome');
        throw error;
    }
    return data;
}

async function atualizar(id, dados) {
    const linha = { ...validar(dados, true), atualizado_em: new Date().toISOString() };
    const { data, error } = await supabase.from('modelos_camera').update(linha).eq('id', id).select('*').maybeSingle();
    if (error) {
        if (error.code === '23505') throw new ErroValidacao('Já existe um modelo com esse nome');
        throw error;
    }
    return data;
}

/** Modelo de fábrica não é apagado (pode ser desativado) */
async function apagar(id) {
    const { data: atual } = await supabase.from('modelos_camera').select('id, de_fabrica').eq('id', id).maybeSingle();
    if (!atual) return false;
    if (atual.de_fabrica) throw new ErroValidacao('Modelo de fábrica não pode ser apagado; desative-o');
    const { error } = await supabase.from('modelos_camera').delete().eq('id', id);
    if (error) throw error;
    return true;
}

module.exports = { listar, criar, atualizar, apagar, validarPadrao, validar, MODELOS_DE_FABRICA, ErroValidacao };
