'use strict';

/**
 * Fila de sincronização dos leitores: toda mudança de acesso anotada pelos gatilhos do banco precisa
 * chegar aos leitores. Regras cobertas:
 *  - cada pendência sincroniza a pessoa nos leitores (cadastra/remove conforme status e áreas);
 *  - a pendência é marcada como processada ANTES de sincronizar (mudança no meio não se perde);
 *  - troca de evento remove dos leitores do evento antigo;
 *  - lote grande (ex.: áreas de um lote) carrega leitores e áreas do evento uma vez só;
 *  - sem a tabela (migration não aplicada): avisa e não quebra.
 */

let mockFila;
let mockErroSelect;
let mockOrdem;

jest.mock('../src/config/supabase', () => ({
    supabase: {
        from: () => {
            const q = {
                _filtros: [], _upd: null, _del: false,
                select() { return q; },
                is(c, v) { q._filtros.push(r => r[c] === v || (v === null && r[c] == null)); return q; },
                order() { return q; },
                limit(n) { q._limite = n; return q; },
                update(v) { q._upd = v; return q; },
                delete() { q._del = true; return q; },
                in(c, vals) { q._filtros.push(r => vals.includes(r[c])); return q; },
                eq(c, v) { q._filtros.push(r => r[c] === v); return q; },
                lt() { return q; },
                then(ok, falha) {
                    if (mockErroSelect && !q._upd && !q._del) return Promise.resolve({ data: null, error: mockErroSelect }).then(ok, falha);
                    const linhas = mockFila.filter(r => q._filtros.every(f => f(r)));
                    if (q._upd) {
                        linhas.forEach(r => Object.assign(r, q._upd));
                        mockOrdem.push(`marcou:${linhas.map(r => r.id).join(',')}`);
                        return Promise.resolve({ data: null, error: null }).then(ok, falha);
                    }
                    if (q._del) return Promise.resolve({ data: null, error: null }).then(ok, falha);
                    return Promise.resolve({ data: linhas.slice(0, q._limite || linhas.length).map(r => ({ ...r })), error: null }).then(ok, falha);
                }
            };
            return q;
        }
    }
}));
const mockWarn = jest.fn();
jest.mock('../src/services/logger', () => ({ info: () => {}, warn: (...a) => mockWarn(...a), debug: () => {}, error: () => {} }));

const { ciclo } = require('../src/modules/devices/filaSyncLeitores.service');

function syncFalso() {
    return {
        syncUserToAllDevices: jest.fn(async (id) => { mockOrdem.push(`sync:${id}`); }),
        deleteUserFromAllDevices: jest.fn(async (id, ev) => { mockOrdem.push(`remove:${id}@${ev}`); }),
        _carregarContextoSync: jest.fn(async () => ({ terminais: ['t1'] }))
    };
}

beforeEach(() => {
    mockErroSelect = null;
    mockOrdem = [];
    mockWarn.mockClear();
    mockFila = [
        { id: 1, pessoa_id: 'expulso', evento_id: 'E1', evento_anterior: null, motivo: 'status', processado_em: null },
        { id: 2, pessoa_id: 'nova-area', evento_id: 'E1', evento_anterior: null, motivo: 'areas_da_pessoa', processado_em: null },
        { id: 3, pessoa_id: 'ja-feito', evento_id: 'E1', evento_anterior: null, motivo: 'foto', processado_em: '2026-11-19T00:00:00Z' }
    ];
});

test('sincroniza cada pendência e marca como processada antes de sincronizar', async () => {
    const s = syncFalso();
    const feitos = await ciclo(s);
    expect(feitos).toBe(2);
    expect(s.syncUserToAllDevices.mock.calls.map(c => c[0])).toEqual(['expulso', 'nova-area']);
    expect(mockOrdem[0]).toBe('marcou:1,2'); // marcou antes da primeira sincronização
    expect(mockFila.find(r => r.id === 1).processado_em).toBeTruthy();
    expect(s.syncUserToAllDevices).not.toHaveBeenCalledWith('ja-feito', expect.anything());
});

test('sem pendências não faz nada', async () => {
    mockFila = [];
    const s = syncFalso();
    expect(await ciclo(s)).toBe(0);
    expect(s.syncUserToAllDevices).not.toHaveBeenCalled();
});

test('troca de evento: remove dos leitores do evento antigo e sincroniza no novo', async () => {
    mockFila = [{ id: 9, pessoa_id: 'mudou', evento_id: 'E2', evento_anterior: 'E1', motivo: 'evento', processado_em: null }];
    const s = syncFalso();
    await ciclo(s);
    expect(mockOrdem).toEqual(['marcou:9', 'remove:mudou@E1', 'sync:mudou']);
});

test('lote grande (áreas de um lote): carrega leitores e áreas do evento uma vez só', async () => {
    mockFila = Array.from({ length: 25 }, (_, i) => ({ id: i + 1, pessoa_id: `p${i}`, evento_id: 'E1', motivo: 'areas_do_lote', processado_em: null }));
    const s = syncFalso();
    await ciclo(s);
    expect(s._carregarContextoSync).toHaveBeenCalledTimes(1);
    expect(s.syncUserToAllDevices).toHaveBeenCalledTimes(25);
    expect(s.syncUserToAllDevices.mock.calls[0][1]).toEqual({ terminais: ['t1'] });
});

test('falha em uma pessoa não impede as outras', async () => {
    const s = syncFalso();
    s.syncUserToAllDevices.mockImplementationOnce(async () => { throw new Error('leitor recusou'); });
    const feitos = await ciclo(s);
    expect(feitos).toBe(1);
    expect(s.syncUserToAllDevices).toHaveBeenCalledTimes(2);
});

test('migration não aplicada: avisa uma vez e não quebra', async () => {
    mockErroSelect = { code: '42P01', message: 'relation "fila_sync_leitores" does not exist' };
    const s = syncFalso();
    expect(await ciclo(s)).toBe(0);
    expect(await ciclo(s)).toBe(0);
    expect(mockWarn).toHaveBeenCalledTimes(1);
    expect(s.syncUserToAllDevices).not.toHaveBeenCalled();
});
