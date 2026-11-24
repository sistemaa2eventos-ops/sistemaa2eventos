/**
 * Alerta de watchlist na fiscalização: SÓ por CPF. Casar por nome (ilike) alertava homônimos e alvos
 * sem CPF cadastrado. Banco simulado; o teste falha se a consulta por nome for feita.
 */
const mockWatchIlike = jest.fn();

const mockDb = { pessoas: [], watchlist: [], logs: [] };
// Pulseira em uso hoje por pessoa (a fiscalização só libera quem está dentro do evento)
const mockPulseiraHoje = {};

function mockConstruir(tabela) {
    const filtros = [];
    const q = {};
    for (const m of ['select', 'order', 'gte', 'lte', 'gt', 'lt', 'neq', 'is', 'not', 'range', 'update', 'upsert', 'delete']) q[m] = () => q;
    q.eq = (c, v) => { filtros.push(['eq', c, v]); return q; };
    q.in = (c, v) => { filtros.push(['in', c, v]); return q; };
    q.ilike = (c, v) => { if (tabela === 'watchlist') mockWatchIlike(c, v); return q; };
    q.insert = () => Promise.resolve({ data: null, error: null });
    let limite = Infinity;
    const base = () => (tabela === 'pessoas' ? mockDb.pessoas : tabela === 'watchlist' ? mockDb.watchlist : tabela === 'logs_acesso' ? mockDb.logs : []);
    const linhas = () => base().filter(r => filtros.every(([op, c, v]) => (op === 'eq' ? r[c] === v : v.includes(r[c]))));
    q.limit = (n) => { limite = n; return q; };
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
jest.mock('../src/modules/checkin/services/database.service', () => ({ logDeniedAccess: jest.fn(async () => {}) }));
jest.mock('../src/modules/system/watchlist.service', () => ({ verificarCPF: jest.fn(async () => null), registrarAlerta: jest.fn(async () => {}) }));
jest.mock('../src/modules/pulseiras/pulseira.service', () => ({
    buscarStatusPulseira: jest.fn(async (_ev, pid) => ({ emUso: mockPulseiraHoje[pid] || null, pendencia: null }))
}));
jest.mock('../src/modules/pulseiras/loteSelecao', () => ({ buscarLotesDaFaixa: jest.fn(), escolherLote: jest.fn() }));

const websocketService = require('../src/services/websocketService');
const watchlistService = require('../src/modules/system/watchlist.service');
const controller = require('../src/modules/checkin/checkin.controller');

const resposta = () => {
    const res = { statusCode: 200, corpo: null };
    res.status = (c) => { res.statusCode = c; return res; };
    res.json = (b) => { res.corpo = b; return res; };
    return res;
};
const fiscalizar = async (codigo) => {
    const res = resposta();
    await controller.fiscalizarAcesso({
        body: { codigo, area_id: null }, event: { id: 'ev1' }, headers: {}, query: {},
        user: { id: 'op' }, supabase: mockConstruir.cliente
    }, res);
    return res;
};
const alertas = () => websocketService.emit.mock.calls.filter(([nome]) => nome === 'watchlist_alert');

beforeEach(() => {
    mockWatchIlike.mockClear();
    websocketService.emit.mockClear();
    watchlistService.registrarAlerta.mockClear();
    mockConstruir.cliente = { from: (t) => mockConstruir(t) };
    mockDb.pessoas = [
        { id: 'p1', evento_id: 'ev1', nome_completo: 'Maria Silva', cpf: '52998224725', numero_pulseira: '1001', status_acesso: 'checkin_feito' },
        { id: 'p2', evento_id: 'ev1', nome_completo: 'Sem Cpf', cpf: null, numero_pulseira: '3003', status_acesso: 'checkin_feito' }
    ];
    mockDb.watchlist = [];
    mockDb.logs = [
        { tipo: 'checkin', evento_id: 'ev1', pessoa_id: 'p1', numero_pulseira: '1001', created_at: new Date().toISOString(), metodo: 'pulseira' },
        { tipo: 'checkin', evento_id: 'ev1', pessoa_id: 'p2', numero_pulseira: '3003', created_at: new Date().toISOString(), metodo: 'pulseira' }
    ];
    for (const k of Object.keys(mockPulseiraHoje)) delete mockPulseiraHoje[k];
    Object.assign(mockPulseiraHoje, { p1: '1001', p2: '3003' });
});

describe('fiscalização: watchlist só por CPF', () => {
    it('alvo cadastrado só pelo nome (sem CPF) não gera alerta e a consulta por nome não é feita', async () => {
        mockDb.watchlist = [{ id: 'w1', nome: 'Maria Silva', cpf: null, ativo: true, motivo: 'homônimo' }];
        const r = await fiscalizar('1001');
        expect(r.statusCode).toBe(200);
        expect(r.corpo.data.autorizado).toBe(true);
        expect(alertas()).toHaveLength(0);
        expect(watchlistService.registrarAlerta).not.toHaveBeenCalled();
        expect(mockWatchIlike).not.toHaveBeenCalled();
    });

    it('pessoa sem CPF cadastrado nunca dispara alerta, mesmo com o mesmo nome na watchlist', async () => {
        mockDb.watchlist = [{ id: 'w2', nome: 'Sem Cpf', cpf: null, ativo: true, motivo: 'x' }];
        const r = await fiscalizar('3003');
        expect(r.corpo.data.autorizado).toBe(true);
        expect(alertas()).toHaveLength(0);
        expect(mockWatchIlike).not.toHaveBeenCalled();
    });

    it('alvo com o CPF cadastrado dispara o alerta e bloqueia a credencial', async () => {
        mockDb.watchlist = [{ id: 'w3', nome: 'Outro nome', cpf: '52998224725', ativo: true, motivo: 'procurado' }];
        const r = await fiscalizar('1001');
        expect(r.corpo.data.status).toBe('bloqueado');
        expect(alertas()).toHaveLength(1);
        expect(mockWatchIlike).not.toHaveBeenCalled();
    });

    it('o alvo pelo CPF continua valendo quando o nome da watchlist é diferente', async () => {
        mockDb.watchlist = [{ id: 'w4', nome: 'Nome Antigo', cpf: '52998224725', ativo: true }];
        const r = await fiscalizar('52998224725');
        expect(r.corpo.data.autorizado).toBe(false);
        expect(alertas()).toHaveLength(1);
    });
});
