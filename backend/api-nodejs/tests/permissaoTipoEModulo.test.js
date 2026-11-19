/**
 * Permissão por tipo efetivo (req.body.tipo) nas rotas de entrada/saída e negação explícita de módulo.
 * - /leitor-rapido, /pulseira/checkin, /checkin/manual, /checkin/qrcode: tipo 'checkout' exige checkout;
 *   qualquer outro valor (inclusive ausente) exige checkin.
 * - checkAnyPermission: módulo desligado (=== false) → 403 sem consultar o PolicyEngine.
 * Supabase e políticas simulados; o middleware de permissão é o real.
 */
const mockPolicy = { hasPermission: jest.fn(async () => false) };

jest.mock('../src/config/supabase', () => ({ supabase: { from: () => ({}) } }));
jest.mock('../src/services/logger', () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() }));
jest.mock('../src/services/authCache', () => ({}));
jest.mock('../src/modules/checkin/policy.service', () => ({ hasPermission: (...a) => mockPolicy.hasPermission(...a) }));
jest.mock('../src/middleware/eventMiddleware', () => ({
    requireEvent: (req, res, next) => next(),
    buscarEvento: jest.fn(async () => ({ evento: null }))
}));
jest.mock('../src/modules/checkin/checkin.controller', () => new Proxy({}, { get: () => jest.fn() }));

const { checkAnyPermission } = require('../src/middleware/auth');
const checkinRouter = require('../src/modules/checkin/checkin.routes');

const rotaDe = (caminho) => checkinRouter.stack.find(l => l.route && l.route.path === caminho);
// Middleware de permissão da rota: o que declara os recursos (o wrapper por tipo ou o checkAnyPermission)
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
const passar = async (middleware, usuario, body = {}) => {
    const next = jest.fn();
    const res = respostaFalsa();
    await middleware({ user: usuario, headers: { 'x-evento-id': 'ev1' }, query: {}, body }, res, next);
    return { next, res };
};

const soCheckin = () => operador({ checkin: true, checkout: false, fiscalizacao: false });
const soCheckout = () => operador({ checkin: false, checkout: true, fiscalizacao: false });
const soFiscal = () => operador({ checkin: false, checkout: false, fiscalizacao: true });

beforeEach(() => {
    mockPolicy.hasPermission.mockReset();
    mockPolicy.hasPermission.mockResolvedValue(false);
});

describe('rotas com tipo no corpo: a permissão segue o tipo efetivo', () => {
    const rotas = ['/leitor-rapido', '/pulseira/checkin', '/checkin/manual', '/checkin/qrcode'];

    it.each(rotas)('%s: operador só com checkin registra ENTRADA (sem tipo ou tipo checkin)', async (caminho) => {
        const semTipo = await passar(permissaoDe(caminho), soCheckin(), {});
        expect(semTipo.next).toHaveBeenCalled();
        const entrada = await passar(permissaoDe(caminho), soCheckin(), { tipo: 'checkin' });
        expect(entrada.next).toHaveBeenCalled();
    });

    it.each(rotas)('%s: operador só com checkin NÃO registra SAÍDA (tipo checkout → 403)', async (caminho) => {
        const { next, res } = await passar(permissaoDe(caminho), soCheckin(), { tipo: 'checkout' });
        expect(res.statusCode).toBe(403);
        expect(next).not.toHaveBeenCalled();
    });

    it.each(rotas)('%s: operador só com checkout NÃO registra ENTRADA (sem tipo → 403)', async (caminho) => {
        const { next, res } = await passar(permissaoDe(caminho), soCheckout(), {});
        expect(res.statusCode).toBe(403);
        expect(next).not.toHaveBeenCalled();
    });

    it.each(rotas)('%s: operador só com checkout NÃO registra ENTRADA (tipo checkin → 403)', async (caminho) => {
        const { next, res } = await passar(permissaoDe(caminho), soCheckout(), { tipo: 'checkin' });
        expect(res.statusCode).toBe(403);
        expect(next).not.toHaveBeenCalled();
    });

    it.each(rotas)('%s: operador só com checkout registra SAÍDA (tipo checkout)', async (caminho) => {
        const { next } = await passar(permissaoDe(caminho), soCheckout(), { tipo: 'checkout' });
        expect(next).toHaveBeenCalled();
    });

    it.each(rotas)('%s: operador só com fiscalização não registra nem entrada nem saída', async (caminho) => {
        const entrada = await passar(permissaoDe(caminho), soFiscal(), {});
        const saida = await passar(permissaoDe(caminho), soFiscal(), { tipo: 'checkout' });
        expect(entrada.res.statusCode).toBe(403);
        expect(saida.res.statusCode).toBe(403);
    });

    it('leitor-rapido declara os dois módulos (entrada ou saída)', () => {
        expect(permissaoDe('/leitor-rapido').recursos).toEqual(['checkin', 'checkout']);
    });
});

describe('checkAnyPermission: módulo desligado explicitamente', () => {
    const exigeCheckin = checkAnyPermission(['checkin']);

    it('checkin === false → 403 mesmo com linha de policy que libera (policy não é consultada)', async () => {
        mockPolicy.hasPermission.mockResolvedValue(true);
        const usuario = operador({ checkin: false });
        const { next, res } = await passar(exigeCheckin, usuario);
        expect(res.statusCode).toBe(403);
        expect(next).not.toHaveBeenCalled();
        expect(mockPolicy.hasPermission).not.toHaveBeenCalled();
    });

    it('todos os módulos pedidos desligados → 403 sem policy', async () => {
        mockPolicy.hasPermission.mockResolvedValue(true);
        const { res } = await passar(checkAnyPermission(['checkin', 'checkout', 'fiscalizacao']),
            operador({ checkin: false, checkout: false, fiscalizacao: false }));
        expect(res.statusCode).toBe(403);
        expect(mockPolicy.hasPermission).not.toHaveBeenCalled();
    });

    it('módulo ligado passa sem consultar a policy', async () => {
        const { next } = await passar(exigeCheckin, operador({ checkin: true }));
        expect(next).toHaveBeenCalled();
        expect(mockPolicy.hasPermission).not.toHaveBeenCalled();
    });

    it('campo ausente (não desligado) segue para a policy, que pode liberar (supervisor)', async () => {
        mockPolicy.hasPermission.mockResolvedValue(true);
        const { next } = await passar(exigeCheckin, operador({}, { role: 'supervisor', nivel_acesso: 'supervisor' }));
        expect(next).toHaveBeenCalled();
        expect(mockPolicy.hasPermission).toHaveBeenCalled();
    });

    it('sem usuário → 401', async () => {
        const { res } = await passar(exigeCheckin, undefined);
        expect(res.statusCode).toBe(401);
    });
});
