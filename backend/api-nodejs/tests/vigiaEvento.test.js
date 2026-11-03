/**
 * Vigia do evento: avisa só quando muda (caiu / voltou), espera confirmar antes de avisar
 * e não repete o mesmo aviso de lotação.
 */
process.env.VIGIA_SEM_RECURSOS = 'true'; // disco/memória dependem da máquina do teste
const mockMundo = { leitores: [], bancoErro: null, alertas: [] };
const mockEnviadas = [];

jest.mock('../src/services/logger', () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() }));
jest.mock('../src/services/telegramSistema', () => ({ enviar: jest.fn(async (t) => { mockEnviadas.push(t); return true; }) }));
jest.mock('../src/modules/system/operacao.service', () => ({ resumo: jest.fn(async () => ({ alertas: mockMundo.alertas })) }));
jest.mock('../src/config/supabase', () => {
    const consulta = (tabela) => {
        const q = {
            select: () => q, eq: () => q, in: () => q, limit: () => q,
            then: (ok) => {
                if (tabela === 'eventos' && mockMundo.bancoErro) return ok({ data: null, error: { message: mockMundo.bancoErro } });
                if (tabela === 'eventos') return ok({ data: [{ id: 'e1', nome: 'Show X' }], error: null });
                if (tabela === 'dispositivos_acesso') return ok({ data: mockMundo.leitores, error: null });
                return ok({ data: [], error: null });
            }
        };
        return q;
    };
    return { supabase: { from: consulta } };
});

const vigia = require('../src/services/vigiaEvento');
const leitor = (status) => [{ id: 'l1', nome: 'Totem', status_online: status, evento_id: 'e1' }];

beforeEach(() => { mockEnviadas.length = 0; });

it('leitor caído: avisa na 2ª verificação seguida, uma vez só, e avisa quando volta', async () => {
    mockMundo.leitores = leitor('online');
    await vigia.verificar(); // primeira (pós-deploy)
    mockMundo.leitores = leitor('offline');
    await vigia.verificar();
    expect(mockEnviadas).toHaveLength(0); // 1 verificação offline: ainda pode ser oscilação
    await vigia.verificar();
    expect(mockEnviadas).toHaveLength(1);
    expect(mockEnviadas[0]).toMatch(/Leitor sem conexão.*Totem.*Show X/s);
    await vigia.verificar();
    expect(mockEnviadas).toHaveLength(1); // não repete
    mockMundo.leitores = leitor('online');
    await vigia.verificar();
    expect(mockEnviadas[1]).toMatch(/Leitor voltou.*Totem/);
});

it('lotação: avisa ao entrar e quando muda, não a cada verificação', async () => {
    mockMundo.leitores = leitor('online');
    mockMundo.alertas = [{ id: 'capacidade', nivel: 'warning', titulo: 'Evento com 92% da capacidade', itens: [] }];
    await vigia.verificar();
    await vigia.verificar();
    expect(mockEnviadas.filter(t => /capacidade/.test(t))).toHaveLength(1);
    mockMundo.alertas = [{ id: 'capacidade', nivel: 'error', titulo: 'Evento lotado', itens: [] }];
    await vigia.verificar();
    expect(mockEnviadas.some(t => /🔴.*Evento lotado/.test(t))).toBe(true);
    mockMundo.alertas = [];
});

it('banco fora: avisa depois de 3 falhas seguidas e quando volta', async () => {
    mockMundo.bancoErro = 'timeout';
    await vigia.verificar();
    await vigia.verificar();
    expect(mockEnviadas.filter(t => /Banco/.test(t))).toHaveLength(0);
    await vigia.verificar();
    expect(mockEnviadas.filter(t => /Banco de dados sem responder/.test(t))).toHaveLength(1);
    mockMundo.bancoErro = null;
    await vigia.verificar();
    expect(mockEnviadas.some(t => /Banco de dados voltou/.test(t))).toBe(true);
});
