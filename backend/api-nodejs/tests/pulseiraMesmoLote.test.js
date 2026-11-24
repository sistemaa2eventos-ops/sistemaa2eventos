/**
 * Decisão 2: pulseira repetida só conflita DENTRO DO MESMO LOTE (tipo_pulseira_id).
 * - Vinculação (credenciarPulseira e checkinPulseira): outra pessoa do evento com o mesmo número no mesmo lote
 *   → 409 'Pulseira já vinculada a outra pessoa neste lote', sem gravar nada. Vale SEMPRE (sem alerta_duplicidade).
 *   Mesmo número em outro lote não gera 409.
 * - Busca por código (buscarPessoaPorCodigo): número repetido em lotes diferentes é desambiguado pelo lote ATIVO
 *   (escolherLote). 409 só se o número estiver repetido DENTRO do lote ativo.
 * Supabase simulado com filtros; lote ativo simulado (loteSelecao); check-in e registro de entrega simulados.
 * Nada é gravado de verdade.
 */

const mockDb = { pessoas: [], evento_tipos_pulseira: [], gravacoes: [] };
// Lote que vale agora para a faixa (escolherLote) e candidatos da faixa (buscarLotesDaFaixa)
const mockEscolha = { lote: null, bloqueado: false, motivo: null };

function mockConstruir(tabela) {
    const filtros = [];
    const q = {};
    for (const m of ['select', 'order', 'gte', 'lte', 'gt', 'lt', 'not', 'range']) q[m] = () => q;
    q.eq = (c, v) => { filtros.push(['eq', c, v]); return q; };
    q.neq = (c, v) => { filtros.push(['neq', c, v]); return q; };
    q.is = (c, v) => { filtros.push(['is', c, v]); return q; };
    q.in = (c, v) => { filtros.push(['in', c, v]); return q; };
    const linhas = () => (mockDb[tabela] || []).filter(p => filtros.every(([op, c, v]) => {
        if (op === 'eq') return p[c] === v;
        if (op === 'neq') return p[c] !== v;
        if (op === 'is') return (p[c] ?? null) === v;
        return v.includes(p[c]);
    }));
    for (const op of ['insert', 'upsert', 'update']) {
        q[op] = (dados) => { mockDb.gravacoes.push({ tabela, op, dados }); return q; };
    }
    q.limit = (n) => {
        const lote = linhas().slice(0, n);
        const primeira = async () => ({ data: lote[0] || null, error: null });
        return { data: lote, error: null, maybeSingle: primeira, single: primeira,
            then: (ok, ko) => Promise.resolve({ data: lote, error: null }).then(ok, ko) };
    };
    q.single = async () => ({ data: linhas()[0] || null, error: null });
    q.maybeSingle = q.single;
    q.then = (ok, ko) => Promise.resolve({ data: linhas(), error: null }).then(ok, ko);
    return q;
}
const cliente = { from: (t) => mockConstruir(t), rpc: async () => ({ error: null }) };

jest.mock('../src/config/supabase', () => ({
    supabase: { from: (t) => mockConstruir(t), rpc: async () => ({ error: null }) }
}));
jest.mock('../src/services/logger', () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() }));
jest.mock('../src/services/websocketService', () => ({ emit: jest.fn() }));
jest.mock('../src/services/cacheService', () => ({ invalidatePessoa: jest.fn(), get: jest.fn(), set: jest.fn() }));
jest.mock('../src/services/webhookDispatcher', () => ({ dispatchCheckin: jest.fn(), dispatchCheckout: jest.fn() }));
jest.mock('../src/modules/system/watchlist.service', () => ({ verificarCPF: jest.fn(async () => null), registrarAlerta: jest.fn(async () => {}) }));
jest.mock('../src/modules/pulseiras/pulseira.service', () => ({ numeroBloqueado: jest.fn(async () => null), registrarEntrega: jest.fn() }));
jest.mock('../src/modules/pulseiras/loteSelecao', () => ({
    buscarLotesDaFaixa: jest.fn(async () => []),
    escolherLote: jest.fn(async () => mockEscolha)
}));
jest.mock('../src/modules/checkin/checkin.service', () => ({
    registrarAcesso: jest.fn(async () => ({ tipo: 'checkin' })),
    verificarEntradaSemGravar: jest.fn(async () => null)
}));
jest.mock('../src/modules/checkin/services/validation.service', () => ({}));
jest.mock('../src/modules/checkin/services/database.service', () => ({
    registerAccessTransaction: jest.fn(async () => ({ success: true })),
    logDeniedAccess: jest.fn(async () => {})
}));

const controller = require('../src/modules/checkin/checkin.controller');
const pulseiraService = require('../src/modules/pulseiras/pulseira.service');
const checkinService = require('../src/modules/checkin/checkin.service');
const { buscarPessoaPorCodigo } = require('../src/modules/checkin/codigoLeitor');
const { outraPessoaNoLote } = require('../src/modules/checkin/pulseiraLote');

const LOTE_MONTAGEM = { id: 'tp1', nome_tipo: 'Montagem', cor_hex: '#ffffff', alerta_duplicidade: false, fase: 'montagem', pulseira_areas_permitidas: [] };
const LOTE_EVENTO = { id: 'tp2', nome_tipo: 'Evento', cor_hex: '#000000', alerta_duplicidade: false, fase: 'evento', pulseira_areas_permitidas: [] };

const PESSOAS_BASE = () => [
    { id: 'p1', evento_id: 'ev1', nome_completo: 'Maria Silva', numero_pulseira: '1234', tipo_pulseira_id: 'tp1', status_acesso: 'autorizado', bloqueado: false, empresas: null },
    { id: 'p2', evento_id: 'ev1', nome_completo: 'João Souza', numero_pulseira: '5555', tipo_pulseira_id: null, status_acesso: 'autorizado', bloqueado: false, empresas: null },
    // Pessoa que vai receber a pulseira (sem número ainda)
    { id: 'p9', evento_id: 'ev1', nome_completo: 'Ana Lima', numero_pulseira: null, tipo_pulseira_id: null, status_acesso: 'autorizado', bloqueado: false, empresas: null },
    // Mesmo número em OUTRO evento: nunca conflita
    { id: 'p8', evento_id: 'ev2', nome_completo: 'Outro Evento', numero_pulseira: '1234', tipo_pulseira_id: 'tp1', status_acesso: 'autorizado', bloqueado: false, empresas: null }
];

const resposta = () => {
    const res = { statusCode: 200, corpo: null };
    res.status = (c) => { res.statusCode = c; return res; };
    res.json = (b) => { res.corpo = b; return res; };
    return res;
};

const gravouNumeroPulseira = () => mockDb.gravacoes.some(g => g.tabela === 'pessoas' && g.op === 'update' && g.dados?.numero_pulseira !== undefined);

beforeEach(() => {
    jest.clearAllMocks();
    mockDb.pessoas = PESSOAS_BASE();
    mockDb.evento_tipos_pulseira = [LOTE_MONTAGEM, LOTE_EVENTO];
    mockDb.gravacoes.length = 0;
    mockEscolha.lote = null;
    mockEscolha.bloqueado = false;
    mockEscolha.motivo = null;
});

describe('outraPessoaNoLote (checagem de vínculo)', () => {
    it('mesmo número, mesmo lote, outra pessoa → acha a outra; a própria pessoa é excluída', async () => {
        expect(await outraPessoaNoLote(cliente, 'ev1', '1234', 'p9', 'tp1')).toEqual(expect.objectContaining({ id: 'p1' }));
        expect(await outraPessoaNoLote(cliente, 'ev1', '1234', 'p1', 'tp1')).toBeNull();
    });

    it('mesmo número em OUTRO lote → não acha (lotes diferentes podem repetir)', async () => {
        expect(await outraPessoaNoLote(cliente, 'ev1', '1234', 'p9', 'tp2')).toBeNull();
    });

    it('sem lote: o grupo sem lote é o mesmo lote; número com lote não conflita com o sem lote', async () => {
        expect(await outraPessoaNoLote(cliente, 'ev1', '5555', 'p9', null)).toEqual(expect.objectContaining({ id: 'p2' }));
        expect(await outraPessoaNoLote(cliente, 'ev1', '5555', 'p9', 'tp1')).toBeNull();
    });

    it('número de outro evento nunca conflita', async () => {
        expect(await outraPessoaNoLote(cliente, 'ev3', '1234', 'p9', 'tp1')).toBeNull();
    });
});

describe('credenciarPulseira: vinculação', () => {
    const credenciar = (corpo) => {
        const res = resposta();
        return controller.credenciarPulseira({ body: { pessoa_id: 'p9', ...corpo }, event: { id: 'ev1' }, user: { id: 'op1' }, supabase: cliente }, res)
            .then(() => res);
    };

    it('mesmo número no mesmo lote → 409 "Pulseira já vinculada a outra pessoa neste lote", sem gravar nada', async () => {
        const res = await credenciar({ numero_pulseira: '1234', tipo_pulseira_id: 'tp1' });
        expect(res.statusCode).toBe(409);
        expect(res.corpo.error).toBe('Pulseira já vinculada a outra pessoa neste lote');
        expect(gravouNumeroPulseira()).toBe(false);
        expect(mockDb.gravacoes).toEqual([]);
        expect(pulseiraService.registrarEntrega).not.toHaveBeenCalled();
        expect(checkinService.registrarAcesso).not.toHaveBeenCalled();
    });

    it('mesmo número em OUTRO lote → não é 409: grava a pulseira', async () => {
        const res = await credenciar({ numero_pulseira: '1234', tipo_pulseira_id: 'tp2' });
        expect(res.statusCode).not.toBe(409);
        expect(gravouNumeroPulseira()).toBe(true);
    });

    it('sem lote: número já usado por outra pessoa sem lote → 409', async () => {
        const res = await credenciar({ numero_pulseira: '5555' });
        expect(res.statusCode).toBe(409);
        expect(res.corpo.error).toBe('Pulseira já vinculada a outra pessoa neste lote');
        expect(gravouNumeroPulseira()).toBe(false);
    });
});

describe('checkinPulseira: vinculação', () => {
    const vincular = (corpo) => {
        const res = resposta();
        return controller.checkinPulseira({ body: { pessoa_id: 'p9', ...corpo }, event: { id: 'ev1' }, user: { id: 'op1' }, supabase: cliente }, res)
            .then(() => res);
    };

    it('lote ativo tp1 e número já no tp1 de outra pessoa → 409 sem gravar', async () => {
        mockEscolha.lote = LOTE_MONTAGEM;
        const res = await vincular({ numero_pulseira: '1234' });
        expect(res.statusCode).toBe(409);
        expect(res.corpo.error).toBe('Pulseira já vinculada a outra pessoa neste lote');
        expect(gravouNumeroPulseira()).toBe(false);
        expect(checkinService.registrarAcesso).not.toHaveBeenCalled();
    });

    it('lote ativo tp2 (o número está no tp1) → não é 409: vincula no lote ativo', async () => {
        mockEscolha.lote = LOTE_EVENTO;
        const res = await vincular({ numero_pulseira: '1234' });
        expect(res.statusCode).not.toBe(409);
        expect(gravouNumeroPulseira()).toBe(true);
    });
});

describe('buscarPessoaPorCodigo: número repetido desambiguado pelo lote ativo', () => {
    const buscar = (codigo) => buscarPessoaPorCodigo(cliente, 'ev1', codigo, 'id, nome_completo, numero_pulseira, tipo_pulseira_id');

    beforeEach(() => {
        // Número 2002 repetido em lotes diferentes (tp1 e tp2) no mesmo evento
        mockDb.pessoas = [
            { id: 'a1', evento_id: 'ev1', nome_completo: 'Dupla Montagem', numero_pulseira: '2002', tipo_pulseira_id: 'tp1', qr_code: null, cpf: '10000000001' },
            { id: 'a2', evento_id: 'ev1', nome_completo: 'Dupla Evento', numero_pulseira: '2002', tipo_pulseira_id: 'tp2', qr_code: null, cpf: '10000000002' }
        ];
    });

    it('mesmo número em lotes diferentes, lote ativo tp2 → devolve a pessoa do tp2 (sem 409)', async () => {
        mockEscolha.lote = LOTE_EVENTO;
        const r = await buscar('2002');
        expect(r.pessoa?.id).toBe('a2');
        expect(r.status).toBeUndefined();
    });

    it('mesmo número em lotes diferentes, lote ativo tp1 → devolve a pessoa do tp1', async () => {
        mockEscolha.lote = LOTE_MONTAGEM;
        const r = await buscar('2002');
        expect(r.pessoa?.id).toBe('a1');
    });

    it('mesmo número repetido DENTRO do lote ativo → 409', async () => {
        mockDb.pessoas.push({ id: 'a3', evento_id: 'ev1', nome_completo: 'Outra Montagem', numero_pulseira: '2002', tipo_pulseira_id: 'tp1', qr_code: null, cpf: '10000000003' });
        mockEscolha.lote = LOTE_MONTAGEM;
        const r = await buscar('2002');
        expect(r.status).toBe(409);
        expect(r.erro).toMatch(/neste lote/);
        expect(r.pessoa).toBeUndefined();
    });

    it('repetido só em lotes que não valem agora → 404 (não 409)', async () => {
        mockEscolha.lote = null; // nenhum lote vale neste momento
        const r = await buscar('2002');
        expect(r.status).toBe(404);
        expect(r.erro).toMatch(/outro lote/);
    });

    it('pulseira única no evento → devolve a pessoa como antes', async () => {
        mockDb.pessoas = [{ id: 'u1', evento_id: 'ev1', nome_completo: 'Única', numero_pulseira: '3003', tipo_pulseira_id: 'tp1', qr_code: null, cpf: '10000000004' }];
        mockEscolha.lote = LOTE_MONTAGEM;
        const r = await buscar('3003');
        expect(r.pessoa?.id).toBe('u1');
    });
});
