/**
 * Acesso liberado não pode se perder quando o Supabase falha:
 * vai para a fila do Redis e o CloudSyncWorker regrava (log + status da pessoa).
 * Banco e Redis simulados — nada é gravado de verdade.
 */

const chamadas = [];
let falharInsert = null;
let logMaisNovo = [];

// Cliente Supabase simulado: registra cada operação e responde conforme o cenário
const tabela = (nome) => {
    const op = { tabela: nome, filtros: {} };
    const builder = {
        insert: (linhas) => { op.acao = 'insert'; op.dados = linhas; chamadas.push(op); return Promise.resolve({ error: falharInsert }); },
        upsert: (linha) => { op.acao = 'upsert'; op.dados = linha; chamadas.push(op); return Promise.resolve({ error: null }); },
        update: (dados) => { op.acao = 'update'; op.dados = dados; chamadas.push(op); return builder; },
        select: () => { op.acao = 'select'; return builder; },
        eq: (c, v) => { op.filtros[c] = v; return op.acao === 'update' ? Promise.resolve({ error: null }) : builder; },
        neq: () => builder,
        gt: () => builder,
        limit: () => Promise.resolve({ data: logMaisNovo, error: null })
    };
    return builder;
};

jest.mock('../src/config/supabase', () => ({ supabase: { from: (n) => tabela(n) } }));

const publicados = [];
jest.mock('../src/services/queue.service', () => ({
    UP_STREAM_KEY: 'stream', CONSUMER_GROUP: 'grupo',
    publishLogToCloud: jest.fn(async (log) => { publicados.push(log); return 'msg-1'; }),
    getClient: () => null
}));
jest.mock('../src/services/websocketService', () => ({ emit: jest.fn() }));
jest.mock('../src/services/logger', () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() }));

const DatabaseService = require('../src/modules/checkin/services/database.service');
const worker = require('../src/workers/cloud_sync_worker');
const queueService = require('../src/services/queue.service');

const pessoa = { id: 'p1', status_acesso: 'pendente' };
const payload = { evento_id: 'e1', pessoa_id: 'p1', tipo: 'checkin', metodo: 'facial' };

beforeEach(() => {
    chamadas.length = 0;
    publicados.length = 0;
    falharInsert = null;
    logMaisNovo = [];
    queueService.publishLogToCloud.mockClear();
});

describe('registerAccessTransaction', () => {
    it('grava o log e atualiza o status quando o Supabase responde', async () => {
        const r = await DatabaseService.registerAccessTransaction('log-1', new Date(), payload, pessoa, 'checkin_feito');
        expect(r.success).toBe(true);
        expect(r.na_fila).toBeUndefined();
        expect(chamadas.map(c => `${c.tabela}.${c.acao}`)).toEqual(['logs_acesso.insert', 'pessoas.update']);
        expect(publicados).toHaveLength(0);
    });

    it('com o Supabase fora, manda o acesso liberado para a fila e não nega a pessoa', async () => {
        falharInsert = { code: '', message: 'TimeoutError: The operation was aborted' };
        const r = await DatabaseService.registerAccessTransaction('log-2', new Date(), payload, pessoa, 'checkin_feito');
        expect(r.success).toBe(true);
        expect(r.na_fila).toBe(true);
        expect(publicados).toHaveLength(1);
        expect(publicados[0]).toMatchObject({ id: 'log-2', pessoa_id: 'p1', tipo: 'checkin', _status_pessoa: 'checkin_feito' });
    });

    it('duplicidade (reenvio com o mesmo sync_id) não vai para a fila', async () => {
        falharInsert = { code: '23505', message: 'duplicate key' };
        const r = await DatabaseService.registerAccessTransaction('log-3', new Date(), payload, pessoa, 'checkin_feito');
        expect(r).toEqual({ success: true, already_done: true });
        expect(publicados).toHaveLength(0);
    });

    it('sem Supabase e sem Redis, devolve o erro (não finge que gravou)', async () => {
        falharInsert = { code: '', message: 'fetch failed' };
        queueService.publishLogToCloud.mockResolvedValueOnce(false);
        await expect(DatabaseService.registerAccessTransaction('log-4', new Date(), payload, pessoa, 'checkin_feito'))
            .rejects.toMatchObject({ message: 'fetch failed' });
    });
});

describe('CloudSyncWorker.processMessage', () => {
    const mensagem = (log) => ({ id: '1-0', message: { payload_json: JSON.stringify(log) } });

    beforeEach(() => {
        worker.client = { xAck: jest.fn().mockResolvedValue(1) };
    });

    it('regrava o log sem o campo interno e aplica o status da pessoa', async () => {
        await worker.processMessage(mensagem({ id: 'log-2', pessoa_id: 'p1', created_at: '2026-10-29T12:00:00.000Z', _status_pessoa: 'checkin_feito' }));
        const upsert = chamadas.find(c => c.acao === 'upsert');
        expect(upsert.dados).not.toHaveProperty('_status_pessoa');
        const update = chamadas.find(c => c.tabela === 'pessoas' && c.acao === 'update');
        expect(update.dados.status_acesso).toBe('checkin_feito');
        expect(worker.client.xAck).toHaveBeenCalled();
    });

    it('não desfaz um acesso mais novo da pessoa (ex.: saída gravada depois)', async () => {
        logMaisNovo = [{ id: 'log-saida' }];
        await worker.processMessage(mensagem({ id: 'log-2', pessoa_id: 'p1', created_at: '2026-10-29T12:00:00.000Z', _status_pessoa: 'checkin_feito' }));
        expect(chamadas.find(c => c.tabela === 'pessoas' && c.acao === 'update')).toBeUndefined();
        expect(worker.client.xAck).toHaveBeenCalled();
    });

    it('log negado (sem status) só regrava o log', async () => {
        await worker.processMessage(mensagem({ id: 'log-n', pessoa_id: 'p1', tipo: 'negado' }));
        expect(chamadas.map(c => `${c.tabela}.${c.acao}`)).toEqual(['logs_acesso.upsert']);
    });
});
