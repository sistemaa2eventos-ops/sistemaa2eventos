/**
 * Lista de recusas do painel (migration 20261119c), pelas rotas reais de /api/checkin:
 * - GET  /api/checkin/recusados: só pendentes do evento em foco, mais novas primeiro, máx. 200, com nome da pessoa;
 * - POST /api/checkin/recusados/:id/resolver: marca resolvido_em e resolvido_por; outro evento = 404;
 *   já resolvida = 200 sem mudar; sem permissão = 403; tabela ausente = 503.
 * Supabase simulado (nada é gravado de verdade); o controller de check-in dos outros endpoints é substituído.
 */

const mockDb = {
    usuario: null,
    politicaNegada: false,   // hasPermission do policy devolve false (usuário sem o módulo checkin)
    semTabela: false,        // acessos_recusados ainda não existe (migration 20261119c não aplicada)
    acessos_recusados: [],
    pessoas: []
};

function mockConstruir(tabela) {
    const filtros = [];
    let ordem = null;
    let limite = Infinity;
    let operacao = null;
    let valores = null;
    const b = {
        select() { return b; },
        eq(c, v) { filtros.push(r => r[c] === v); return b; },
        is(c, v) { filtros.push(r => (r[c] ?? null) === v); return b; },
        in(c, vs) { filtros.push(r => vs.includes(r[c])); return b; },
        order(c, opts = {}) { ordem = { c, desc: opts.ascending === false }; return b; },
        limit(n) { limite = n; return b; },
        update(v) { operacao = 'update'; valores = v; return b; },
        maybeSingle() { return executar().then(r => ({ data: Array.isArray(r.data) ? (r.data[0] ?? null) : r.data, error: r.error })); },
        then(ok, ko) { return executar().then(ok, ko); }
    };
    function executar() {
        if (tabela === 'acessos_recusados' && mockDb.semTabela) {
            return Promise.resolve({ data: null, error: { code: 'PGRST205', message: "Could not find the table 'public.acessos_recusados' in the schema cache" } });
        }
        let alvo = (mockDb[tabela] || []).filter(r => filtros.every(f => f(r)));
        if (operacao === 'update') {
            alvo.forEach(r => Object.assign(r, valores));
            return Promise.resolve({ data: alvo.map(r => ({ ...r })), error: null });
        }
        if (ordem) {
            alvo = [...alvo].sort((x, y) => (x[ordem.c] < y[ordem.c] ? -1 : x[ordem.c] > y[ordem.c] ? 1 : 0) * (ordem.desc ? -1 : 1));
        }
        return Promise.resolve({ data: alvo.slice(0, limite).map(r => ({ ...r })), error: null });
    }
    return b;
}

jest.mock('../src/config/supabase', () => ({
    supabase: { from: (t) => mockConstruir(t) }
}));
jest.mock('../src/services/logger', () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() }));
jest.mock('../src/modules/checkin/policy.service', () => ({
    hasPermission: jest.fn(async () => !mockDb.politicaNegada)
}));
jest.mock('../src/middleware/auth', () => {
    const real = jest.requireActual('../src/middleware/auth');
    return { ...real, authenticate: (req, _res, next) => { req.user = mockDb.usuario; next(); } };
});
jest.mock('../src/middleware/eventMiddleware', () => ({
    requireEvent: (req, _res, next) => { req.event = { id: req.headers['x-evento-id'] || 'ev1' }; next(); },
    buscarEvento: jest.fn(async () => ({ evento: { id: 'ev1', horario_reset: '00:00:00' } }))
}));
// Os handlers de check-in dos outros endpoints não fazem parte deste teste
jest.mock('../src/modules/checkin/checkin.controller', () => new Proxy({}, {
    get: () => (_req, res) => res.json({ stub: true })
}));

const express = require('express');
const request = require('supertest');

const UUID = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const REC_PENDENTE = UUID(1);
const REC_RESOLVIDA = UUID(2);
const REC_OUTRO_EVENTO = UUID(3);
const PESSOA = UUID(20);
const USUARIO = UUID(50);

const operador = ({ permissoes = { checkin: true }, eventos = ['ev1'] } = {}) => ({
    id: USUARIO, role: 'operador', evento_id: 'ev1',
    isAllowedEvent: (e) => eventos.includes(e),
    getEffectivePermissions: () => permissoes
});

const recusa = (extra) => ({
    evento_id: 'ev1', pessoa_id: PESSOA, area_id: null, etapa: 'evento', tipo: 'checkin', metodo: 'pulseira',
    motivo: 'Recusado ao gravar da fila: Pessoa já está dentro desde 14:05', dados: { codigo: 'P0409' },
    criado_em: '2026-11-19T17:10:00.000Z', resolvido_em: null, resolvido_por: null, ...extra
});

function app() {
    const a = express();
    a.use(express.json());
    a.use('/api/checkin', require('../src/modules/checkin/checkin.routes'));
    return a;
}

beforeEach(() => {
    mockDb.usuario = operador();
    mockDb.politicaNegada = false;
    mockDb.semTabela = false;
    mockDb.pessoas = [{ id: PESSOA, evento_id: 'ev1', nome_completo: 'Maria Silva' }];
    mockDb.acessos_recusados = [
        { id: REC_PENDENTE, ...recusa({ criado_em: '2026-11-19T17:10:00.000Z' }) },
        { id: REC_RESOLVIDA, ...recusa({ criado_em: '2026-11-19T16:00:00.000Z', resolvido_em: '2026-11-19T16:30:00.000Z', resolvido_por: UUID(9) }) },
        { id: REC_OUTRO_EVENTO, ...recusa({ evento_id: 'ev2', pessoa_id: null }) }
    ];
    jest.clearAllMocks();
});

describe('GET /api/checkin/recusados', () => {
    it('lista só as pendentes do evento em foco, com o nome da pessoa', async () => {
        const r = await request(app()).get('/api/checkin/recusados').set('x-evento-id', 'ev1');

        expect(r.status).toBe(200);
        expect(r.body.success).toBe(true);
        expect(r.body.data).toHaveLength(1);
        expect(r.body.data[0]).toEqual(expect.objectContaining({ id: REC_PENDENTE, pessoa_nome: 'Maria Silva', tipo: 'checkin', metodo: 'pulseira' }));
        expect(r.body.data.map(x => x.id)).not.toContain(REC_OUTRO_EVENTO);
        expect(r.body.data.map(x => x.id)).not.toContain(REC_RESOLVIDA);
    });

    it('máximo de 200, mais novas primeiro', async () => {
        mockDb.acessos_recusados = Array.from({ length: 205 }, (_, i) => ({
            id: UUID(1000 + i), ...recusa({ criado_em: new Date(Date.UTC(2026, 10, 19, 12, i)).toISOString() })
        }));

        const r = await request(app()).get('/api/checkin/recusados').set('x-evento-id', 'ev1');

        expect(r.body.data).toHaveLength(200);
        expect(r.body.data[0].id).toBe(UUID(1000 + 204)); // a mais nova
    });

    it('?evento de outro evento: 400 (o escopo é sempre o evento em foco)', async () => {
        const r = await request(app()).get('/api/checkin/recusados?evento=ev2').set('x-evento-id', 'ev1');
        expect(r.status).toBe(400);
    });

    it('sem permissão de check-in no evento: 403', async () => {
        mockDb.usuario = operador({ permissoes: {} });
        mockDb.politicaNegada = true;
        const r = await request(app()).get('/api/checkin/recusados').set('x-evento-id', 'ev1');
        expect(r.status).toBe(403);
    });

    it('operador sem acesso ao evento: 403', async () => {
        mockDb.usuario = operador({ eventos: ['outro'] });
        const r = await request(app()).get('/api/checkin/recusados').set('x-evento-id', 'ev1');
        expect(r.status).toBe(403);
    });

    it('tabela ausente: 503 com o nome da migration', async () => {
        mockDb.semTabela = true;
        const r = await request(app()).get('/api/checkin/recusados').set('x-evento-id', 'ev1');
        expect(r.status).toBe(503);
        expect(r.body.error).toMatch(/20261119c_acessos_recusados\.sql/);
    });
});

describe('POST /api/checkin/recusados/:id/resolver', () => {
    it('marca resolvido_em e resolvido_por (quem resolveu) e responde a data', async () => {
        const r = await request(app()).post(`/api/checkin/recusados/${REC_PENDENTE}/resolver`).set('x-evento-id', 'ev1');

        expect(r.status).toBe(200);
        expect(r.body.data).toEqual(expect.objectContaining({ id: REC_PENDENTE, ja_resolvida: false }));
        expect(r.body.data.resolvido_em).toEqual(expect.any(String));
        const gravada = mockDb.acessos_recusados.find(x => x.id === REC_PENDENTE);
        expect(gravada.resolvido_por).toBe(USUARIO);
        expect(gravada.resolvido_em).not.toBeNull();
    });

    it('já resolvida: 200 com ja_resolvida true, sem mudar quem resolveu nem quando', async () => {
        const r = await request(app()).post(`/api/checkin/recusados/${REC_RESOLVIDA}/resolver`).set('x-evento-id', 'ev1');

        expect(r.status).toBe(200);
        expect(r.body.data.ja_resolvida).toBe(true);
        const igual = mockDb.acessos_recusados.find(x => x.id === REC_RESOLVIDA);
        expect(igual.resolvido_por).toBe(UUID(9));
        expect(igual.resolvido_em).toBe('2026-11-19T16:30:00.000Z');
    });

    it('recusa de outro evento: 404 e nada muda', async () => {
        const r = await request(app()).post(`/api/checkin/recusados/${REC_OUTRO_EVENTO}/resolver`).set('x-evento-id', 'ev1');

        expect(r.status).toBe(404);
        expect(mockDb.acessos_recusados.find(x => x.id === REC_OUTRO_EVENTO).resolvido_em).toBeNull();
    });

    it('id que não é uuid: 400', async () => {
        const r = await request(app()).post('/api/checkin/recusados/nao-e-uuid/resolver').set('x-evento-id', 'ev1');
        expect(r.status).toBe(400);
    });

    it('sem permissão de check-in: 403 e nada muda', async () => {
        mockDb.usuario = operador({ permissoes: {} });
        mockDb.politicaNegada = true;
        const r = await request(app()).post(`/api/checkin/recusados/${REC_PENDENTE}/resolver`).set('x-evento-id', 'ev1');
        expect(r.status).toBe(403);
        expect(mockDb.acessos_recusados.find(x => x.id === REC_PENDENTE).resolvido_em).toBeNull();
    });

    it('tabela ausente: 503', async () => {
        mockDb.semTabela = true;
        const r = await request(app()).post(`/api/checkin/recusados/${REC_PENDENTE}/resolver`).set('x-evento-id', 'ev1');
        expect(r.status).toBe(503);
    });
});
