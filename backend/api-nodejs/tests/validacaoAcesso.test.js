/**
 * Validação de acesso com menos idas ao banco: o último log buscado pelo toggle
 * é reaproveitado no anti-passback, e as estatísticas antigas não seguram a catraca.
 * Banco simulado — nada é gravado de verdade.
 */

let consultasLogs = 0;
let ultimoLog = null;

const builder = (tabela) => {
    const b = {
        select: () => b, eq: () => b, in: () => b, or: () => b, order: () => b, limit: () => b, neq: () => b,
        gte: () => b, lte: () => b,
        maybeSingle: () => {
            if (tabela === 'logs_acesso') consultasLogs++;
            return Promise.resolve({ data: tabela === 'logs_acesso' ? ultimoLog : null, error: null });
        },
        single: () => Promise.resolve({ data: {}, error: null }),
        then: (ok) => ok({ data: [], error: null })
    };
    return b;
};

jest.mock('../src/config/supabase', () => ({ supabase: { from: (t) => builder(t) } }));
jest.mock('../src/middleware/eventMiddleware', () => ({
    buscarEvento: jest.fn(async () => ({ evento: { id: 'e1', min_face_score: 70 } }))
}));
jest.mock('../src/services/logger', () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() }));

const ValidationService = require('../src/modules/checkin/services/validation.service');

beforeEach(() => {
    consultasLogs = 0;
    ultimoLog = null;
});

describe('último log reaproveitado', () => {
    it('toggle + anti-passback fazem UMA consulta de logs (antes eram duas)', async () => {
        ultimoLog = { tipo: 'checkin', created_at: new Date(Date.now() - 60 * 60 * 1000).toISOString() };
        const ctx = {};
        const tipo = await ValidationService.determineSmartAccessType('p1', 'e1', null, 'a1', ctx);
        expect(tipo).toBe('checkout');
        await ValidationService.validateAntiPassback('e1', 'p1', tipo, 'facial', 15, 'a1', new Date(), ctx.ultimoLog);
        expect(consultasLogs).toBe(1);
    });

    it('sem log anterior, o "nenhum log" também é reaproveitado (não consulta de novo)', async () => {
        const ctx = {};
        const tipo = await ValidationService.determineSmartAccessType('p1', 'e1', null, null, ctx);
        expect(tipo).toBe('checkin');
        expect(ctx.ultimoLog).toBeNull();
        await ValidationService.validateAntiPassback('e1', 'p1', tipo, 'facial', 15, null, new Date(), ctx.ultimoLog);
        expect(consultasLogs).toBe(1);
    });

    it('tipo forçado (sem toggle) ainda consulta no anti-passback e bloqueia passagem dupla', async () => {
        ultimoLog = { tipo: 'checkin', created_at: new Date(Date.now() - 2 * 60 * 1000).toISOString() };
        const ctx = {};
        await ValidationService.determineSmartAccessType('p1', 'e1', 'checkin', null, ctx);
        await expect(ValidationService.validateAntiPassback('e1', 'p1', 'checkin', 'facial', 15, null, new Date(),
            'ultimoLog' in ctx ? ctx.ultimoLog : undefined)).rejects.toMatchObject({ is_passback_cooldown: true });
        expect(consultasLogs).toBe(1);
    });
});

describe('estatísticas de lotação', () => {
    it('valor antigo responde na hora e recalcula em segundo plano', async () => {
        let chamadas = 0;
        let liberar;
        const espy = jest.spyOn(ValidationService, 'getRealtimeStatsInternal').mockImplementation(() => {
            chamadas++;
            if (chamadas === 1) return Promise.resolve({ presentes: 1, capacidade: 10, empresas: [] });
            return new Promise((r) => { liberar = () => r({ presentes: 2, capacidade: 10, empresas: [] }); });
        });

        const primeira = await ValidationService._getStatsParaValidacao('ev-stats');
        expect(primeira.presentes).toBe(1);

        const agora = Date.now();
        const relogio = jest.spyOn(Date, 'now').mockReturnValue(agora + 11000); // passou dos 10 s
        const segunda = await ValidationService._getStatsParaValidacao('ev-stats');
        expect(segunda.presentes).toBe(1); // não esperou a recontagem
        expect(chamadas).toBe(2);

        await ValidationService._getStatsParaValidacao('ev-stats');
        expect(chamadas).toBe(2); // recontagem já em andamento não dispara outra

        liberar();
        await new Promise((r) => setImmediate(r));
        const terceira = await ValidationService._getStatsParaValidacao('ev-stats');
        expect(terceira.presentes).toBe(2);

        relogio.mockRestore();
        espy.mockRestore();
    });
});
