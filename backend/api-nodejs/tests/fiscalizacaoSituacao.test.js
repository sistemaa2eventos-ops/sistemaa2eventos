// Fiscalização: credencial, presença de hoje e pulseira em uso hoje (nunca de outro dia).

const mockMovimentos = { lista: [] };
const mockTipos = { lista: [{ id: 't1', nome_tipo: 'MONTAGEM 1', cor_hex: '#FFB800' }] };
const mockStatusPulseira = { valor: { emUso: null, pendencia: null } };

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

const client = {
    from(tabela) {
        const b = {
            select: () => b, eq: () => b, in: () => b, gte: () => b, lte: () => b, order: () => b,
            maybeSingle: () => Promise.resolve({ data: mockTipos.lista[0], error: null }),
            then: (ok, erro) => {
                const data = tabela === 'logs_acesso' ? mockMovimentos.lista : [];
                return Promise.resolve({ data, error: null }).then(ok, erro);
            },
        };
        return b;
    },
};

const pessoaOk = { id: 'p1', status_acesso: 'checkin_feito', ativo: true, bloqueado: false, tipo_pulseira_id: 't1' };

beforeEach(() => {
    mockMovimentos.lista = [];
    mockStatusPulseira.valor = { emUso: null, pendencia: null };
});

test('credenciada, entrou hoje com a pulseira em uso: dentro, com número, tipo e horário', async () => {
    mockMovimentos.lista = [{ tipo: 'checkin', created_at: '2026-11-24T17:31:06', numero_pulseira: '1000', metodo: 'pulseira', evento_areas: { nome_area: 'Portaria' } }];
    mockStatusPulseira.valor = { emUso: '1000', pendencia: null };
    const s = await situacaoFiscal(client, 'ev', pessoaOk);
    expect(s.credenciado).toBe(true);
    expect(s.dentro_do_evento).toBe(true);
    expect(s.pulseira).toEqual({ numero: '1000', tipo_nome: 'MONTAGEM 1', cor_hex: '#FFB800', colocada_em: '2026-11-24T17:31:06.000Z' });
    expect(s.historico_hoje[0]).toMatchObject({ tipo: 'checkin', numero_pulseira: '1000', area_nome: 'Portaria' });
});

test('saiu depois do check-in: fora do evento e sem pulseira em uso', async () => {
    mockMovimentos.lista = [
        { tipo: 'checkin', created_at: '2026-11-24T12:00:00', numero_pulseira: '1000' },
        { tipo: 'checkout', created_at: '2026-11-24T15:00:00', numero_pulseira: '1000' },
    ];
    const s = await situacaoFiscal(client, 'ev', pessoaOk);
    expect(s.dentro_do_evento).toBe(false);
    expect(s.ultimo_evento_hoje).toBe('checkout');
    expect(s.pulseira).toBeNull();
    expect(s.historico_hoje).toHaveLength(2);
});

test('pulseira de outro dia (sem devolução ou descredenciada) nunca aparece como pulseira', async () => {
    mockStatusPulseira.valor = { emUso: null, pendencia: { numero: '0190', dataCheckin: '2026-11-20T23:30:00.000Z', motivo: null } };
    const s = await situacaoFiscal(client, 'ev', pessoaOk);
    expect(s.pulseira).toBeNull();
    expect(s.dentro_do_evento).toBe(false);
    expect(JSON.stringify(s)).not.toContain('0190');
});

test('pendente, recusada, em verificação, bloqueada ou cadastro desativado: não credenciada', async () => {
    for (const st of ['pendente', 'recusado', 'verificacao']) {
        const s = await situacaoFiscal(client, 'ev', { ...pessoaOk, status_acesso: st });
        expect(s.credenciado).toBe(false);
    }
    expect((await situacaoFiscal(client, 'ev', { ...pessoaOk, bloqueado: true })).credenciado).toBe(false);
    expect((await situacaoFiscal(client, 'ev', { ...pessoaOk, ativo: false })).credenciado).toBe(false);
});

test('entrada de hoje sem pulseira: dentro=false e pulseira null', async () => {
    mockMovimentos.lista = [{ tipo: 'checkin', created_at: '2026-11-24T12:00:00', numero_pulseira: null }];
    const s = await situacaoFiscal(client, 'ev', pessoaOk);
    expect(s.pulseira).toBeNull();
    expect(s.dentro_do_evento).toBe(false);
    expect(s.ultimo_evento_hoje).toBe('checkin');
});
