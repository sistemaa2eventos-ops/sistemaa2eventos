'use strict';

/**
 * Teste de rede a partir da REDE DO EVENTO (ferramenta de rede do painel e "Diagnosticar" das câmeras):
 * ping + porta TCP para um IP ou nome. Substitui o Prompt de Comando da equipe de campo.
 *
 * Caminho: pelo agente do PC do evento (comando rede_testar) ou, quando a própria API roda no servidor
 * do evento (PYTHON_MICROSERVICE_URL definida, ou fora de produção), direto daqui. Na VPS sem agente
 * não testa: o resultado seria da rede da VPS, não da do evento.
 */
const net = require('net');
const dns = require('dns');
const { execFile } = require('child_process');
const agentService = require('../../services/agentService');

const HOST_VALIDO = /^[A-Za-z0-9](?:[A-Za-z0-9.-]{0,251}[A-Za-z0-9])?$/;
const MAX_PORTAS = 10;

const erroHttp = (status, msg) => Object.assign(new Error(msg), { status });
const apiNoEvento = () => !!process.env.PYTHON_MICROSERVICE_URL || process.env.NODE_ENV !== 'production';

/** Valida e normaliza o pedido. Lança erro com status 400. */
function normalizar(host, portas) {
    const alvo = String(host || '').trim().replace(/^[a-z]+:\/\//i, '').replace(/\/.*$/, '');
    if (!HOST_VALIDO.test(alvo)) throw erroHttp(400, 'Informe um IP ou nome válido (ex.: 192.168.1.64).');
    const lista = [...new Set((Array.isArray(portas) ? portas : String(portas || '').split(/[\s,;]+/))
        .filter(p => p !== '' && p !== null && p !== undefined).map(Number))];
    if (lista.some(p => !Number.isInteger(p) || p < 1 || p > 65535)) throw erroHttp(400, 'Portas entre 1 e 65535.');
    if (lista.length > MAX_PORTAS) throw erroHttp(400, `No máximo ${MAX_PORTAS} portas por teste.`);
    return { host: alvo, portas: lista };
}

function tcpAbre(ip, porta, timeoutMs) {
    return new Promise((resolve) => {
        const inicio = Date.now();
        const s = net.connect({ host: ip, port: porta });
        let feito = false;
        const fim = (aberta, erro = null) => {
            if (feito) return;
            feito = true;
            s.destroy();
            resolve({ porta, aberta, ms: aberta ? Date.now() - inicio : null, erro });
        };
        s.once('connect', () => fim(true));
        s.once('error', (err) => fim(false, err.code === 'ECONNREFUSED' ? 'recusada' : (err.code || err.message)));
        setTimeout(() => fim(false, 'sem resposta'), timeoutMs);
    });
}

function pingar(ip) {
    return new Promise((resolve) => {
        const win = process.platform === 'win32';
        const args = win ? ['-n', '1', '-w', '1500', ip] : ['-c', '1', '-W', '2', ip];
        execFile('ping', args, { timeout: 4000, windowsHide: true }, (err, saida = '') => {
            const respondeu = /ttl=/i.test(saida);
            const ms = (String(saida).match(/(?:tempo|time)[=<]\s*(\d+(?:[.,]\d+)?)\s*ms/i) || [])[1];
            resolve({ ok: respondeu, ms: respondeu && ms ? Math.round(parseFloat(ms.replace(',', '.'))) : null, erro: respondeu ? null : 'sem resposta ao ping' });
        });
    });
}

/** Mesmo teste do agente, rodando nesta máquina */
async function testarAqui(host, portas, timeoutMs = 2500) {
    let ip = host;
    if (!net.isIP(host)) {
        try {
            ip = (await dns.promises.lookup(host)).address;
        } catch {
            return { host, ip: null, resolvido: false, ping: { ok: false, ms: null, erro: 'nome não encontrado' }, portas: portas.map(p => ({ porta: p, aberta: false, ms: null, erro: 'nome não encontrado' })) };
        }
    }
    const [ping, ...resultado] = await Promise.all([pingar(ip), ...portas.map(p => tcpAbre(ip, p, timeoutMs))]);
    return { host, ip, resolvido: true, ping, portas: resultado, pc: 'servidor do evento' };
}

/**
 * @param {object} p { eventoId, agentId?, host, portas, timeoutMs? }
 * @returns resultado + { origem: 'agente'|'servidor' }
 */
async function testar({ eventoId, agentId = null, host, portas = [], timeoutMs = 2500 }) {
    const pedido = normalizar(host, portas);
    // Agente escolhido precisa ser do evento (não dá para testar a rede de outro evento)
    const escolhido = agentId && agentService.agents.get(agentId)?.agentInfo?.evento_id === eventoId ? agentId : null;
    if (agentId && !escolhido) throw erroHttp(404, 'Este agente não está conectado ou não é deste evento.');
    const agente = escolhido || agentService.findAgentForEvent(eventoId);
    if (agente && agentService.agents.has(agente)) {
        try {
            const r = await agentService.sendCommand(agente, 'rede_testar', { ...pedido, timeoutMs }, timeoutMs + 8000);
            return { ...r, origem: 'agente' };
        } catch (err) {
            if (/Comando desconhecido/i.test(err.message)) {
                throw erroHttp(409, 'O agente do PC do evento é de uma versão antiga e não faz teste de rede. No PC do evento, rode ligar-ia-facial.bat para atualizar.');
            }
            throw erroHttp(502, `O PC do evento não conseguiu testar: ${err.message}`);
        }
    }
    if (apiNoEvento()) return { ...(await testarAqui(pedido.host, pedido.portas, timeoutMs)), origem: 'servidor' };
    throw erroHttp(409, 'Nenhum PC do evento conectado: o teste precisa rodar dentro da rede do evento. No PC do evento, rode ligar-ia-facial.bat.');
}

module.exports = { testar, normalizar, testarAqui };
