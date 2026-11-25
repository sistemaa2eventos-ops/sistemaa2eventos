'use strict';
/**
 * Operadores da Central de Monitoramento local: cadastro (senha só como hash) e registro de atividades
 * vindo do agente (evento sempre o do token, operador de outro evento não liga, reenvio não duplica).
 */

// Supabase simulado: cada consulta registra as operações e devolve a próxima resposta da tabela
const mockChamadas = [];
const mockRespostas = {};
function mockConstruir(tabela) {
    const reg = { tabela, ops: [] };
    mockChamadas.push(reg);
    const b = new Proxy({}, {
        get(_, prop) {
            if (prop === 'then') {
                const r = (mockRespostas[tabela] || []).shift() || { data: null, error: null };
                return (ok, falha) => Promise.resolve(r).then(ok, falha);
            }
            return (...args) => { reg.ops.push([prop, ...args]); return b; };
        }
    });
    return b;
}
jest.mock('../src/config/supabase', () => ({ supabase: { from: (t) => mockConstruir(t) } }));

const svc = require('../src/modules/system/centralOperadores.service');
const { verificarSenha } = require('../src/modules/producao/producaoPortalAuth');

const EVENTO = '11111111-1111-4111-8111-111111111111';
const OP_DO_EVENTO = '22222222-2222-4222-8222-222222222222';
const OP_DE_OUTRO = '33333333-3333-4333-8333-333333333333';
const AGENTE = { id: '44444444-4444-4444-8444-444444444444', evento_id: EVENTO };

beforeEach(() => {
    mockChamadas.length = 0;
    for (const k of Object.keys(mockRespostas)) delete mockRespostas[k];
});

const op = (reg, nome) => reg.ops.find(o => o[0] === nome);

describe('cadastro de operadores', () => {
    test('valida nome, login e senha antes de gravar', async () => {
        await expect(svc.criar(EVENTO, { nome: 'A', login: 'maria', senha: '12345678' })).rejects.toMatchObject({ status: 400 });
        await expect(svc.criar(EVENTO, { nome: 'Maria', login: 'ma', senha: '12345678' })).rejects.toMatchObject({ status: 400 });
        await expect(svc.criar(EVENTO, { nome: 'Maria', login: 'maria silva', senha: '12345678' })).rejects.toMatchObject({ status: 400 });
        await expect(svc.criar(EVENTO, { nome: 'Maria', login: 'maria', senha: 'curta' })).rejects.toMatchObject({ status: 400 });
        expect(mockChamadas).toHaveLength(0);
    });

    test('grava só o hash da senha, com login em minúsculas, no evento da requisição', async () => {
        mockRespostas.central_operadores = [{ data: { id: OP_DO_EVENTO, nome: 'Maria', login: 'maria', ativo: true }, error: null }];
        await svc.criar(EVENTO, { nome: '  Maria  ', login: 'Maria', senha: 'Senha@123' });
        const linha = op(mockChamadas[0], 'insert')[1];
        expect(linha).toMatchObject({ evento_id: EVENTO, nome: 'Maria', login: 'maria', ativo: true });
        expect(linha.senha_hash).toMatch(/^scrypt\$/);
        expect(JSON.stringify(linha)).not.toContain('Senha@123');
        expect(verificarSenha('Senha@123', linha.senha_hash)).toBe(true);
        // A resposta não pede o hash de volta
        expect(op(mockChamadas[0], 'select')[1]).not.toContain('senha_hash');
    });

    test('login repetido no evento responde 409', async () => {
        mockRespostas.central_operadores = [{ data: null, error: { code: '23505', message: 'duplicate key' } }];
        await expect(svc.criar(EVENTO, { nome: 'Maria', login: 'maria', senha: 'Senha@123' })).rejects.toMatchObject({ status: 409 });
    });

    test('alterar ou excluir só dentro do evento; id inválido é 404 sem consultar', async () => {
        await expect(svc.atualizar(EVENTO, 'nao-e-uuid', { nome: 'X Y' })).rejects.toMatchObject({ status: 404 });
        expect(mockChamadas).toHaveLength(0);
        mockRespostas.central_operadores = [{ data: { id: OP_DO_EVENTO, login: 'maria' }, error: null }];
        await svc.excluir(EVENTO, OP_DO_EVENTO);
        const eqs = mockChamadas[0].ops.filter(o => o[0] === 'eq');
        expect(eqs).toEqual(expect.arrayContaining([['eq', 'evento_id', EVENTO], ['eq', 'id', OP_DO_EVENTO]]));
    });
});

describe('registro de atividades vindo do agente', () => {
    test('descarta itens inválidos, usa o evento do token e não liga operador de outro evento', async () => {
        mockRespostas.central_operadores = [{ data: [{ id: OP_DO_EVENTO }], error: null }];
        const agora = new Date().toISOString();
        const r = await svc.registrarAuditoria(AGENTE, [
            { uid: 'a'.repeat(24), acao: 'entrar', operador_id: OP_DO_EVENTO, operador_nome: 'Maria', ocorrido_em: agora, evento_id: 'evento-falso' },
            { uid: 'b'.repeat(24), acao: 'girar', operador_id: OP_DE_OUTRO, operador_nome: 'Intruso', camera_id: 'cam-1', ocorrido_em: agora },
            { uid: 'c'.repeat(24), acao: 'apagar_tudo', operador_nome: 'X', ocorrido_em: agora },
            { uid: 'curto', acao: 'sair', operador_nome: 'X', ocorrido_em: agora },
            { uid: 'd'.repeat(24), acao: 'sair', operador_nome: 'X', ocorrido_em: new Date(Date.now() + 3 * 86400000).toISOString() }
        ]);
        expect(r).toEqual({ ok: true, n: 2 });
        const upsert = mockChamadas.map(c => op(c, 'upsert')).find(Boolean);
        const [, linhas, opcoes] = upsert;
        expect(opcoes).toEqual({ onConflict: 'uid', ignoreDuplicates: true });
        expect(linhas.map(l => l.acao)).toEqual(['entrar', 'girar']);
        expect(linhas.every(l => l.evento_id === EVENTO && l.agente_id === AGENTE.id)).toBe(true);
        expect(linhas[0].operador_id).toBe(OP_DO_EVENTO);
        expect(linhas[1].operador_id).toBeNull();
        expect(linhas[1].operador_nome).toBe('Intruso');
    });

    test('agente sem evento não grava nada', async () => {
        expect(await svc.registrarAuditoria({ id: AGENTE.id }, [{ uid: 'a'.repeat(24), acao: 'entrar' }])).toMatchObject({ ok: false });
        expect(mockChamadas).toHaveLength(0);
        expect(await svc.paraAgente(null)).toEqual([]);
    });
});
