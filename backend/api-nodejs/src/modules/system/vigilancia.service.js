'use strict';

const axios = require('axios');
const { supabase } = require('../../config/supabase');
const logger = require('../../services/logger');

/**
 * Vigilância: alertas das câmeras com o painel FECHADO.
 *
 * O motor de IA do evento mantém as câmeras do evento ligadas e roda a IA quando há movimento,
 * mesmo sem ninguém assistindo. Quem for reconhecido vira uma detecção que chega aqui e passa pela
 * mesma lógica de alerta do Monitor (pessoa bloqueada, watchlist) — ver processarDeteccoesCamera.
 *
 * Dois caminhos até o motor:
 *  - agente local (API na nuvem): o agente recebe a lista de câmeras e envia 'agent:deteccao';
 *  - PYTHON_MICROSERVICE_URL (API no próprio servidor do evento): esta API configura e busca direto.
 */
const IA_URL_DIRETA = process.env.PYTHON_MICROSERVICE_URL || null;
const RECONFIGURAR_MS = 5 * 60 * 1000;

/** Câmeras RTSP ativas do evento com as opções de IA de cada uma (IA ligada, vigilância 24 h, prioridade, sub-stream) */
async function camerasDoEvento(eventoId) {
    const consultar = (campos) => supabase.from('cameras_ip').select(campos).eq('evento_id', eventoId).like('stream_url', 'rtsp%');
    let { data, error } = await consultar('id, nome, status, stream_url, ia_ativa, vigilancia_ativa, prioridade, url_substream');
    if (error && (error.code === '42703' || /column/i.test(error.message))) {
        ({ data, error } = await consultar('id, nome, status, stream_url')); // banco sem a migration 20261028
    }
    if (error) throw error;
    return (data || [])
        .filter(c => c.status !== 'desativada' && c.status !== 'inativa')
        .map(c => ({
            id: c.id,
            nome: c.nome,
            stream_url: c.stream_url,
            ia_ativa: c.ia_ativa !== false,
            vigilancia_ativa: c.vigilancia_ativa !== false,
            prioridade: c.prioridade ?? 1,
            url_substream: c.url_substream || null
        }));
}

/** Envia ao agente a lista de câmeras do evento dele (agente antigo, sem o comando, é ignorado) */
async function configurarAgente(agentId, eventoId) {
    const agentService = require('../../services/agentService');
    if (!eventoId) {
        // Sem evento no token, a lista seria a de todos os eventos: nenhum agente vigia câmeras alheias
        logger.warn(`[Vigilância] agente ${agentId} sem evento vinculado: vigilância desligada`);
        return;
    }
    try {
        const cameras = await camerasDoEvento(eventoId);
        const r = await agentService.sendCommand(agentId, 'vigilancia_configurar', { cameras }, 15000);
        logger.info(`👁️ [Vigilância] agente ${agentId}: ${r?.cameras ?? cameras.length} câmera(s) sob vigilância`);
    } catch (err) {
        if (/Comando desconhecido/.test(err.message)) {
            logger.warn(`[Vigilância] agente ${agentId} é antigo (sem vigilância): atualize o agente local`);
        } else {
            logger.warn(`[Vigilância] falha ao configurar agente ${agentId}: ${err.message}`);
        }
    }
}

/** Câmeras do evento mudaram (cadastro/edição/exclusão): reconfigura quem vigia */
async function eventoAlterado(eventoId) {
    const agentService = require('../../services/agentService');
    const agentId = agentService.findAgentForEvent(eventoId);
    if (agentId) await configurarAgente(agentId, eventoId);
    if (IA_URL_DIRETA) local.proximaConfiguracao = 0;
}

/** Detecção enviada por um agente: só vale para câmera do evento do próprio agente (local: esta API buscou no motor) */
async function receberDeteccao(eventoIdDoAgente, deteccao, { local = false } = {}) {
    if (!deteccao?.camera_id || !Array.isArray(deteccao.results)) return;
    const { data: cam } = await supabase.from('cameras_ip')
        .select('*, area:evento_areas(id, nome_area)')
        .eq('id', deteccao.camera_id).maybeSingle();
    if (!cam || cam.status === 'desativada' || cam.status === 'inativa' || cam.ia_ativa === false) return;
    if (!local && cam.evento_id !== eventoIdDoAgente) {
        logger.warn(`[Vigilância] detecção de câmera de outro evento ignorada (câmera ${cam.id})`);
        return;
    }
    const nomes = deteccao.results.map(r => r.matched_person?.nome).filter(Boolean).join(', ');
    logger.info(`👁️ [Vigilância] ${nomes} reconhecido(s) pela câmera ${cam.nome}`);
    const { processarDeteccoesCamera } = require('./camera.controller');
    await processarDeteccoesCamera(cam, deteccao.results, deteccao.annotated_frame_base64, { origem: 'vigilancia' });
}

// ---- Modo servidor local: esta API fala direto com o motor ----
const local = { desde: 0, inicio: null, proximaConfiguracao: 0, rodando: false };

async function cicloLocal() {
    if (local.rodando) return;
    local.rodando = true;
    try {
        if (Date.now() >= local.proximaConfiguracao) {
            const { data: eventos } = await supabase.from('eventos').select('id').eq('status', 'ativo');
            const cameras = (await Promise.all((eventos || []).map(e => camerasDoEvento(e.id)))).flat();
            await axios.post(`${IA_URL_DIRETA}/api/vigilancia`, { cameras }, { timeout: 10000 });
            const { perfil, ajustes } = await require('./iaConfig.service').obter();
            await axios.post(`${IA_URL_DIRETA}/api/config`, { perfil, ajustes }, { timeout: 10000 }).catch(() => {});
            local.proximaConfiguracao = Date.now() + 30000;
        }
        const { data } = await axios.get(`${IA_URL_DIRETA}/api/vigilancia/deteccoes`, { params: { desde: local.desde, max_idade_s: 60 }, timeout: 5000 });
        if (data.inicio !== undefined && data.inicio !== local.inicio) {
            // Motor reiniciou, ou esta API acabou de subir: só detecções recentes (max_idade_s) viram alerta
            local.inicio = data.inicio;
            local.desde = 0;
            local.proximaConfiguracao = 0;
            return;
        }
        if (data.seq < local.desde) { local.desde = 0; return; } // motor reiniciou
        for (const d of data.deteccoes || []) {
            await receberDeteccao(null, d, { local: true }).catch(err => logger.error(`[Vigilância] ${err.message}`));
            local.desde = d.seq;
        }
    } catch {
        // motor desligado: tenta no próximo ciclo
    } finally {
        local.rodando = false;
    }
}

function iniciar() {
    if (IA_URL_DIRETA) {
        setInterval(cicloLocal, 1500).unref();
        logger.info(`👁️ [Vigilância] modo servidor local: motor em ${IA_URL_DIRETA}`);
    }
    // Agentes conectados: lista renovada periodicamente (câmeras novas, motor reiniciado)
    setInterval(() => {
        const agentService = require('../../services/agentService');
        for (const [agentId, socket] of agentService.agents) configurarAgente(agentId, socket.agentInfo?.evento_id);
    }, RECONFIGURAR_MS).unref();
}

module.exports = { iniciar, configurarAgente, eventoAlterado, receberDeteccao };
