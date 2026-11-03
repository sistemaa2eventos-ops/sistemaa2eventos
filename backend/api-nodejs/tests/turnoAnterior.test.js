/**
 * Check-out de quem entrou num dia anterior: detecta, sugere a saída pelo horário do último dia
 * trabalhado e corrige o turno antigo (troca a saída automática do reset), sem saída falsa "hoje".
 */
const mockDb = { logs: [], updates: [], inserts: [] };

jest.mock('../src/services/logger', () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() }));
jest.mock('../src/config/supabase', () => {
    const consulta = (tabela) => {
        const q = {
            select: () => q, eq: () => q, in: () => q, limit: () => q,
            order: () => q,
            maybeSingle: async () => ({ data: tabela === 'eventos' ? { horario_reset: '06:00:00' } : null }),
            update: (row) => { mockDb.updates.push({ tabela, row }); return q; },
            insert: async (row) => { mockDb.inserts.push({ tabela, row }); return { error: null }; },
            then: (ok) => ok(tabela === 'logs_acesso' ? { data: [...mockDb.logs], error: null } : { data: null, error: null })
        };
        return q;
    };
    return { supabase: { from: consulta } };
});

const turno = require('../src/modules/checkin/turnoAnterior.service');
const dia = 24 * 60 * 60 * 1000;
// hora local (UTC-3) de N dias atrás → texto como o banco guarda (UTC sem fuso)
const local = (diasAtras, h, m) => {
    const d = new Date(Date.now() - diasAtras * dia);
    const [a, mes, dd] = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(d).split('-');
    return new Date(`${a}-${mes}-${dd}T${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:00-03:00`).toISOString().replace('Z', '');
};
const horaLocal = (iso) => new Date(iso).toLocaleTimeString('pt-BR', { timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit' });

beforeEach(() => { mockDb.logs = []; mockDb.updates = []; mockDb.inserts = []; });

it('reset encerrou o turno: pede confirmação e sugere o horário de saída do dia anterior', async () => {
    mockDb.logs = [ // mais recente primeiro
        { id: 'f1', tipo: 'checkout', created_at: local(2, 6, 0), observacao: 'CHECKOUT_FORCADO_CRON' },
        { id: 'c2', tipo: 'checkin', created_at: local(3, 14, 0), observacao: null },
        { id: 'o1', tipo: 'checkout', created_at: local(4, 22, 30), observacao: null },
        { id: 'c1', tipo: 'checkin', created_at: local(4, 14, 5), observacao: null }
    ];
    const t = await turno.verificar('p1', 'e1');
    expect(t.saida_forcada_id).toBe('f1');
    expect(horaLocal(t.entrada_em)).toBe('14:00');
    expect(horaLocal(t.saida_sugerida)).toBe('22:30'); // mesma hora em que saiu no dia anterior
});

it('sem saída anterior conhecida: sugere entrada + 8 h', async () => {
    mockDb.logs = [
        { id: 'f1', tipo: 'checkout', created_at: local(1, 6, 0), observacao: 'CHECKOUT_FORCADO_CRON' },
        { id: 'c1', tipo: 'checkin', created_at: local(2, 9, 0), observacao: null }
    ];
    const t = await turno.verificar('p1', 'e1');
    expect(horaLocal(t.saida_sugerida)).toBe('17:00');
});

it('entrou hoje: segue o check-out normal', async () => {
    mockDb.logs = [{ id: 'c1', tipo: 'checkin', created_at: new Date(Date.now() - 30 * 60 * 1000).toISOString().replace('Z', ''), observacao: null }];
    expect(await turno.verificar('p1', 'e1')).toBeNull();
});

it('corrigir troca a saída automática pelo horário informado (não cria outra)', async () => {
    mockDb.logs = [
        { id: 'f1', tipo: 'checkout', created_at: local(2, 6, 0), observacao: 'CHECKOUT_FORCADO_CRON' },
        { id: 'c1', tipo: 'checkin', created_at: local(3, 14, 0), observacao: null }
    ];
    const saida = new Date(local(3, 23, 15) + 'Z').toISOString();
    const r = await turno.corrigir({ pessoa_id: 'p1', evento_id: 'e1', saida_em: saida, usuario_id: 'op1' });
    expect(r.substituiu_saida_automatica).toBe(true);
    const upd = mockDb.updates.find(u => u.tabela === 'logs_acesso');
    expect(upd.row).toMatchObject({ observacao: 'SAIDA_CORRIGIDA', created_by: 'op1', created_at: saida });
    expect(mockDb.inserts).toHaveLength(0);
});

it('saída antes da entrada é recusada', async () => {
    mockDb.logs = [
        { id: 'f1', tipo: 'checkout', created_at: local(2, 6, 0), observacao: 'CHECKOUT_FORCADO_CRON' },
        { id: 'c1', tipo: 'checkin', created_at: local(3, 14, 0), observacao: null }
    ];
    const r = await turno.corrigir({ pessoa_id: 'p1', evento_id: 'e1', saida_em: new Date(local(3, 13, 0) + 'Z').toISOString() });
    expect(r.status).toBe(400);
});
