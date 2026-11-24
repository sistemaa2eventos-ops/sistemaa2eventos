/**
 * GET /access/consultar-pulseira/:codigo (conferência do crachá no Check-in) e POST /access/fiscalizar:
 * mesma busca do leitor rápido — pulseira, CPF (com ou sem máscara), QR do crachá (JWT) ou id.
 * Texto que não é código → 400; pulseira repetida → 409. Sem busca por nome e sem .or() montado.
 */
const mockDb = { pessoas: [], consultas: [] };

/** Cliente do banco genérico, sem .or() nem .ilike() (filtro montado com o texto lido derrubaria o teste) */
function mockConstruir(tabela) {
    const filtros = [];
    const q = {};
    for (const m of ['select', 'order', 'gte', 'lte', 'gt', 'lt', 'neq', 'is', 'not', 'range', 'update', 'upsert', 'delete']) q[m] = () => q;
    q.eq = (c, v) => { filtros.push(['eq', c, v]); return q; };
    q.in = (c, v) => { filtros.push(['in', c, v]); return q; };
    // .ilike só em outras tabelas (a watchlist confere nome); em pessoas seria a busca por nome removida
    q.ilike = () => { if (tabela === 'pessoas') throw new Error('busca por nome em pessoas'); return q; };
    q.insert = () => Promise.resolve({ data: null, error: null });
    const linhas = () => (tabela !== 'pessoas' ? [] :
        mockDb.pessoas.filter(p => filtros.every(([op, c, v]) => (op === 'eq' ? p[c] === v : v.includes(p[c])))));
    let limite = Infinity;
    q.limit = (n) => {
        if (tabela === 'pessoas') mockDb.consultas.push(filtros.filter(f => f[1] !== 'evento_id'));
        limite = n;
        return q;
    };
    q.single = async () => ({ data: linhas()[0] || null, error: null });
    q.maybeSingle = q.single;
    q.then = (ok, ko) => Promise.resolve({ data: linhas().slice(0, limite), error: null }).then(ok, ko);
    return q;
}

jest.mock('../src/services/logger', () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() }));
jest.mock('../src/config/supabase', () => ({ supabase: { from: (t) => mockConstruir(t) } }));
jest.mock('../src/modules/checkin/checkin.service', () => ({ registrarAcesso: jest.fn(async () => ({ success: true })) }));
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

const cliente = { from: (t) => mockConstruir(t) };
// JWT do qrGenerator: três partes com pontos, bem mais de 64 caracteres
const QR = `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6IjUyOTk4MjI0NzI1IiwidHMiOjE3MDAwMDAwMDAwMDAsInJuZCI6ImFiY2RlZiJ9.${'x'.repeat(43)}`;

const resposta = () => {
    const res = { statusCode: 200, corpo: null };
    res.status = (c) => { res.statusCode = c; return res; };
    res.json = (b) => { res.corpo = b; return res; };
    return res;
};
const consultar = async (codigo) => {
    const res = resposta();
    await controller.consultarPulseira({ params: { codigo }, event: { id: 'ev1' }, headers: {}, query: {}, supabase: cliente }, res);
    return res;
};
const fiscalizar = async (codigo) => {
    const res = resposta();
    await controller.fiscalizarAcesso({ body: { codigo }, event: { id: 'ev1' }, headers: {}, query: {}, user: { id: 'op' }, supabase: cliente }, res);
    return res;
};

beforeEach(() => {
    mockDb.consultas.length = 0;
    mockDb.pessoas = [
        { id: 'p1', evento_id: 'ev1', nome_completo: 'Maria Silva', cpf: '529.982.247-25', numero_pulseira: '1001', qr_code: QR, status_acesso: 'autorizado' },
        { id: 'p2', evento_id: 'ev1', nome_completo: 'João Souza', cpf: '11144477735', numero_pulseira: '2002', qr_code: null },
        { id: 'p3', evento_id: 'ev1', nome_completo: 'Ana Lima', cpf: '39053344705', numero_pulseira: '2002', qr_code: null }
    ];
});

describe('GET /access/consultar-pulseira/:codigo', () => {
    it('QR do crachá (JWT, >64 caracteres, com pontos) encontra a pessoa no formato que o painel lê', async () => {
        expect(QR.length).toBeGreaterThan(64);
        const r = await consultar(QR);
        expect(r.statusCode).toBe(200);
        expect(r.corpo).toMatchObject({ success: true, data: { id: 'p1', nome_completo: 'Maria Silva' } });
    });

    it('CPF com pontos e traço, CPF só dígitos e pulseira', async () => {
        expect((await consultar('529.982.247-25')).corpo.data.id).toBe('p1');
        expect((await consultar('52998224725')).corpo.data.id).toBe('p1');
        expect((await consultar('1001')).corpo.data.id).toBe('p1');
    });

    it('pulseira repetida → 409; não encontrado → 404; nome → 400', async () => {
        expect((await consultar('2002')).statusCode).toBe(409);
        const nao = await consultar('9999');
        expect(nao.statusCode).toBe(404);
        expect(nao.corpo.error).toBe('Pulseira / Colaborador não encontrado');
        const nome = await consultar('Maria Silva');
        expect(nome.statusCode).toBe(400);
        // 2002 e 9999 consultam pulseira e QR (2 cada); o nome não chega ao banco
        expect(mockDb.consultas).toHaveLength(4);
    });
});

describe('POST /access/fiscalizar', () => {
    it('nome não fiscaliza ninguém: 400, sem consulta', async () => {
        const r = await fiscalizar('Maria');
        expect(r.statusCode).toBe(400);
        expect(r.corpo.error).toBe('Código não reconhecido. Use a busca por nome.');
        expect(mockDb.consultas).toHaveLength(0);
    });

    it('não encontrado continua 200 com status nao_encontrado (formato do painel)', async () => {
        const r = await fiscalizar('9999');
        expect(r.statusCode).toBe(200);
        expect(r.corpo.data).toMatchObject({ autorizado: false, status: 'nao_encontrado' });
    });

    it('pulseira repetida → 409', async () => {
        expect((await fiscalizar('2002')).statusCode).toBe(409);
    });

    it('QR (qr_code) e CPF com e sem máscara continuam cobertos; id da escolha na lista também', async () => {
        const logger = require('../src/services/logger');
        for (const codigo of [QR, '529.982.247-25', '52998224725', '1001']) {
            logger.error.mockClear();
            const r = await fiscalizar(codigo);
            expect(logger.error.mock.calls.map(c => String(c[0]?.err?.message || c[1] || ''))).toEqual([]);
            expect(r.statusCode).toBe(200);
            expect(r.corpo.data.status).not.toBe('nao_encontrado');
        }
        mockDb.pessoas[0].id = '11111111-2222-3333-4444-555555555555';
        const porId = await fiscalizar('11111111-2222-3333-4444-555555555555');
        expect(porId.statusCode).toBe(200);
        expect(porId.corpo.data.status).not.toBe('nao_encontrado');
    });
});
