/**
 * Webhook de pagamento com a mesma pessoa (CPF) em dois eventos (um cadastro por evento).
 * Antes: .or(id, cpf) casava as duas linhas, maybeSingle falhava e o pagamento ficava órfão.
 * Agora: external_id (id do cadastro) manda; sem ele, vale o cadastro mais recente daquele CPF.
 */
const mockDb = { pessoas: [], atualizadas: [] };

function mockFrom(tabela) {
    const filtros = [];
    let ordem = null;
    let limite = Infinity;
    let atualizacao = null;
    const q = {};
    q.select = () => q;
    q.eq = (c, v) => { filtros.push([c, v]); return q; };
    q.or = () => { throw new Error('.or() montado com dados do webhook'); };
    q.order = (c, { ascending } = {}) => { ordem = [c, ascending]; return q; };
    q.limit = (n) => { limite = n; return q; };
    q.update = (p) => { atualizacao = p; return q; };
    q.insert = async () => ({ data: null, error: null });
    const linhas = () => {
        let r = (tabela === 'pessoas' ? mockDb.pessoas : []).filter(l => filtros.every(([c, v]) => l[c] === v));
        if (ordem) r = [...r].sort((a, b) => (a[ordem[0]] < b[ordem[0]] ? -1 : 1) * (ordem[1] ? 1 : -1));
        return r.slice(0, limite);
    };
    q.maybeSingle = async () => {
        const r = linhas();
        if (r.length > 1) return { data: null, error: { message: 'várias linhas' } };
        return { data: r[0] || null, error: null };
    };
    q.then = (ok, ko) => {
        if (atualizacao) linhas().forEach(l => mockDb.atualizadas.push(l.id));
        return Promise.resolve({ data: linhas(), error: null }).then(ok, ko);
    };
    return q;
}

jest.mock('../src/services/logger', () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() }));
jest.mock('../src/config/supabase', () => ({ supabase: { from: (t) => mockFrom(t) } }));

const pagamentos = require('../src/modules/payments/payment.service');

const ID_A = 'aaaaaaaa-0000-4000-8000-000000000001';
const ID_B = 'bbbbbbbb-0000-4000-8000-000000000002';

beforeEach(() => {
    mockDb.atualizadas = [];
    mockDb.pessoas = [
        { id: ID_A, nome: 'Ana', cpf: '12345678900', evento_id: 'ev-A', pagamento_validado: false, created_at: '2026-10-01T10:00:00Z' },
        { id: ID_B, nome: 'Ana', cpf: '12345678900', evento_id: 'ev-B', pagamento_validado: false, created_at: '2026-11-20T10:00:00Z' }
    ];
    jest.spyOn(pagamentos, 'verifyWebhookSignature').mockReturnValue({ valid: true });
    jest.spyOn(pagamentos, 'logTransaction').mockResolvedValue({ id: 't1' });
});
afterEach(() => jest.restoreAllMocks());

const webhook = (dados) => {
    jest.spyOn(pagamentos, 'normalizePayload').mockReturnValue({ success: true, valor: 100, status: 'paid', ...dados });
    return pagamentos.processWebhook('teste', {}, {}, '');
};

describe('Pagamento com a mesma pessoa em dois eventos', () => {
    it('external_id valida exatamente aquele cadastro', async () => {
        const r = await webhook({ external_id: ID_A, cpf: '123.456.789-00' });
        expect(r.processed).toBe(true);
        expect(r.pessoa_id).toBe(ID_A);
        expect(mockDb.atualizadas).toEqual([ID_A]);
    });

    it('só o CPF valida o cadastro mais recente', async () => {
        const r = await webhook({ cpf: '123.456.789-00' });
        expect(r.pessoa_id).toBe(ID_B);
        expect(mockDb.atualizadas).toEqual([ID_B]);
    });

    it('external_id que não é cadastro cai no CPF', async () => {
        const r = await webhook({ external_id: 'pedido-9981', cpf: '12345678900' });
        expect(r.pessoa_id).toBe(ID_B);
    });

    it('sem pessoa: pagamento fica para conferência manual', async () => {
        const r = await webhook({ cpf: '00000000000' });
        expect(r.processed).toBe(false);
    });
});
