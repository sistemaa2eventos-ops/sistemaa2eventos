'use strict';

const { supabase } = require('../../config/supabase');
const logger = require('../../services/logger');

/**
 * Gravações das câmeras. O vídeo fica NO PC do evento que gravou (agente local); aqui ficam só o
 * registro (câmera, horário, tamanho, motivo) e quem assistiu ou baixou (LGPD).
 * Para assistir, o painel pede pedaços do arquivo ao agente (Range HTTP: avançar e voltar funcionam).
 * Trechos de ALERTA de câmeras com "copiar alertas para o Drive" vão também ao Google Drive.
 */
const PEDACO = 768 * 1024;
// ia_onde: local (PC do evento reconhece) · auto (servidor de IA central, com o PC do evento de reserva)
const PADRAO_EVENTO = { motor_ia_ativo: true, gravacao_ativa: true, gravacao_limite_gb: 40, gravacao_retencao_dias: 30, ia_onde: 'local' };
// Só "tabela não existe" (migration pendente) — outros erros (permissão, constraint) sobem normalmente
const tabelaInexistente = (error) => error?.code === '42P01' || error?.code === 'PGRST205'
    || /(relation|table) .*(cameras_evento_config|gravacoes).* (does not exist|not find)/i.test(error?.message || '');

// ------------------------------------------------------------------ chaves gerais do evento
const cacheConfig = new Map(); // evento_id → { valor, ate }

async function configEvento(eventoId) {
    if (!eventoId) return { ...PADRAO_EVENTO };
    const c = cacheConfig.get(eventoId);
    if (c && Date.now() < c.ate) return c.valor;
    const { data, error } = await supabase.from('cameras_evento_config').select('*').eq('evento_id', eventoId).maybeSingle();
    if (error && !tabelaInexistente(error)) throw error;
    const valor = { ...PADRAO_EVENTO, ...(data || {}) };
    cacheConfig.set(eventoId, { valor, ate: Date.now() + 15000 });
    return valor;
}

async function salvarConfigEvento(eventoId, dados = {}, usuario) {
    const atual = await configEvento(eventoId);
    const inteiro = (v, min, max, padrao) => {
        const n = parseInt(v, 10);
        return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : padrao;
    };
    const nova = {
        evento_id: eventoId,
        motor_ia_ativo: dados.motor_ia_ativo !== undefined ? dados.motor_ia_ativo !== false : atual.motor_ia_ativo,
        gravacao_ativa: dados.gravacao_ativa !== undefined ? dados.gravacao_ativa !== false : atual.gravacao_ativa,
        gravacao_limite_gb: inteiro(dados.gravacao_limite_gb, 2, 4000, atual.gravacao_limite_gb),
        gravacao_retencao_dias: inteiro(dados.gravacao_retencao_dias, 1, 365, atual.gravacao_retencao_dias),
        ia_onde: ['local', 'auto'].includes(dados.ia_onde) ? dados.ia_onde : (atual.ia_onde || 'local'),
        atualizado_por: usuario?.email || usuario?.id || null,
        atualizado_em: new Date().toISOString()
    };
    let { data, error } = await supabase.from('cameras_evento_config').upsert(nova).select().single();
    if (error && /ia_onde/.test(error.message || '')) {
        if (dados.ia_onde === 'auto') throw new Error('Para usar o servidor de IA central, aplique a migration 20261112_servidores_ia.sql no Supabase.');
        const { ia_onde: _sem, ...semIaOnde } = nova; // banco sem a migration 20261112: salva o resto
        ({ data, error } = await supabase.from('cameras_evento_config').upsert(semIaOnde).select().single());
    }
    if (error) {
        if (tabelaInexistente(error)) throw new Error('Aplique a migration 20261111_cameras_modos_gravacao.sql no banco antes de usar estas chaves.');
        throw error;
    }
    cacheConfig.delete(eventoId);
    // Voltou a reconhecer no PC do evento: os servidores centrais perdem a permissão e a memória do evento
    if (atual.ia_onde === 'auto' && (data?.ia_onde || 'local') !== 'auto') require('../../services/iaCentral').liberarEvento(eventoId);
    require('./vigilancia.service').eventoAlterado(eventoId).catch(() => {});
    return { ...PADRAO_EVENTO, ...data };
}

// ------------------------------------------------------------------ registro vindo do agente
async function registrar(agentInfo, dados = {}) {
    const eventoId = agentInfo?.evento_id;
    if (!eventoId || !dados.arquivo || !dados.inicio) throw new Error('registro de gravação incompleto');
    const { data: cam } = await supabase.from('cameras_ip').select('id, nome, evento_id, gravacao_drive')
        .eq('id', dados.camera_id).maybeSingle();
    if (cam && cam.evento_id !== eventoId) throw new Error('câmera de outro evento');
    const linha = {
        evento_id: eventoId,
        camera_id: cam?.id || null,
        camera_nome: cam?.nome || null,
        agent_id: agentInfo.id,
        arquivo: String(dados.arquivo).slice(0, 500),
        motivo: dados.motivo === 'alerta' ? 'alerta' : 'continua',
        alerta_descricao: dados.alerta_descricao ? String(dados.alerta_descricao).slice(0, 500) : null,
        inicio: dados.inicio,
        fim: dados.fim || null,
        tamanho_bytes: Number(dados.tamanho_bytes) || null,
        status: 'local'
    };
    const { data, error } = await supabase.from('gravacoes').upsert(linha, { onConflict: 'agent_id,arquivo' }).select().single();
    if (error) throw error;
    if (linha.motivo === 'alerta' && cam?.gravacao_drive && !data.drive_file_id) {
        require('../integracoes/drive.service').copiarGravacaoEmSegundoPlano(data.id);
    }
    return data;
}

async function apagadas(agentInfo, arquivos = []) {
    if (!agentInfo?.id || !Array.isArray(arquivos) || !arquivos.length) return;
    for (let i = 0; i < arquivos.length; i += 200) {
        await supabase.from('gravacoes').update({ status: 'apagada' })
            .eq('agent_id', agentInfo.id).in('arquivo', arquivos.slice(i, i + 200));
    }
}

// ------------------------------------------------------------------ alertas → trecho gravado
/** Alerta numa câmera: se ela grava "em alertas", o PC guarda de 10 s antes a 30 s depois */
async function marcarAlerta(cam, descricao) {
    if (!cam?.id || cam.gravacao_modo !== 'alertas') return;
    const agentService = require('../../services/agentService');
    const agentId = agentService.findAgentForEvent(cam.evento_id);
    if (!agentId) return;
    agentService.sendCommand(agentId, 'gravacao_marcar', { camera_ids: [cam.id], descricao }, 8000)
        .catch(err => logger.debug(`[Gravação] marcar alerta: ${err.message}`));
}

/** Alerta de um leitor: grava as câmeras da mesma área que gravam "em alertas" */
async function marcarAlertaArea(eventoId, areaId, descricao) {
    if (!eventoId || !areaId) return;
    const agentService = require('../../services/agentService');
    const agentId = agentService.findAgentForEvent(eventoId);
    if (!agentId) return;
    const { data, error } = await supabase.from('cameras_ip').select('id')
        .eq('evento_id', eventoId).eq('area_id', areaId).eq('gravacao_modo', 'alertas');
    if (error || !data?.length) return;
    agentService.sendCommand(agentId, 'gravacao_marcar', { camera_ids: data.map(c => c.id), descricao }, 8000)
        .catch(err => logger.debug(`[Gravação] marcar alerta da área: ${err.message}`));
}

// ------------------------------------------------------------------ consulta e reprodução
async function listar(eventoId, { camera_id, de, ate, motivo, limite = 200 } = {}) {
    let q = supabase.from('gravacoes')
        .select('id, camera_id, camera_nome, motivo, alerta_descricao, inicio, fim, tamanho_bytes, status, drive_file_id, drive_erro, agent_id')
        .eq('evento_id', eventoId).order('inicio', { ascending: false }).limit(Math.min(Number(limite) || 200, 1000));
    if (camera_id) q = q.eq('camera_id', camera_id);
    if (motivo === 'alerta' || motivo === 'continua') q = q.eq('motivo', motivo);
    if (de) q = q.gte('inicio', de);
    if (ate) q = q.lte('inicio', ate);
    const { data, error } = await q;
    if (error) {
        if (tabelaInexistente(error)) return [];
        throw error;
    }
    const agentService = require('../../services/agentService');
    return (data || []).map(({ agent_id, ...g }) => ({ ...g, pc_conectado: agentService.agents.has(agent_id) }));
}

async function buscar(id, eventoId) {
    let q = supabase.from('gravacoes').select('*').eq('id', id);
    if (eventoId) q = q.eq('evento_id', eventoId);
    const { data, error } = await q.maybeSingle();
    if (error) throw error;
    return data;
}

async function registrarAcesso(gravacao, usuario, acao, ip) {
    await supabase.from('gravacoes_acessos').insert({
        gravacao_id: gravacao.id, usuario_id: usuario?.id || null, usuario_email: usuario?.email || null, acao, ip: ip || null
    });
}

async function lerDoAgente(gravacao, inicio, tamanho) {
    const agentService = require('../../services/agentService');
    if (!agentService.agents.has(gravacao.agent_id)) {
        const err = new Error('O PC que gravou este vídeo está desligado ou sem internet. A gravação fica disponível quando ele voltar.');
        err.status = 503;
        throw err;
    }
    // Canal de vídeo do agente: baixar/assistir não atrasa os comandos dos leitores
    const r = await agentService.sendCommand(gravacao.agent_id, 'gravacao_ler', { arquivo: gravacao.arquivo, inicio, tamanho }, 20000, { canal: 'video' });
    return { total: r.total, dados: Buffer.from(r.base64 || '', 'base64') };
}

/** Responde ao <video> (com Range) ou ao download (arquivo inteiro, em sequência) */
async function transmitir(gravacao, req, res, { baixar = false } = {}) {
    const nome = `${(gravacao.camera_nome || 'camera').replace(/[^\w\- ]+/g, '').trim() || 'camera'}_${String(gravacao.inicio).slice(0, 19).replace(/[:T]/g, '-')}.mp4`;
    const range = /^bytes=(\d*)-(\d*)$/.exec(req.headers.range || '');
    if (range && !baixar) {
        const pedidoIni = range[1] === '' ? null : Number(range[1]);
        const pedidoFim = range[2] === '' ? null : Number(range[2]);
        const inicio = pedidoIni ?? 0;
        const primeiro = await lerDoAgente(gravacao, inicio, PEDACO);
        const total = primeiro.total;
        if (inicio >= total) {
            res.status(416).set('Content-Range', `bytes */${total}`).end();
            return;
        }
        const fim = Math.min(pedidoFim ?? total - 1, inicio + primeiro.dados.length - 1, total - 1);
        const corpo = primeiro.dados.subarray(0, fim - inicio + 1);
        res.status(206).set({
            'Content-Type': 'video/mp4',
            'Content-Range': `bytes ${inicio}-${fim}/${total}`,
            'Content-Length': corpo.length,
            'Accept-Ranges': 'bytes',
            'Cache-Control': 'private, no-store'
        });
        res.end(corpo);
        return;
    }
    // Sem Range (primeiro pedido do player ou download): envia em sequência
    const primeiro = await lerDoAgente(gravacao, 0, PEDACO);
    res.status(200).set({
        'Content-Type': 'video/mp4',
        'Content-Length': primeiro.total,
        'Accept-Ranges': 'bytes',
        'Cache-Control': 'private, no-store',
        ...(baixar ? { 'Content-Disposition': `attachment; filename="${nome}"` } : {})
    });
    let enviado = 0;
    let pedaco = primeiro.dados;
    let fechado = false;
    req.on('close', () => { fechado = true; });
    while (!fechado) {
        if (!res.write(pedaco)) await new Promise(r => res.once('drain', r));
        enviado += pedaco.length;
        if (enviado >= primeiro.total || !pedaco.length) break;
        pedaco = (await lerDoAgente(gravacao, enviado, PEDACO)).dados;
    }
    res.end();
}

async function statusDoPc(eventoId) {
    const agentService = require('../../services/agentService');
    const agentId = agentService.findAgentForEvent(eventoId);
    if (!agentId) return { conectado: false };
    const recursos = agentService.recursos(agentId);
    try {
        const s = await agentService.sendCommand(agentId, 'gravacao_status', {}, 8000);
        return { conectado: true, recursos, ...s };
    } catch (err) {
        return { conectado: true, recursos, erro: /Comando desconhecido/.test(err.message) ? 'Agente local desatualizado: rode ligar-ia-facial.bat no PC do evento' : err.message };
    }
}

module.exports = {
    PADRAO_EVENTO, configEvento, salvarConfigEvento, registrar, apagadas, marcarAlerta, marcarAlertaArea,
    listar, buscar, registrarAcesso, lerDoAgente, transmitir, statusDoPc
};
