'use strict';

const axios = require('axios');
const { supabase } = require('../../config/supabase');
const logger = require('../../services/logger');

/**
 * Configuração da IA facial e do vídeo das câmeras (Configurações > IA facial e câmeras).
 *
 * Guardada em system_settings.config.ia_facial (sem tabela nova):
 *  - perfil: 'leve' | 'equilibrado' | 'maximo'
 *  - ajustes: sobrescreve valores do perfil no motor (limiar, fps da IA, tamanho mínimo do rosto...)
 *  - video / painel: fps, largura e qualidade do vídeo, limite de vídeos ao vivo, alertas
 *
 * O motor recebe { perfil, ajustes } pelo agente ('ia_config'); o vídeo e o painel são aplicados aqui
 * e no navegador.
 */
const IA_URL_DIRETA = process.env.PYTHON_MICROSERVICE_URL || null;
const CACHE_MS = 30000;

// Vídeo e painel por perfil (a parte de IA de cada perfil vive no motor: src/main.py → PERFIS)
const PERFIS = {
    leve: {
        video: { mini: { fps: 4, max_width: 480, quality: 50 }, foco: { fps: 10, max_width: 960, quality: 65 } },
        painel: { max_streams_ao_vivo: 6 }
    },
    equilibrado: {
        video: { mini: { fps: 6, max_width: 480, quality: 55 }, foco: { fps: 12, max_width: 1280, quality: 70 } },
        painel: { max_streams_ao_vivo: 9 }
    },
    maximo: {
        video: { mini: { fps: 8, max_width: 640, quality: 60 }, foco: { fps: 15, max_width: 1280, quality: 75 } },
        painel: { max_streams_ao_vivo: 16 }
    }
};
const PAINEL_COMUM = { som_alerta: true, alerta_repetir_s: 30, rastreamento_expira_min: 120 };

// Ajustes do motor aceitos pelo painel (validados de novo no motor)
const AJUSTES_IA = [
    'limiar', 'margem', 'confirmacoes', 'min_face_px', 'min_det_score', 'min_nitidez', 'max_yaw', 'reconhecer_s',
    'ia_fps_total', 'ia_fps_foco', 'ia_fps_mini', 'ia_fps_vigilancia', 'det_size', 'ia_stream', 'movimento', 'aprender',
    'cena_parada_s', 'vigilancia_repetir_s'
];

const limitar = (v, min, max, padrao) => {
    const n = Number(v);
    return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : padrao;
};

/** Junta o perfil com o que foi salvo, sempre devolvendo todos os campos com valores válidos */
function normalizar(salvo = {}) {
    const perfil = PERFIS[salvo.perfil] ? salvo.perfil : 'equilibrado';
    const base = PERFIS[perfil];
    const video = {};
    for (const q of ['mini', 'foco']) {
        const s = salvo.video?.[q] || {};
        video[q] = {
            fps: limitar(s.fps, 1, 30, base.video[q].fps),
            max_width: limitar(s.max_width, 320, 1920, base.video[q].max_width),
            quality: limitar(s.quality, 30, 90, base.video[q].quality)
        };
    }
    const p = salvo.painel || {};
    const painel = {
        max_streams_ao_vivo: limitar(p.max_streams_ao_vivo, 1, 16, base.painel.max_streams_ao_vivo),
        som_alerta: p.som_alerta !== undefined ? p.som_alerta !== false : PAINEL_COMUM.som_alerta,
        alerta_repetir_s: limitar(p.alerta_repetir_s, 5, 3600, PAINEL_COMUM.alerta_repetir_s),
        rastreamento_expira_min: limitar(p.rastreamento_expira_min, 5, 1440, PAINEL_COMUM.rastreamento_expira_min)
    };
    const ajustes = {};
    for (const k of AJUSTES_IA) {
        if (salvo.ajustes?.[k] !== undefined && salvo.ajustes[k] !== null && salvo.ajustes[k] !== '') ajustes[k] = salvo.ajustes[k];
    }
    // O intervalo de repetição de alerta do painel também vale para as detecções do motor
    ajustes.vigilancia_repetir_s = painel.alerta_repetir_s;
    return { perfil, ajustes, video, painel, atualizado_em: salvo.atualizado_em || null, atualizado_por: salvo.atualizado_por || null };
}

let cache = { valor: null, ate: 0 };

async function lerConfigSistema() {
    const { data, error } = await supabase.from('system_settings').select('config').eq('id', 1).maybeSingle();
    if (error) throw error;
    return data?.config || {};
}

async function obter() {
    if (cache.valor && Date.now() < cache.ate) return cache.valor;
    try {
        cache = { valor: normalizar((await lerConfigSistema()).ia_facial), ate: Date.now() + CACHE_MS };
    } catch (err) {
        logger.warn(`[IA config] usando padrão (${err.message})`);
        cache = { valor: normalizar(), ate: Date.now() + 5000 };
    }
    return cache.valor;
}

/** Valor em memória, sem esperar o banco (para regras síncronas); renova o cache em segundo plano */
function atual() {
    if (!cache.valor || Date.now() >= cache.ate) obter().catch(() => {});
    return cache.valor || normalizar();
}

async function salvar(dados, usuario) {
    const config = await lerConfigSistema();
    const nova = normalizar({
        ...dados,
        atualizado_em: new Date().toISOString(),
        atualizado_por: usuario?.email || usuario?.id || null
    });
    const { error } = await supabase.from('system_settings').update({ config: { ...config, ia_facial: nova } }).eq('id', 1);
    if (error) throw error;
    cache = { valor: nova, ate: Date.now() + CACHE_MS };
    await aplicarEmTodos();
    return nova;
}

/** Envia perfil e ajustes ao motor de um agente (chamado ao conectar e ao salvar) */
async function aplicarNoAgente(agentId) {
    const agentService = require('../../services/agentService');
    const { perfil, ajustes } = await obter();
    try {
        await agentService.sendCommand(agentId, 'ia_config', { perfil, ajustes }, 15000);
    } catch (err) {
        if (/Comando desconhecido/.test(err.message)) logger.warn(`[IA config] agente ${agentId} é antigo: atualize o agente local`);
        else logger.debug(`[IA config] agente ${agentId}: ${err.message}`);
    }
}

async function aplicarEmTodos() {
    const agentService = require('../../services/agentService');
    await Promise.all([...agentService.agents.keys()].map(aplicarNoAgente));
    if (IA_URL_DIRETA) {
        const { perfil, ajustes } = await obter();
        await axios.post(`${IA_URL_DIRETA}/api/config`, { perfil, ajustes }, { timeout: 10000 })
            .catch(err => logger.debug(`[IA config] motor direto: ${err.message}`));
    }
}

/** Status do motor do evento (GPU, fps e IA por câmera) */
async function status(eventoId) {
    if (IA_URL_DIRETA) {
        const { data } = await axios.get(`${IA_URL_DIRETA}/api/engine/status`, { timeout: 5000 });
        return data;
    }
    const agentService = require('../../services/agentService');
    const agentId = agentService.findAgentForEvent(eventoId);
    if (!agentId) {
        const err = new Error('Nenhum agente local conectado para este evento');
        err.status = 503;
        throw err;
    }
    return agentService.sendCommand(agentId, 'ia_status', {}, 8000);
}

module.exports = { PERFIS, obter, atual, salvar, aplicarNoAgente, aplicarEmTodos, status, normalizar };
