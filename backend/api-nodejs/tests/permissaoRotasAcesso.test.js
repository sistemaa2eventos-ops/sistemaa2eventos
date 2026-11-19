/**
 * A2 e B12: cada rota de acesso exige o módulo da operação que ela faz.
 * - SAÍDA (checkout): ['checkout']; ENTRADA e CREDENCIAMENTO (checkin): ['checkin'];
 * - LEITOR RÁPIDO (entrada ou saída): ['checkin', 'checkout'];
 * - CONSULTAS (crachá, busca, último check-in, fiscalizar): ['checkin', 'checkout', 'fiscalizacao'].
 * Operador só com fiscalização não registra saída nem entrada (403). Operador só com checkout não entra (403, B12).
 * Os recursos de cada middleware são conferidos pela própria rota (o checkAnyPermission real é que decide).
 * Supabase e políticas simulados.
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

const CONSULTA = ['checkin', 'checkout', 'fiscalizacao'];

const rotaDe = (caminho) => checkinRouter.stack.find(l => l.route && l.route.path === caminho);
const permissaoDe = (caminho) => {
    const rota = rotaDe(caminho);
    if (!rota) return undefined;
    const middleware = rota.route.stack.map(s => s.handle).find(h => Array.isArray(h.recursos));
    return middleware;
};

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
// Passa pela permissão da própria rota (o middleware real), como a requisição chegaria
const passarPelaRota = async (caminho, usuario, body = {}) => {
    const permissao = permissaoDe(caminho);
    const next = jest.fn();
    const res = respostaFalsa();
    await permissao({ user: usuario, headers: { 'x-evento-id': 'ev1' }, query: {}, body }, res, next);
    return { next, res };
};

beforeEach(() => {
    mockPolicy.hasPermission.mockReset();
    mockPolicy.hasPermission.mockResolvedValue(false);
});

describe('módulo exigido por rota', () => {
    it.each([
        ['/pulseira/checkout', ['checkout']],
        ['/checkout/corrigir-turno', ['checkout']],
        ['/pulseira/checkin', ['checkin']],
        ['/pulseira/link-checkin', ['checkin']],
        ['/link-checkin', ['checkin']],
        ['/checkin/manual', ['checkin']],
        ['/checkin/qrcode', ['checkin']],
        ['/credenciar-pulseira', ['checkin']],
        ['/leitor-rapido', ['checkin', 'checkout']],
        ['/pulseira/buscar', CONSULTA],
        ['/pulseira/ultimo/:pessoa_id', CONSULTA],
        ['/consultar-pulseira/:codigo', CONSULTA],
        ['/fiscalizar', CONSULTA]
    ])('%s exige %j', (caminho, recursos) => {
        expect(permissaoDe(caminho)).toBeDefined();
        expect(permissaoDe(caminho).recursos).toEqual(recursos);
    });

    it('todas as rotas de entrada, saída e credenciamento têm exigência de módulo', () => {
        const semPermissao = ['/pulseira/checkin', '/pulseira/checkout', '/checkout/corrigir-turno', '/pulseira/link-checkin',
            '/link-checkin', '/checkin/manual', '/checkin/qrcode', '/credenciar-pulseira', '/leitor-rapido'];
        for (const caminho of semPermissao) expect(permissaoDe(caminho)).toBeDefined();
    });
});

describe('operador só com o módulo fiscalização', () => {
    const fiscal = () => operador({ checkin: false, checkout: false, fiscalizacao: true });

    it.each([
        '/pulseira/checkout', '/checkout/corrigir-turno',     // não registra SAÍDA
        '/pulseira/checkin', '/checkin/manual', '/checkin/qrcode', '/credenciar-pulseira', '/leitor-rapido' // nem ENTRADA
    ])('%s → 403 e a rota não é executada', async (caminho) => {
        const { next, res } = await passarPelaRota(caminho, fiscal());
        expect(res.statusCode).toBe(403);
        expect(next).not.toHaveBeenCalled();
    });

    it.each(['/pulseira/buscar', '/pulseira/ultimo/:pessoa_id', '/consultar-pulseira/:codigo', '/fiscalizar'])(
        '%s (consulta) continua liberada para o fiscal', async (caminho) => {
            const { next } = await passarPelaRota(caminho, fiscal());
            expect(next).toHaveBeenCalled();
        });
});

describe('B12: operador só com checkout', () => {
    const soCheckout = () => operador({ checkin: false, checkout: true, fiscalizacao: false });

    it('a entrada (/pulseira/checkin) dá 403; a saída segue liberada', async () => {
        const entrada = await passarPelaRota('/pulseira/checkin', soCheckout());
        expect(entrada.res.statusCode).toBe(403);
        expect(entrada.next).not.toHaveBeenCalled();

        const saida = await passarPelaRota('/pulseira/checkout', soCheckout());
        expect(saida.next).toHaveBeenCalled();
    });

    it('o leitor rápido aceita quem tem checkout só para SAÍDA (tipo checkout)', async () => {
        const { next } = await passarPelaRota('/leitor-rapido', soCheckout(), { tipo: 'checkout' });
        expect(next).toHaveBeenCalled();
    });

    it('o leitor rápido sem tipo é ENTRADA: quem só tem checkout recebe 403', async () => {
        const { next, res } = await passarPelaRota('/leitor-rapido', soCheckout(), {});
        expect(res.statusCode).toBe(403);
        expect(next).not.toHaveBeenCalled();
    });
});

describe('operador só com check-in', () => {
    it('a saída (/pulseira/checkout) dá 403', async () => {
        const { next, res } = await passarPelaRota('/pulseira/checkout', operador({ checkin: true, checkout: false, fiscalizacao: false }));
        expect(res.statusCode).toBe(403);
        expect(next).not.toHaveBeenCalled();
    });
});

describe('admin passa em todas as rotas de acesso', () => {
    it.each(['/pulseira/checkin', '/pulseira/checkout', '/credenciar-pulseira', '/leitor-rapido', '/fiscalizar'])(
        '%s', async (caminho) => {
            const { next } = await passarPelaRota(caminho, { id: 'a1', role: 'admin_master', nivel_acesso: 'admin_master' });
            expect(next).toHaveBeenCalled();
        });
});
