/**
 * Registro do evento antes da exclusão (GET /api/eventos/:id/registro-encerramento):
 *  - traz evento, empresas, pessoas (inclui vínculo pivô de outro evento), acessos, pulseiras e Central
 *  - nunca leva biometria, token, chave, QR ou foto
 *  - tabela opcional ausente vira "indisponivel"; erro de leitura ou volume no teto interrompe tudo
 */

const bancoSimulado = {};
let erroPorTabela = {};

jest.mock('../src/utils/buscarTodos', () => {
    const actual = jest.requireActual('../src/utils/buscarTodos');
    return {
        ...actual,
        buscarTodos: jest.fn(async (query) => query.__executar()),
        buscarPorIdsEmLotes: jest.fn(async (ids, montar) => montar(ids)),
    };
});

const { montarRegistroEncerramento, limpar } = require('../src/modules/events/registroEncerramento.service');
const { buscarTodos } = require('../src/utils/buscarTodos');

function consulta(tabela) {
    const filtros = [];
    const aplicar = () => (bancoSimulado[tabela] || []).filter(l => filtros.every(([tipo, c, v]) =>
        tipo === 'in' ? v.includes(l[c]) : l[c] === v));
    const erro = () => erroPorTabela[tabela] || null;
    const b = {
        select() { return b; },
        order() { return b; },
        eq(c, v) { filtros.push(['eq', c, v]); return b; },
        in(c, v) { filtros.push(['in', c, v]); return b; },
        maybeSingle() {
            return Promise.resolve({ data: aplicar()[0] || null, error: erro() });
        },
        __executar() {
            return Promise.resolve({ data: aplicar(), error: erro() });
        },
        then(ok, ko) { return b.__executar().then(ok, ko); },
    };
    return b;
}

const cliente = { from: (tabela) => consulta(tabela) };
const EVENTO = 'evt-1';
const OUTRO = 'evt-2';

beforeEach(() => {
    erroPorTabela = {};
    for (const k of Object.keys(bancoSimulado)) delete bancoSimulado[k];
    bancoSimulado.eventos = [{ id: EVENTO, nome: 'Feira', config: { chave_motor: 'x', modulo: { ok: 1 } } }];
    bancoSimulado.empresas = [{ id: 'emp-1', evento_id: EVENTO, nome: 'Acme', registration_token: 'tok-123' }];
    bancoSimulado.pessoas = [
        { id: 'p-1', evento_id: EVENTO, nome_completo: 'Ana', cpf: '111', face_encoding: [0.1], foto_url: 'x.jpg', qr_code: 'pessoa-1' },
        { id: 'p-3', evento_id: OUTRO, nome_completo: 'Caio', cpf: '333' },
    ];
    bancoSimulado.pessoa_evento_empresa = [
        { id: 'v-1', pessoa_id: 'p-1', evento_id: EVENTO, empresa_id: 'emp-1' },
        { id: 'v-2', pessoa_id: 'p-3', evento_id: EVENTO, empresa_id: 'emp-1' },
    ];
    bancoSimulado.logs_acesso = [{ id: 'l-1', evento_id: EVENTO, pessoa_id: 'p-1', tipo: 'entrada' }];
    bancoSimulado.pulseira_vinculos = [{ id: 'pv-1', evento_id: EVENTO, pessoa_id: 'p-1', numero_pulseira: '10' }];
    bancoSimulado.pulseiras_pendencia = [];
    bancoSimulado.central_auditoria = [{ id: 1, evento_id: EVENTO, acao: 'entrar', detalhe: { senha_hash: 'h', camera: 'c1' } }];
    buscarTodos.mockClear();
});

describe('montarRegistroEncerramento', () => {
    test('traz evento, empresas, pessoas (com pivô), acessos, pulseiras e Central', async () => {
        const r = await montarRegistroEncerramento(cliente, EVENTO, { geradoPor: 'Admin' });

        expect(r.formato).toBe('nzt-registro-encerramento');
        expect(r.evento.id).toBe(EVENTO);
        expect(r.gerado_por).toBe('Admin');
        expect(r.secoes.empresas).toHaveLength(1);
        expect(r.secoes.logs_acesso).toHaveLength(1);
        expect(r.secoes.pulseira_vinculos).toHaveLength(1);
        expect(r.secoes.central_auditoria).toHaveLength(1);
        // p-1 do evento + p-3 (outro evento, mas com vínculo pivô neste evento)
        expect(r.secoes.pessoas.map(p => p.id).sort()).toEqual(['p-1', 'p-3']);
        expect(r.contagens.pessoas).toBe(2);
        expect(r.secoes_indisponiveis).toEqual([]);
    });

    test('não leva biometria, token, QR, foto nem chave de configuração', async () => {
        const r = JSON.stringify(await montarRegistroEncerramento(cliente, EVENTO));
        expect(r).not.toMatch(/face_encoding/);
        expect(r).not.toMatch(/foto_url/);
        expect(r).not.toMatch(/qr_code/);
        expect(r).not.toMatch(/registration_token/);
        expect(r).not.toMatch(/chave_motor/);
        expect(r).not.toMatch(/senha_hash/);
        // o que não é sigiloso continua
        expect(r).toMatch(/"camera":"c1"/);
        expect(r).toMatch(/"modulo"/);
    });

    test('tabela opcional ausente (central_auditoria) fica indisponível sem derrubar o registro', async () => {
        erroPorTabela.central_auditoria = { code: '42P01', message: 'relation does not exist' };
        const r = await montarRegistroEncerramento(cliente, EVENTO);
        expect(r.secoes_indisponiveis).toEqual(['central_auditoria']);
        expect(r.secoes.central_auditoria).toEqual([]);
        expect(r.secoes.logs_acesso).toHaveLength(1);
    });

    test('erro de leitura em tabela obrigatória interrompe a exportação', async () => {
        erroPorTabela.logs_acesso = { code: 'XX000', message: 'timeout' };
        await expect(montarRegistroEncerramento(cliente, EVENTO)).rejects.toMatchObject({ status: 500 });
    });

    test('volume no teto de leitura bloqueia (registro não pode sair cortado)', async () => {
        const { LIMITE_SEGURANCA } = jest.requireActual('../src/utils/buscarTodos');
        bancoSimulado.logs_acesso = Array.from({ length: LIMITE_SEGURANCA }, (_, i) => ({ id: `l${i}`, evento_id: EVENTO }));
        await expect(montarRegistroEncerramento(cliente, EVENTO)).rejects.toMatchObject({ status: 413 });
    });

    test('evento inexistente devolve 404', async () => {
        await expect(montarRegistroEncerramento(cliente, 'nao-existe')).rejects.toMatchObject({ status: 404 });
    });
});

describe('limpar', () => {
    test('remove chaves sigilosas em qualquer profundidade e mantém o resto', () => {
        const out = limpar({ a: 1, token_x: 'z', deep: { lista: [{ foto_url: 'u', nome: 'n' }] } });
        expect(out).toEqual({ a: 1, deep: { lista: [{ nome: 'n' }] } });
    });
});
