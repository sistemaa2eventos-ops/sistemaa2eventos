/**
 * Monitor (POST /monitor/watchlist): CPF inválido não é gravado.
 * "abc" gravava CPF vazio e "123" gravava CPF parcial. Agora: 400 e nenhum upsert.
 * CPF com máscara válido é gravado só com os 11 dígitos. Banco simulado; nada é gravado de verdade.
 */

const mockDb = { upserts: [] };

function mockConstruir(tabela) {
    let carga = null;
    const q = {
        select: () => q,
        upsert: (linhas) => { carga = linhas; return q; },
        single: async () => {
            mockDb.upserts.push({ tabela, linhas: carga });
            return { data: carga[0], error: null };
        }
    };
    return q;
}

jest.mock('../src/config/supabase', () => ({ supabase: { from: (t) => mockConstruir(t) } }));
jest.mock('../src/utils/buscarTodos', () => ({ buscarTodos: jest.fn(async () => []) }));
jest.mock('../src/config/pgEdge', () => ({ testPgConnection: jest.fn(async () => true) }));
jest.mock('../src/modules/devices/sync.service', () => ({}));
jest.mock('../src/services/cacheService', () => ({}));
jest.mock('../src/middleware/auth', () => ({ extractRole: jest.fn(() => null) }));
jest.mock('../src/services/logger', () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() }));

const controller = require('../src/modules/system/monitor.controller');

const resposta = () => {
    const res = { statusCode: 200, corpo: null };
    res.status = (c) => { res.statusCode = c; return res; };
    res.json = (b) => { res.corpo = b; return res; };
    return res;
};
const adicionar = async (corpo) => {
    const res = resposta();
    await controller.addToWatchlist({ body: { evento_id: 'ev1', nome: 'Teste', ...corpo }, headers: {}, event: { id: 'ev1' }, user: { id: 'op' } }, res);
    return res;
};

beforeEach(() => {
    mockDb.upserts = [];
});

describe('monitor watchlist: CPF inválido não é gravado', () => {
    it('CPF "abc" (sem dígitos) → 400 com a mensagem e nenhum upsert', async () => {
        const r = await adicionar({ cpf: 'abc' });
        expect(r.statusCode).toBe(400);
        expect(r.corpo.error).toBe('CPF inválido: informe 11 dígitos');
        expect(mockDb.upserts).toHaveLength(0);
    });

    it('CPF "123" (parcial) → 400 e nenhum upsert', async () => {
        const r = await adicionar({ cpf: '123' });
        expect(r.statusCode).toBe(400);
        expect(r.corpo.error).toBe('CPF inválido: informe 11 dígitos');
        expect(mockDb.upserts).toHaveLength(0);
    });

    it('CPF com 12 dígitos → 400 e nenhum upsert', async () => {
        const r = await adicionar({ cpf: '123456789012' });
        expect(r.statusCode).toBe(400);
        expect(mockDb.upserts).toHaveLength(0);
    });

    it('CPF com máscara válido → grava com exatamente 11 dígitos', async () => {
        const r = await adicionar({ cpf: '529.982.247-25' });
        expect(r.statusCode).toBe(200);
        expect(mockDb.upserts).toHaveLength(1);
        expect(mockDb.upserts[0].tabela).toBe('watchlist');
        expect(mockDb.upserts[0].linhas[0].cpf).toBe('52998224725');
    });

    it('nenhuma linha com cpf vazio ou parcial é gravada nos casos inválidos', async () => {
        await adicionar({ cpf: 'abc' });
        await adicionar({ cpf: '123' });
        const gravados = mockDb.upserts.flatMap(u => u.linhas);
        expect(gravados.every(l => /^\d{11}$/.test(l.cpf))).toBe(true);
    });
});
