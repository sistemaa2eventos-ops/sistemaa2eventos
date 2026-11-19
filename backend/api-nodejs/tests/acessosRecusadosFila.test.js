/**
 * Recusas da fila (CloudSyncWorker) para a lista visível do painel (acessos_recusados, migration 20261119c):
 * - P0409 (entrada com a pessoa já dentro, ou saída sem liberação) grava uma linha com motivo legível e confirma;
 * - 23505 (duplicidade) grava a mesma coisa;
 * - a recusa NÃO vai para logs_acesso;
 * - tabela ausente: aviso no log e confirmação (a fila não trava);
 * - erro temporário ao gravar a recusa: sem confirmação (volta na retentativa);
 * - erro permanente ao gravar a recusa: aviso e confirmação (não fica repetindo).
 * Supabase, Redis e logger simulados: nada é gravado de verdade.
 */

const mockRpc = jest.fn();
const mockFrom = jest.fn();

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

const insertRecusa = jest.fn();

const mensagem = (log, id = 'msg-1') => ({ id, message: { payload_json: JSON.stringify(log) } });

const passagem = {
    id: 'log-1', evento_id: 'e1', pessoa_id: 'p1', tipo: 'checkin', metodo: 'pulseira',
    created_at: '2026-11-19T17:00:00.000Z', etapa: 'evento', dia_civil: '2026-11-19', area_id: null,
    pessoas: { id: 'p1', nome_completo: 'Nome que não vai para a recusa' }
};

beforeEach(() => {
    jest.clearAllMocks();
    mockRpc.mockResolvedValue({ data: null, error: null });
    insertRecusa.mockResolvedValue({ error: null });
    mockFrom.mockImplementation((tabela) => ({
        insert: (linhas) => insertRecusa(tabela, linhas),
        // consulta do id em logs_acesso (só no 23505): por padrão o id não existe
        select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null, error: null }) }) })
    }));
});

const recusaGravada = () => {
    expect(insertRecusa).toHaveBeenCalledTimes(1);
    const [tabela, linhas] = insertRecusa.mock.calls[0];
    expect(tabela).toBe('acessos_recusados');
    return linhas[0];
};

describe('P0409 (entrada recusada) vira linha em acessos_recusados', () => {
    it('pessoa ainda dentro: grava a recusa com motivo legível (hora local), dados técnicos e confirma uma vez', async () => {
        mockRpc.mockResolvedValue({ error: { code: 'P0409', message: 'Pessoa já está dentro nesta etapa, área e dia', hint: 'false|2026-11-19T17:05:00Z' } });

        await worker.processMessage(mensagem(passagem));

        const linha = recusaGravada();
        expect(linha).toEqual(expect.objectContaining({ evento_id: 'e1', pessoa_id: 'p1', tipo: 'checkin', metodo: 'pulseira', etapa: 'evento', area_id: null }));
        expect(linha.motivo).toMatch(/^Recusado ao gravar da fila: Pessoa já está dentro desde \d{2}:\d{2}/);
        expect(linha.dados).toEqual(expect.objectContaining({ codigo: 'P0409', log_id: 'log-1', dia_civil: '2026-11-19' }));
        expect(xAck).toHaveBeenCalledTimes(1);
        expect(xAck).toHaveBeenCalledWith('stream', 'grupo', 'msg-1');
    });

    it('saiu sem liberação (hint "true|..."): o motivo diz que a reentrada precisa de liberação', async () => {
        mockRpc.mockResolvedValue({ error: { code: 'P0409', message: 'Saída sem liberação de reentrada nesta etapa, área e dia', hint: 'true|2026-11-19T17:05:00Z' } });

        await worker.processMessage(mensagem(passagem));

        expect(recusaGravada().motivo).toMatch(/Reentrada precisa de liberação do controlador/);
        expect(xAck).toHaveBeenCalledTimes(1);
    });

    it('sem hint (função antiga): o motivo continua legível, usando o horário do acesso', async () => {
        mockRpc.mockResolvedValue({ error: { code: 'P0409', message: 'Pessoa já está dentro nesta etapa, área e dia' } });

        await worker.processMessage(mensagem(passagem));

        expect(recusaGravada().motivo).toMatch(/já está dentro desde \d{2}:\d{2}/);
    });

    it('a recusa nunca vai para logs_acesso (nem upsert, nem insert direto)', async () => {
        mockRpc.mockResolvedValue({ error: { code: 'P0409', message: 'x', hint: 'false|2026-11-19T17:05:00Z' } });

        await worker.processMessage(mensagem(passagem));

        expect(mockFrom.mock.calls.map(c => c[0])).toEqual(['acessos_recusados']);
    });
});

describe('23505 (duplicidade) também vira linha em acessos_recusados', () => {
    it('grava com motivo de duplicidade e confirma uma vez', async () => {
        mockRpc.mockResolvedValue({ error: { code: '23505', message: 'duplicate key value violates unique constraint "logs_acesso_pkey"' } });

        await worker.processMessage(mensagem(passagem));

        const linha = recusaGravada();
        expect(linha.motivo).toMatch(/duplicidade/);
        expect(linha.dados.codigo).toBe('23505');
        expect(xAck).toHaveBeenCalledTimes(1);
    });
});

describe('falhas ao gravar a própria recusa (a fila não pode travar)', () => {
    it('tabela acessos_recusados ausente: aviso no log com a migration e confirmação (sem travar)', async () => {
        mockRpc.mockResolvedValue({ error: { code: 'P0409', message: 'x', hint: 'false|2026-11-19T17:05:00Z' } });
        insertRecusa.mockResolvedValue({ error: { code: 'PGRST205', message: "Could not find the table 'public.acessos_recusados' in the schema cache" } });

        await worker.processMessage(mensagem(passagem));

        expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining('20261119c_acessos_recusados.sql'));
        expect(xAck).toHaveBeenCalledTimes(1);
        expect(xAck).toHaveBeenCalledWith('stream', 'grupo', 'msg-1');
    });

    it('erro temporário ao gravar a recusa: sem confirmação, para a retentativa', async () => {
        mockRpc.mockResolvedValue({ error: { code: 'P0409', message: 'x', hint: 'false|2026-11-19T17:05:00Z' } });
        insertRecusa.mockResolvedValue({ error: { code: '57014', message: 'canceling statement due to statement timeout' } });

        await worker.processMessage(mensagem(passagem));

        expect(xAck).not.toHaveBeenCalled();
        expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining('Recusa não gravada na lista'));
    });

    it('erro permanente ao gravar a recusa (ex.: evento inexistente): aviso e confirmação, sem repetir', async () => {
        mockRpc.mockResolvedValue({ error: { code: 'P0409', message: 'x', hint: 'false|2026-11-19T17:05:00Z' } });
        insertRecusa.mockResolvedValue({ error: { code: '23503', message: 'violates foreign key constraint' } });

        await worker.processMessage(mensagem(passagem));

        expect(xAck).toHaveBeenCalledTimes(1);
        expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining('erro 23503'));
    });
});

describe('o que não muda', () => {
    it('erro temporário da passagem (não é recusa) segue sem ack e não grava recusa', async () => {
        mockRpc.mockResolvedValue({ error: { code: '57014', message: 'timeout' } });

        await worker.processMessage(mensagem(passagem));

        expect(insertRecusa).not.toHaveBeenCalled();
        expect(xAck).not.toHaveBeenCalled();
    });

    it('código fora da lista (ex.: 23502) confirma como antes, sem gravar recusa', async () => {
        mockRpc.mockResolvedValue({ error: { code: '23502', message: 'not null violation' } });

        await worker.processMessage(mensagem(passagem));

        expect(insertRecusa).not.toHaveBeenCalled();
        expect(xAck).toHaveBeenCalledTimes(1);
    });
});
