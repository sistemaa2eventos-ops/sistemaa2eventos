/**
 * Alerta de PC do evento desconectado: só depois do tempo de espera, uma vez por queda,
 * e nada se o agente voltar antes.
 */
process.env.AGENTE_ALERTA_APOS_MS = '1000';

const emitidos = [];
const notificacoes = [];
const emails = [];
jest.mock('../src/services/websocketService', () => ({ emit: (evento, dados) => emitidos.push(dados) }));
jest.mock('../src/modules/system/notificacao.service', () => ({ criar: async (n) => { notificacoes.push(...n); return n; } }));
jest.mock('../src/services/emailService', () => ({ sendAgentOfflineAlert: async (email) => { emails.push(email); } }));
jest.mock('../src/services/logger', () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() }));
jest.mock('../src/config/supabase', () => {
    const q = { select: () => q, eq: () => q, neq: () => Promise.resolve({ data: [{ email: 'admin@x' }] }) };
    return { supabase: { from: () => q } };
});

const alerta = require('../src/services/alertaAgente');
const agente = { id: 'ag1', nome: 'PC portaria', evento_id: 'ev1' };
const esperar = (ms) => new Promise(r => setTimeout(r, ms));

beforeEach(() => { emitidos.length = 0; notificacoes.length = 0; emails.length = 0; });

it('voltou antes do tempo: nenhum alerta', async () => {
    let conectado = false;
    alerta.agenteDesconectou(agente, () => conectado);
    await esperar(300);
    conectado = true;
    alerta.agenteConectou(agente);
    await esperar(1200);
    expect(emitidos).toHaveLength(0);
    expect(emails).toHaveLength(0);
});

it('fora por mais tempo: alerta 1 vez (painel, sino e e-mail) e avisa quando volta', async () => {
    alerta.agenteDesconectou(agente, () => false);
    alerta.agenteDesconectou(agente, () => false); // desconexão repetida não duplica
    await esperar(1300);
    expect(emitidos.map(e => e.type)).toEqual(['AGENTE_OFFLINE']);
    expect(notificacoes).toHaveLength(1);
    expect(emails).toEqual(['admin@x']);

    alerta.agenteConectou(agente);
    expect(emitidos.map(e => e.type)).toEqual(['AGENTE_OFFLINE', 'AGENTE_ONLINE']);
});
