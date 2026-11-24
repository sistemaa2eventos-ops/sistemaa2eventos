/**
 * Pessoa de OUTRO evento no check-in manual (POST /api/checkin/manual, rota real com controller e serviço reais).
 * O pessoa_id vem do corpo e não é checado contra o evento da sessão: a busca da pessoa agora usa id + evento_id.
 * Pessoa de outro evento (ou inexistente) → 404 'Pessoa não encontrada neste evento' e NENHUMA gravação
 * (nada em logs_acesso, nada em pessoas, nenhuma RPC, nenhum evento websocket).
 * Supabase simulado: toda escrita (insert/update/upsert/delete/rpc) é registrada em mockDb.escritas.
 */

const mockDb = {
    usuario: null,
    pessoas: [],
    logs_acesso: [],
    escritas: []
};

function mockBuilder(tabela) {
    const filtros = [];
    let operacao = 'select';
    let carga = null;
    let limite = Infinity;
    const b = {
        select() { return b; },
        eq(c, v) { filtros.push(r => r[c] === v); return b; },
        is(c, v) { filtros.push(r => (r[c] ?? null) === v); return b; },
        in(c, vs) { filtros.push(r => vs.includes(r[c])); return b; },
        gt(c, v) { filtros.push(r => r[c] > v); return b; },
        gte(c, v) { filtros.push(r => r[c] >= v); return b; },
        lt(c, v) { filtros.push(r => r[c] < v); return b; },
        lte(c, v) { filtros.push(r => r[c] <= v); return b; },
        neq(c, v) { filtros.push(r => r[c] !== v); return b; },
        order() { return b; },
        limit(n) { limite = n; return b; },
        range() { return b; },
        insert(rows) { operacao = 'insert'; carga = rows; return b; },
        update(vals) { operacao = 'update'; carga = vals; return b; },
        upsert(rows) { operacao = 'upsert'; carga = rows; return b; },
        delete() { operacao = 'delete'; return b; },
        maybeSingle() { return executar().then(r => ({ data: (r.data && r.data[0]) || null, error: r.error })); },
        single() {
            return executar().then(r => (r.data && r.data[0])
                ? { data: r.data[0], error: null }
                : { data: null, error: { code: 'PGRST116', message: 'JSON object requested, multiple (or no) rows returned' } });
        },
        then(ok, ko) { return executar().then(ok, ko); }
    };
    function executar() {
        if (operacao !== 'select') {
            mockDb.escritas.push({ tabela, operacao, carga });
            return Promise.resolve({ data: null, error: null });
        }
        const linhas = (mockDb[tabela] || []).filter(r => filtros.every(f => f(r)));
        return Promise.resolve({ data: linhas.slice(0, limite), error: null });
    }
    return b;
}

jest.mock('../src/config/supabase', () => ({
    supabase: {
        from: (t) => mockBuilder(t),
        rpc: (nome, args) => { mockDb.escritas.push({ tabela: 'rpc', operacao: nome, carga: args }); return Promise.resolve({ data: null, error: null }); }
    }
}));
jest.mock('../src/services/logger', () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() }));
jest.mock('../src/services/authCache', () => ({}));
jest.mock('../src/services/websocketService', () => ({ emit: jest.fn() }));
jest.mock('../src/services/cacheService', () => ({ invalidatePessoa: jest.fn(), get: jest.fn(), set: jest.fn() }));
jest.mock('../src/services/queue.service', () => ({ publishLogToCloud: jest.fn(async () => false) }));
jest.mock('../src/services/webhookDispatcher', () => ({ dispatchCheckin: jest.fn(), dispatchCheckout: jest.fn() }));
jest.mock('../src/utils/buscarTodos', () => ({ buscarTodos: jest.fn(async () => ({ data: [], error: null })) }));
jest.mock('../src/modules/system/watchlist.service', () => ({ verificarCPF: jest.fn(async () => null), registrarAlerta: jest.fn(async () => {}) }));
jest.mock('../src/modules/pulseiras/pulseira.service', () => ({}));
jest.mock('../src/modules/pulseiras/loteSelecao', () => ({ buscarLotesDaFaixa: jest.fn(), escolherLote: jest.fn() }));
jest.mock('../src/modules/checkin/policy.service', () => ({ hasPermission: jest.fn(async () => false) }));
jest.mock('../src/middleware/eventMiddleware', () => ({
    requireEvent: (req, _res, next) => { req.event = { id: req.headers['x-evento-id'] || 'ev1' }; next(); },
    buscarEvento: jest.fn(async () => ({ evento: { id: 'ev1', horario_reset: '00:00:00' } }))
}));
jest.mock('../src/middleware/auth', () => {
    const real = jest.requireActual('../src/middleware/auth');
    return { ...real, authenticate: (req, _res, next) => { req.user = mockDb.usuario; next(); } };
});

const express = require('express');
const request = require('supertest');
const websocketService = require('../src/services/websocketService');
const checkinRouter = require('../src/modules/checkin/checkin.routes');

const app = express();
app.use(express.json());
app.use('/api', checkinRouter);

const UUID = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const PESSOA_EV1 = UUID(1);
const PESSOA_EV2 = UUID(2);

const operador = (permissoes) => ({
    id: UUID(50), role: 'operador', nivel_acesso: 'operador', evento_id: 'ev1',
    isAllowedEvent: (ev) => ev === 'ev1',
    getEffectivePermissions: () => permissoes
});

beforeEach(() => {
    mockDb.escritas = [];
    mockDb.logs_acesso = [];
    websocketService.emit.mockClear();
    mockDb.pessoas = [
        { id: PESSOA_EV1, evento_id: 'ev1', nome_completo: 'Da Sessão', cpf: '52998224725', status_acesso: 'pendente', empresa_id: null, numero_pulseira: null },
        { id: PESSOA_EV2, evento_id: 'ev2', nome_completo: 'De Outro Evento', cpf: '11144477735', status_acesso: 'pendente', empresa_id: null, numero_pulseira: null }
    ];
});

const pedirManual = (usuario, corpo) => request(app)
    .post('/api/checkin/manual')
    .set('x-evento-id', 'ev1')
    .send(corpo);

describe('check-in manual: pessoa de outro evento', () => {
    it('operador com CHECKOUT, pessoa de outro evento → 404 e zero gravações', async () => {
        mockDb.usuario = operador({ checkin: false, checkout: true, fiscalizacao: false });
        const res = await pedirManual(mockDb.usuario, { busca: PESSOA_EV2, tipo: 'checkout' });
        expect(res.status).toBe(404);
        expect(res.body.error).toBe('Pessoa não encontrada neste evento');
        expect(mockDb.escritas).toEqual([]);
        expect(websocketService.emit).not.toHaveBeenCalled();
    });

    it('operador com CHECKIN, pessoa de outro evento → 404 e zero gravações', async () => {
        mockDb.usuario = operador({ checkin: true, checkout: false, fiscalizacao: false });
        const res = await pedirManual(mockDb.usuario, { busca: PESSOA_EV2, tipo: 'checkin' });
        expect(res.status).toBe(404);
        expect(res.body.error).toBe('Pessoa não encontrada neste evento');
        expect(mockDb.escritas).toEqual([]);
        expect(websocketService.emit).not.toHaveBeenCalled();
    });

    it('operador com check-in e check-out, sem tipo, pessoa de outro evento → 404 e zero gravações', async () => {
        mockDb.usuario = operador({ checkin: true, checkout: true, fiscalizacao: false });
        const res = await pedirManual(mockDb.usuario, { busca: PESSOA_EV2 });
        expect(res.status).toBe(404);
        expect(mockDb.escritas).toEqual([]);
    });

    it('pessoa inexistente → 404 e zero gravações (mesma resposta, sem revelar se existe em outro evento)', async () => {
        mockDb.usuario = operador({ checkin: true, checkout: false, fiscalizacao: false });
        const res = await pedirManual(mockDb.usuario, { busca: UUID(999), tipo: 'checkin' });
        expect(res.status).toBe(404);
        expect(res.body.error).toBe('Pessoa não encontrada neste evento');
        expect(mockDb.escritas).toEqual([]);
    });

    it('controle: pessoa do próprio evento NÃO recebe 404 (a busca por evento acha quem é do evento)', async () => {
        mockDb.usuario = operador({ checkin: true, checkout: false, fiscalizacao: false });
        const res = await pedirManual(mockDb.usuario, { busca: PESSOA_EV1, tipo: 'checkin' });
        expect(res.body.error).not.toBe('Pessoa não encontrada neste evento');
        expect(res.status).not.toBe(404);
    });
});
