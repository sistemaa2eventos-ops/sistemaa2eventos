/**
 * M6 (CloudSyncWorker): 23505 cujo id JÁ existe em logs_acesso é reenvio do mesmo acesso.
 * - id gravado → confirma (ack) e NÃO grava recusa na lista do painel;
 * - id ausente → recusa de verdade: grava em acessos_recusados e confirma;
 * - falha ao consultar o id → sem ack (volta na retentativa), sem recusa;
 * - P0409 não faz essa consulta (a regra vale só para 23505).
 * Supabase, Redis e logger simulados: nada é gravado de verdade.
 */

const mockRpc = jest.fn();
const mockConsultaLog = jest.fn(); // (id) → { data, error } da consulta em logs_acesso
const mockInsertRecusa = jest.fn();

jest.mock('../src/config/supabase', () => ({
    supabase: {
        rpc: (...args) => mockRpc(...args),
        from: (tabela) => ({
            insert: (linhas) => mockInsertRecusa(tabela, linhas),
            select: () => ({
                eq: (_coluna, valor) => ({ maybeSingle: async () => mockConsultaLog(tabela, valor) })
            })
        })
    }
}));
jest.mock('../src/services/logger', () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() }));
jest.mock('../src/services/queue.service', () => ({ UP_STREAM_KEY: 'stream', CONSUMER_GROUP: 'grupo', getClient: () => null }));

const worker = require('../src/workers/cloud_sync_worker');

const xAck = jest.fn(async () => 1);
worker.client = { xAck };

const mensagem = (log, id = 'msg-1') => ({ id, message: { payload_json: JSON.stringify(log) } });

const passagem = {
    id: 'log-1', evento_id: 'e1', pessoa_id: 'p1', tipo: 'checkin', metodo: 'pulseira',
    created_at: '2026-11-19T17:00:00.000Z', etapa: 'evento', dia_civil: '2026-11-19', area_id: null
};
const ERRO_23505 = { code: '23505', message: 'duplicate key value violates unique constraint "uq_logs_credenciamento_etapa_dia"' };

beforeEach(() => {
    jest.clearAllMocks();
    mockRpc.mockResolvedValue({ data: null, error: null });
    mockInsertRecusa.mockResolvedValue({ error: null });
    mockConsultaLog.mockResolvedValue({ data: null, error: null });
});

describe('23505 com o id já gravado (reenvio)', () => {
    it('confirma a mensagem e não grava recusa', async () => {
        mockRpc.mockResolvedValue({ data: null, error: ERRO_23505 });
        mockConsultaLog.mockResolvedValue({ data: { id: 'log-1' }, error: null });

        await worker.processMessage(mensagem(passagem));

        expect(mockConsultaLog).toHaveBeenCalledWith('logs_acesso', 'log-1');
        expect(mockInsertRecusa).not.toHaveBeenCalled();
        expect(xAck).toHaveBeenCalledTimes(1);
        expect(xAck).toHaveBeenCalledWith('stream', 'grupo', 'msg-1');
    });
});

describe('23505 com o id ausente (recusa de verdade)', () => {
    it('grava a recusa na lista do painel e confirma uma vez', async () => {
        mockRpc.mockResolvedValue({ data: null, error: ERRO_23505 });
        mockConsultaLog.mockResolvedValue({ data: null, error: null });

        await worker.processMessage(mensagem(passagem));

        expect(mockInsertRecusa).toHaveBeenCalledTimes(1);
        const [tabela, linhas] = mockInsertRecusa.mock.calls[0];
        expect(tabela).toBe('acessos_recusados');
        expect(linhas[0].motivo).toMatch(/duplicidade/);
        expect(linhas[0].dados.codigo).toBe('23505');
        expect(xAck).toHaveBeenCalledTimes(1);
    });
});

describe('falha ao consultar o id', () => {
    it('sem confirmação e sem recusa: a mensagem volta na retentativa', async () => {
        mockRpc.mockResolvedValue({ data: null, error: ERRO_23505 });
        mockConsultaLog.mockResolvedValue({ data: null, error: { message: 'statement timeout' } });

        await worker.processMessage(mensagem(passagem));

        expect(mockInsertRecusa).not.toHaveBeenCalled();
        expect(xAck).not.toHaveBeenCalled();
    });
});

describe('o que não muda', () => {
    it('P0409 não consulta o id: continua sendo recusa listada', async () => {
        mockRpc.mockResolvedValue({ data: null, error: { code: 'P0409', message: 'já está dentro', hint: 'false|2026-11-19T17:05:00Z' } });

        await worker.processMessage(mensagem(passagem));

        expect(mockConsultaLog).not.toHaveBeenCalled();
        expect(mockInsertRecusa).toHaveBeenCalledTimes(1);
        expect(xAck).toHaveBeenCalledTimes(1);
    });
});
