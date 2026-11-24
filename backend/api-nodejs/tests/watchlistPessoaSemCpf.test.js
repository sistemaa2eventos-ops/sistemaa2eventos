/**
 * Watchlist: procurar pessoa pelo pessoa_id. Pessoa SEM CPF de 11 dígitos não pode ser gravada com um CPF
 * fictício ('ID-xxxxxxxx'): a fiscalização só casa por CPF, então esse registro nunca alertaria nada.
 * Resposta 400 e nenhuma gravação na watchlist. Banco simulado; nada é gravado de verdade.
 */

const mockDb = { pessoas: [], watchlist_upserts: [] };

function mockConstruir(tabela) {
    const filtros = [];
    let operacao = 'select';
    let carga = null;
    const q = {
        select: () => q,
        eq: (c, v) => { filtros.push(r => r[c] === v); return q; },
        upsert: (linhas) => { operacao = 'upsert'; carga = linhas; return q; },
        single: async () => {
            if (operacao === 'upsert') {
                mockDb.watchlist_upserts.push({ tabela, linhas: carga });
                return { data: carga[0], error: null };
            }
            const achados = mockDb[tabela].filter(r => filtros.every(f => f(r)));
            return achados.length
                ? { data: achados[0], error: null }
                : { data: null, error: { code: 'PGRST116', message: 'no rows' } };
        }
    };
    return q;
}

jest.mock('../src/config/supabase', () => ({ supabase: { from: (t) => mockConstruir(t) } }));
jest.mock('../src/services/logger', () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() }));
jest.mock('../src/services/emailService', () => ({}));
jest.mock('../src/services/websocketService', () => ({ emit: jest.fn() }));
jest.mock('../src/modules/system/watchlist.service', () => ({ verificarCPF: jest.fn(async () => null) }));

const controller = require('../src/modules/system/watchlist.controller');

const resposta = () => {
    const res = { statusCode: 200, corpo: null };
    res.status = (c) => { res.statusCode = c; return res; };
    res.json = (b) => { res.corpo = b; return res; };
    return res;
};
const procurar = async (corpo) => {
    const res = resposta();
    await controller.addProcurado({ body: { evento_id: 'ev1', ...corpo }, headers: {}, event: { id: 'ev1' }, user: { id: 'op' } }, res);
    return res;
};

beforeEach(() => {
    mockDb.watchlist_upserts = [];
    mockDb.pessoas = [
        { id: 'p-sem-cpf-000000000001', nome_completo: 'Sem CPF', cpf: null },
        { id: 'p-cpf-curto-0000000002', nome_completo: 'CPF curto', cpf: '12345' },
        { id: 'p-com-cpf-000000000003', nome_completo: 'Com CPF', cpf: '529.982.247-25' }
    ];
});

describe('watchlist: pessoa sem CPF não vira CPF fictício', () => {
    it('pessoa sem CPF → 400 com a mensagem e nada gravado', async () => {
        const r = await procurar({ pessoa_id: 'p-sem-cpf-000000000001' });
        expect(r.statusCode).toBe(400);
        expect(r.corpo.error).toBe('Pessoa sem CPF cadastrado: não é possível procurar');
        expect(mockDb.watchlist_upserts).toHaveLength(0);
    });

    it('pessoa com CPF curto (menos de 11 dígitos) → 400 e nada gravado', async () => {
        const r = await procurar({ pessoa_id: 'p-cpf-curto-0000000002' });
        expect(r.statusCode).toBe(400);
        expect(mockDb.watchlist_upserts).toHaveLength(0);
    });

    it('nenhuma linha com cpf começando por "ID-" é gravada', async () => {
        await procurar({ pessoa_id: 'p-sem-cpf-000000000001' });
        await procurar({ pessoa_id: 'p-cpf-curto-0000000002' });
        const gravados = mockDb.watchlist_upserts.flatMap(u => u.linhas);
        expect(gravados.some(l => String(l.cpf).startsWith('ID-'))).toBe(false);
    });

    it('CPF direto no corpo com 3 dígitos ("123") → 400 e nenhuma gravação', async () => {
        const r = await procurar({ cpf: '123' });
        expect(r.statusCode).toBe(400);
        expect(r.corpo.error).toBe('CPF inválido: informe 11 dígitos');
        expect(mockDb.watchlist_upserts).toHaveLength(0);
    });

    it('CPF direto no corpo com máscara válido é gravado com 11 dígitos', async () => {
        const r = await procurar({ cpf: '529.982.247-25' });
        expect(r.statusCode).toBe(200);
        expect(mockDb.watchlist_upserts).toHaveLength(1);
        expect(mockDb.watchlist_upserts[0].linhas[0].cpf).toBe('52998224725');
    });

    it('pessoa com CPF de 11 dígitos (com máscara) é gravada só com os dígitos', async () => {
        const r = await procurar({ pessoa_id: 'p-com-cpf-000000000003' });
        expect(r.statusCode).toBe(200);
        expect(mockDb.watchlist_upserts).toHaveLength(1);
        expect(mockDb.watchlist_upserts[0].linhas[0].cpf).toBe('52998224725');
    });
});
