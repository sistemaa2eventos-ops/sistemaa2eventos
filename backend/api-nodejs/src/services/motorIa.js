'use strict';

/**
 * Comunicação da API com o motor de IA facial (microservice-face-python, POST /api/rostos).
 *
 * O motor é alcançado de duas formas (mesma regra de camera.controller):
 *  1. direto, em PYTHON_MICROSERVICE_URL (API no mesmo servidor do motor); fora de produção, localhost:8000;
 *  2. pelo agente local de cada evento conectado (comando ia_post, caminho /api/rostos).
 * A chave interna (IA_CHAVE_INTERNA) vai no cabeçalho X-IA-Chave, só no envio direto.
 */

const axios = require('axios');
const agentService = require('./agentService');
const logger = require('./logger');

const TIMEOUT_MS = 8000;

const urlDiretaDoMotor = () => process.env.PYTHON_MICROSERVICE_URL
    || (process.env.NODE_ENV === 'production' ? null : 'http://localhost:8000');

const cabecalhosIa = () => (process.env.IA_CHAVE_INTERNA ? { 'X-IA-Chave': process.env.IA_CHAVE_INTERNA } : {});

/**
 * Pede ao motor que tire estas pessoas do índice facial (lista "remover" de /api/rostos).
 * Envia para o motor direto e para todos os agentes conectados (a pessoa pode estar no índice
 * de outro evento pela watchlist). Nunca lança: falhas voltam na contagem para quem chama logar.
 * @param {string[]} ids ids de pessoas
 * @returns {Promise<{ enviados: number, falhas: number }>}
 */
async function removerPessoasDoMotor(ids = []) {
    const lista = [...new Set((Array.isArray(ids) ? ids : []).filter(Boolean).map(String))];
    if (!lista.length) return { enviados: 0, falhas: 0 };

    const corpo = { pessoas: [], remover: lista };
    let enviados = 0;
    let falhas = 0;

    const url = urlDiretaDoMotor();
    if (url) {
        try {
            await axios.post(`${url}/api/rostos`, corpo, { timeout: TIMEOUT_MS, headers: cabecalhosIa() });
            enviados++;
        } catch (err) {
            falhas++;
            logger.warn(`[Motor IA] remoção direta falhou: ${err.message}`);
        }
    }

    // Em paralelo: um agente travado não atrasa os outros (nem a anonimização por mais que um timeout)
    const resultados = await Promise.allSettled([...agentService.agents.keys()].map(async (agentId) => {
        const r = await agentService.sendCommand(agentId, 'ia_post',
            { path: '/api/rostos', body: corpo, timeoutMs: TIMEOUT_MS }, TIMEOUT_MS + 1000);
        if (!r?.ok) throw new Error(`agente ${agentId} recusou a remoção (HTTP ${r?.status})`);
    }));
    for (const r of resultados) {
        if (r.status === 'fulfilled') enviados++;
        else {
            falhas++;
            logger.warn(`[Motor IA] remoção pelo agente falhou: ${r.reason?.message || r.reason}`);
        }
    }

    if (enviados === 0) {
        logger.warn(`[Motor IA] nenhum motor recebeu a remoção de ${lista.length} pessoa(s) (${falhas} falha(s); sem motor direto e sem agente conectado = 0)`);
    }

    return { enviados, falhas };
}

module.exports = { removerPessoasDoMotor };
