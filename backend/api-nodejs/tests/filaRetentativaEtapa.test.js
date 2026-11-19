/**
 * Fila de retentativa (CloudSyncWorker):
 * - passagem com etapa é gravada pela função registrar_acesso_etapa (regra de entrada única);
 * - sem a função no banco, grava direto e avisa no log;
 * - P0409 (entrada já dentro) e 23505 (duplicidade) são recusas definitivas: ack + motivo, sem nova tentativa;
 * - erro temporário continua sem ack (volta pela retentativa).
 * Supabase, Redis e logger simulados: nada é gravado de verdade.
 */

const mockRpc = jest.fn();
const mockFrom = jest.fn();
const mockUpsert = jest.fn();
const mockInsertRecusa = jest.fn(); // lista de recusas (acessos_recusados, migration 20261119c)

jest.mock('../src/config/supabase', () => ({
    supabase: {
        rpc: (...args) => mockRpc(...args),
        from: (...args) => mockFrom(...args)
    }
}));
jest.mock('../src/services/logger', () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() }));
jest.mock('../src/services/queue.service', () => ({ UP_STREAM_KEY: 'stream', CONSUMER_GROUP: 'grupo', getClient: () => null }));

const logger = require('../src/services/logger');
const worker = require('../src/workers/cloud_sync_worker');

const xAck = jest.fn(async () => 1);
worker.client = { xAck };

const mensagem = (log, id = 'msg-1') => ({ id, message: { payload_json: JSON.stringify(log) } });

const passagem = {
    id: 'log-1', evento_id: 'e1', pessoa_id: 'p1', tipo: 'checkin', metodo: 'manual',
    created_at: '2026-11-19T12:00:00.000Z', etapa: 'evento', dia_civil: '2026-11-19',
    pessoas: { id: 'p1', nome_completo: 'Relação que não vai para o banco' }
};

beforeEach(() => {
    jest.clearAllMocks();
    // select: consulta do id em logs_acesso antes de recusar um 23505 (reenvio já gravado não é recusa)
    mockFrom.mockImplementation(() => ({
        upsert: mockUpsert,
        insert: mockInsertRecusa,
        select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null, error: null }) }) })
    }));
    mockUpsert.mockResolvedValue({ error: null });
    mockInsertRecusa.mockResolvedValue({ error: null });
    mockRpc.mockResolvedValue({ data: 'log-1', error: null });
});

describe('passagem com etapa pela função registrar_acesso_etapa', () => {
    it('chama a função com a linha (sem relações) e confirma a mensagem', async () => {
        await worker.processMessage(mensagem(passagem));

        expect(mockRpc).toHaveBeenCalledTimes(1);
        const [nome, args] = mockRpc.mock.calls[0];
        expect(nome).toBe('registrar_acesso_etapa');
        expect(args.p_row).toEqual(expect.objectContaining({ id: 'log-1', etapa: 'evento', dia_civil: '2026-11-19' }));
        expect(args.p_row).not.toHaveProperty('pessoas');
        expect(mockFrom).not.toHaveBeenCalled();
        expect(xAck).toHaveBeenCalledWith('stream', 'grupo', 'msg-1');
    });

    it('credenciamento com etapa vai pela função como passagem comum (método pulseira, sem marcador)', async () => {
        await worker.processMessage(mensagem({ ...passagem, metodo: 'pulseira' }));
        expect(mockRpc).toHaveBeenCalledTimes(1);
        expect(mockRpc.mock.calls[0][1].p_row).toEqual(expect.objectContaining({ metodo: 'pulseira', tipo: 'checkin' }));
        expect(xAck).toHaveBeenCalledTimes(1);
    });

    it('linha antiga da fila com o marcador CREDENCIAMENTO também vai pela função (sem exceção)', async () => {
        await worker.processMessage(mensagem({ ...passagem, observacao: 'CREDENCIAMENTO' }));
        expect(mockRpc).toHaveBeenCalledTimes(1);
        expect(mockRpc.mock.calls[0][1].p_row.observacao).toBe('CREDENCIAMENTO');
        expect(xAck).toHaveBeenCalledTimes(1);
    });

    it.each([['PGRST202', 'Could not find the function public.registrar_acesso_etapa'], ['42883', 'function does not exist']])(
        'sem a função no banco (%s): grava direto como antes e avisa no log',
        async (code, message) => {
            mockRpc.mockResolvedValue({ error: { code, message } });

            await worker.processMessage(mensagem(passagem));

            expect(mockUpsert).toHaveBeenCalledWith(expect.objectContaining({ id: 'log-1', etapa: 'evento' }), { onConflict: 'id', ignoreDuplicates: true });
            expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining('registrar_acesso_etapa'));
            expect(xAck).toHaveBeenCalledWith('stream', 'grupo', 'msg-1');
        }
    );

    it('log sem etapa nem dia civil (negado, log antigo) segue pelo upsert direto', async () => {
        const { etapa, dia_civil, ...semEtapa } = passagem;
        await worker.processMessage(mensagem({ ...semEtapa, tipo: 'negado' }));

        expect(mockRpc).not.toHaveBeenCalled();
        expect(mockUpsert).toHaveBeenCalledTimes(1);
        expect(xAck).toHaveBeenCalledTimes(1);
    });

    it('erro temporário (ex.: timeout) não é confirmado: fica para a retentativa', async () => {
        mockRpc.mockResolvedValue({ error: { code: '57014', message: 'canceling statement due to statement timeout' } });

        await worker.processMessage(mensagem(passagem));

        expect(xAck).not.toHaveBeenCalled();
        expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining('Falha temporária'));
    });
});

describe('recusas definitivas (ack, sem nova tentativa)', () => {
    it.each([
        ['P0409', 'entrada recusada'],
        ['23505', 'duplicidade recusada']
    ])('erro %s: confirma uma vez, registra o motivo e não grava nem aplica status', async (code, motivo) => {
        mockRpc.mockResolvedValue({ error: { code, message: 'recusado pelo banco' } });
        const comStatus = { ...passagem, _status_pessoa: 'checkin_feito' };

        await worker.processMessage(mensagem(comStatus));

        expect(mockRpc).toHaveBeenCalledTimes(1);
        expect(xAck).toHaveBeenCalledTimes(1);
        expect(xAck).toHaveBeenCalledWith('stream', 'grupo', 'msg-1');
        expect(logger.error).toHaveBeenCalledWith(expect.stringContaining(motivo), expect.anything());
        expect(mockUpsert).not.toHaveBeenCalled();
        // Só a lista de recusas é gravada (acessos_recusados): sem escrita em logs_acesso e sem status da pessoa.
        // Antes disso o 23505 consulta o id em logs_acesso (leitura: reenvio já gravado não é recusa).
        expect(mockFrom.mock.calls.map(c => c[0])).toEqual(expect.arrayContaining(['acessos_recusados']));
        expect(mockFrom.mock.calls.map(c => c[0]).filter(t => t !== 'logs_acesso')).toEqual(['acessos_recusados']);
        expect(mockInsertRecusa).toHaveBeenCalledTimes(1);
    });
});
