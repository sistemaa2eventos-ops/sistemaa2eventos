// Resumo de participantes da empresa: contagens de cadastro, pulseira, movimento de hoje, expulsão e pendências.

let mockPessoas = [];
let mockLogs = [];
let mockDocs = [];

jest.mock('../src/utils/buscarTodos', () => ({
    buscarTodos: async (q) => {
        const t = q.__tabela;
        if (t === 'pessoas') return { data: mockPessoas, error: null };
        if (t === 'logs_acesso') return { data: mockLogs, error: null };
        if (t === 'pessoa_documentos') return { data: mockDocs, error: null };
        return { data: [], error: null };
    },
}));
jest.mock('../src/config/supabase', () => ({
    supabase: { from: (tabela) => ({ __tabela: tabela, select() { return this; }, eq() { return this; }, in() { return this; }, gte() { return this; }, lte() { return this; }, order() { return this; } }) },
}));
jest.mock('../src/utils/dateUtils', () => ({
    getLimitesDiaLocalUTC: () => ({ start: '2026-11-26T03:00:00.000Z', end: '2026-11-27T02:59:59.999Z' }),
}));
jest.mock('../src/modules/entities/documentoRequisitos.service', () => ({
    getConfig: jest.fn().mockResolvedValue({ tipos: [], regras: {} }),
    // Sem regras: pendente quando não há documento aprovado (regra desta versão)
    avaliar: (config, p, docs) => ({
        status_documentos: docs.some(d => d.status === 'aprovado') ? 'aprovado' : 'pendente',
        exigidos: [], pendencias: [],
    }),
}));
jest.mock('../src/modules/entities/documento.service', () => ({
    _obrigatoriosComSituacao: () => [],
}));

const resumo = require('../src/modules/entities/empresaResumo.service');

beforeEach(() => {
    mockPessoas = [];
    mockLogs = [];
    mockDocs = [];
});

test('conta cadastrados, pulseira, check-in, dentro, check-out, expulsos e pendências', async () => {
    mockPessoas = [
        { id: 'a', nome_completo: 'Ana', funcao: 'DONO', numero_pulseira: '10', status_acesso: 'checkin_feito' },
        { id: 'b', nome_completo: 'Bruno', funcao: 'LIMPEZA', numero_pulseira: null, status_acesso: 'checkout_feito' },
        { id: 'c', nome_completo: 'Carla', funcao: 'PRODUTOR', numero_pulseira: null, status_acesso: 'expulso' },
        { id: 'd', nome_completo: 'Diego', funcao: null, numero_pulseira: null, status_acesso: 'autorizado' },
    ];
    mockLogs = [
        { pessoa_id: 'a', tipo: 'checkin', created_at: '2026-11-26T12:00:00Z' },
        { pessoa_id: 'b', tipo: 'checkin', created_at: '2026-11-26T13:00:00Z' },
        { pessoa_id: 'b', tipo: 'checkout', created_at: '2026-11-26T15:00:00Z' },
        { pessoa_id: 'c', tipo: 'expulsao', created_at: '2026-11-26T16:00:00Z' },
    ];
    mockDocs = [{ pessoa_id: 'a', status: 'aprovado' }];

    const { resumo: r, participantes } = await resumo.resumoParticipantes('ev1', 'emp1');

    expect(r).toMatchObject({
        cadastrados: 4,
        com_pulseira: 1,
        checkins_hoje: 2,
        checkouts_hoje: 1,
        dentro: 1,
        expulsos: 1,
        expulsoes_hoje: 1,
        pendentes_documentos: 3,
    });
    const b = participantes.find(p => p.id === 'b');
    expect(b.checkin_em).toBe('2026-11-26T13:00:00Z');
    expect(b.checkout_em).toBe('2026-11-26T15:00:00Z');
    expect(participantes.find(p => p.id === 'a').pendente).toBe(false);
});

test('sem participantes devolve zeros e lista vazia', async () => {
    const { resumo: r, participantes } = await resumo.resumoParticipantes('ev1', 'emp1');
    expect(participantes).toEqual([]);
    expect(r.cadastrados).toBe(0);
});
