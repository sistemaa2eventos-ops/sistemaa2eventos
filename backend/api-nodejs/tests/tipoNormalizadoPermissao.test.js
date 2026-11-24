/**
 * Tipo do corpo normalizado no guard das rotas de entrada/saída (exigePorTipo, checkin.routes.js):
 * - 'CHECKOUT' e ' checkout ' contam como SAÍDA para a exigência de módulo (operador só check-in → 403);
 * - só 'checkin', 'checkout' ou ausente são aceitos: qualquer outro valor → 400 (antes de checar o módulo);
 * - ausente, vazio ou só espaços: sem tipo; exige checkin OU checkout (403 sem nenhum) e o sistema decide o tipo.
 * Supabase e política simulados; o middleware de permissão e o guard são os reais.
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

const checkinRouter = require('../src/modules/checkin/checkin.routes');

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
const passar = async (middleware, usuario, body = {}) => {
    const next = jest.fn();
    const res = respostaFalsa();
    const req = { user: usuario, headers: { 'x-evento-id': 'ev1' }, query: {}, body };
    await middleware(req, res, next);
    return { next, res, req };
};

const soCheckin = () => operador({ checkin: true, checkout: false, fiscalizacao: false });
const soCheckout = () => operador({ checkin: false, checkout: true, fiscalizacao: false });

beforeEach(() => {
    mockPolicy.hasPermission.mockReset();
    mockPolicy.hasPermission.mockResolvedValue(false);
});

const rotas = ['/leitor-rapido', '/pulseira/checkin', '/checkin/manual', '/checkin/qrcode'];

describe('tipo normalizado: a saída é reconhecida com maiúsculas e espaços', () => {
    it.each(rotas)('%s: operador só check-in com tipo "CHECKOUT" → 403 (é saída)', async (caminho) => {
        const { next, res } = await passar(permissaoDe(caminho), soCheckin(), { tipo: 'CHECKOUT' });
        expect(res.statusCode).toBe(403);
        expect(next).not.toHaveBeenCalled();
    });

    it.each(rotas)('%s: operador só check-in com tipo " checkout " → 403 (é saída)', async (caminho) => {
        const { next, res } = await passar(permissaoDe(caminho), soCheckin(), { tipo: ' checkout ' });
        expect(res.statusCode).toBe(403);
        expect(next).not.toHaveBeenCalled();
    });

    it.each(rotas)('%s: operador com módulo checkout e tipo " checkout " → passa e o tipo sai normalizado', async (caminho) => {
        const { next, req } = await passar(permissaoDe(caminho), soCheckout(), { tipo: ' checkout ' });
        expect(next).toHaveBeenCalled();
        expect(req.body.tipo).toBe('checkout');
    });

    it.each(rotas)('%s: operador com módulo checkout e tipo "CHECKOUT" → passa', async (caminho) => {
        const { next, req } = await passar(permissaoDe(caminho), soCheckout(), { tipo: 'CHECKOUT' });
        expect(next).toHaveBeenCalled();
        expect(req.body.tipo).toBe('checkout');
    });

    it.each(rotas)('%s: operador só check-in com tipo " Checkin " → entrada normalizada', async (caminho) => {
        const { next, req } = await passar(permissaoDe(caminho), soCheckin(), { tipo: ' Checkin ' });
        expect(next).toHaveBeenCalled();
        expect(req.body.tipo).toBe('checkin');
    });
});

describe('tipo fora de checkin/checkout → 400 (antes da checagem de módulo)', () => {
    const naoTexto = [1, true, ['checkout'], { tipo: 'checkout' }];

    it.each(rotas)('%s: operador só check-in com "fiscalizacao" → 400', async (caminho) => {
        const { next, res } = await passar(permissaoDe(caminho), soCheckin(), { tipo: 'fiscalizacao' });
        expect(res.statusCode).toBe(400);
        expect(next).not.toHaveBeenCalled();
    });

    it.each(rotas)('%s: operador com checkin e checkout com "negado" → 400', async (caminho) => {
        const ambos = operador({ checkin: true, checkout: true, fiscalizacao: false });
        const { next, res } = await passar(permissaoDe(caminho), ambos, { tipo: 'negado' });
        expect(res.statusCode).toBe(400);
        expect(next).not.toHaveBeenCalled();
    });

    it.each(rotas)('%s: admin com "expulsao" → 400', async (caminho) => {
        const { next, res } = await passar(permissaoDe(caminho), { id: 'a1', role: 'admin_master', nivel_acesso: 'admin_master' }, { tipo: 'expulsao' });
        expect(res.statusCode).toBe(400);
        expect(next).not.toHaveBeenCalled();
    });

    it.each(rotas)('%s: texto parecido com saída ("checkouts", "checkin-out") → 400', async (caminho) => {
        for (const valor of ['checkouts', 'checkin-out']) {
            const { next, res } = await passar(permissaoDe(caminho), soCheckout(), { tipo: valor });
            expect(res.statusCode).toBe(400);
            expect(next).not.toHaveBeenCalled();
        }
    });

    it.each(rotas)('%s: valores que não são texto (número, booleano, lista, objeto) → 400', async (caminho) => {
        for (const valor of naoTexto) {
            const { next, res } = await passar(permissaoDe(caminho), soCheckout(), { tipo: valor });
            expect(res.statusCode).toBe(400);
            expect(next).not.toHaveBeenCalled();
        }
    });
});

describe('tipo ausente, vazio ou só espaços: sem tipo (o sistema decide, nenhum tipo é forçado)', () => {
    it.each(rotas)('%s: operador só check-in com "   " → tipo removido e NÃO vira entrada', async (caminho) => {
        const { next, req, res } = await passar(permissaoDe(caminho), soCheckin(), { tipo: '   ' });
        expect(res.statusCode).toBe(200);
        expect(next).toHaveBeenCalled();
        expect(req.body.tipo).toBeUndefined();
    });

    it.each(rotas)('%s: operador check-in + check-out com tipo null → deixa o toggle decidir', async (caminho) => {
        const { next, req } = await passar(permissaoDe(caminho), operador({ checkin: true, checkout: true }), { tipo: null });
        expect(next).toHaveBeenCalled();
        expect(req.body.tipo).toBeUndefined();
    });

    it.each(rotas)('%s: operador só check-out sem tipo → passa (tem módulo de saída; o sistema decide)', async (caminho) => {
        const { next, req } = await passar(permissaoDe(caminho), soCheckout(), {});
        expect(next).toHaveBeenCalled();
        expect(req.body.tipo).toBeUndefined();
    });

    it.each(rotas)('%s: operador sem check-in nem check-out e sem tipo → 403', async (caminho) => {
        const { next, res } = await passar(permissaoDe(caminho), operador({ checkin: false, checkout: false, fiscalizacao: true }), {});
        expect(res.statusCode).toBe(403);
        expect(next).not.toHaveBeenCalled();
    });
});
