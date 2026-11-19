/**
 * Credenciamento de pessoa que está DENTRO (sem saída registrada: saiu sem bipar, ou foi expulsa):
 * - a entrada no credenciamento é recusada (409 ENTRADA_BLOQUEADA, liberavel = false);
 * - o operador registra a SAÍDA pelo mesmo endpoint de check-out da ficha (POST /pulseira/checkout) com o
 *   pessoa_id; se a pulseira lida for de OUTRA pessoa (ou de ninguém) no evento, 409 PULSEIRA_DE_OUTRA_PESSOA
 *   e nada é gravado; pessoa de outro evento = 404;
 * - a observacao CREDENCIAMENTO é só informação: não muda a decisão de entrada (entrada única, reentrada,
 *   replay) e nenhuma regra do código compara o texto.
 * Supabase, validação e persistência simulados: nada é gravado de verdade.
 */

const fs = require('fs');
const path = require('path');

const mockDb = { pessoas: [], logs_acesso: [], evento_areas: [], liberacoes_reentrada: [] };

// Consulta simulada: eq/in/is/gt filtram; or() não pode aparecer; insert grava na tabela
function mockConstruir(tabela) {
    const filtros = [];
    let ordem = null;
    let limite = Infinity;
    let operacao = null;
    let carga = null;
    const b = {
        select() { return b; },
        eq(c, v) { filtros.push(r => r[c] === v); return b; },
        neq(c, v) { filtros.push(r => r[c] !== v); return b; },
        is(c, v) { filtros.push(r => (r[c] ?? null) === v); return b; },
        in(c, vs) { filtros.push(r => vs.includes(r[c])); return b; },
        gt(c, v) { filtros.push(r => r[c] > v); return b; },
        or() { throw new Error('or() não deveria ser usado no checkout nem na entrada'); },
        order(c, opts = {}) { ordem = { c, desc: opts.ascending === false }; return b; },
        limit(n) { limite = n; return b; },
        insert(rows) { operacao = 'insert'; carga = rows; return b; },
        maybeSingle() { return executar().then(r => ({ data: Array.isArray(r.data) ? (r.data[0] ?? null) : r.data, error: r.error })); },
        single() { return executar().then(r => ({ data: Array.isArray(r.data) ? (r.data[0] ?? null) : r.data, error: r.error })); },
        then(ok, ko) { return executar().then(ok, ko); }
    };
    function executar() {
        if (operacao === 'insert') {
            mockDb[tabela] = mockDb[tabela] || [];
            mockDb[tabela].push(...carga);
            return Promise.resolve({ data: carga, error: null });
        }
        let linhas = (mockDb[tabela] || []).filter(r => filtros.every(f => f(r)));
        if (ordem) linhas = [...linhas].sort((x, y) => (x[ordem.c] < y[ordem.c] ? -1 : x[ordem.c] > y[ordem.c] ? 1 : 0) * (ordem.desc ? -1 : 1));
        return Promise.resolve({ data: linhas.slice(0, limite).map(r => ({ ...r })), error: null });
    }
    return b;
}

jest.mock('../src/config/supabase', () => ({
    supabase: { from: (t) => mockConstruir(t), rpc: jest.fn(async () => ({ error: null })) }
}));
jest.mock('../src/services/logger', () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() }));
jest.mock('../src/services/queue.service', () => ({ publishLogToCloud: jest.fn(async () => false) }));
jest.mock('../src/services/authCache', () => ({}));
jest.mock('../src/services/websocketService', () => ({ emit: jest.fn() }));
jest.mock('../src/services/cacheService', () => ({ invalidatePessoa: jest.fn() }));
jest.mock('../src/modules/checkin/policy.service', () => ({ hasPermission: jest.fn(async () => false) }));
jest.mock('../src/middleware/eventMiddleware', () => ({
    requireEvent: (req, res, next) => next(),
    buscarEvento: jest.fn(async () => ({ evento: null }))
}));
jest.mock('../src/modules/checkin/checkin.service', () => ({ registrarAcesso: jest.fn(async () => ({ success: true, action: 'allow' })) }));
jest.mock('../src/modules/checkin/services/validation.service', () => ({}));
jest.mock('../src/services/webhookDispatcher', () => ({ dispatchCheckin: jest.fn(), dispatchCheckout: jest.fn() }));
jest.mock('../src/modules/checkin/services/database.service', () => ({ logDeniedAccess: jest.fn(async () => {}) }));
jest.mock('../src/modules/system/watchlist.service', () => ({ verificarCPF: jest.fn(async () => null), registrarAlerta: jest.fn(async () => {}) }));
jest.mock('../src/modules/pulseiras/pulseira.service', () => ({ numeroBloqueado: jest.fn(async () => null), registrarEntrega: jest.fn() }));
jest.mock('../src/modules/pulseiras/loteSelecao', () => ({
    buscarLotesDaFaixa: jest.fn(async () => []),
    escolherLote: jest.fn(async () => ({ lote: null }))
}));

const controller = require('../src/modules/checkin/checkin.controller');
const checkinService = require('../src/modules/checkin/checkin.service');
const entradaEtapa = require('../src/modules/checkin/services/entradaEtapa');
const { supabase } = require('../src/config/supabase');

const PESSOA = '00000000-0000-4000-8000-000000000001';
const PESSOA_OUTRO_EVENTO = '00000000-0000-4000-8000-000000000002';
const DIA = '2026-11-19';

const pessoas = () => [
    { id: PESSOA, evento_id: 'ev1', nome_completo: 'Maria Silva', cpf: '52998224725', numero_pulseira: '1234', status_acesso: 'checkin_feito', tipo_pulseira_id: null, empresas: null },
    { id: PESSOA_OUTRO_EVENTO, evento_id: 'ev2', nome_completo: 'Outra', cpf: '11144477735', numero_pulseira: '5678', status_acesso: 'autorizado', tipo_pulseira_id: null, empresas: null }
];

const resposta = () => {
    const res = { statusCode: 200, corpo: null };
    res.status = (c) => { res.statusCode = c; return res; };
    res.json = (b) => { res.corpo = b; return res; };
    return res;
};

const reqCheckout = (body) => ({
    body, event: { id: 'ev1' }, headers: {}, query: {}, user: { id: 'op1' }, supabase: supabase
});

beforeEach(() => {
    jest.clearAllMocks();
    mockDb.pessoas = pessoas();
    mockDb.logs_acesso = [];
    mockDb.evento_areas = [];
    mockDb.liberacoes_reentrada = [];
    checkinService.registrarAcesso.mockResolvedValue({ success: true, action: 'allow' });
});

describe('saída pelo credenciamento (pessoa localizada, sem pulseira correta)', () => {
    it('pessoa_id da pessoa do evento: registra CHECK-OUT (tipo forçado), método manual, sem usar a pulseira', async () => {
        const res = resposta();
        await controller.checkoutPulseira(reqCheckout({ pessoa_id: PESSOA }), res);

        expect(res.statusCode).toBe(200);
        expect(checkinService.registrarAcesso).toHaveBeenCalledTimes(1);
        const [, dados] = checkinService.registrarAcesso.mock.calls[0];
        expect(dados).toEqual(expect.objectContaining({ pessoa_id: PESSOA, evento_id: 'ev1', tipo: 'checkout', metodo: 'manual' }));
    });

    it('pulseira que não é da pessoa → 409 PULSEIRA_DE_OUTRA_PESSOA e nada é registrado', async () => {
        const res = resposta();
        await controller.checkoutPulseira(reqCheckout({ pessoa_id: PESSOA, numero_pulseira: '9999' }), res);

        expect(res.statusCode).toBe(409);
        expect(res.corpo.codigo).toBe('PULSEIRA_DE_OUTRA_PESSOA');
        expect(res.corpo.liberavel).toBe(false);
        expect(checkinService.registrarAcesso).not.toHaveBeenCalled();
    });

    it('pessoa de outro evento: 404 e nada é registrado', async () => {
        const res = resposta();
        await controller.checkoutPulseira(reqCheckout({ pessoa_id: PESSOA_OUTRO_EVENTO }), res);

        expect(res.statusCode).toBe(404);
        expect(checkinService.registrarAcesso).not.toHaveBeenCalled();
    });

    it('pessoa_id que não é uuid: 400', async () => {
        const res = resposta();
        await controller.checkoutPulseira(reqCheckout({ pessoa_id: 'abc' }), res);
        expect(res.statusCode).toBe(400);
        expect(checkinService.registrarAcesso).not.toHaveBeenCalled();
    });

    it('sem pulseira, CPF nem pessoa_id: 400 com a mensagem de antes', async () => {
        const res = resposta();
        await controller.checkoutPulseira(reqCheckout({}), res);
        expect(res.statusCode).toBe(400);
        expect(res.corpo.error).toMatch(/Identificador \(pulseira, CPF ou código\) é obrigatório/);
    });

    it('checkout só com pulseira (como a ficha faz hoje): continua com metodo pulseira', async () => {
        const res = resposta();
        await controller.checkoutPulseira(reqCheckout({ numero_pulseira: '1234' }), res);

        expect(res.statusCode).toBe(200);
        const [, dados] = checkinService.registrarAcesso.mock.calls[0];
        expect(dados).toEqual(expect.objectContaining({ pessoa_id: PESSOA, tipo: 'checkout', metodo: 'pulseira' }));
    });
});

describe('credenciamento de pessoa que está dentro', () => {
    const reqCredenciar = (body = {}) => ({
        body: { pessoa_id: PESSOA, ...body }, event: { id: 'ev1' }, headers: {}, query: {}, user: { id: 'op1' },
        supabase: supabase
    });

    it('entrada recusada pelo banco (P0409 vira 409 ENTRADA_BLOQUEADA, liberavel false) e o operador pode registrar a saída', async () => {
        checkinService.registrarAcesso.mockResolvedValueOnce({
            error: 'Pessoa já está dentro desde 14:05 (America/Sao_Paulo)', status: 409, action: 'deny',
            detalhes: { codigo: 'ENTRADA_BLOQUEADA', liberavel: false }
        });
        const res = resposta();
        await controller.credenciarPulseira(reqCredenciar(), res);

        expect(res.statusCode).toBe(409);
        expect(res.corpo.codigo).toBe('ENTRADA_BLOQUEADA');
        expect(res.corpo.liberavel).toBe(false);
        // A entrada foi tentada como checkin com a observacao informativa
        const [, dados] = checkinService.registrarAcesso.mock.calls[0];
        expect(dados).toEqual(expect.objectContaining({ tipo: 'checkin', metodo: 'manual', observacao: 'CREDENCIAMENTO' }));
    });

    it('credenciamento sem bipe grava a observacao CREDENCIAMENTO (informativa)', async () => {
        const res = resposta();
        await controller.credenciarPulseira(reqCredenciar(), res);
        expect(res.statusCode).toBe(200);
        expect(checkinService.registrarAcesso.mock.calls[0][1].observacao).toBe('CREDENCIAMENTO');
    });
});

describe('a observacao CREDENCIAMENTO não muda nenhuma decisão', () => {
    // Cliente simulado para a regra de entrada (bloqueioDeEntrada usa o cliente que recebe)
    const bloqueio = (observacao, { saiu = false, liberadoDepois = false } = {}) => {
        const agora = Date.now();
        mockDb.logs_acesso = [{
            id: 'l1', evento_id: 'ev1', pessoa_id: PESSOA, tipo: saiu ? 'checkout' : 'checkin', metodo: 'pulseira',
            etapa: 'evento', dia_civil: DIA, area_id: null, observacao,
            created_at: new Date(agora - 5 * 60000).toISOString()
        }];
        mockDb.liberacoes_reentrada = liberadoDepois
            ? [{ id: 'lib1', evento_id: 'ev1', pessoa_id: PESSOA, etapa: 'evento', dia_civil: DIA, area_id: null, criado_em: new Date(agora - 60000).toISOString() }]
            : [];
        return entradaEtapa.bloqueioDeEntrada(supabase, {
            evento_id: 'ev1', pessoa_id: PESSOA, etapa: 'evento', dia: DIA, area_id: null, logId: 'novo-log'
        });
    };
    const resumo = (erro) => (erro ? { codigo: erro.codigo, liberavel: erro.liberavel, msg: erro.message } : null);

    it('pessoa dentro: mesma decisão com ou sem a observacao (bloqueia, liberavel false)', async () => {
        const com = resumo(await bloqueio('CREDENCIAMENTO'));
        const sem = resumo(await bloqueio(null));
        expect(com).toEqual(sem);
        expect(com).toEqual(expect.objectContaining({ codigo: 'ENTRADA_BLOQUEADA', liberavel: false }));
    });

    it('saiu sem liberação: mesma decisão (bloqueia, liberavel true)', async () => {
        const com = resumo(await bloqueio('CREDENCIAMENTO', { saiu: true }));
        const sem = resumo(await bloqueio(null, { saiu: true }));
        expect(com).toEqual(sem);
        expect(com).toEqual(expect.objectContaining({ codigo: 'ENTRADA_BLOQUEADA', liberavel: true }));
    });

    it('saiu e há liberação depois da saída: libera nos dois casos', async () => {
        expect(await bloqueio('CREDENCIAMENTO', { saiu: true, liberadoDepois: true })).toBeNull();
        expect(await bloqueio(null, { saiu: true, liberadoDepois: true })).toBeNull();
    });

    it('replay offline grava o aviso junto da observacao (não substitui o CREDENCIAMENTO)', async () => {
        const DatabaseService = jest.requireActual('../src/modules/checkin/services/database.service');
        const ts = new Date(Date.now() - 60000);
        await DatabaseService.registerAccessTransaction('replay-1', ts, {
            evento_id: 'ev1', pessoa_id: PESSOA, tipo: 'checkin', metodo: 'pulseira', observacao: 'CREDENCIAMENTO'
        }, { id: PESSOA, status_acesso: 'checkin_feito' }, 'checkin_feito', { atualizarStatus: false });

        const gravada = mockDb.logs_acesso.find(r => r.id === 'replay-1');
        expect(gravada.observacao).toMatch(/^CREDENCIAMENTO · Replay offline/);
    });

    it('nenhum arquivo de src compara o texto CREDENCIAMENTO (só a constante do controller do credenciamento)', () => {
        const srcDir = path.join(__dirname, '..', 'src');
        const achados = [];
        const percorrer = (dir) => {
            for (const nome of fs.readdirSync(dir)) {
                const cheio = path.join(dir, nome);
                if (fs.statSync(cheio).isDirectory()) percorrer(cheio);
                else if (nome.endsWith('.js') && /['"`]CREDENCIAMENTO['"`]/.test(fs.readFileSync(cheio, 'utf8'))) {
                    achados.push(path.relative(srcDir, cheio).replace(/\\/g, '/'));
                }
            }
        };
        percorrer(srcDir);
        expect(achados).toEqual(['modules/checkin/checkin.controller.js']);
    });
});
