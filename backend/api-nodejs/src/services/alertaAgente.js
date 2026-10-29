const { supabase } = require('../config/supabase');
const logger = require('./logger');

/**
 * Alerta quando o agente local (PC do evento: leitores e câmeras) fica desconectado.
 * Quedas curtas (internet oscilando, deploy da API) não alertam: só depois de 2 min fora.
 * Avisa no painel (tempo real + sino) e por e-mail aos Admin Master; avisa de novo ao voltar.
 */
const ESPERA_MS = parseInt(process.env.AGENTE_ALERTA_APOS_MS || String(2 * 60 * 1000), 10);
const pendentes = new Map(); // agentId → timer
const alertados = new Map(); // agentId → { desde }

const horaLocal = (d) => d.toLocaleString('pt-BR', { timeZone: process.env.TZ || 'America/Sao_Paulo' });

async function avisar(agente, desde) {
    const websocketService = require('./websocketService');
    const notificacaoService = require('../modules/system/notificacao.service');
    const emailService = require('./emailService');

    alertados.set(agente.id, { desde });
    const nome = agente.nome || 'Agente local';
    logger.warn(`🔴 [Agente] ${nome} desconectado há mais de ${Math.round(ESPERA_MS / 60000)} min`);

    websocketService.emit('system:alert', {
        type: 'AGENTE_OFFLINE', severity: 'critical',
        message: `PC do evento desconectado: ${nome}. Leitores e câmeras desse local estão sem comando.`,
        details: { agent_id: agente.id }
    }, 'system_admin');

    if (agente.evento_id) {
        await notificacaoService.criar([{
            evento_id: agente.evento_id,
            tipo: 'AGENTE_OFFLINE',
            severidade: 'critical',
            titulo: `PC do evento desconectado: ${nome}`,
            mensagem: `Sem conexão desde ${horaLocal(desde)}. Confira se o computador do evento está ligado e com internet.`,
            referencia_tipo: 'agente',
            referencia_id: agente.id,
            chave_dedupe: `AGENTE_OFFLINE:${agente.id}:${desde.toISOString()}`
        }]);
    }

    const { data: admins } = await supabase.from('perfis').select('email')
        .eq('nivel_acesso', 'admin_master').neq('status', 'inativo');
    const linkPainel = (process.env.FRONTEND_URL || 'https://painel.nzt.app.br').replace(/\/+$/, '');
    for (const a of admins || []) {
        if (!a.email) continue;
        await emailService.sendAgentOfflineAlert(a.email, { nomeAgente: nome, desde: horaLocal(desde), linkPainel })
            .catch(err => logger.warn(`[Agente] Falha ao avisar ${a.email}: ${err.message}`));
    }
}

/** Chamado no disconnect da conexão vigente do agente. */
function agenteDesconectou(agente, aindaConectado) {
    if (pendentes.has(agente.id) || alertados.has(agente.id)) return;
    const desde = new Date();
    const timer = setTimeout(() => {
        pendentes.delete(agente.id);
        if (aindaConectado()) return; // reconectou nesse meio-tempo
        avisar(agente, desde).catch(err => logger.error(`[Agente] Falha no alerta de desconexão: ${err.message}`));
    }, ESPERA_MS);
    timer.unref();
    pendentes.set(agente.id, timer);
}

/** Chamado a cada conexão do agente. */
function agenteConectou(agente) {
    clearTimeout(pendentes.get(agente.id));
    pendentes.delete(agente.id);

    const alerta = alertados.get(agente.id);
    if (!alerta) return;
    alertados.delete(agente.id);
    const minutos = Math.max(1, Math.round((Date.now() - alerta.desde.getTime()) / 60000));
    logger.info(`🟢 [Agente] ${agente.nome} reconectou após ~${minutos} min`);
    require('./websocketService').emit('system:alert', {
        type: 'AGENTE_ONLINE', severity: 'info',
        message: `PC do evento reconectado: ${agente.nome} (fora por ~${minutos} min).`,
        details: { agent_id: agente.id }
    }, 'system_admin');
}

module.exports = { agenteDesconectou, agenteConectou, ESPERA_MS };
