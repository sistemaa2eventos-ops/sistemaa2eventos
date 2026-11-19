/**
 * Saída trocada entre pessoas: POST /access/pulseira/checkout com pessoa_id + numero_pulseira.
 * A pulseira lida TEM de ser a da pessoa no evento; se for de outra (ou de ninguém), 409
 * PULSEIRA_DE_OUTRA_PESSOA (liberavel false) e nenhum registro é gravado.
 * Sem pessoa_id, o comportamento de busca pela pulseira/código segue como antes.
 * Banco simulado; registrarAcesso é substituído (nada é gravado de verdade).
 */

const mockDb = { pessoas: [] };

// Consulta simulada: .eq/.in filtram; maybeSingle com mais de uma linha dá erro (como o PostgREST)
function mockConstruir() {
    const filtros = [];
    let limite = Infinity;
    const linhas = () => mockDb.pessoas.filter(r => filtros.every(f => f(r)));
    const q = {
        select: () => q,
        eq: (c, v) => { filtros.push(r => r[c] === v); return q; },
        in: (c, vs) => { filtros.push(r => vs.includes(r[c])); return q; },
        limit: (n) => { limite = n; return q; },
        maybeSingle: async () => {
            const r = linhas();
            if (r.length > 1) return { data: null, error: { code: 'PGRST116', message: 'multiple rows' } };
            return { data: r[0] || null, error: null };
        },
        then: (ok, ko) => Promise.resolve({ data: linhas().slice(0, limite), error: null }).then(ok, ko)
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
jest.mock('../src/modules/checkin/checkin.service', () => ({ registrarAcesso: jest.fn(async () => ({ success: true, action: 'allow' })) }));
jest.mock('../src/modules/checkin/services/validation.service', () => ({}));
jest.mock('../src/services/webhookDispatcher', () => ({ dispatchCheckin: jest.fn(), dispatchCheckout: jest.fn() }));
jest.mock('../src/services/websocketService', () => ({ emit: jest.fn() }));
jest.mock('../src/modules/checkin/services/database.service', () => ({ logDeniedAccess: jest.fn(async () => {}) }));
jest.mock('../src/modules/system/watchlist.service', () => ({ verificarCPF: jest.fn(async () => null), registrarAlerta: jest.fn(async () => {}) }));
jest.mock('../src/modules/pulseiras/pulseira.service', () => ({}));
jest.mock('../src/modules/pulseiras/loteSelecao', () => ({ buscarLotesDaFaixa: jest.fn(), escolherLote: jest.fn() }));

const controller = require('../src/modules/checkin/checkin.controller');
const checkinService = require('../src/modules/checkin/checkin.service');

const resposta = () => {
    const res = { statusCode: 200, corpo: null };
    res.status = (c) => { res.statusCode = c; return res; };
    res.json = (b) => { res.corpo = b; return res; };
    return res;
};
const saida = async (corpo) => {
    const res = resposta();
    await controller.checkoutPulseira({
        body: corpo, event: { id: 'ev1' }, headers: {}, query: {}, user: { id: 'op1' },
        supabase: { from: () => mockConstruir() }
    }, res);
    return res;
};
const pessoasBaixadas = () => checkinService.registrarAcesso.mock.calls.map(([, dados]) => dados.pessoa_id);

beforeEach(() => {
    jest.clearAllMocks();
    mockDb.pessoas = [
        { id: '11111111-1111-4111-8111-111111111111', evento_id: 'ev1', nome_completo: 'Maria Silva', cpf: '52998224725', numero_pulseira: '1001', qr_code: null, status_acesso: 'checkin_feito', empresas: null },
        { id: '22222222-2222-4222-8222-222222222222', evento_id: 'ev1', nome_completo: 'João Souza', cpf: '11122233344', numero_pulseira: '2002', qr_code: null, status_acesso: 'checkin_feito', empresas: null },
        { id: '66666666-6666-4666-8666-666666666666', evento_id: 'ev1', nome_completo: 'Sem Pulseira', cpf: '33344455566', numero_pulseira: null, qr_code: null, status_acesso: 'checkin_feito', empresas: null },
        { id: '33333333-3333-4333-8333-333333333333', evento_id: 'ev2', nome_completo: 'Outro Evento', cpf: '99988877766', numero_pulseira: '9009', qr_code: null, status_acesso: 'checkin_feito', empresas: null }
    ];
});

describe('saída com pessoa_id: a pulseira lida tem de ser da pessoa', () => {
    it('pulseira de OUTRA pessoa → 409 PULSEIRA_DE_OUTRA_PESSOA, liberavel false, zero gravações', async () => {
        const res = await saida({ pessoa_id: '11111111-1111-4111-8111-111111111111', numero_pulseira: '2002' });
        expect(res.statusCode).toBe(409);
        expect(res.corpo.codigo).toBe('PULSEIRA_DE_OUTRA_PESSOA');
        expect(res.corpo.liberavel).toBe(false);
        expect(checkinService.registrarAcesso).not.toHaveBeenCalled();
    });

    it('pulseira que ninguém do evento tem → 409, zero gravações', async () => {
        const res = await saida({ pessoa_id: '11111111-1111-4111-8111-111111111111', numero_pulseira: '7777' });
        expect(res.statusCode).toBe(409);
        expect(res.corpo.codigo).toBe('PULSEIRA_DE_OUTRA_PESSOA');
        expect(checkinService.registrarAcesso).not.toHaveBeenCalled();
    });

    it('pessoa sem pulseira cadastrada, com pulseira lida → 409, zero gravações', async () => {
        const res = await saida({ pessoa_id: '66666666-6666-4666-8666-666666666666', numero_pulseira: '1001' });
        expect(res.statusCode).toBe(409);
        expect(checkinService.registrarAcesso).not.toHaveBeenCalled();
    });

    it('pulseira da própria pessoa → baixa na pessoa informada', async () => {
        const res = await saida({ pessoa_id: '11111111-1111-4111-8111-111111111111', numero_pulseira: '1001' });
        expect(res.statusCode).toBe(200);
        expect(pessoasBaixadas()).toEqual(['11111111-1111-4111-8111-111111111111']);
        expect(checkinService.registrarAcesso.mock.calls[0][1].tipo).toBe('checkout');
    });

    it('pessoa_id sem pulseira lida (ficha) → baixa normal, sem conferir pulseira', async () => {
        const res = await saida({ pessoa_id: '22222222-2222-4222-8222-222222222222' });
        expect(res.statusCode).toBe(200);
        expect(pessoasBaixadas()).toEqual(['22222222-2222-4222-8222-222222222222']);
    });

    it('pessoa de outro evento → 404, zero gravações', async () => {
        const res = await saida({ pessoa_id: '33333333-3333-4333-8333-333333333333', numero_pulseira: '9009' });
        expect(res.statusCode).toBe(404);
        expect(checkinService.registrarAcesso).not.toHaveBeenCalled();
    });
});

describe('saída só com numero_pulseira (sem pessoa_id) segue como antes', () => {
    it('pulseira lida dá baixa em quem a tem', async () => {
        const res = await saida({ numero_pulseira: '2002' });
        expect(res.statusCode).toBe(200);
        expect(pessoasBaixadas()).toEqual(['22222222-2222-4222-8222-222222222222']);
    });

    it('pulseira que ninguém tem → 404, zero gravações', async () => {
        const res = await saida({ numero_pulseira: '7777' });
        expect(res.statusCode).toBe(404);
        expect(checkinService.registrarAcesso).not.toHaveBeenCalled();
    });
});
