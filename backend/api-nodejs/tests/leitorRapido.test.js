/**
 * POST /access/leitor-rapido (check-in e check-out do painel por leitura de código):
 *  - só código (pulseira, CPF, QR, id); nome não faz check-in → 400;
 *  - pulseira com o mesmo número em duas pessoas → 409, sem escolher uma;
 *  - código válido continua registrando check-in e check-out;
 *  - o texto lido vai como parâmetro (.eq/.in), não montado em filtro .or().
 */
const mockDb = { pessoas: [], consultas: [], registros: [] };

/**
 * Cliente do banco genérico: pessoas filtradas por .eq/.in; outras tabelas vazias; insert/update ok.
 * Não tem .or() nem .ilike(): um filtro montado com o texto lido derrubaria o teste.
 */
function mockConstruir(tabela) {
    const filtros = [];
    const q = {};
    for (const m of ['select', 'order', 'gte', 'lte', 'gt', 'lt', 'neq', 'is', 'not', 'range', 'update', 'upsert', 'delete']) q[m] = () => q;
    q.eq = (c, v) => { filtros.push(['eq', c, v]); return q; };
    q.in = (c, v) => { filtros.push(['in', c, v]); return q; };
    q.insert = () => Promise.resolve({ data: null, error: null });
    const linhas = () => {
        if (tabela !== 'pessoas') return [];
        return mockDb.pessoas.filter(p => filtros.every(([op, c, v]) => (op === 'eq' ? p[c] === v : v.includes(p[c]))));
    };
    q.limit = (n) => {
        if (tabela === 'pessoas') mockDb.consultas.push(filtros.filter(f => f[1] !== 'evento_id'));
        return Promise.resolve({ data: linhas().slice(0, n), error: null });
    };
    q.single = async () => ({ data: linhas()[0] || null, error: null });
    q.maybeSingle = q.single;
    q.then = (ok, ko) => Promise.resolve({ data: linhas(), error: null }).then(ok, ko);
    return q;
}

jest.mock('../src/services/logger', () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() }));
jest.mock('../src/config/supabase', () => ({ supabase: { from: (t) => mockConstruir(t) } }));
jest.mock('../src/modules/checkin/checkin.service', () => ({
    registrarAcesso: jest.fn(async (_c, dados) => { mockDb.registros.push(dados); return { success: true, tipo: dados.tipo }; })
}));
jest.mock('../src/modules/checkin/services/validation.service', () => ({}));
jest.mock('../src/services/webhookDispatcher', () => ({ dispatchCheckin: jest.fn(), dispatchCheckout: jest.fn() }));
jest.mock('../src/services/websocketService', () => ({ emit: jest.fn() }));
jest.mock('../src/modules/checkin/services/database.service', () => ({}));
jest.mock('../src/modules/system/watchlist.service', () => ({ verificarCPF: jest.fn(async () => null), registrarAlerta: jest.fn(async () => {}) }));
jest.mock('../src/modules/pulseiras/pulseira.service', () => ({}));
jest.mock('../src/modules/pulseiras/loteSelecao', () => ({
    buscarLotesDaFaixa: jest.fn(async () => []),
    escolherLote: jest.fn(async () => ({ lote: null, bloqueado: false, motivo: null }))
}));

const controller = require('../src/modules/checkin/checkin.controller');
const { classificarCodigoLeitor } = require('../src/modules/checkin/codigoLeitor');

const cliente = { from: (t) => mockConstruir(t) };

const chamar = async (body) => {
    const res = { statusCode: 200, corpo: null };
    res.status = (c) => { res.statusCode = c; return res; };
    res.json = (b) => { res.corpo = b; return res; };
    await controller.leitorRapido({ body, event: { id: 'ev1' }, headers: {}, query: {}, user: { id: 'op' }, supabase: cliente }, res);
    return res;
};

const QR = 'eyJhbGciOiJIUzI1NiJ9.eyJpZCI6IjEyMyJ9.abc_DEF-123';

beforeEach(() => {
    mockDb.consultas.length = 0;
    mockDb.registros.length = 0;
    mockDb.pessoas = [
        { id: 'p1', evento_id: 'ev1', nome_completo: 'Maria Silva', cpf: '529.982.247-25', numero_pulseira: '1001', qr_code: QR },
        { id: 'p2', evento_id: 'ev1', nome_completo: 'João Souza', cpf: '11144477735', numero_pulseira: '2002', qr_code: null },
        { id: 'p3', evento_id: 'ev1', nome_completo: 'Ana Lima', cpf: '39053344705', numero_pulseira: '2002', qr_code: null }
    ];
});

describe('nome não faz check-in', () => {
    it.each(['Maria', 'Maria Silva', 'joão', 'silva%'])('"%s" → 400, sem registrar', async (codigo) => {
        const r = await chamar({ codigo, tipo: 'checkin' });
        expect(r.statusCode).toBe(400);
        expect(r.corpo.error).toBe('Código não reconhecido. Use a busca por nome.');
        expect(mockDb.registros).toHaveLength(0);
        expect(mockDb.consultas).toHaveLength(0);
    });

    it('texto com caracteres de filtro do PostgREST não vira consulta', async () => {
        const r = await chamar({ codigo: '1001,cpf.not.is.null', tipo: 'checkin' });
        expect(r.statusCode).toBe(400);
        expect(mockDb.registros).toHaveLength(0);
    });
});

describe('pulseira repetida', () => {
    it('mesmo número em duas pessoas → 409, sem escolher uma', async () => {
        const r = await chamar({ codigo: '2002', tipo: 'checkin' });
        expect(r.statusCode).toBe(409);
        expect(r.corpo.error).toContain('2002');
        expect(mockDb.registros).toHaveLength(0);
    });
});

describe('código válido continua funcionando', () => {
    it('pulseira → check-in da pessoa certa', async () => {
        const r = await chamar({ codigo: '1001', tipo: 'checkin' });
        expect(r.statusCode).toBe(200);
        expect(mockDb.registros[0]).toMatchObject({ pessoa_id: 'p1', tipo: 'checkin' });
    });

    it('CPF só dígitos acha CPF gravado com máscara; check-out também', async () => {
        const r = await chamar({ codigo: '52998224725', tipo: 'checkout' });
        expect(r.statusCode).toBe(200);
        expect(mockDb.registros[0]).toMatchObject({ pessoa_id: 'p1', tipo: 'checkout' });
    });

    it('CPF com máscara', async () => {
        const r = await chamar({ codigo: '111.444.777-35', tipo: 'checkin' });
        expect(r.statusCode).toBe(200);
        expect(mockDb.registros[0].pessoa_id).toBe('p2');
    });

    it('QR (JWT)', async () => {
        const r = await chamar({ codigo: QR, tipo: 'checkin' });
        expect(r.statusCode).toBe(200);
        expect(mockDb.registros[0].pessoa_id).toBe('p1');
    });

    it('código que não existe → 404', async () => {
        expect((await chamar({ codigo: '9999', tipo: 'checkin' })).statusCode).toBe(404);
    });
});

describe('classificarCodigoLeitor', () => {
    it('separa código de nome', () => {
        expect(classificarCodigoLeitor('Maria')).toBeNull();
        expect(classificarCodigoLeitor('Maria Silva')).toBeNull();
        expect(classificarCodigoLeitor('')).toBeNull();
        expect(classificarCodigoLeitor('1001')).toMatchObject({ pulseira: true, qr: true, cpf: null });
        expect(classificarCodigoLeitor('529.982.247-25')).toMatchObject({ pulseira: false, qr: false, cpf: ['52998224725', '529.982.247-25'] });
        expect(classificarCodigoLeitor(QR)).toMatchObject({ pulseira: false, qr: true });
        expect(classificarCodigoLeitor('11111111-2222-3333-4444-555555555555')).toMatchObject({ id: true });
    });
});

describe('tipo ausente: o sistema decide (não força entrada)', () => {
    it('leitura de pulseira sem tipo chega ao check-in com tipo null', async () => {
        mockDb.registros.length = 0;
        const r = await chamar({ codigo: '1001' });
        expect(r.statusCode).toBe(200);
        expect(mockDb.registros).toHaveLength(1);
        expect(mockDb.registros[0].tipo).toBeNull();
    });

    it('tipo checkout explícito continua saída', async () => {
        mockDb.registros.length = 0;
        await chamar({ codigo: '1001', tipo: 'checkout' });
        expect(mockDb.registros[0].tipo).toBe('checkout');
    });
});
