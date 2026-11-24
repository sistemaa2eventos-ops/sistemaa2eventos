/**
 * Controle de entrada (portão), migration 20261119_controle_entrada_portao:
 *  - leitura de controla_entrada da área (área geral e área sem linha controlam; false libera);
 *  - liberação do controlador: POST /api/checkin/liberar-reentrada (403 sem permissão, 404 pessoa de outro
 *    evento, grava liberação com liberado_por, dia civil e etapa do lote);
 *  - tabela de liberações ausente: a regra de saída sem liberação fica desligada, sem quebrar a entrada;
 *  - área nova sem controla_entrada informado fica controlada (default true, simulado no insert);
 *  - ApiResponse.error sobe codigo e liberavel para o topo do corpo do 409.
 * Supabase simulado: nada é gravado no banco de verdade.
 */

const mockDb = {
    usuario: null,
    pessoas: [], evento_areas: [], evento_tipos_pulseira: [], logs_acesso: [], liberacoes_reentrada: [],
    inserts: [],
    semLiberacoes: false,      // tabela liberacoes_reentrada ainda não existe (migration não aplicada)
    politicaNegada: false      // hasPermission do policy devolve false (usuário sem o módulo checkin)
};

function mockBuilder(tabela) {
    const filtros = [];
    let ordem = null;
    let limite = Infinity;
    let operacao = null;
    let carga = null;
    const b = {
        select() { return b; },
        eq(c, v) { filtros.push(r => r[c] === v); return b; },
        is(c, v) { filtros.push(r => (r[c] ?? null) === v); return b; },
        gt(c, v) { filtros.push(r => r[c] > v); return b; },
        in(c, vs) { filtros.push(r => vs.includes(r[c])); return b; },
        // Nenhuma consulta de check-in usa .or() (o filtro de credenciamento foi removido): se aparecer, o teste falha
        or(expr) { throw new Error('or não deveria ser usado no check-in: ' + expr); },
        order(c, opts = {}) { ordem = { c, desc: opts.ascending === false }; return b; },
        limit(n) { limite = n; return b; },
        insert(rows) { operacao = 'insert'; carga = rows; return b; },
        maybeSingle() { return executar().then(r => ({ data: (r.data && r.data[0]) || null, error: r.error })); },
        single() { return executar().then(r => ({ data: (r.data && r.data[0]) || null, error: r.error })); },
        then(ok, ko) { return executar().then(ok, ko); }
    };
    function executar() {
        if (tabela === 'liberacoes_reentrada' && mockDb.semLiberacoes) {
            return Promise.resolve({ data: null, error: { code: 'PGRST205', message: "Could not find the table 'public.liberacoes_reentrada' in the schema cache" } });
        }
        if (operacao === 'insert') {
            const linhas = carga.map((l) => {
                const nova = { ...l };
                if (tabela === 'liberacoes_reentrada') {
                    nova.id = `lib-${mockDb.liberacoes_reentrada.length + 1}`;
                    nova.criado_em = new Date().toISOString();
                }
                // DEFAULT da coluna (migration 20261119): área nova fica controlada
                if (tabela === 'evento_areas' && nova.controla_entrada === undefined) nova.controla_entrada = true;
                return nova;
            });
            mockDb[tabela].push(...linhas);
            mockDb.inserts.push({ tabela, linhas: carga });
            return Promise.resolve({ data: linhas, error: null });
        }
        let r = (mockDb[tabela] || []).filter(x => filtros.every(f => f(x)));
        if (ordem) r = [...r].sort((x, y) => ((x[ordem.c] < y[ordem.c] ? -1 : 1) * (ordem.desc ? -1 : 1)));
        return Promise.resolve({ data: r.slice(0, limite), error: null });
    }
    return b;
}

jest.mock('../src/config/supabase', () => ({
    supabase: { from: (t) => mockBuilder(t) }
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
// Os controllers das outras rotas de check-in não fazem parte deste teste: qualquer handler serve
jest.mock('../src/modules/checkin/checkin.controller', () => new Proxy({}, {
    get: () => (_req, res) => res.json({ stub: true })
}));

const express = require('express');
const request = require('supertest');
const entradaEtapa = require('../src/modules/checkin/services/entradaEtapa');
const ApiResponse = require('../src/utils/apiResponse');
const configController = require('../src/modules/system/config.controller');
const { supabase } = require('../src/config/supabase');

const UUID = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const PESSOA = UUID(1);
const PESSOA_OUTRO_EVENTO = UUID(2);
const AREA = UUID(10);
const AREA_OUTRO_EVENTO = UUID(11);
const AREA_LIVRE = UUID(12);
const USUARIO = UUID(50);
const hoje = () => entradaEtapa.diaDoAcesso(new Date());

const operador = ({ permissoes = { checkin: true }, eventos = ['ev1'] } = {}) => ({
    id: USUARIO, role: 'operador', evento_id: 'ev1',
    isAllowedEvent: (e) => eventos.includes(e),
    getEffectivePermissions: () => permissoes
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
    mockDb.semLiberacoes = false;
    mockDb.pessoas = [
        { id: PESSOA, evento_id: 'ev1', tipo_pulseira_id: 'tp-montagem' },
        { id: PESSOA_OUTRO_EVENTO, evento_id: 'ev2', tipo_pulseira_id: null }
    ];
    mockDb.evento_tipos_pulseira = [{ id: 'tp-montagem', fase: 'montagem' }];
    mockDb.evento_areas = [
        { id: AREA, evento_id: 'ev1', nome_area: 'Entrada de serviços', controla_entrada: true },
        { id: AREA_OUTRO_EVENTO, evento_id: 'ev2', nome_area: 'Outro', controla_entrada: true },
        { id: AREA_LIVRE, evento_id: 'ev1', nome_area: 'Palco', controla_entrada: false }
    ];
    mockDb.logs_acesso = [];
    mockDb.liberacoes_reentrada = [];
    mockDb.inserts = [];
    jest.clearAllMocks();
});

describe('controla_entrada da área (regra do portão)', () => {
    it('área geral (sem área) é LIVRE (20261119f); área informada sem linha continua controlada (comportamento antigo)', async () => {
        expect(await entradaEtapa.areaControlaEntrada(supabase, null)).toBe(false);
        expect(await entradaEtapa.areaControlaEntrada(supabase, UUID(99))).toBe(true);
    });

    it('área geral: dentro e saiu sem liberação não bloqueiam (entra e sai quantas vezes quiser)', async () => {
        const dados = { evento_id: 'ev1', pessoa_id: PESSOA, etapa: 'montagem', dia: hoje(), area_id: null, logId: UUID(75) };
        mockDb.logs_acesso.push({ id: UUID(76), evento_id: 'ev1', pessoa_id: PESSOA, tipo: 'checkin', etapa: 'montagem', dia_civil: hoje(), area_id: null, observacao: null, created_at: new Date(Date.now() - 60000).toISOString() });
        expect(await entradaEtapa.bloqueioDeEntrada(supabase, dados)).toBeNull();
        mockDb.logs_acesso.push({ id: UUID(77), evento_id: 'ev1', pessoa_id: PESSOA, tipo: 'checkout', etapa: 'montagem', dia_civil: hoje(), area_id: null, observacao: null, created_at: new Date().toISOString() });
        expect(await entradaEtapa.bloqueioDeEntrada(supabase, dados)).toBeNull();
    });

    it('área com controla_entrada = false não controla; true controla; resultado fica em cache da requisição', async () => {
        const cache = new Map();
        expect(await entradaEtapa.areaControlaEntrada(supabase, AREA_LIVRE, cache)).toBe(false);
        expect(cache.get(AREA_LIVRE)).toBe(false);
        mockDb.evento_areas.find(a => a.id === AREA_LIVRE).controla_entrada = true; // muda no banco...
        expect(await entradaEtapa.areaControlaEntrada(supabase, AREA_LIVRE, cache)).toBe(false); // ...cache ainda vale
    });

    it('área sem controle: não bloqueia entrada enquanto dentro, nem após saída', async () => {
        const dados = { evento_id: 'ev1', pessoa_id: PESSOA, etapa: 'montagem', dia: hoje(), area_id: AREA_LIVRE, logId: UUID(70) };
        mockDb.logs_acesso.push({ id: UUID(71), evento_id: 'ev1', pessoa_id: PESSOA, tipo: 'checkin', etapa: 'montagem', dia_civil: hoje(), area_id: AREA_LIVRE, observacao: null, created_at: new Date(Date.now() - 60000).toISOString() });
        expect(await entradaEtapa.bloqueioDeEntrada(supabase, dados)).toBeNull();
        mockDb.logs_acesso.push({ id: UUID(72), evento_id: 'ev1', pessoa_id: PESSOA, tipo: 'checkout', etapa: 'montagem', dia_civil: hoje(), area_id: AREA_LIVRE, observacao: null, created_at: new Date().toISOString() });
        expect(await entradaEtapa.bloqueioDeEntrada(supabase, dados)).toBeNull();
    });

    it('tabela liberacoes_reentrada ausente: saída sem liberação não bloqueia (regra desligada, com aviso)', async () => {
        mockDb.semLiberacoes = true;
        const logger = require('../src/services/logger');
        mockDb.logs_acesso.push({ id: UUID(73), evento_id: 'ev1', pessoa_id: PESSOA, tipo: 'checkout', etapa: 'montagem', dia_civil: hoje(), area_id: AREA, observacao: null, created_at: new Date(Date.now() - 60000).toISOString() });
        const erro = await entradaEtapa.bloqueioDeEntrada(supabase, { evento_id: 'ev1', pessoa_id: PESSOA, etapa: 'montagem', dia: hoje(), area_id: AREA, logId: UUID(74) });
        expect(erro).toBeNull();
        expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining('20261119_controle_entrada_portao.sql'));
    });

    it('área nova sem controla_entrada informado fica controlada (default true)', async () => {
        const res = { statusCode: 0, body: null, status(c) { this.statusCode = c; return this; }, json(b) { this.body = b; return this; } };
        await configController.createArea({ event: { id: 'ev1' }, body: { nome_area: 'Entrada de serviços' } }, res);
        expect(res.statusCode).toBe(201);
        expect(res.body.data.controla_entrada).toBe(true);
        expect(mockDb.inserts[0].linhas[0]).not.toHaveProperty('controla_entrada');
    });

    it('área nova com controla_entrada = false é gravada; valor que não é boolean é recusado (400)', async () => {
        const mk = () => ({ statusCode: 0, body: null, status(c) { this.statusCode = c; return this; }, json(b) { this.body = b; return this; } });
        const ok = mk();
        await configController.createArea({ event: { id: 'ev1' }, body: { nome_area: 'Palco', controla_entrada: false } }, ok);
        expect(ok.body.data.controla_entrada).toBe(false);
        const ruim = mk();
        await configController.createArea({ event: { id: 'ev1' }, body: { nome_area: 'X', controla_entrada: 'nao' } }, ruim);
        expect(ruim.statusCode).toBe(400);
    });
});

describe('POST /api/checkin/liberar-reentrada', () => {
    const rota = '/api/checkin/liberar-reentrada';

    it('sem permissão de check-in no evento: 403, nada gravado', async () => {
        mockDb.usuario = operador({ permissoes: {} });
        mockDb.politicaNegada = true;
        const r = await request(app()).post(rota).send({ pessoa_id: PESSOA, area_id: AREA });
        expect(r.status).toBe(403);
        expect(mockDb.liberacoes_reentrada).toHaveLength(0);
    });

    it('operador sem acesso ao evento: 403', async () => {
        mockDb.usuario = operador({ eventos: ['outro'] });
        const r = await request(app()).post(rota).set('x-evento-id', 'ev1').send({ pessoa_id: PESSOA, area_id: AREA });
        expect(r.status).toBe(403);
        expect(mockDb.liberacoes_reentrada).toHaveLength(0);
    });

    it('pessoa de outro evento: 404 e nada gravado', async () => {
        const r = await request(app()).post(rota).send({ pessoa_id: PESSOA_OUTRO_EVENTO, area_id: AREA });
        expect(r.status).toBe(404);
        expect(mockDb.liberacoes_reentrada).toHaveLength(0);
    });

    it('grava a liberação: quem liberou, dia civil do momento, área e etapa do lote da pessoa', async () => {
        const r = await request(app()).post(rota).send({ pessoa_id: PESSOA, area_id: AREA });
        expect(r.status).toBe(200);
        expect(r.body).toEqual({ success: true, data: { id: expect.any(String) } });
        expect(mockDb.liberacoes_reentrada).toHaveLength(1);
        const [lib] = mockDb.liberacoes_reentrada;
        expect(lib).toMatchObject({
            evento_id: 'ev1', pessoa_id: PESSOA, area_id: AREA, etapa: 'montagem',
            dia_civil: hoje(), liberado_por: USUARIO
        });
    });

    it('etapa informada é usada (showday vira evento); área geral com area_id null', async () => {
        const r = await request(app()).post(rota).send({ pessoa_id: PESSOA, area_id: null, etapa: 'showday' });
        expect(r.status).toBe(200);
        expect(mockDb.liberacoes_reentrada[0]).toMatchObject({ area_id: null, etapa: 'evento' });
    });

    it('área de outro evento: 400', async () => {
        const r = await request(app()).post(rota).send({ pessoa_id: PESSOA, area_id: AREA_OUTRO_EVENTO });
        expect(r.status).toBe(400);
        expect(mockDb.liberacoes_reentrada).toHaveLength(0);
    });

    it('corpo inválido: sem pessoa_id, area_id ou etapa fora da lista → 400', async () => {
        const a = app();
        expect((await request(a).post(rota).send({ area_id: AREA })).status).toBe(400);
        expect((await request(a).post(rota).send({ pessoa_id: PESSOA, area_id: 'x' })).status).toBe(400);
        expect((await request(a).post(rota).send({ pessoa_id: PESSOA, etapa: 'festa' })).status).toBe(400);
        expect(mockDb.liberacoes_reentrada).toHaveLength(0);
    });

    it('liberação gravada passa a valer na regra: saída depois de liberada deixa entrar', async () => {
        mockDb.logs_acesso.push({ id: UUID(80), evento_id: 'ev1', pessoa_id: PESSOA, tipo: 'checkout', etapa: 'montagem', dia_civil: hoje(), area_id: AREA, observacao: null, created_at: new Date(Date.now() - 60000).toISOString() });
        const antes = await entradaEtapa.bloqueioDeEntrada(supabase, { evento_id: 'ev1', pessoa_id: PESSOA, etapa: 'montagem', dia: hoje(), area_id: AREA, logId: UUID(81) });
        expect(antes.liberavel).toBe(true);
        await request(app()).post(rota).send({ pessoa_id: PESSOA, area_id: AREA });
        const depois = await entradaEtapa.bloqueioDeEntrada(supabase, { evento_id: 'ev1', pessoa_id: PESSOA, etapa: 'montagem', dia: hoje(), area_id: AREA, logId: UUID(81) });
        expect(depois).toBeNull();
    });

    it('tabela de liberações ausente: 503 com o nome da migration', async () => {
        mockDb.semLiberacoes = true;
        const r = await request(app()).post(rota).send({ pessoa_id: PESSOA, area_id: AREA });
        expect(r.status).toBe(503);
        expect(r.body.error).toMatch(/20261119_controle_entrada_portao\.sql/);
    });
});

describe('corpo do 409 de bloqueio (contrato com o painel)', () => {
    const resposta = () => ({ statusCode: 0, body: null, status(c) { this.statusCode = c; return this; }, json(b) { this.body = b; return this; } });

    it('bloqueio por saída sem liberação: codigo e liberavel true no topo do corpo', () => {
        const res = resposta();
        const erro = entradaEtapa.erroSaidaSemLiberacao('2026-11-19T12:00:00Z');
        ApiResponse.error(res, erro.message, erro.status, { codigo: erro.codigo, liberavel: erro.liberavel });
        expect(res.statusCode).toBe(409);
        expect(res.body).toEqual({
            success: false,
            error: expect.stringMatching(/^Saída registrada às \d{2}:\d{2}\. Reentrada precisa de liberação do controlador\.$/),
            details: { codigo: 'ENTRADA_BLOQUEADA', liberavel: true },
            codigo: 'ENTRADA_BLOQUEADA',
            liberavel: true
        });
    });

    it('pessoa ainda dentro: liberavel false', () => {
        const res = resposta();
        const erro = entradaEtapa.erroEntradaAberta('2026-11-19T12:00:00Z');
        ApiResponse.error(res, erro.message, erro.status, { codigo: erro.codigo, liberavel: erro.liberavel });
        expect(res.body.codigo).toBe('ENTRADA_BLOQUEADA');
        expect(res.body.liberavel).toBe(false);
    });

    it('outros erros (sem codigo) mantêm o formato antigo, sem campos novos', () => {
        const res = resposta();
        ApiResponse.error(res, 'Cota esgotada', 403, null);
        expect(res.body).toEqual({ success: false, error: 'Cota esgotada', details: null });
    });

    it('TURNO_ANTERIOR continua com details.codigo e agora também codigo no topo (aditivo)', () => {
        const res = resposta();
        ApiResponse.error(res, 'Confirme', 409, { codigo: 'TURNO_ANTERIOR', pessoa: {} });
        expect(res.body.details.codigo).toBe('TURNO_ANTERIOR');
        expect(res.body.codigo).toBe('TURNO_ANTERIOR');
        expect(res.body).not.toHaveProperty('liberavel');
    });

    it('HINT do banco: "true|instante" é saída sem liberação; "false|instante" é dentro; sem prefixo é dentro', () => {
        expect(entradaEtapa.erroDoBloqueioDoBanco('true|2026-11-19T12:00:00Z').liberavel).toBe(true);
        expect(entradaEtapa.erroDoBloqueioDoBanco('false|2026-11-19T12:00:00Z').liberavel).toBe(false);
        const antigo = entradaEtapa.erroDoBloqueioDoBanco('2026-11-19T12:00:00Z');
        expect(antigo.liberavel).toBe(false);
        expect(antigo.message).toMatch(/^Pessoa já está dentro desde \d{2}:\d{2} \(America\/Sao_Paulo\)$/);
    });
});
