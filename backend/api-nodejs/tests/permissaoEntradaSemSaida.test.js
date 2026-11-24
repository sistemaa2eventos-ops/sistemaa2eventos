/**
 * Permissão de entrada/saída e efeito no banco (decisão 3 da usuária, 19/11/2026):
 * 1. /logs e /fiscalizacoes-recentes exigem checkin, checkout ou fiscalizacao (admin passa). /stats/realtime fica como está.
 * 2. /pulseira/checkin, /checkin/manual e /checkin/qrcode: tipo AUSENTE NÃO é forçado para entrada. A permissão exige
 *    checkin OU checkout (sem nenhum dos dois, 403) e o sistema (toggle, determineSmartAccessType) decide o tipo.
 *    Tipo 'checkout' informado exige checkout; tipo 'checkin' informado exige checkin.
 * 3. Efeito no banco simulado, com o toggle REAL e a regra de entrada única REAL (bloqueioDeEntrada): com tipo
 *    ausente o toggle escolhe SAÍDA para quem está dentro (inclusive quem só tem check-in); com tipo 'checkin'
 *    pedido, a entrada única bloqueia (409 ENTRADA_BLOQUEADA, liberavel false) e nenhuma saída é gravada.
 *    Área geral é livre (20261119f): sem 409.
 *
 * O passo 3 reproduz a sequência do checkin.service (toggle → entrada única) sem o HTTP: o controller só repassa
 * `tipo: req.body.tipo || null` (checkin.controller.js, checkinManual). Supabase, política, cache e logger simulados:
 * nada é gravado de verdade.
 */

const mockDb = { logs_acesso: [], evento_areas: [], liberacoes_reentrada: [], inserts: [] };
const mockPolicy = { hasPermission: jest.fn(async () => false) };

// Consulta simulada: eq/is/gt/in filtram, order/limit ordenam; insert só registra
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
        order(c, opts = {}) { ordem = { c, desc: opts.ascending === false }; return b; },
        limit(n) { limite = n; return b; },
        insert(rows) { operacao = 'insert'; carga = rows; return b; },
        maybeSingle() { return executar().then(r => ({ data: (r.data && r.data[0]) || null, error: r.error })); },
        single() { return executar().then(r => ({ data: (r.data && r.data[0]) || null, error: r.error })); },
        then(ok, ko) { return executar().then(ok, ko); }
    };
    function executar() {
        if (operacao === 'insert') {
            mockDb[tabela] && mockDb[tabela].push(...carga);
            mockDb.inserts.push({ tabela, linhas: carga });
            return Promise.resolve({ data: carga, error: null });
        }
        let r = (mockDb[tabela] || []).filter(x => filtros.every(f => f(x)));
        if (ordem) r = [...r].sort((x, y) => ((x[ordem.c] < y[ordem.c] ? -1 : 1) * (ordem.desc ? -1 : 1)));
        return Promise.resolve({ data: r.slice(0, limite), error: null });
    }
    return b;
}

jest.mock('../src/config/supabase', () => ({ supabase: { from: (t) => mockBuilder(t) } }));
jest.mock('../src/services/logger', () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() }));
jest.mock('../src/services/authCache', () => ({}));
jest.mock('../src/services/cacheService', () => ({ invalidatePessoa: jest.fn(), get: jest.fn(), set: jest.fn() }));
jest.mock('../src/utils/buscarTodos', () => ({ buscarTodos: jest.fn(async () => ({ data: [], error: null })) }));
jest.mock('../src/modules/checkin/policy.service', () => ({ hasPermission: (...a) => mockPolicy.hasPermission(...a) }));
jest.mock('../src/middleware/eventMiddleware', () => ({
    requireEvent: (req, res, next) => next(),
    buscarEvento: jest.fn(async () => ({ evento: { id: 'ev1', horario_reset: '00:00:00' } }))
}));
jest.mock('../src/modules/checkin/checkin.controller', () => new Proxy({}, { get: () => jest.fn() }));
// Marca os recursos pedidos em cada checkAnyPermission (o comportamento continua o real)
jest.mock('../src/middleware/auth', () => {
    const real = jest.requireActual('../src/middleware/auth');
    const checkAnyPermission = (recursos, acao) => {
        const middleware = real.checkAnyPermission(recursos, acao);
        middleware.recursos = recursos;
        return middleware;
    };
    return { ...real, checkAnyPermission };
});

const checkinRouter = require('../src/modules/checkin/checkin.routes');
const ValidationService = require('../src/modules/checkin/services/validation.service');
const entradaEtapa = require('../src/modules/checkin/services/entradaEtapa');

const UUID = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const PESSOA = 'p1';
const AREA_PORTAO = UUID(20);
const hoje = () => entradaEtapa.diaDoAcesso(new Date());
const CONSULTA = ['checkin', 'checkout', 'fiscalizacao'];

const rotaDe = (caminho) => checkinRouter.stack.find(l => l.route && l.route.path === caminho);
const permissaoDe = (caminho) => rotaDe(caminho).route.stack.map(s => s.handle).find(h => Array.isArray(h.recursos));

const respostaFalsa = () => {
    const res = { statusCode: 200, corpo: null };
    res.status = (c) => { res.statusCode = c; return res; };
    res.json = (b) => { res.corpo = b; return res; };
    return res;
};
const operador = (permissoes, extra = {}) => ({
    id: 'u1', role: 'operador', nivel_acesso: 'operador', evento_id: 'ev1',
    isAllowedEvent: (ev) => ev === 'ev1',
    getEffectivePermissions: () => permissoes,
    ...extra
});
// Passa pelo middleware da rota com a requisição (como chegaria); devolve next, resposta e a requisição já ajustada
const passar = async (middleware, usuario, body = {}, query = {}) => {
    const next = jest.fn();
    const res = respostaFalsa();
    const req = { user: usuario, headers: { 'x-evento-id': 'ev1' }, query, body };
    await middleware(req, res, next);
    return { next, res, req };
};

const soCheckin = () => operador({ checkin: true, checkout: false, fiscalizacao: false });
const soCheckout = () => operador({ checkin: false, checkout: true, fiscalizacao: false });
const checkinECheckout = () => operador({ checkin: true, checkout: true, fiscalizacao: false });
const soFiscal = () => operador({ checkin: false, checkout: false, fiscalizacao: true });

beforeEach(() => {
    mockPolicy.hasPermission.mockReset();
    mockPolicy.hasPermission.mockResolvedValue(false);
    mockDb.logs_acesso = [];
    mockDb.evento_areas = [{ id: AREA_PORTAO, evento_id: 'ev1', nome_area: 'Portão', controla_entrada: true }];
    mockDb.liberacoes_reentrada = [];
    mockDb.inserts = [];
    jest.clearAllMocks();
});

describe('1. consultas /logs e /fiscalizacoes-recentes exigem módulo', () => {
    it.each(['/logs', '/fiscalizacoes-recentes'])('%s: operador sem nenhum dos três módulos → 403, a rota não roda', async (caminho) => {
        const { next, res } = await passar(permissaoDe(caminho), operador({ checkin: false, checkout: false, fiscalizacao: false }));
        expect(res.statusCode).toBe(403);
        expect(next).not.toHaveBeenCalled();
    });

    it.each(['/logs', '/fiscalizacoes-recentes'])('%s: qualquer um dos três módulos libera (check-in, check-out ou fiscalização)', async (caminho) => {
        expect(permissaoDe(caminho).recursos).toEqual(CONSULTA);
        for (const usuario of [soCheckin(), soCheckout(), soFiscal()]) {
            const { next } = await passar(permissaoDe(caminho), usuario);
            expect(next).toHaveBeenCalled();
        }
    });

    it.each(['/logs', '/fiscalizacoes-recentes'])('%s: admin passa sempre', async (caminho) => {
        const { next } = await passar(permissaoDe(caminho), { id: 'a1', role: 'admin_master', nivel_acesso: 'admin_master' });
        expect(next).toHaveBeenCalled();
    });
});

describe('2. tipo ausente: nenhum tipo é forçado; exige checkin ou checkout (exigePorTipo)', () => {
    const rotas = ['/pulseira/checkin', '/checkin/manual', '/checkin/qrcode'];

    it.each(rotas)('%s: operador só check-in, sem tipo → NÃO força tipo (o sistema decide) e a rota roda', async (caminho) => {
        const { next, req } = await passar(permissaoDe(caminho), soCheckin(), {});
        expect(next).toHaveBeenCalled();
        expect(req.body.tipo).toBeUndefined();
    });

    it.each(rotas)('%s: operador check-in + check-out, sem tipo → NÃO força (o toggle decide)', async (caminho) => {
        const { next, req } = await passar(permissaoDe(caminho), checkinECheckout(), {});
        expect(next).toHaveBeenCalled();
        expect(req.body.tipo).toBeUndefined();
    });

    it.each(rotas)('%s: supervisor sem campo checkout mas com a política liberando checkout → NÃO força', async (caminho) => {
        mockPolicy.hasPermission.mockResolvedValue(true); // a política libera check-in e check-out (perfil supervisor)
        const supervisor = operador({}, { role: 'supervisor', nivel_acesso: 'supervisor' });
        const { next, req } = await passar(permissaoDe(caminho), supervisor, {});
        expect(next).toHaveBeenCalled();
        expect(req.body.tipo).toBeUndefined();
    });

    it.each(rotas)('%s: admin sem tipo → NÃO força (passa pelo toggle como antes)', async (caminho) => {
        const { next, req } = await passar(permissaoDe(caminho), { id: 'a1', role: 'admin_master', nivel_acesso: 'admin_master' }, {});
        expect(next).toHaveBeenCalled();
        expect(req.body.tipo).toBeUndefined();
    });

    it.each(rotas)('%s: operador só check-in, tipo checkout informado → 403 (não é forçado para entrada)', async (caminho) => {
        const { next, res, req } = await passar(permissaoDe(caminho), soCheckin(), { tipo: 'checkout' });
        expect(res.statusCode).toBe(403);
        expect(next).not.toHaveBeenCalled();
        expect(req.body.tipo).toBe('checkout');
    });

    it.each(rotas)('%s: operador só check-out, sem tipo → passa (tem módulo de saída; o sistema decide, sem tipo forçado)', async (caminho) => {
        const { next, req } = await passar(permissaoDe(caminho), soCheckout(), {});
        expect(next).toHaveBeenCalled();
        expect(req.body.tipo).toBeUndefined();
    });

    it.each(rotas)('%s: operador só fiscalização, sem tipo → 403 (sem check-in nem check-out)', async (caminho) => {
        const { next, res } = await passar(permissaoDe(caminho), soFiscal(), {});
        expect(res.statusCode).toBe(403);
        expect(next).not.toHaveBeenCalled();
    });
});

describe('3. efeito no banco simulado: toggle real + entrada única real', () => {
    // Mesmo passo do checkin.service: o toggle decide o tipo (ou respeita o tipo pedido); se for entrada,
    // a regra de entrada única decide o 409
    async function acesso(usuario, corpo, area_id) {
        const { req, res, next } = await passar(permissaoDe('/checkin/manual'), usuario, { busca: PESSOA, ...corpo });
        if (!next.mock.calls.length) return { bloqueadoNaRota: res.statusCode };
        const ctx = {};
        const tipoFinal = await ValidationService.determineSmartAccessType(PESSOA, 'ev1', req.body.tipo, area_id, ctx);
        if (tipoFinal !== 'checkin') return { tipoFinal, erro: null };
        const erro = await entradaEtapa.bloqueioDeEntrada(require('../src/config/supabase').supabase, {
            evento_id: 'ev1', pessoa_id: PESSOA, etapa: 'evento', dia: hoje(), area_id, logId: UUID(90)
        });
        return { tipoFinal, erro: erro && { status: erro.status, codigo: erro.codigo, liberavel: erro.liberavel } };
    }
    const acessoSemTipo = (usuario, area_id) => acesso(usuario, {}, area_id);

    const registrarPassagem = (tipo, area_id, minutosAtras = 0) => mockDb.logs_acesso.push({
        id: UUID(100 + mockDb.logs_acesso.length), evento_id: 'ev1', pessoa_id: PESSOA, tipo,
        etapa: 'evento', dia_civil: hoje(), area_id, observacao: null,
        created_at: new Date(Date.now() - minutosAtras * 60000).toISOString()
    });

    it('sem tipo, pessoa DENTRO do portão: o toggle escolhe SAÍDA, mesmo para quem só tem check-in (o sistema decide)', async () => {
        registrarPassagem('checkin', AREA_PORTAO, 5);
        const tipo = await ValidationService.determineSmartAccessType(PESSOA, 'ev1', undefined, AREA_PORTAO, {});
        expect(tipo).toBe('checkout');
        const r = await acessoSemTipo(soCheckin(), AREA_PORTAO);
        expect(r.tipoFinal).toBe('checkout');
    });

    it('tipo checkin PEDIDO, área de portão, DENTRO → ENTRADA_BLOQUEADA 409 (liberavel false), sem saída gravada', async () => {
        registrarPassagem('checkin', AREA_PORTAO, 5);
        const r = await acesso(soCheckin(), { tipo: 'checkin' }, AREA_PORTAO);
        expect(r.tipoFinal).toBe('checkin');
        expect(r.erro).toEqual({ status: 409, codigo: 'ENTRADA_BLOQUEADA', liberavel: false });
        expect(mockDb.inserts.flatMap(i => i.linhas).filter(l => l.tipo === 'checkout')).toHaveLength(0);
    });

    it('área de portão, FORA (sem registro hoje nesta etapa/área), só check-in, sem tipo → entrada', async () => {
        const r = await acessoSemTipo(soCheckin(), AREA_PORTAO);
        expect(r.tipoFinal).toBe('checkin');
        expect(r.erro).toBeNull();
    });

    it('área geral (livre): só check-in, sem tipo, pessoa dentro → toggle escolhe SAÍDA, sem 409 (área livre, 20261119f)', async () => {
        registrarPassagem('checkin', null, 5);
        const r = await acessoSemTipo(soCheckin(), null);
        expect(r.tipoFinal).toBe('checkout');
        expect(r.erro).toBeNull();
    });

    it('operador com check-out, sem tipo, pessoa dentro → o toggle continua escolhendo SAÍDA', async () => {
        registrarPassagem('checkin', AREA_PORTAO, 5);
        const r = await acessoSemTipo(checkinECheckout(), AREA_PORTAO);
        expect(r.tipoFinal).toBe('checkout');
    });
});
