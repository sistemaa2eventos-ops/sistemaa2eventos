// Pulseira em uso / pendente: só entrada COM pulseira; saída real (qualquer número) ou devolução resolve;
// saída automática do fechamento de turno não resolve.

const mockDados = { entradas: [], saidas: [], marcadas: [], motivos: [] };

jest.mock('../src/config/supabase', () => {
    const builder = (tabela) => {
        const filtros = {};
        const b = {
            select: () => b, eq: (c, v) => { filtros[c] = v; return b; }, not: () => b, order: () => b,
            limit: () => b, gt: () => b, gte: () => b, in: () => b,
            then: (ok, erro) => {
                let data = [];
                if (tabela === 'logs_acesso') data = filtros.tipo === 'checkin' ? mockDados.entradas : mockDados.saidas;
                if (tabela === 'pulseira_vinculos') data = mockDados.marcadas;
                if (tabela === 'pulseiras_pendencia') data = mockDados.motivos;
                return Promise.resolve({ data, error: null }).then(ok, erro);
            },
        };
        return b;
    };
    return { supabase: { from: (t) => builder(t) } };
});
jest.mock('../src/services/logger', () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() }));
jest.mock('../src/utils/dateUtils', () => ({
    ...jest.requireActual('../src/utils/dateUtils'),
    getHojeLocal: () => '2026-11-24',
    getLimitesDiaLocalUTC: () => ({ start: '2026-11-24T03:00:00.000Z', end: '2026-11-25T02:59:59.999Z' }),
}));

const pulseiraService = require('../src/modules/pulseiras/pulseira.service');

beforeEach(() => Object.assign(mockDados, { entradas: [], saidas: [], marcadas: [], motivos: [] }));

test('entrada sem pulseira não gera pendência nem pulseira em uso', async () => {
    mockDados.entradas = [{ numero_pulseira: '', created_at: '2026-10-10T15:00:00' }];
    expect(await pulseiraService.buscarStatusPulseira('ev', 'p')).toEqual({ emUso: null, pendencia: null });
});

test('entrada de dia anterior só com saída automática do turno fica pendente (data em ISO UTC)', async () => {
    mockDados.entradas = [{ numero_pulseira: '0190', created_at: '2026-11-20T23:30:00' }];
    mockDados.saidas = [{ observacao: 'CHECKOUT_FORCADO_CRON' }];
    const r = await pulseiraService.buscarStatusPulseira('ev', 'p');
    expect(r.emUso).toBeNull();
    expect(r.pendencia).toEqual({ numero: '0190', dataCheckin: '2026-11-20T23:30:00.000Z', motivo: null });
});

test('saída real sem número de pulseira resolve a pendência', async () => {
    mockDados.entradas = [{ numero_pulseira: '0190', created_at: '2026-11-20T23:30:00' }];
    mockDados.saidas = [{ observacao: null }];
    expect(await pulseiraService.buscarStatusPulseira('ev', 'p')).toEqual({ emUso: null, pendencia: null });
});

test('pulseira marcada como devolvida resolve a pendência', async () => {
    mockDados.entradas = [{ numero_pulseira: '0190', created_at: '2026-11-20T23:30:00' }];
    mockDados.marcadas = [{ id: 'v1' }];
    expect(await pulseiraService.buscarStatusPulseira('ev', 'p')).toEqual({ emUso: null, pendencia: null });
});

test('entrada de hoje (horário de Brasília) sem saída = pulseira em uso', async () => {
    mockDados.entradas = [{ numero_pulseira: '1000', created_at: '2026-11-24T17:31:06' }];
    expect(await pulseiraService.buscarStatusPulseira('ev', 'p')).toEqual({ emUso: '1000', pendencia: null });
});

test('motivo já registrado aparece na pendência', async () => {
    mockDados.entradas = [{ numero_pulseira: '0190', created_at: '2026-11-20T23:30:00' }];
    mockDados.motivos = [{ motivo_nao_devolucao: 'perdeu no estacionamento' }];
    expect((await pulseiraService.buscarStatusPulseira('ev', 'p')).pendencia.motivo).toBe('perdeu no estacionamento');
});
