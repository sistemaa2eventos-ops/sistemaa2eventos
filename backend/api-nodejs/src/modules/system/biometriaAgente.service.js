'use strict';

const { supabase } = require('../../config/supabase');
const logger = require('../../services/logger');
const { caminhoDeStorage, baixarArquivo, BUCKETS_FOTO } = require('../../services/storageSeguro');

/**
 * Biometrias para o motor de IA do evento SEM a chave de serviço do banco no PC do evento.
 *
 * O agente pede ('agent:rostos') e recebe só as pessoas do evento dele, mais quem está na lista de
 * observação ativa (watchlist é global: a pessoa pode estar cadastrada em outro evento). Modos:
 *   ids     → todos os ids válidos (o motor tira do índice quem não estiver na lista)
 *   pessoas → dados + vetor dos ids pedidos (no máximo 200)
 *   desde   → o que mudou desde a última vez (nome, bloqueio, status, rosto) — coluna
 *             biometria_atualizada_em, da migration 20261111
 *
 * Também gera, pelo agente, a biometria de quem tem foto e ainda não tem vetor (antes o motor fazia
 * isso lendo e gravando direto no banco).
 */
const CAMPOS = 'id, nome_completo, cpf, status_acesso, bloqueado, foto_url, face_encoding, evento_id, biometria_atualizada_em';
const CAMPOS_SEM_DATA = 'id, nome_completo, cpf, status_acesso, bloqueado, foto_url, face_encoding, evento_id';
const LOTE = 200;
const colunaInexistente = (error) => error?.code === '42703' || /biometria_atualizada_em/.test(error?.message || '');

const soDigitos = (cpf) => String(cpf || '').replace(/\D/g, '');
const cpfFormatado = (d) => (d.length === 11 ? d.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4') : d);

let cacheWatchlist = { ate: 0, cpfs: [] };
async function cpfsDaWatchlist() {
    if (Date.now() < cacheWatchlist.ate) return cacheWatchlist.cpfs;
    const { data, error } = await supabase.from('watchlist').select('cpf').eq('ativo', true).limit(1000); // teto do PostgREST
    if (error) {
        logger.debug(`[Biometria] watchlist: ${error.message}`);
        return cacheWatchlist.cpfs;
    }
    const cpfs = [...new Set((data || []).map(w => soDigitos(w.cpf)).filter(c => c.length >= 11))];
    cacheWatchlist = { ate: Date.now() + 5 * 60000, cpfs };
    return cpfs;
}

/** Pessoas de outros eventos que estão na watchlist (uma por CPF, com biometria) */
/** CPFs (só dígitos) de quem já está cadastrado neste evento */
async function cpfsDoEvento(eventoId) {
    const cpfs = new Set();
    for (let de = 0; ; de += 1000) {
        // Só quem tem rosto no índice conta: cadastro do evento sem biometria não pode tirar a versão da watchlist
        const { data, error } = await supabase.from('pessoas').select('cpf')
            .eq('evento_id', eventoId).not('face_encoding', 'is', null).order('id').range(de, de + 999);
        if (error) throw error;
        for (const p of data || []) { const c = soDigitos(p.cpf); if (c) cpfs.add(c); }
        if (!data || data.length < 1000) break;
    }
    return cpfs;
}

async function idsWatchlistForaDoEvento(eventoId) {
    const cpfs = await cpfsDaWatchlist();
    if (!cpfs.length) return [];
    // Quem já está no evento não entra de novo pela watchlist: duas entradas da mesma pessoa no índice
    // deixam s1 e s2 iguais e a margem de reconhecimento nunca passa
    const doEvento = await cpfsDoEvento(eventoId);
    const formas = cpfs.filter(c => !doEvento.has(c)).flatMap(c => [c, cpfFormatado(c)]);
    if (!formas.length) return [];
    const ids = [];
    const vistos = new Set();
    for (let i = 0; i < formas.length; i += 300) {
        const { data } = await supabase.from('pessoas').select('id, cpf, evento_id')
            .in('cpf', formas.slice(i, i + 300)).not('face_encoding', 'is', null)
            .order('created_at', { ascending: false });
        for (const p of data || []) {
            const c = soDigitos(p.cpf);
            if (p.evento_id === eventoId || vistos.has(c)) continue;
            vistos.add(c);
            ids.push(p.id);
        }
    }
    return ids;
}

/** Pessoas reconhecíveis por este evento (do evento ou trazidas pela watchlist) que estão na watchlist ativa */
async function alvosDaWatchlist(eventoId) {
    const { data: lista, error } = await supabase.from('watchlist').select('cpf, motivo, nivel_alerta')
        .eq('ativo', true).limit(1000);
    if (error) throw error;
    const porCpf = new Map();
    for (const w of lista || []) {
        const c = soDigitos(w.cpf);
        if (c.length >= 11) porCpf.set(c, { motivo: w.motivo || null, nivel: w.nivel_alerta || 'alto' });
    }
    if (!porCpf.size) return [];
    const extras = new Set(await idsWatchlistForaDoEvento(eventoId));
    const formas = [...porCpf.keys()].flatMap(c => [c, cpfFormatado(c)]);
    const alvos = [];
    for (let i = 0; i < formas.length; i += 300) {
        const { data, error: erro } = await supabase.from('pessoas').select('id, cpf, evento_id')
            .in('cpf', formas.slice(i, i + 300)).not('face_encoding', 'is', null);
        if (erro) throw erro;
        for (const p of data || []) {
            if (p.evento_id !== eventoId && !extras.has(p.id)) continue;
            const w = porCpf.get(soDigitos(p.cpf));
            if (w) alvos.push({ pessoa_id: p.id, ...w });
        }
    }
    return alvos;
}

async function idsDoEvento(eventoId) {
    const ids = [];
    for (let de = 0; ; de += 1000) {
        const { data, error } = await supabase.from('pessoas').select('id')
            .eq('evento_id', eventoId).not('face_encoding', 'is', null)
            .order('id').range(de, de + 999);
        if (error) throw error;
        ids.push(...(data || []).map(p => p.id));
        if (!data || data.length < 1000) break;
    }
    return ids;
}

/**
 * O motor põe cada pessoa no índice do evento indicado em evento_id (a câmera só compara com o próprio
 * evento). Por isso TODA pessoa segue com o evento do agente: os da watchlist de outro evento entram
 * como se fossem deste, que é o que a watchlist pede (reconhecer a pessoa neste evento também).
 */
const paraMotor = (p, eventoId) => ({
    id: p.id, nome_completo: p.nome_completo, cpf: p.cpf, status_acesso: p.status_acesso,
    bloqueado: !!p.bloqueado, foto_url: p.foto_url, face_encoding: p.face_encoding,
    evento_id: eventoId
});

async function atender(agentInfo, pedido = {}) {
    const eventoId = agentInfo?.evento_id;
    // Sem evento no token, a lista seria a de todos os eventos: nenhum agente recebe rostos alheios
    if (!eventoId) return { ok: false, erro: 'agente sem evento vinculado' };

    if (pedido.modo === 'ids') {
        const ate = new Date(Date.now() - 5000).toISOString(); // margem para gravações simultâneas
        const [doEvento, extras] = await Promise.all([idsDoEvento(eventoId), idsWatchlistForaDoEvento(eventoId)]);
        return { ok: true, ids: [...doEvento, ...extras], ate };
    }

    if (pedido.modo === 'watchlist') {
        // Quem, entre as pessoas que este agente reconhece, está na watchlist: a Central local marca o
        // alerta no mesmo quadro, sem esperar a ida e volta pela VPS. Só ids de pessoa (o PC já tem os
        // dados delas no motor), com motivo e nível do alerta.
        return { ok: true, alvos: await alvosDaWatchlist(eventoId) };
    }

    if (pedido.modo === 'pessoas') {
        const ids = (Array.isArray(pedido.ids) ? pedido.ids : []).slice(0, LOTE);
        if (!ids.length) return { ok: true, pessoas: [] };
        const { data, error } = await supabase.from('pessoas').select(CAMPOS_SEM_DATA).in('id', ids);
        if (error) throw error;
        const extras = new Set(await idsWatchlistForaDoEvento(eventoId));
        const pessoas = (data || []).filter(p => p.evento_id === eventoId || extras.has(p.id)).map(p => paraMotor(p, eventoId));
        return { ok: true, pessoas };
    }

    if (pedido.modo === 'desde') {
        // Repassa o carimbo como veio do banco (microssegundos): converter em Date truncava para
        // milissegundos e o mesmo lote voltava a cada página
        const desde = typeof pedido.desde === 'string' ? pedido.desde : null;
        if (!desde || !/^\d{4}-\d{2}-\d{2}T[\d:.]+(Z|[+-]\d{2}:?\d{2})?$/.test(desde) || Number.isNaN(Date.parse(desde))) {
            return { ok: false, erro: 'data inválida' };
        }
        const { data, error } = await supabase.from('pessoas').select(CAMPOS)
            .eq('evento_id', eventoId).gt('biometria_atualizada_em', desde)
            .order('biometria_atualizada_em', { ascending: true }).limit(LOTE);
        if (error) {
            if (colunaInexistente(error)) return { ok: false, erro: 'migration 20261111 pendente (sincronização completa a cada 15 min)' };
            throw error;
        }
        const lista = data || [];
        return {
            ok: true,
            // face_encoding nulo: o motor tira a pessoa do índice
            pessoas: lista.map(p => paraMotor(p, eventoId)),
            ate: lista.length ? lista[lista.length - 1].biometria_atualizada_em : pedido.desde,
            mais: lista.length === LOTE
        };
    }
    return { ok: false, erro: 'modo desconhecido' };
}

// ------------------------------------------------------------------ biometrias pendentes
const falhas = new Map(); // pessoa_id → foto_url que já falhou (não tenta de novo a mesma foto)

/** Só fotos do armazenamento do próprio sistema (a API não busca endereço qualquer cadastrado) */
function fotoPermitida(url) {
    try {
        const u = new URL(url);
        const supa = new URL(process.env.SUPABASE_URL || 'http://invalido');
        return u.protocol === 'https:' && u.host === supa.host && u.pathname.startsWith('/storage/v1/object/');
    } catch {
        return false;
    }
}

async function fotoEmBase64(url) {
    // Só fotos do storage do sistema (regra mantida); baixadas com service role, valendo com bucket privado
    if (!fotoPermitida(url) || !caminhoDeStorage(url, { buckets: BUCKETS_FOTO })) throw new Error('foto fora do armazenamento do sistema');
    const buf = await baixarArquivo(url, { buckets: BUCKETS_FOTO });
    if (buf.length > 8e6) throw new Error('foto grande demais');
    return buf.toString('base64');
}

async function gerarPendentes(agentId, eventoId) {
    const agentService = require('../../services/agentService');
    const { data } = await supabase.from('pessoas').select('id, nome_completo, foto_url')
        .eq('evento_id', eventoId).is('face_encoding', null).not('foto_url', 'is', null).limit(40);
    const pendentes = (data || []).filter(p => fotoPermitida(p.foto_url) && falhas.get(p.id) !== p.foto_url).slice(0, 8);
    for (const p of pendentes) {
        try {
            const image_base64 = await fotoEmBase64(p.foto_url);
            const r = await agentService.sendCommand(agentId, 'ia_post',
                { path: '/api/extract', body: { image_base64, skip_liveness: true }, timeoutMs: 20000 }, 25000);
            const emb = r?.json?.embedding;
            if (!r?.ok || !r.json?.success || r.json.mock || !Array.isArray(emb) || emb.length !== 512) {
                falhas.set(p.id, p.foto_url);
                if (r?.json?.message) logger.warn(`[Biometria] foto de ${p.nome_completo} recusada: ${r.json.message}`);
                continue;
            }
            const { error } = await supabase.from('pessoas').update({ face_encoding: emb }).eq('id', p.id).is('face_encoding', null);
            if (error) throw error;
            logger.info(`🧬 [Biometria] gerada pelo motor do evento: ${p.nome_completo}`);
        } catch (err) {
            if (/Motor de IA|desligado|não está conectado|Timeout/.test(err.message)) return; // motor fora: tenta no próximo ciclo
            falhas.set(p.id, p.foto_url);
            logger.warn(`[Biometria] ${p.nome_completo}: ${err.message}`);
        }
    }
    if (falhas.size > 20000) falhas.clear();
}

let rodando = false;
async function ciclo() {
    if (rodando) return;
    rodando = true;
    try {
        const agentService = require('../../services/agentService');
        for (const [agentId, socket] of agentService.agents) {
            const eventoId = socket.agentInfo?.evento_id;
            if (!eventoId || !socket.recursos?.rostos_pelo_agente) continue;
            await gerarPendentes(agentId, eventoId).catch(err => logger.debug(`[Biometria] pendentes: ${err.message}`));
        }
    } finally {
        rodando = false;
    }
}

function iniciar() {
    setInterval(ciclo, 60000).unref();
}

module.exports = { atender, iniciar, fotoEmBase64, alvosDaWatchlist };
