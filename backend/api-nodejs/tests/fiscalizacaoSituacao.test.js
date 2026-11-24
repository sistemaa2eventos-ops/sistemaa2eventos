// Fiscalização: credencial, presença de hoje, pulseira em uso hoje, pulseira de outro dia não devolvida
// e forma de cada registro (facial, manual com o operador, pulseira...).

const mockDados = {
    hoje: [],          // movimentos de hoje (checkin/checkout)
    anteriores: [],    // check-ins de pulseira (busca por número)
    saidas: [],        // saídas posteriores à entrada de outro dia
    perfis: [],
};
const mockStatusPulseira = { valor: { emUso: null, pendencia: null } };
const mockTipos = [{ id: 't1', nome_tipo: 'MONTAGEM 1', cor_hex: '#FFB800' }];

jest.mock('../src/config/supabase', () => ({ supabase: {} }));
jest.mock('../src/services/logger', () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() }));
jest.mock('../src/utils/dateUtils', () => ({
    ...jest.requireActual('../src/utils/dateUtils'),
    getHojeLocal: () => '2026-11-24',
    getLimitesDiaLocalUTC: () => ({ start: '2026-11-24T03:00:00.000Z', end: '2026-11-25T02:59:59.999Z' }),
}));
jest.mock('../src/modules/pulseiras/pulseira.service', () => ({
    buscarStatusPulseira: jest.fn(async () => mockStatusPulseira.valor),
}));

const { situacaoFiscal } = require('../src/modules/checkin/fiscalizacaoSituacao.service');

// Banco simulado: escolhe a lista pelo que foi pedido na consulta
function consulta(tabela) {
    const f = {};
    const b = {
        select: () => b,
        eq: (c, v) => { f[c] = v; return b; },
        in: () => b, gte: () => b, lte: () => b, limit: () => b,
        gt: (c, v) => { f.gt = [c, v]; return b; },
        order: () => b,
        maybeSingle: () => Promise.resolve({ data: mockTipos[0], error: null }),
        then: (ok, erro) => {
            let data = [];
            if (tabela === 'logs_acesso') {
                if (f.numero_pulseira) data = mockDados.anteriores;
                else if (f.tipo === 'checkout' && f.gt) data = mockDados.saidas;
                else data = mockDados.hoje;
            }
            if (tabela === 'perfis') data = mockDados.perfis;
            return Promise.resolve({ data, error: null }).then(ok, erro);
        },
    };
    return b;
}
const client = { from: (t) => consulta(t) };

const pessoaOk = { id: 'p1', status_acesso: 'checkin_feito', ativo: true, bloqueado: false, tipo_pulseira_id: 't1' };

beforeEach(() => {
    Object.assign(mockDados, { hoje: [], anteriores: [], saidas: [], perfis: [] });
    mockStatusPulseira.valor = { emUso: null, pendencia: null };
});

test('facial: entrou hoje com pulseira em uso, mostra horário, forma e pulseira', async () => {
    mockDados.hoje = [{ tipo: 'checkin', created_at: '2026-11-24T17:31:06', numero_pulseira: '1000', metodo: 'facial', created_by: null, evento_areas: { nome_area: 'Portaria' } }];
    mockStatusPulseira.valor = { emUso: '1000', pendencia: null };
    const s = await situacaoFiscal(client, 'ev', pessoaOk);
    expect(s.credenciado).toBe(true);
    expect(s.dentro_do_evento).toBe(true);
    expect(s.pulseira).toMatchObject({ numero: '1000', tipo_nome: 'MONTAGEM 1', forma: 'Facial', usuario_nome: null, colocada_em: '2026-11-24T17:31:06.000Z' });
    expect(s.entrada_hoje).toMatchObject({ forma: 'Facial', horario: '2026-11-24T17:31:06.000Z' });
});

test('entrada manual sem pulseira é válida e indica o operador e a hora', async () => {
    mockDados.hoje = [{ tipo: 'checkin', created_at: '2026-11-24T12:00:00', numero_pulseira: null, metodo: 'manual', created_by: 'op1' }];
    mockDados.perfis = [{ id: 'op1', nome_completo: 'Ana Operadora' }];
    const s = await situacaoFiscal(client, 'ev', pessoaOk);
    expect(s.dentro_do_evento).toBe(true);
    expect(s.pulseira).toBeNull();
    expect(s.entrada_hoje).toMatchObject({ forma: 'Manual', usuario_nome: 'Ana Operadora', horario: '2026-11-24T12:00:00.000Z' });
});

test('saiu depois do check-in: fora do evento', async () => {
    mockDados.hoje = [
        { tipo: 'checkin', created_at: '2026-11-24T12:00:00', numero_pulseira: '1000', metodo: 'pulseira' },
        { tipo: 'checkout', created_at: '2026-11-24T15:00:00', numero_pulseira: '1000', metodo: 'pulseira' },
    ];
    const s = await situacaoFiscal(client, 'ev', pessoaOk);
    expect(s.dentro_do_evento).toBe(false);
    expect(s.ultimo_evento_hoje).toBe('checkout');
    expect(s.historico_hoje).toHaveLength(2);
});

test('pulseira de outro dia não devolvida e pessoa ainda no evento: aparece como ainda dentro', async () => {
    mockStatusPulseira.valor = { emUso: null, pendencia: { numero: '0190', dataCheckin: '2026-11-20T23:30:00.000Z', motivo: null } };
    mockDados.anteriores = [{ created_at: '2026-11-20T23:30:00', metodo: 'manual', created_by: 'op2' }];
    mockDados.perfis = [{ id: 'op2', nome_completo: 'Bruno Portaria' }];
    const s = await situacaoFiscal(client, 'ev', pessoaOk);
    expect(s.dentro_do_evento).toBe(false);
    expect(s.pulseira).toBeNull();
    expect(s.pulseira_anterior).toMatchObject({
        numero: '0190', colocada_em: '2026-11-20T23:30:00.000Z', forma: 'Manual', usuario_nome: 'Bruno Portaria',
        ainda_dentro: true, saiu_em: null,
    });
});

test('pulseira de outro dia não devolvida, mas saiu no fim de turno: aparece com a hora da saída', async () => {
    mockStatusPulseira.valor = { emUso: null, pendencia: { numero: '0190', dataCheckin: '2026-11-20T23:30:00.000Z', motivo: null } };
    mockDados.anteriores = [{ created_at: '2026-11-20T23:30:00', metodo: 'facial', created_by: null }];
    mockDados.saidas = [{ created_at: '2026-11-21T02:00:00' }];
    const s = await situacaoFiscal(client, 'ev', pessoaOk);
    expect(s.pulseira_anterior).toMatchObject({ numero: '0190', forma: 'Facial', ainda_dentro: false, saiu_em: '2026-11-21T02:00:00.000Z' });
});

test('pulseira descredenciada (sem pendência) não aparece em lugar nenhum', async () => {
    mockStatusPulseira.valor = { emUso: null, pendencia: null };
    const s = await situacaoFiscal(client, 'ev', pessoaOk);
    expect(s.pulseira).toBeNull();
    expect(s.pulseira_anterior).toBeNull();
    expect(JSON.stringify(s)).not.toContain('0190');
});

test('pendente, recusada, em verificação, bloqueada ou cadastro desativado: não credenciada', async () => {
    for (const st of ['pendente', 'recusado', 'verificacao']) {
        expect((await situacaoFiscal(client, 'ev', { ...pessoaOk, status_acesso: st })).credenciado).toBe(false);
    }
    expect((await situacaoFiscal(client, 'ev', { ...pessoaOk, bloqueado: true })).credenciado).toBe(false);
    expect((await situacaoFiscal(client, 'ev', { ...pessoaOk, ativo: false })).credenciado).toBe(false);
});
