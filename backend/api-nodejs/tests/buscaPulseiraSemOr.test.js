/**
 * B3: GET /access/pulseira/buscar.
 * (a) rota com limite de consulta e checagem de módulo (checkin, checkout ou fiscalização);
 * (b) o texto digitado nunca entra num .or(): vírgula ou parêntese não muda a consulta. Limite de 10 mantido.
 * Banco simulado; nada é gravado no Supabase.
 */

const mockDb = { pessoas: [] };
const mockOrChamado = jest.fn();

// Construtor de consulta simulado: .eq/.in/.ilike filtram; .or() é proibido nesta rota
function mockConstruir(tabela, registro) {
    const filtros = [];
    let limite = Infinity;
    const q = {
        select: () => q,
        order: () => q,
        eq: (c, v) => { registro.push(['eq', c, v]); filtros.push(r => r[c] === v); return q; },
        in: (c, vs) => { registro.push(['in', c, vs]); filtros.push(r => vs.includes(r[c])); return q; },
        ilike: (c, v) => {
            registro.push(['ilike', c, v]);
            const alvo = v.replace(/^%|%$/g, '').replace(/\\(.)/g, '$1').toLowerCase();
            filtros.push(r => String(r[c] || '').toLowerCase().includes(alvo));
            return q;
        },
        or: (...args) => { mockOrChamado(...args); throw new Error('or() não deveria ser usado na busca de pulseira'); },
        limit: (n) => { limite = n; return q; },
        then: (ok, ko) => Promise.resolve({ data: mockDb[tabela].filter(r => filtros.every(f => f(r))).slice(0, limite), error: null }).then(ok, ko)
    };
    return q;
}

jest.mock('../src/config/supabase', () => ({ supabase: { from: () => ({}) } }));
jest.mock('../src/services/logger', () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() }));
jest.mock('../src/services/authCache', () => ({}));
jest.mock('../src/modules/checkin/policy.service', () => ({ hasPermission: jest.fn(async () => false) }));
jest.mock('../src/middleware/eventMiddleware', () => ({
    requireEvent: (req, res, next) => next(),
    buscarEvento: jest.fn(async () => ({ evento: null }))
}));
jest.mock('../src/modules/checkin/checkin.service', () => ({ registrarAcesso: jest.fn(async () => ({ success: true })) }));
jest.mock('../src/modules/checkin/services/validation.service', () => ({}));
jest.mock('../src/services/webhookDispatcher', () => ({ dispatchCheckin: jest.fn(), dispatchCheckout: jest.fn() }));
jest.mock('../src/services/websocketService', () => ({ emit: jest.fn() }));
jest.mock('../src/modules/checkin/services/database.service', () => ({ logDeniedAccess: jest.fn(async () => {}) }));
jest.mock('../src/modules/system/watchlist.service', () => ({ verificarCPF: jest.fn(async () => null), registrarAlerta: jest.fn(async () => {}) }));
jest.mock('../src/modules/pulseiras/pulseira.service', () => ({}));
jest.mock('../src/modules/pulseiras/loteSelecao', () => ({ buscarLotesDaFaixa: jest.fn(), escolherLote: jest.fn() }));

const controller = require('../src/modules/checkin/checkin.controller');
const { checkAnyPermission } = require('../src/middleware/auth');
const rateLimiter = require('../src/middleware/rateLimiter');
const checkinRouter = require('../src/modules/checkin/checkin.routes');

const resposta = () => {
    const res = { statusCode: 200, corpo: null };
    res.status = (c) => { res.statusCode = c; return res; };
    res.json = (b) => { res.corpo = b; return res; };
    return res;
};
// Chama a busca e devolve a resposta + as condições que chegaram ao banco
const buscar = async (codigo) => {
    const registro = [];
    const cliente = { from: (t) => mockConstruir(t, registro) };
    const res = resposta();
    await controller.buscarPessoaPulseira({ query: { codigo }, event: { id: 'ev1' }, supabase: cliente }, res);
    return { res, registro };
};

beforeEach(() => {
    mockOrChamado.mockClear();
    mockDb.pessoas = [
        { id: 'p1', evento_id: 'ev1', nome_completo: 'Maria Silva', cpf: '52998224725', numero_pulseira: '1001', funcao: 'Equipe', status_acesso: 'pendente', foto_url: null, empresas: null },
        { id: 'p2', evento_id: 'ev1', nome_completo: 'João Souza', cpf: '11122233344', numero_pulseira: '2002', funcao: 'Equipe', status_acesso: 'pendente', foto_url: null, empresas: null },
        { id: 'p3', evento_id: 'ev2', nome_completo: 'Outro Evento', cpf: '99988877766', numero_pulseira: '1001', funcao: 'Equipe', status_acesso: 'pendente', foto_url: null, empresas: null }
    ];
});

const rotaDe = (caminho) => checkinRouter.stack.find(l => l.route && l.route.path === caminho);

describe('rota GET /pulseira/buscar (B3a)', () => {
    it('usa o limite de consulta e a checagem de módulo, como /consultar-pulseira', () => {
        const rota = rotaDe('/pulseira/buscar');
        expect(rota).toBeDefined();
        const handles = rota.route.stack.map(s => s.handle);
        expect(handles).toContain(rateLimiter.consulta);
        expect(handles).not.toContain(rateLimiter.access);
        // authenticate, requireEvent, rateLimiter.consulta, checkAnyPermission, controller
        expect(rota.route.stack).toHaveLength(5);
        expect(typeof checkAnyPermission(['checkin'])).toBe('function');
    });
});

describe('busca de pessoa por texto (B3b)', () => {
    it('pulseira exata encontra a pessoa do evento', async () => {
        const { res } = await buscar('1001');
        expect(res.corpo.data.pessoas.map(p => p.id)).toEqual(['p1']);
    });

    it('CPF com máscara e sem máscara encontra a mesma pessoa', async () => {
        expect((await buscar('529.982.247-25')).res.corpo.data.pessoas.map(p => p.id)).toEqual(['p1']);
        expect((await buscar('52998224725')).res.corpo.data.pessoas.map(p => p.id)).toEqual(['p1']);
    });

    it('nome é buscado com .ilike, com o texto só como valor', async () => {
        const { res, registro } = await buscar('maria');
        expect(res.corpo.data.pessoas.map(p => p.id)).toEqual(['p1']);
        expect(registro).toContainEqual(['ilike', 'nome_completo', '%maria%']);
    });

    it('vírgula e parêntese no texto não viram filtro: nada é casado por engano e .or() não é chamado', async () => {
        const texto = 'x,numero_pulseira.eq.1001),id.eq.p2';
        const { res, registro } = await buscar(texto);
        expect(res.statusCode).toBe(200);
        expect(res.corpo.data.pessoas).toEqual([]);
        expect(mockOrChamado).not.toHaveBeenCalled();
        // o texto aparece só como valor de .eq ou .ilike, nunca montado em outra coisa
        for (const [op, c, v] of registro) {
            if (op === 'eq' && c === 'numero_pulseira') expect(v).toBe(texto);
            // o texto só entra como valor, com % _ e \ escapados para o LIKE
            if (op === 'ilike') expect(v).toBe(`%${texto.replace(/[\\%_]/g, '\\$&')}%`);
        }
        expect(registro.some(([op, c]) => op === 'in' && c === 'cpf')).toBe(false);
    });

    it('caracteres de LIKE (% e _) no nome são escapados e não casam tudo', async () => {
        const { res, registro } = await buscar('a%_');
        expect(res.corpo.data.pessoas).toEqual([]);
        expect(registro).toContainEqual(['ilike', 'nome_completo', '%a\\%\\_%']);
    });

    it('limite de 10 resultados é mantido', async () => {
        mockDb.pessoas = Array.from({ length: 15 }, (_, i) => ({
            id: `m${i}`, evento_id: 'ev1', nome_completo: `Visitante ${i}`, cpf: null, numero_pulseira: null,
            funcao: 'x', status_acesso: 'pendente', foto_url: null, empresas: null
        }));
        const { res } = await buscar('visitante');
        expect(res.corpo.data.pessoas).toHaveLength(10);
    });

    it('pessoa de outro evento nunca aparece', async () => {
        const { res } = await buscar('1001');
        expect(res.corpo.data.pessoas.map(p => p.id)).not.toContain('p3');
    });
});
