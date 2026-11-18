'use strict';

/**
 * Biometrias que o servidor manda ao motor de IA pelo agente do evento.
 * Regras cobertas:
 *  - toda pessoa enviada leva o evento_id do agente (o motor só usa quem é do evento da câmera);
 *  - quem está na watchlist de OUTRO evento entra como se fosse deste;
 *  - quem já tem rosto neste evento (mesmo CPF) NÃO entra de novo: duas entradas da mesma pessoa
 *    deixam a margem de reconhecimento zerada e ninguém é reconhecido.
 */

let mockDb;

function mockConsulta(tabela) {
    const filtros = [];
    let faixa = null;
    let limite = null;
    const q = {
        select() { return q; },
        order() { return q; },
        eq(coluna, valor) { filtros.push(r => r[coluna] === valor); return q; },
        in(coluna, valores) { filtros.push(r => valores.includes(r[coluna])); return q; },
        not(coluna, op, valor) {
            if (op === 'is' && valor === null) filtros.push(r => r[coluna] !== null && r[coluna] !== undefined);
            return q;
        },
        range(de, ate) { faixa = [de, ate]; return q; },
        limit(n) { limite = n; return q; },
        then(resolve, reject) {
            let linhas = (mockDb[tabela] || []).filter(r => filtros.every(f => f(r)));
            if (faixa) linhas = linhas.slice(faixa[0], faixa[1] + 1);
            if (limite) linhas = linhas.slice(0, limite);
            return Promise.resolve({ data: linhas, error: null }).then(resolve, reject);
        },
    };
    return q;
}

jest.mock('../src/config/supabase', () => ({ supabase: { from: (t) => mockConsulta(t) } }));
jest.mock('../src/services/logger', () => ({ info: () => {}, warn: () => {}, debug: () => {}, error: () => {} }));
jest.mock('../src/services/storageSeguro', () => ({ caminhoDeStorage: () => null, baixarArquivo: async () => Buffer.alloc(0), BUCKETS_FOTO: [] }));

const { atender } = require('../src/modules/system/biometriaAgente.service');

const ROSTO = [0.1, 0.2];

beforeEach(() => {
    mockDb = {
        watchlist: [
            { cpf: '22222222222', ativo: true },
            { cpf: '11111111111', ativo: true },
        ],
        pessoas: [
            // cadastrada no evento do agente (E1), com rosto
            { id: 'p1', nome_completo: 'Do evento', cpf: '11111111111', status_acesso: 'liberado', bloqueado: false, foto_url: null, face_encoding: ROSTO, evento_id: 'E1' },
            // só na watchlist de outro evento (E2), com rosto: deve entrar, com o evento do agente
            { id: 'p2', nome_completo: 'Watchlist', cpf: '22222222222', status_acesso: 'liberado', bloqueado: false, foto_url: null, face_encoding: ROSTO, evento_id: 'E2' },
            // de outro evento, sem watchlist: não deve entrar
            { id: 'p3', nome_completo: 'Outro evento', cpf: '33333333333', status_acesso: 'liberado', bloqueado: false, foto_url: null, face_encoding: ROSTO, evento_id: 'E2' },
            // mesmo CPF da p1 em outro evento: já está no E1 com rosto, não pode entrar de novo
            { id: 'p4', nome_completo: 'Duplicada', cpf: '11111111111', status_acesso: 'liberado', bloqueado: false, foto_url: null, face_encoding: ROSTO, evento_id: 'E2' },
        ],
    };
});

test('toda pessoa enviada leva o evento do agente; watchlist de outro evento entra', async () => {
    const r = await atender({ evento_id: 'E1' }, { modo: 'pessoas', ids: ['p1', 'p2', 'p3', 'p4'] });
    expect(r.ok).toBe(true);
    expect(r.pessoas.map(p => p.id).sort()).toEqual(['p1', 'p2']);
    for (const p of r.pessoas) expect(p.evento_id).toBe('E1');
});

test('mesma pessoa no evento e na watchlist de outro evento não entra duas vezes', async () => {
    const r = await atender({ evento_id: 'E1' }, { modo: 'pessoas', ids: ['p1', 'p4'] });
    expect(r.pessoas.map(p => p.id)).toEqual(['p1']);
});

test('cadastro do evento sem rosto não bloqueia a versão da watchlist que tem rosto', async () => {
    mockDb.pessoas[0].face_encoding = null; // p1 sem biometria no E1
    const r = await atender({ evento_id: 'E1' }, { modo: 'pessoas', ids: ['p2', 'p4'] });
    // p1 não tem rosto, então o CPF 111 não conta como "já no evento": a versão p4 (com rosto) entra
    expect(r.pessoas.map(p => p.id).sort()).toEqual(['p2', 'p4']);
});

test('sem evento no agente não envia ninguém', async () => {
    const r = await atender({}, { modo: 'pessoas', ids: ['p1'] });
    expect(r.ok).toBe(false);
});
