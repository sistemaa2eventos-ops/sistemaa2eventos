/**
 * D3: GET de procurados (listProcurados) casa o alvo com a pessoa só pelo CPF.
 * Casar por nome gerava homônimo e marcava "presente" alvo sem CPF. Banco simulado; nada é gravado.
 */

const mockDb = { watchlist: [], pessoas: [], logs_acesso: [] };

function mockConstruir(tabela) {
    const filtros = [];
    const q = {
        select: () => q,
        order: () => q,
        eq: (c, v) => { filtros.push(r => r[c] === v); return q; },
        in: (c, vs) => { filtros.push(r => vs.includes(r[c])); return q; },
        then: (ok, ko) => Promise.resolve({ data: mockDb[tabela].filter(r => filtros.every(f => f(r))), error: null }).then(ok, ko)
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
const listar = async () => {
    const res = resposta();
    await controller.listProcurados({ query: { evento_id: 'ev1' }, headers: {}, event: { id: 'ev1' } }, res);
    return res.corpo.data;
};
const alvo = (dados) => ({ ativo: true, evento_id: 'ev1', nivel_alerta: 'alto', created_at: '2026-11-01T00:00:00Z', ...dados });

beforeEach(() => {
    mockDb.pessoas = [
        { id: 'p1', evento_id: 'ev1', nome_completo: 'Maria Silva', cpf: '529.982.247-25', funcao: 'Equipe', numero_pulseira: '1001', foto_url: null, status_acesso: 'checkin_feito', empresas: null },
        { id: 'p2', evento_id: 'ev1', nome_completo: 'João Souza', cpf: '111.222.333-44', funcao: 'Equipe', numero_pulseira: '2002', foto_url: null, status_acesso: 'pendente', empresas: null }
    ];
    mockDb.logs_acesso = [
        { id: 'l1', pessoa_id: 'p1', evento_id: 'ev1', tipo: 'checkin', created_at: '2026-11-18T12:00:00Z' }
    ];
    mockDb.watchlist = [];
});

describe('procurados: alvo casa com a pessoa só pelo CPF (D3)', () => {
    it('alvo sem CPF com o mesmo nome de uma pessoa presente não é associado a ela', async () => {
        mockDb.watchlist = [alvo({ id: 'w1', nome: 'Maria Silva', cpf: null })];
        const [item] = await listar();
        expect(item.pessoa_id).toBeNull();
        expect(item.esta_presente).toBe(false);
        expect(item.numero_pulseira).toBe('Sem pulseira');
    });

    it('alvo com nome igual ao de outra pessoa, mas CPF diferente, não casa com ela', async () => {
        mockDb.watchlist = [alvo({ id: 'w2', nome: 'João Souza', cpf: '99988877766' })];
        const [item] = await listar();
        expect(item.pessoa_id).toBeNull();
        expect(item.esta_presente).toBe(false);
    });

    it('alvo com o CPF cadastrado casa com a pessoa e mostra a presença', async () => {
        mockDb.watchlist = [alvo({ id: 'w3', nome: 'Nome Diferente', cpf: '52998224725' })];
        const [item] = await listar();
        expect(item.pessoa_id).toBe('p1');
        expect(item.esta_presente).toBe(true);
        expect(item.numero_pulseira).toBe('1001');
    });

    it('CPF do alvo com máscara diferente casa com a pessoa pelo número', async () => {
        mockDb.watchlist = [alvo({ id: 'w4', nome: 'X', cpf: '111.222.333-44' })];
        const [item] = await listar();
        expect(item.pessoa_id).toBe('p2');
        expect(item.esta_presente).toBe(false);
    });

    it('alvo sem CPF e sem pessoa correspondente continua na lista, sem presença', async () => {
        mockDb.watchlist = [alvo({ id: 'w5', nome: 'Desconhecido', cpf: null })];
        const lista = await listar();
        expect(lista).toHaveLength(1);
        expect(lista[0].esta_presente).toBe(false);
        expect(lista[0].pessoa_id).toBeNull();
    });
});
