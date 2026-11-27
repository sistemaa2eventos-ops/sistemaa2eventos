/**
 * D6: POST /access/pulseira/checkout procura a pessoa só com .eq/.in (como o leitor rápido).
 * Antes, o código lido entrava num .or(): vírgula podia dar check-out na pessoa errada.
 * Banco simulado; registrarAcesso é substituído (nada é gravado).
 */

const mockDb = { pessoas: [] };
const mockOrChamado = jest.fn();

// Consulta simulada: .eq/.in filtram; .or() não pode ser usado; maybeSingle com mais de uma linha dá erro (como o PostgREST)
function mockConstruir() {
    const filtros = [];
    let limite = Infinity;
    const linhas = () => mockDb.pessoas.filter(r => filtros.every(f => f(r)));
    const q = {
        select: () => q,
        eq: (c, v) => { filtros.push(r => r[c] === v); return q; },
        in: (c, vs) => { filtros.push(r => vs.includes(r[c])); return q; },
        or: (...args) => { mockOrChamado(...args); throw new Error('or() não deveria ser usado no checkout'); },
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
jest.mock('../src/modules/pulseiras/pulseira.service', () => ({ buscarStatusPulseira: jest.fn(async () => ({ emUso: null, pendencia: null })), liberarNaSaida: jest.fn(async () => ({ liberada: false, numero_pulseira: null })) }));
jest.mock('../src/modules/pulseiras/loteSelecao', () => ({
    buscarLotesDaFaixa: jest.fn(async () => []),
    escolherLote: jest.fn(async () => ({ lote: null, bloqueado: false, motivo: null }))
}));

const controller = require('../src/modules/checkin/checkin.controller');
const checkinService = require('../src/modules/checkin/checkin.service');

const resposta = () => {
    const res = { statusCode: 200, corpo: null };
    res.status = (c) => { res.statusCode = c; return res; };
    res.json = (b) => { res.corpo = b; return res; };
    return res;
};
const checkout = async (numero_pulseira) => {
    const res = resposta();
    await controller.checkoutPulseira({
        body: { numero_pulseira }, event: { id: 'ev1' }, headers: {}, query: {}, user: { id: 'op1' },
        supabase: { from: () => mockConstruir() }
    }, res);
    return res;
};
const pessoasBaixadas = () => checkinService.registrarAcesso.mock.calls.map(([, dados]) => dados.pessoa_id);

beforeEach(() => {
    jest.clearAllMocks();
    mockOrChamado.mockClear();
    mockDb.pessoas = [
        { id: 'p1', evento_id: 'ev1', nome_completo: 'Maria Silva', cpf: '52998224725', numero_pulseira: '1001', qr_code: null, status_acesso: 'checkin_feito', empresas: null },
        { id: 'p2', evento_id: 'ev1', nome_completo: 'João Souza', cpf: '11122233344', numero_pulseira: '2002', qr_code: null, status_acesso: 'checkin_feito', empresas: null },
        { id: 'p4', evento_id: 'ev1', nome_completo: 'Dupla A', cpf: '10000000001', numero_pulseira: '3003', qr_code: null, status_acesso: 'checkin_feito', empresas: null },
        { id: 'p5', evento_id: 'ev1', nome_completo: 'Dupla B', cpf: '10000000002', numero_pulseira: '3003', qr_code: null, status_acesso: 'checkin_feito', empresas: null },
        { id: 'p3', evento_id: 'ev2', nome_completo: 'Outro Evento', cpf: '99988877766', numero_pulseira: '9009', qr_code: null, status_acesso: 'checkin_feito', empresas: null }
    ];
});

describe('check-out por pulseira/código sem .or() (D6)', () => {
    it('pulseira exata dá check-out na pessoa da pulseira', async () => {
        const res = await checkout('1001');
        expect(res.statusCode).toBe(200);
        expect(pessoasBaixadas()).toEqual(['p1']);
        expect(checkinService.registrarAcesso.mock.calls[0][1].tipo).toBe('checkout');
        expect(checkinService.registrarAcesso.mock.calls[0][1].metodo).toBe('pulseira');
    });

    it('CPF com máscara encontra a pessoa certa pelo .in e não pela string montada', async () => {
        const res = await checkout('111.222.333-44');
        expect(res.statusCode).toBe(200);
        expect(pessoasBaixadas()).toEqual(['p2']);
        expect(checkinService.registrarAcesso.mock.calls[0][1].metodo).toBe('barcode');
    });

    it('texto com vírgula não dá check-out em outra pessoa (antes: .or injetado com id.eq)', async () => {
        const res = await checkout('zzz,id.eq.p2');
        expect(res.statusCode).toBe(404);
        expect(checkinService.registrarAcesso).not.toHaveBeenCalled();
        expect(mockOrChamado).not.toHaveBeenCalled();
    });

    it('parêntese no código não casa ninguém e não baixa ninguém', async () => {
        const res = await checkout('1001),id.eq.p2');
        expect(res.statusCode).toBe(404);
        expect(checkinService.registrarAcesso).not.toHaveBeenCalled();
    });

    it('código lido em mais de uma pessoa do evento → 409, sem dar baixa em nenhuma', async () => {
        const res = await checkout('3003');
        expect(res.statusCode).toBe(409);
        expect(checkinService.registrarAcesso).not.toHaveBeenCalled();
    });

    it('pessoa de outro evento não recebe baixa', async () => {
        const res = await checkout('9009');
        expect(res.statusCode).toBe(404);
        expect(checkinService.registrarAcesso).not.toHaveBeenCalled();
    });

    it('nenhuma consulta usa .or() com o texto lido', async () => {
        for (const codigo of ['1001', '52998224725', 'a,b', 'x(y)']) await checkout(codigo);
        expect(mockOrChamado).not.toHaveBeenCalled();
    });
});
