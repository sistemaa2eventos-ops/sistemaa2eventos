'use strict';

/**
 * Último resumo de saúde do vídeo enviado por cada agente local (PC do evento).
 * Fica só em memória: é um retrato de agora, não histórico. Sem envio há mais de VALIDADE_MS,
 * o agente aparece como "sem dados" no painel.
 */
const VALIDADE_MS = 30000;
const MAX_CAMERAS = 32;
const porAgente = new Map(); // agentId -> { agente, motor, retransmissor, cameras, recebido_em }

const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);

function registrar(agentId, nomeAgente, dados = {}) {
    const cameras = (Array.isArray(dados.cameras) ? dados.cameras : []).slice(0, MAX_CAMERAS).map(c => ({
        nome: String(c.nome || '').slice(0, 80),
        camera_id: c.camera_id ? String(c.camera_id) : null,
        fps: num(c.fps),
        conectada: !!c.conectada,
        reconexoes: num(c.reconexoes),
        resolucao: String(c.resolucao || '').slice(0, 20),
        ia_ms: num(c.ia_ms),
        rostos: num(c.rostos),
    }));
    porAgente.set(String(agentId), {
        agente: String(nomeAgente || 'Agente local').slice(0, 80),
        motor: !!dados.motor,
        retransmissor: !!dados.retransmissor,
        cameras,
        recebido_em: Date.now(),
    });
}

/** Lista para o painel: idade do último envio e se ainda está valendo */
function resumo() {
    const agora = Date.now();
    return [...porAgente.entries()].map(([agente_id, d]) => ({
        agente_id,
        agente: d.agente,
        motor: d.motor,
        retransmissor: d.retransmissor,
        cameras: d.cameras,
        idade_s: Math.round((agora - d.recebido_em) / 1000),
        ok: agora - d.recebido_em < VALIDADE_MS,
    }));
}

module.exports = { registrar, resumo, VALIDADE_MS };
