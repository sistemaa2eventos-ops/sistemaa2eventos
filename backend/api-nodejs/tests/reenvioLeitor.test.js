/**
 * Modo online: passagem antiga reenviada pelo leitor ao reconectar não vira acesso de agora.
 */
jest.mock('../src/services/logger', () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() }));
jest.mock('../src/config/supabase', () => {
    const q = { select: () => q, eq: () => q, order: () => q, limit: () => q, maybeSingle: async () => ({ data: null }), single: async () => ({ data: null }) };
    return { supabase: { from: () => q } };
});

const controller = require('../src/modules/devices/intelbras.controller');
const agora = () => Math.floor(Date.now() / 1000);
const chamar = (data) => new Promise((resolve) => {
    const req = { body: { id: 7, Events: [{ Code: 'AccessControl', Data: { UserID: '12345678909', ErrorCode: 0, ...data } }] }, query: { token: 'x' }, headers: {}, ip: '1.2.3.4' };
    controller.handleOnlineMode(req, { json: resolve, status() { return this; } });
});

it('passagem de 3 dias atrás é recusada como registro antigo', async () => {
    const r = await chamar({ UTC: agora() - 3 * 86400, CreateTime: agora() - 3 * 86400 });
    expect(r).toMatchObject({ id: 7, auth: 'false', message: 'REGISTRO ANTIGO' });
});

it('passagem de agora segue o fluxo normal (aqui: leitor desconhecido)', async () => {
    const r = await chamar({ UTC: agora(), CreateTime: agora() });
    expect(r.message).not.toBe('REGISTRO ANTIGO');
});

it('evento sem horário (firmware antigo) segue o fluxo normal', async () => {
    const r = await chamar({});
    expect(r.message).not.toBe('REGISTRO ANTIGO');
});
