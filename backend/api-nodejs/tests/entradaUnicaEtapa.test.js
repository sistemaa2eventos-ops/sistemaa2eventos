/**
 * Não entrar de novo enquanto estiver DENTRO (mesma etapa, dia civil e área). Saída libera nova entrada.
 * Corrida entre duas leituras, replay offline que não reverte status, e o caminho sem a função no banco.
 * Banco simulado: a função registrar_acesso_etapa (migration 20261118b_entrada_aberta.sql) e os índices
 * são emulados. Nada é gravado no Supabase de verdade.
 */

const mockDb = {
    logs_acesso: [], pessoas_updates: [], evento_tipos_pulseira: [],
    evento_areas: [],          // { id, controla_entrada } (área sem linha = controla, como no banco)
    liberacoes_reentrada: [],  // { evento_id, pessoa_id, area_id, etapa, dia_civil, criado_em (ISO) }
    semColunas: false,        // banco sem as colunas etapa/dia_civil (20261118 não aplicada)
    semFuncao: false,         // banco sem a função registrar_acesso_etapa (20261118b não aplicada)
    indiceEntradaAntigo: false // banco ainda com o índice uq_logs_entrada_etapa_dia (antes da 20261118b)
};
// Marcador usado por linhas antigas (gravadas antes da mudança que tirou o tratamento especial do credenciamento)
const mockMarcadorLegado = 'CREDENCIAMENTO';
const mockNulo = (v) => v === null || v === undefined;
const mockAreaChave = (r) => r.area_id || '00000000-0000-0000-0000-000000000000';
const mockChave = (r) => [r.evento_id, r.pessoa_id, r.etapa, r.dia_civil, mockAreaChave(r)].join('|');
// Índice antigo uq_logs_entrada_etapa_dia (20261118, removido pela 20261118b): definição original
const mockIdxEntrada = (r) => r.tipo === 'checkin' && !mockNulo(r.etapa) && !mockNulo(r.dia_civil) && r.observacao !== mockMarcadorLegado;

// Violação de unicidade como o PostgREST devolve: código 23505 e nome do índice na mensagem
function mockViolacao(nova) {
    if (mockDb.logs_acesso.some(r => r.id === nova.id)) {
        return { code: '23505', message: 'duplicate key value violates unique constraint "logs_acesso_pkey"' };
    }
    if (mockDb.indiceEntradaAntigo && mockIdxEntrada(nova)
        && mockDb.logs_acesso.some(r => mockIdxEntrada(r) && mockChave(r) === mockChave(nova))) {
        return { code: '23505', message: 'duplicate key value violates unique constraint "uq_logs_entrada_etapa_dia"' };
    }
    return null;
}

// Função registrar_acesso_etapa(p_row jsonb): regra da migration 20261119_controle_entrada_portao.
// Entrada (checkin) com etapa, inclusive credenciamento (passagem comum), em área que controla entrada
// (área geral sempre controla): último registro de passagem da etapa/dia/área (excluindo o próprio id) é
// entrada → P0409 'false|instante'; é saída sem liberação posterior → P0409 'true|instante'.
function mockRpc(nome, args) {
    if (mockDb.semFuncao || nome !== 'registrar_acesso_etapa') {
        return Promise.resolve({ data: null, error: { code: 'PGRST202', message: `Could not find the function public.${nome}(p_row) in the schema cache` } });
    }
    const l = args.p_row;
    if (mockDb.semColunas && 'etapa' in l) {
        return Promise.resolve({ data: null, error: { code: '42703', message: 'column "etapa" does not exist' } });
    }
    if (l.tipo === 'checkin' && l.etapa && l.dia_civil) {
        const area = l.area_id ? mockDb.evento_areas.find(a => a.id === l.area_id) : null;
        const controla = !area || area.controla_entrada !== false;
        const ultimo = mockDb.logs_acesso
            .filter(r => r.evento_id === l.evento_id && r.pessoa_id === l.pessoa_id && r.etapa === l.etapa
                && r.dia_civil === l.dia_civil && (r.area_id || null) === (l.area_id || null)
                && (r.tipo === 'checkin' || r.tipo === 'checkout') && r.id !== l.id)
            .sort((a, b) => (a.created_at < b.created_at ? 1 : -1))[0];
        if (controla && ultimo && ultimo.tipo === 'checkin') {
            return Promise.resolve({ data: null, error: {
                code: 'P0409', message: 'Pessoa já está dentro nesta etapa, área e dia',
                hint: 'false|' + ultimo.created_at.slice(0, 19) + 'Z'
            } });
        }
        if (controla && ultimo && ultimo.tipo === 'checkout') {
            const liberada = mockDb.liberacoes_reentrada.some(r => r.evento_id === l.evento_id && r.pessoa_id === l.pessoa_id
                && r.etapa === l.etapa && r.dia_civil === l.dia_civil && (r.area_id || null) === (l.area_id || null)
                && r.criado_em > ultimo.created_at);
            if (!liberada) {
                return Promise.resolve({ data: null, error: {
                    code: 'P0409', message: 'Saída sem liberação de reentrada nesta etapa, área e dia',
                    hint: 'true|' + ultimo.created_at.slice(0, 19) + 'Z'
                } });
            }
        }
    }
    const v = mockViolacao(l);
    if (v) return Promise.resolve({ data: null, error: v });
    mockDb.logs_acesso.push({ ...l });
    return Promise.resolve({ data: l.id, error: null });
}

function mockBuilder(tabela) {
    const filtros = [];
    let ordenar = false;
    let limite = Infinity;
    let operacao = null;
    let carga = null;
    let erroConsulta = null;
    const linhas = () => (mockDb[tabela] || []).filter(r => filtros.every(f => f(r)));
    const b = {
        select() { return b; },
        eq(c, v) {
            if (mockDb.semColunas && (c === 'etapa' || c === 'dia_civil')) {
                erroConsulta = { code: '42703', message: `column logs_acesso.${c} does not exist` };
            }
            filtros.push(r => r[c] === v);
            return b;
        },
        is(c, v) { filtros.push(r => (mockNulo(r[c]) ? null : r[c]) === v); return b; },
        in(c, vs) { filtros.push(r => vs.includes(r[c])); return b; },
        // Nenhuma consulta de check-in usa .or() (o filtro de credenciamento foi removido): se aparecer, o teste falha
        or(expr) { throw new Error('or não deveria ser usado no check-in: ' + expr); },
        gt(c, v) { filtros.push(r => r[c] > v); return b; },
        gte() { return b; }, lte() { return b; }, neq() { return b; }, range() { return b; },
        order(c) { if (c === 'created_at') ordenar = true; return b; },
        limit(n) { limite = n; return b; },
        insert(rows) { operacao = 'insert'; carga = rows; return b; },
        update(vals) { operacao = 'update'; carga = vals; return b; },
        maybeSingle() { return executar().then(r => ({ data: (r.data && r.data[0]) || null, error: r.error })); },
        single() { return executar().then(r => ({ data: (r.data && r.data[0]) || null, error: r.error })); },
        then(ok, ko) { return executar().then(ok, ko); }
    };
    function executar() {
        if (operacao === 'insert') {
            if (tabela !== 'logs_acesso') return Promise.resolve({ data: null, error: null });
            if (mockDb.semColunas && carga.some(l => 'etapa' in l)) {
                return Promise.resolve({ data: null, error: { code: '42703', message: 'column "etapa" of relation "logs_acesso" does not exist' } });
            }
            for (const l of carga) {
                const v = mockViolacao(l);
                if (v) return Promise.resolve({ data: null, error: v });
            }
            mockDb.logs_acesso.push(...carga.map(l => ({ ...l })));
            return Promise.resolve({ data: carga, error: null });
        }
        if (operacao === 'update') {
            if (tabela === 'pessoas') mockDb.pessoas_updates.push(carga);
            return Promise.resolve({ data: null, error: null });
        }
        if (erroConsulta) return Promise.resolve({ data: null, error: erroConsulta });
        let r = linhas();
        if (ordenar) r = [...r].sort((x, y) => (x.created_at < y.created_at ? 1 : -1));
        return Promise.resolve({ data: r.slice(0, limite), error: null, count: r.length });
    }
    return b;
}

jest.mock('../src/config/supabase', () => ({
    supabase: { from: (t) => mockBuilder(t), rpc: (nome, args) => mockRpc(nome, args) }
}));
jest.mock('../src/middleware/eventMiddleware', () => ({
    buscarEvento: jest.fn(async () => ({ evento: { id: 'ev1', horario_reset: '00:00:00', min_face_score: 70 } }))
}));
jest.mock('../src/services/logger', () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() }));
jest.mock('../src/services/websocketService', () => ({ emit: jest.fn() }));
jest.mock('../src/services/queue.service', () => ({ publishLogToCloud: jest.fn(async () => false) }));
jest.mock('../src/modules/system/watchlist.service', () => ({ verificarCPF: jest.fn(async () => null), registrarAlerta: jest.fn(async () => {}) }));
jest.mock('../src/modules/entities/liberacaoManual.service', () => ({ encerrar: jest.fn(async () => {}) }));
jest.mock('../src/modules/entities/documento.service', () => ({ sincronizarStatusPessoa: jest.fn(async () => {}) }));
// Pessoas com vínculo de empresa nas contagens: não é o foco deste teste (a contagem de logs é real)
jest.mock('../src/utils/buscarTodos', () => ({ buscarTodos: jest.fn(async () => ({ data: [], error: null })) }));

const logger = require('../src/services/logger');
const checkinService = require('../src/modules/checkin/checkin.service');
const ValidationService = require('../src/modules/checkin/services/validation.service');
const DatabaseService = require('../src/modules/checkin/services/database.service');
const entrada = require('../src/modules/checkin/services/entradaEtapa');

const PESSOA = {
    id: 'p1', evento_id: 'ev1', nome_completo: 'Maria Silva', cpf: '52998224725',
    status_acesso: 'checkout_feito', tipo_pulseira_id: 'tp-montagem', bloqueado: false, empresas: null
};
const SYNC = [
    'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d',
    'b1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d',
    'c1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d',
    'd1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d'
];
const MSG_DENTRO = /^Pessoa já está dentro desde \d{2}:\d{2} \(America\/Sao_Paulo\)$/;

const acesso = (extra = {}) => ({
    pessoa_id: 'p1', pessoa: PESSOA, evento_id: 'ev1', metodo: 'barcode',
    dispositivo_id: 'web-dashboard', tipo: 'checkin', ...extra
});
const entradasDo = (pessoa = 'p1') => mockDb.logs_acesso.filter(r => r.pessoa_id === pessoa && r.tipo === 'checkin');
const passagensDo = (pessoa = 'p1') => mockDb.logs_acesso.filter(r => r.pessoa_id === pessoa && (r.tipo === 'checkin' || r.tipo === 'checkout'));

beforeEach(() => {
    mockDb.logs_acesso.length = 0;
    mockDb.pessoas_updates.length = 0;
    mockDb.evento_areas.length = 0;
    mockDb.liberacoes_reentrada.length = 0;
    mockDb.semColunas = false;
    mockDb.semFuncao = false;
    mockDb.indiceEntradaAntigo = false;
    mockDb.evento_tipos_pulseira = [
        { id: 'tp-montagem', fase: 'montagem' },
        { id: 'tp-evento', fase: 'showday' },
        { id: 'tp-todas', fase: 'todas' }
    ];
    jest.clearAllMocks();
});

describe('regras puras da etapa', () => {
    it('fase do lote vira etapa: showday é evento; sem fase é todas', () => {
        expect(entrada.normalizarEtapa('showday')).toBe('evento');
        expect(entrada.normalizarEtapa('evento')).toBe('evento');
        expect(entrada.normalizarEtapa('montagem')).toBe('montagem');
        expect(entrada.normalizarEtapa(null)).toBe('todas');
        expect(entrada.normalizarEtapa('todas')).toBe('todas');
    });

    it('mensagem de "já está dentro" traz o horário local (America/Sao_Paulo, UTC-3)', () => {
        const erro = entrada.erroEntradaAberta('2026-11-18T17:05:00Z');
        expect(erro.status).toBe(409);
        expect(erro.message).toBe('Pessoa já está dentro desde 14:05 (America/Sao_Paulo)');
    });

    it('mensagem de entrada repetida (fallback sem última passagem) traz o horário local', () => {
        const erro = entrada.erroEntradaDuplicada('2026-11-18T17:05:00');
        expect(erro.status).toBe(409);
        expect(erro.message).toBe('Entrada já registrada nesta etapa hoje às 14:05');
    });

    it('reconhece violação do índice antigo de entrada, mas não a do id (reenvio) nem o índice de credenciamento (removido do código)', () => {
        expect(entrada.ehViolacaoEntrada({ code: '23505', message: 'violates unique constraint "uq_logs_entrada_etapa_dia"' })).toBe(true);
        expect(entrada.ehViolacaoEntrada({ code: '23505', message: 'violates unique constraint "uq_logs_credenciamento_etapa_dia"' })).toBe(false);
        expect(entrada.ehViolacaoEntrada({ code: '23505', message: 'violates unique constraint "logs_acesso_pkey"' })).toBe(false);
        expect(entrada.ehViolacaoEntrada({ code: '42703', message: 'x' })).toBe(false);
    });

    it('P0409 é entrada aberta; função ausente é PGRST202 ou 42883; coluna ausente não é função ausente', () => {
        expect(entrada.ehEntradaAberta({ code: 'P0409' })).toBe(true);
        expect(entrada.ehEntradaAberta({ code: '23505' })).toBe(false);
        expect(entrada.ehFuncaoAusente({ code: 'PGRST202', message: 'Could not find the function public.registrar_acesso_etapa(p_row) in the schema cache' })).toBe(true);
        expect(entrada.ehFuncaoAusente({ code: '42883', message: 'function registrar_acesso_etapa(jsonb) does not exist' })).toBe(true);
        expect(entrada.ehFuncaoAusente({ code: '42703', message: 'column "etapa" does not exist' })).toBe(false);
    });
});

describe('não entrar de novo enquanto estiver dentro (checkin.service)', () => {
    it('primeira entrada é aceita e grava etapa e dia civil', async () => {
        const r = await checkinService.registrarAcesso(null, acesso({ sync_id: SYNC[0] }));
        expect(r.action).toBe('allow');
        const [linha] = entradasDo();
        expect(linha.etapa).toBe('montagem');
        expect(linha.dia_civil).toMatch(/^\d{4}-\d{2}-\d{2}$/);
        expect(linha.dia_civil).toBe(entrada.diaDoAcesso(new Date()));
    });

    it('entrada sem saída antes → 409 "já está dentro desde HH:MM", registra negado e não muda o status', async () => {
        await checkinService.registrarAcesso(null, acesso({ sync_id: SYNC[0] }));
        const r = await checkinService.registrarAcesso(null, acesso({ sync_id: SYNC[1] }));
        expect(r.action).toBe('deny');
        expect(r.status).toBe(409);
        expect(r.error).toMatch(MSG_DENTRO);
        expect(entradasDo()).toHaveLength(1);
        expect(mockDb.logs_acesso.filter(l => l.tipo === 'negado')).toHaveLength(1);
        expect(mockDb.pessoas_updates).toHaveLength(1);
    });

    it('área geral (controla entrada): entrada depois de saída é bloqueada sem liberação (liberavel true)', async () => {
        expect((await checkinService.registrarAcesso(null, acesso({ sync_id: SYNC[0] }))).action).toBe('allow');
        expect((await checkinService.registrarAcesso(null, acesso({ sync_id: SYNC[1], tipo: 'checkout' }))).action).toBe('allow');
        const volta = await checkinService.registrarAcesso(null, acesso({ sync_id: SYNC[2] }));
        expect(volta.action).toBe('deny');
        expect(volta.status).toBe(409);
        expect(volta.error).toMatch(/^Saída registrada às \d{2}:\d{2}\. Reentrada precisa de liberação do controlador\.$/);
        expect(volta.detalhes).toEqual({ codigo: 'ENTRADA_BLOQUEADA', liberavel: true, etapa: 'montagem' });
        expect(entradasDo()).toHaveLength(1);
    });

    it('saída seguida de entrada passa quando há liberação do controlador posterior à saída', async () => {
        expect((await checkinService.registrarAcesso(null, acesso({ sync_id: SYNC[0] }))).action).toBe('allow');
        const saida = await checkinService.registrarAcesso(null, acesso({ sync_id: SYNC[1], tipo: 'checkout' }));
        expect(saida.action).toBe('allow');
        mockDb.liberacoes_reentrada.push({
            evento_id: 'ev1', pessoa_id: 'p1', area_id: null, etapa: 'montagem', dia_civil: entrada.diaDoAcesso(new Date()),
            criado_em: new Date(new Date(saida.created_at).getTime() + 1000).toISOString()
        });
        const volta = await checkinService.registrarAcesso(null, acesso({ sync_id: SYNC[2] }));
        expect(volta.action).toBe('allow');
        expect(entradasDo()).toHaveLength(2);
    });

    it('liberação anterior à saída não vale: a reentrada continua bloqueada', async () => {
        expect((await checkinService.registrarAcesso(null, acesso({ sync_id: SYNC[0] }))).action).toBe('allow');
        const saida = await checkinService.registrarAcesso(null, acesso({ sync_id: SYNC[1], tipo: 'checkout' }));
        mockDb.liberacoes_reentrada.push({
            evento_id: 'ev1', pessoa_id: 'p1', area_id: null, etapa: 'montagem', dia_civil: entrada.diaDoAcesso(new Date()),
            criado_em: new Date(new Date(saida.created_at).getTime() - 1000).toISOString()
        });
        const volta = await checkinService.registrarAcesso(null, acesso({ sync_id: SYNC[2] }));
        expect(volta.status).toBe(409);
        expect(volta.detalhes.liberavel).toBe(true);
    });

    it('liberação de outra área, etapa ou pessoa não vale para esta reentrada', async () => {
        expect((await checkinService.registrarAcesso(null, acesso({ sync_id: SYNC[0], area_id: 'area-a' }))).action).toBe('allow');
        const saida = await checkinService.registrarAcesso(null, acesso({ sync_id: SYNC[1], tipo: 'checkout', area_id: 'area-a' }));
        const depois = new Date(new Date(saida.created_at).getTime() + 1000).toISOString();
        const dia = entrada.diaDoAcesso(new Date());
        mockDb.liberacoes_reentrada.push(
            { evento_id: 'ev1', pessoa_id: 'p1', area_id: 'area-b', etapa: 'montagem', dia_civil: dia, criado_em: depois },
            { evento_id: 'ev1', pessoa_id: 'p1', area_id: 'area-a', etapa: 'evento', dia_civil: dia, criado_em: depois },
            { evento_id: 'ev1', pessoa_id: 'outra', area_id: 'area-a', etapa: 'montagem', dia_civil: dia, criado_em: depois }
        );
        const volta = await checkinService.registrarAcesso(null, acesso({ sync_id: SYNC[2], area_id: 'area-a' }));
        expect(volta.status).toBe(409);
    });

    it('área sem controle de entrada (controla_entrada = false): entra de novo enquanto dentro, sem bloqueio', async () => {
        mockDb.evento_areas.push({ id: 'area-livre', controla_entrada: false });
        expect((await checkinService.registrarAcesso(null, acesso({ sync_id: SYNC[0], area_id: 'area-livre' }))).action).toBe('allow');
        const de_novo = await checkinService.registrarAcesso(null, acesso({ sync_id: SYNC[1], area_id: 'area-livre' }));
        expect(de_novo.action).toBe('allow');
        expect(entradasDo()).toHaveLength(2);
        expect(mockDb.logs_acesso.filter(l => l.tipo === 'negado')).toHaveLength(0);
    });

    it('área sem controle: saída e nova entrada quantas vezes precisar, sem liberação', async () => {
        mockDb.evento_areas.push({ id: 'area-livre', controla_entrada: false });
        const base = { area_id: 'area-livre' };
        expect((await checkinService.registrarAcesso(null, acesso({ ...base, sync_id: SYNC[0] }))).action).toBe('allow');
        expect((await checkinService.registrarAcesso(null, acesso({ ...base, sync_id: SYNC[1], tipo: 'checkout' }))).action).toBe('allow');
        expect((await checkinService.registrarAcesso(null, acesso({ ...base, sync_id: SYNC[2] }))).action).toBe('allow');
        expect((await checkinService.registrarAcesso(null, acesso({ ...base, sync_id: SYNC[3], tipo: 'checkout' }))).action).toBe('allow');
        expect((await checkinService.registrarAcesso(null, acesso({ ...base, sync_id: 'e1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d' }))).action).toBe('allow');
    });

    it('área com controle, pessoa dentro: 409 com liberavel false (liberação não resolve)', async () => {
        expect((await checkinService.registrarAcesso(null, acesso({ sync_id: SYNC[0], area_id: 'area-a' }))).action).toBe('allow');
        mockDb.liberacoes_reentrada.push({
            evento_id: 'ev1', pessoa_id: 'p1', area_id: 'area-a', etapa: 'montagem', dia_civil: entrada.diaDoAcesso(new Date()),
            criado_em: new Date(Date.now() + 60000).toISOString()
        });
        const r = await checkinService.registrarAcesso(null, acesso({ sync_id: SYNC[1], area_id: 'area-a' }));
        expect(r.status).toBe(409);
        expect(r.error).toMatch(MSG_DENTRO);
        expect(r.detalhes).toEqual({ codigo: 'ENTRADA_BLOQUEADA', liberavel: false, etapa: 'montagem' });
    });

    it('reenvio de uma entrada antiga (já gravada) não bloqueia, mesmo com outra entrada depois', async () => {
        const dia = entrada.diaDoAcesso(new Date());
        expect((await checkinService.registrarAcesso(null, acesso({ sync_id: SYNC[0] }))).action).toBe('allow');
        const saida = await checkinService.registrarAcesso(null, acesso({ sync_id: SYNC[1], tipo: 'checkout' }));
        mockDb.liberacoes_reentrada.push({
            evento_id: 'ev1', pessoa_id: 'p1', area_id: null, etapa: 'montagem', dia_civil: dia,
            criado_em: new Date(new Date(saida.created_at).getTime() + 1000).toISOString()
        });
        expect((await checkinService.registrarAcesso(null, acesso({ sync_id: SYNC[2] }))).action).toBe('allow');
        // Reenvio da primeira entrada (fluxo que força tipo checkin): não é segunda entrada
        const reenvio = await checkinService.registrarAcesso(null, acesso({ sync_id: SYNC[0] }));
        expect(reenvio.action).toBe('allow');
        expect(entradasDo()).toHaveLength(2);
    });

    it('saída não é bloqueada e grava a etapa (fecha a janela da entrada)', async () => {
        expect((await checkinService.registrarAcesso(null, acesso({ sync_id: SYNC[0] }))).action).toBe('allow');
        const saida = await checkinService.registrarAcesso(null, acesso({ sync_id: SYNC[1], tipo: 'checkout' }));
        expect(saida.action).toBe('allow');
        const linhaSaida = mockDb.logs_acesso.find(l => l.id === SYNC[1]);
        expect(linhaSaida.tipo).toBe('checkout');
        expect(linhaSaida.etapa).toBe('montagem');
        expect(linhaSaida.dia_civil).toBe(entrada.diaDoAcesso(new Date()));
    });

    it('reenvio do mesmo acesso (mesmo sync_id) é idempotente: aceito, sem segundo log', async () => {
        await checkinService.registrarAcesso(null, acesso({ sync_id: SYNC[0] }));
        const r = await checkinService.registrarAcesso(null, acesso({ sync_id: SYNC[0] }));
        expect(r.action).toBe('allow');
        expect(entradasDo()).toHaveLength(1);
    });

    it('outra etapa (lote do evento) no mesmo dia é aceita', async () => {
        await checkinService.registrarAcesso(null, acesso({ sync_id: SYNC[0] }));
        const r = await checkinService.registrarAcesso(null, acesso({
            sync_id: SYNC[1], pessoa: { ...PESSOA, tipo_pulseira_id: 'tp-evento' }
        }));
        expect(r.action).toBe('allow');
        expect(entradasDo().map(l => l.etapa)).toEqual(['montagem', 'evento']);
    });

    it('áreas diferentes são independentes; a mesma área, com a pessoa dentro, não', async () => {
        await checkinService.registrarAcesso(null, acesso({ sync_id: SYNC[0], area_id: 'area-a' }));
        const outra = await checkinService.registrarAcesso(null, acesso({ sync_id: SYNC[1], area_id: 'area-b' }));
        expect(outra.action).toBe('allow');
        const mesma = await checkinService.registrarAcesso(null, acesso({ sync_id: SYNC[2], area_id: 'area-a' }));
        expect(mesma.status).toBe(409);
    });

    it('credenciamento é entrada comum: quem se credenciou está dentro, e o leitor bloqueia "já está dentro"', async () => {
        expect((await checkinService.registrarAcesso(null, acesso({ metodo: 'pulseira', sync_id: SYNC[0] }))).action).toBe('allow');
        const leitor = await checkinService.registrarAcesso(null, acesso({ sync_id: SYNC[1] }));
        expect(leitor.action).toBe('deny');
        expect(leitor.status).toBe(409);
        expect(leitor.error).toMatch(MSG_DENTRO);
        expect(entradasDo()).toHaveLength(1);
    });

    it('credenciamento repetido na mesma etapa/dia/área é bloqueado (já está dentro), qualquer método', async () => {
        expect((await checkinService.registrarAcesso(null, acesso({ metodo: 'pulseira', sync_id: SYNC[0] }))).action).toBe('allow');
        const repetido = await checkinService.registrarAcesso(null, acesso({ metodo: 'manual', sync_id: SYNC[1] }));
        expect(repetido.status).toBe(409);
        expect(repetido.error).toMatch(MSG_DENTRO);
    });

    it('credenciamento depois de saída sem liberação é bloqueado; com liberação posterior à saída, passa', async () => {
        expect((await checkinService.registrarAcesso(null, acesso({ metodo: 'pulseira', sync_id: SYNC[0] }))).action).toBe('allow');
        const saida = await checkinService.registrarAcesso(null, acesso({ sync_id: SYNC[1], tipo: 'checkout' }));
        expect(saida.action).toBe('allow');
        const semLiberacao = await checkinService.registrarAcesso(null, acesso({ metodo: 'pulseira', sync_id: SYNC[2] }));
        expect(semLiberacao.status).toBe(409);
        expect(semLiberacao.detalhes).toEqual({ codigo: 'ENTRADA_BLOQUEADA', liberavel: true, etapa: 'montagem' });
        mockDb.liberacoes_reentrada.push({
            evento_id: 'ev1', pessoa_id: 'p1', area_id: null, etapa: 'montagem', dia_civil: entrada.diaDoAcesso(new Date()),
            criado_em: new Date(new Date(saida.created_at).getTime() + 1000).toISOString()
        });
        expect((await checkinService.registrarAcesso(null, acesso({ metodo: 'pulseira', sync_id: SYNC[3] }))).action).toBe('allow');
        expect(entradasDo()).toHaveLength(2);
    });

    it('contagens incluem o credenciamento: entra no total de check-ins do dia', async () => {
        await checkinService.registrarAcesso(null, acesso({ metodo: 'pulseira', sync_id: SYNC[0] }));
        const stats = await ValidationService.getRealtimeStatsInternal('ev1');
        expect(stats.checkins_hoje).toBe(1);
    });

    it('toggle: depois do credenciamento, a próxima leitura é saída (credenciamento conta como passagem)', async () => {
        await checkinService.registrarAcesso(null, acesso({ metodo: 'pulseira', sync_id: SYNC[0] }));
        expect(await ValidationService.determineSmartAccessType('p1', 'ev1', null, null)).toBe('checkout');
    });

    it('linha antiga com o marcador CREDENCIAMENTO (gravada antes da mudança) conta como passagem', async () => {
        mockDb.logs_acesso.push({
            id: SYNC[3], evento_id: 'ev1', pessoa_id: 'p1', tipo: 'checkin', metodo: 'pulseira',
            etapa: 'montagem', dia_civil: entrada.diaDoAcesso(new Date()), area_id: null,
            observacao: mockMarcadorLegado, created_at: new Date(Date.now() - 60000).toISOString()
        });
        const r = await checkinService.registrarAcesso(null, acesso({ sync_id: SYNC[0] }));
        expect(r.status).toBe(409);
        expect(r.error).toMatch(MSG_DENTRO);
    });

    it('banco sem as colunas novas: grava como antes e avisa; a checagem fica desligada', async () => {
        mockDb.semColunas = true;
        const r = await checkinService.registrarAcesso(null, acesso({ sync_id: SYNC[0] }));
        expect(r.action).toBe('allow');
        expect(entradasDo()[0].etapa).toBeUndefined();
        expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining('20261118_logs_entrada_etapa.sql'));
    });
});

describe('gravação e corrida (DatabaseService + função registrar_acesso_etapa)', () => {
    const payload = (tipo = 'checkin', etapa = 'montagem', extra = {}) => ({
        evento_id: 'ev1', pessoa_id: 'p1', tipo, metodo: 'barcode',
        dispositivo_id: 'web-dashboard', area_id: null, observacao: null, etapa,
        dia_civil: entrada.diaDoAcesso(new Date()), ...extra
    });
    const gravar = (id, p) => DatabaseService.registerAccessTransaction(id, new Date(), p, PESSOA, 'checkin_feito');

    it('segunda entrada gravada pela função (P0409) vira entrada_duplicada 409 com o horário, sem mudar status', async () => {
        const primeira = await gravar(SYNC[0], payload());
        expect(primeira.success).toBe(true);
        const segunda = await gravar(SYNC[1], payload());
        expect(segunda.success).toBe(false);
        expect(segunda.entrada_duplicada).toBe(true);
        expect(segunda.erro.status).toBe(409);
        expect(segunda.erro.message).toMatch(MSG_DENTRO);
        expect(mockDb.logs_acesso).toHaveLength(1);
        expect(mockDb.pessoas_updates).toHaveLength(1);
    });

    it('entrada depois de saída gravada pela função é recusada sem liberação (HINT true → liberavel)', async () => {
        expect((await gravar(SYNC[0], payload('checkin'))).success).toBe(true);
        expect((await gravar(SYNC[1], payload('checkout'))).success).toBe(true);
        const volta = await gravar(SYNC[2], payload('checkin'));
        expect(volta.success).toBe(false);
        expect(volta.entrada_duplicada).toBe(true);
        expect(volta.erro.status).toBe(409);
        expect(volta.erro.liberavel).toBe(true);
        expect(volta.erro.codigo).toBe('ENTRADA_BLOQUEADA');
        expect(passagensDo()).toHaveLength(2);
    });

    it('entrada depois de saída gravada pela função passa com liberação posterior à saída', async () => {
        expect((await gravar(SYNC[0], payload('checkin'))).success).toBe(true);
        expect((await gravar(SYNC[1], payload('checkout'))).success).toBe(true);
        mockDb.liberacoes_reentrada.push({
            evento_id: 'ev1', pessoa_id: 'p1', area_id: null, etapa: 'montagem', dia_civil: entrada.diaDoAcesso(new Date()),
            criado_em: new Date(Date.now() + 60000).toISOString()
        });
        const volta = await gravar(SYNC[2], payload('checkin'));
        expect(volta.success).toBe(true);
        expect(passagensDo()).toHaveLength(3);
    });

    it('área sem controle de entrada gravada pela função: entra de novo sem liberação', async () => {
        mockDb.evento_areas.push({ id: 'area-livre', controla_entrada: false });
        const naArea = { area_id: 'area-livre' };
        expect((await gravar(SYNC[0], payload('checkin', 'montagem', naArea))).success).toBe(true);
        expect((await gravar(SYNC[1], payload('checkout', 'montagem', naArea))).success).toBe(true);
        expect((await gravar(SYNC[2], payload('checkin', 'montagem', naArea))).success).toBe(true);
        expect(passagensDo()).toHaveLength(3);
    });

    it('o mesmo id gravado de novo é reenvio (already_done), não entrada duplicada', async () => {
        await gravar(SYNC[0], payload());
        const deNovo = await gravar(SYNC[0], payload());
        expect(deNovo).toEqual({ success: true, already_done: true });
        expect(mockDb.logs_acesso).toHaveLength(1);
    });

    it('sem a função no banco: grava direto (primeira entrada passa) e avisa para rodar a 20261118b', async () => {
        mockDb.semFuncao = true;
        const r = await gravar(SYNC[0], payload());
        expect(r.success).toBe(true);
        expect(mockDb.logs_acesso).toHaveLength(1);
        expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining('20261118b_entrada_aberta.sql'));
    });

    it('sem a função e com o índice antigo: reentrada enquanto dentro ainda é bloqueada (transição)', async () => {
        mockDb.semFuncao = true;
        mockDb.indiceEntradaAntigo = true;
        expect((await gravar(SYNC[0], payload())).success).toBe(true);
        const segunda = await gravar(SYNC[1], payload());
        expect(segunda.entrada_duplicada).toBe(true);
        expect(segunda.erro.message).toMatch(MSG_DENTRO);
    });

    it('credenciamento grava pela função, sem marcador: repetir na mesma etapa dá 409 "já está dentro"', async () => {
        const cred = payload('checkin', 'montagem', { metodo: 'pulseira' });
        expect((await gravar(SYNC[0], cred)).success).toBe(true);
        const repetido = await gravar(SYNC[1], cred);
        expect(repetido.entrada_duplicada).toBe(true);
        expect(repetido.erro.message).toMatch(MSG_DENTRO);
        expect(mockDb.logs_acesso[0].observacao).toBeNull();
    });

    it('colunas etapa/dia_civil ausentes na gravação: grava sem elas', async () => {
        mockDb.semColunas = true;
        const r = await gravar(SYNC[0], payload());
        expect(r.success).toBe(true);
        expect(mockDb.logs_acesso[0].etapa).toBeUndefined();
    });
});

describe('replay offline não reverte status', () => {
    const agoraMenos = (min) => new Date(Date.now() - min * 60000);

    it('item mais antigo que o último evento: vira histórico e o status atual não muda', async () => {
        mockDb.logs_acesso.push({
            id: SYNC[3], evento_id: 'ev1', pessoa_id: 'p1', tipo: 'checkout', metodo: 'barcode',
            area_id: null, observacao: null, created_at: agoraMenos(0).toISOString()
        });
        const instante = agoraMenos(30).toISOString();
        const r = await checkinService.registrarAcesso(null, acesso({
            sync_id: SYNC[0], offline_timestamp: instante
        }));
        expect(r.action).toBe('allow');
        expect(mockDb.pessoas_updates).toHaveLength(0);
        const linha = mockDb.logs_acesso.find(l => l.id === SYNC[0]);
        expect(linha.observacao).toMatch(/Replay offline/);
        expect(linha.created_at).toBe(instante);
    });

    it('item mais novo que o último evento: altera o status normalmente', async () => {
        mockDb.logs_acesso.push({
            id: SYNC[3], evento_id: 'ev1', pessoa_id: 'p1', tipo: 'checkout', metodo: 'barcode',
            area_id: null, observacao: null, created_at: agoraMenos(60).toISOString()
        });
        const r = await checkinService.registrarAcesso(null, acesso({
            sync_id: SYNC[0], offline_timestamp: agoraMenos(10).toISOString()
        }));
        expect(r.action).toBe('allow');
        expect(mockDb.pessoas_updates).toEqual([{ status_acesso: 'checkin_feito', atualizado_em: expect.any(String) }]);
    });
});
