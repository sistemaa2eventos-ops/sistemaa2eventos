/**
 * GET /access/consultar-pulseira/:codigo: limite por usuário e perfil de check-in/checkout/fiscalização.
 * POST /access/checkin/fiscalizar removido (nenhum cliente o usa; o app fiscal chama /access/fiscalizar).
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
const rateLimiter = require('../src/middleware/rateLimiter');
const checkinRouter = require('../src/modules/checkin/checkin.routes');

const rotaDe = (caminho) => checkinRouter.stack.find(l => l.route && l.route.path === caminho);

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
const chamar = async (usuario, req = {}) => {
    const next = jest.fn();
    const res = respostaFalsa();
    await checkAnyPermission(['checkin', 'checkout', 'fiscalizacao'])({
        user: usuario, headers: { 'x-evento-id': 'ev1' }, query: {}, body: {}, ...req
    }, res, next);
    return { next, res };
};

beforeEach(() => {
    mockPolicy.hasPermission.mockReset();
    mockPolicy.hasPermission.mockResolvedValue(false);
});

describe('rota GET /consultar-pulseira/:codigo', () => {
    it('usa o limite por usuário dedicado à consulta (não o de check-in/checkout)', () => {
        const rota = rotaDe('/consultar-pulseira/:codigo');
        expect(rota).toBeDefined();
        const handles = rota.route.stack.map(s => s.handle);
        expect(handles).toContain(rateLimiter.consulta);
        expect(handles).not.toContain(rateLimiter.access);
    });

    it('a conferência exige algum dos módulos de operação (checkin, checkout ou fiscalizacao)', () => {
        const rota = rotaDe('/consultar-pulseira/:codigo');
        // authenticate, requireEvent, rateLimiter.consulta, checkAnyPermission, controller
        expect(rota.route.stack).toHaveLength(5);
    });
});

describe('rota removida', () => {
    it('/checkin/fiscalizar não existe mais; /fiscalizar continua', () => {
        expect(rotaDe('/checkin/fiscalizar')).toBeUndefined();
        expect(rotaDe('/fiscalizar')).toBeDefined();
    });
});

describe('checkAnyPermission (módulos de operação)', () => {
    it('sem usuário autenticado → 401', async () => {
        const { next, res } = await chamar(undefined);
        expect(res.statusCode).toBe(401);
        expect(next).not.toHaveBeenCalled();
    });

    it('operador de check-in (módulo checkin ligado) continua acessando', async () => {
        const { next } = await chamar(operador({ checkin: true, checkout: false, fiscalizacao: false }));
        expect(next).toHaveBeenCalled();
    });

    it('operador de checkout (só checkout ligado) acessa', async () => {
        const { next } = await chamar(operador({ checkin: false, checkout: true, fiscalizacao: false }));
        expect(next).toHaveBeenCalled();
    });

    it('fiscal (só fiscalização ligada) acessa', async () => {
        const { next } = await chamar(operador({ checkin: false, checkout: false, fiscalizacao: true }));
        expect(next).toHaveBeenCalled();
    });

    it('operador sem nenhum dos módulos e sem papel no PolicyEngine → 403', async () => {
        const { next, res } = await chamar(operador({ checkin: false, checkout: false, fiscalizacao: false, dashboard: true }));
        expect(res.statusCode).toBe(403);
        expect(next).not.toHaveBeenCalled();
    });

    it('supervisor sem o módulo ligado, mas com permissão de papel no PolicyEngine → acessa', async () => {
        mockPolicy.hasPermission.mockResolvedValue(true);
        const { next } = await chamar(operador({}, { role: 'supervisor', nivel_acesso: 'supervisor' }));
        expect(next).toHaveBeenCalled();
    });

    it('evento não autorizado para o operador → 403', async () => {
        const { next, res } = await chamar(operador({ checkin: true }), { headers: { 'x-evento-id': 'ev2' } });
        expect(res.statusCode).toBe(403);
        expect(next).not.toHaveBeenCalled();
    });

    it('sessão sem evento vinculado → 400', async () => {
        const { next, res } = await chamar(operador({ checkin: true }, { evento_id: undefined }), { headers: {} });
        expect(res.statusCode).toBe(400);
        expect(next).not.toHaveBeenCalled();
    });

    it('admin passa sem precisar de módulo', async () => {
        const { next } = await chamar({ id: 'a1', role: 'admin_master', nivel_acesso: 'admin_master' });
        expect(next).toHaveBeenCalled();
    });
});
