/**
 * A1 (registerAccessTransaction): um 23505 que NÃO é o índice de entrada não pode virar "ok".
 * - id já gravado em logs_acesso → reenvio: already_done (idempotente);
 * - id ausente → passagem NÃO gravada: success false, erro ENTRADA_DUPLICADA (409, não liberável);
 * - falha ao consultar o id → não confirma nada (success false, sem already_done).
 * B8 (lado do banco): o 409 de bloqueio do banco leva a etapa na própria exceção.
 * Supabase, fila e websocket simulados: nada é gravado de verdade.
 */

const mockRpc = jest.fn();
const mockInsert = jest.fn();
const mockUpdate = jest.fn();
const mockConsultaId = jest.fn(); // (id) → { data, error } da consulta por id em logs_acesso

jest.mock('../src/config/supabase', () => ({
    supabase: {
        rpc: (...args) => mockRpc(...args),
        from: (tabela) => ({
            insert: (linhas) => mockInsert(tabela, linhas),
            update: (dados) => { mockUpdate(tabela, dados); return { eq: async () => ({ error: null }) }; },
            select: () => ({
                eq: (coluna, valor) => ({ maybeSingle: async () => mockConsultaId(tabela, coluna, valor) })
            })
        })
    }
}));
jest.mock('../src/services/logger', () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() }));
jest.mock('../src/services/websocketService', () => ({ emit: jest.fn() }));
jest.mock('../src/services/queue.service', () => ({ publishLogToCloud: jest.fn(async () => true) }));

const queueService = require('../src/services/queue.service');
const DatabaseService = require('../src/modules/checkin/services/database.service');

const TIMESTAMP = new Date('2026-11-19T12:00:00.000Z');
const PAYLOAD = {
    evento_id: 'e1', pessoa_id: 'p1', tipo: 'checkin', metodo: 'pulseira', dispositivo_id: 'web-dashboard',
    created_by: 'op1', area_id: null, etapa: 'montagem', dia_civil: '2026-11-19'
};
const PESSOA = { id: 'p1', status_acesso: 'autorizado' };

// Índice de OUTRA natureza (ex.: credenciamento), não o de entrada uq_logs_entrada_etapa_dia
const ERRO_OUTRO_INDICE = {
    code: '23505',
    message: 'duplicate key value violates unique constraint "uq_logs_credenciamento_etapa_dia"'
};

beforeEach(() => {
    jest.clearAllMocks();
    mockConsultaId.mockResolvedValue({ data: null, error: null });
    mockInsert.mockResolvedValue({ error: null });
});

describe('23505 de outro índice (não o de entrada)', () => {
    // Com etapa a gravação passa pela função (rpc); sem etapa, é insert direto. Os dois caminhos valem.
    it.each([
        ['pela função registrar_acesso_etapa', { ...PAYLOAD }, () => mockRpc.mockResolvedValue({ data: null, error: ERRO_OUTRO_INDICE })],
        ['insert direto (sem etapa)', { ...PAYLOAD, etapa: null, dia_civil: null }, () => mockInsert.mockResolvedValue({ error: ERRO_OUTRO_INDICE })]
    ])('%s, id ausente: NÃO confirma; devolve ENTRADA_DUPLICADA 409 não liberável', async (_nome, payload, preparar) => {
        preparar();

        const r = await DatabaseService.registerAccessTransaction('log-novo', TIMESTAMP, payload, PESSOA, 'checkin_feito');

        expect(r.success).toBe(false);
        expect(r.already_done).toBeUndefined();
        expect(r.entrada_duplicada).toBe(true);
        expect(r.erro.status).toBe(409);
        expect(r.erro.codigo).toBe('ENTRADA_DUPLICADA');
        expect(r.erro.liberavel).toBe(false);
        expect(r.erro.is_entrada_duplicada).toBe(true);
        expect(r.erro.message).toMatch(/Nada foi registrado/);
        // não marca o status da pessoa como ok, nem vai para a fila de retentativa (23505 é recusa definitiva)
        expect(mockUpdate).not.toHaveBeenCalled();
        expect(queueService.publishLogToCloud).not.toHaveBeenCalled();
    });

    it('id já gravado em logs_acesso: é reenvio → already_done', async () => {
        mockRpc.mockResolvedValue({ data: null, error: ERRO_OUTRO_INDICE });
        mockConsultaId.mockResolvedValue({ data: { id: 'log-ja' }, error: null });

        const r = await DatabaseService.registerAccessTransaction('log-ja', TIMESTAMP, PAYLOAD, PESSOA, 'checkin_feito');

        expect(r).toEqual({ success: true, already_done: true });
        expect(mockConsultaId).toHaveBeenCalledWith('logs_acesso', 'id', 'log-ja');
    });

    it('falha ao consultar o id: não confirma nada (success false, sem already_done)', async () => {
        mockRpc.mockResolvedValue({ data: null, error: ERRO_OUTRO_INDICE });
        mockConsultaId.mockResolvedValue({ data: null, error: { message: 'statement timeout' } });

        const r = await DatabaseService.registerAccessTransaction('log-x', TIMESTAMP, PAYLOAD, PESSOA, 'checkin_feito');

        expect(r.success).toBe(false);
        expect(r.already_done).toBeUndefined();
        expect(r.entrada_duplicada).toBeUndefined();
    });
});

describe('B8 no banco: o 409 de bloqueio leva a etapa', () => {
    it('P0409 com hint de "dentro": erro.etapa é a etapa da passagem', async () => {
        mockRpc.mockResolvedValue({ data: null, error: { code: 'P0409', message: 'Pessoa já está dentro', hint: 'false|2026-11-19T17:05:00Z' } });

        const r = await DatabaseService.registerAccessTransaction('log-d', TIMESTAMP, PAYLOAD, PESSOA, 'checkin_feito');

        expect(r.entrada_duplicada).toBe(true);
        expect(r.erro.codigo).toBe('ENTRADA_BLOQUEADA');
        expect(r.erro.liberavel).toBe(false);
        expect(r.erro.etapa).toBe('montagem');
    });

    it('P0409 com hint de "saiu sem liberação": liberavel true e etapa', async () => {
        mockRpc.mockResolvedValue({ data: null, error: { code: 'P0409', message: 'Saída sem liberação', hint: 'true|2026-11-19T17:05:00Z' } });

        const r = await DatabaseService.registerAccessTransaction('log-s', TIMESTAMP, PAYLOAD, PESSOA, 'checkin_feito');

        expect(r.erro.liberavel).toBe(true);
        expect(r.erro.etapa).toBe('montagem');
    });
});
