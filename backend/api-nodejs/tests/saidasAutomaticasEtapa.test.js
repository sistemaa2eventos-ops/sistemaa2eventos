/**
 * Saídas que o sistema grava sozinho (fechamento de turno do cron e correção de turno anterior) levam
 * etapa (fase do lote da pessoa) e dia civil (America/Sao_Paulo do instante da saída), para fechar a
 * janela da etapa. Não passam pela regra de entrada única (só entrada é checada).
 * Supabase e logger simulados: nada é gravado de verdade.
 */

const { getHojeLocal } = require('../src/utils/dateUtils');

const mockDb = {
    pessoas: [], tipos: [], pessoasStatus: [], logsDentro: [], logs: [],
    pessoaUnica: null, tipoUnico: null,
    inserts: [], updates: [], semColunas: false
};

jest.mock('../src/services/logger', () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() }));
jest.mock('../src/services/emailService', () => ({}));
jest.mock('../src/modules/reports/report.controller', () => ({ salvarFechamentoDiario: jest.fn(async () => {}) }));
jest.mock('../src/modules/entities/liberacaoManual.service', () => ({ encerrar: jest.fn(async () => {}) }));
jest.mock('../src/modules/entities/documento.service', () => ({ sincronizarStatusPessoa: jest.fn(async () => {}) }));

// Cliente simulado: responde conforme a tabela e o select pedido; registra inserts e updates
jest.mock('../src/config/supabase', () => {
    const filtrar = (lista, filtro) => (filtro ? lista.filter(x => filtro.v.includes(x[filtro.c])) : lista);
    const erroColuna = { code: '42703', message: 'column "etapa" of relation "logs_acesso" does not exist' };
    const tem = (linhas) => linhas.some(l => 'etapa' in l || 'dia_civil' in l);

    const consulta = (tabela) => {
        const q = { select: null, filtro: null, acao: 'select', erro: null };
        const resultado = () => {
            if (q.acao === 'update') return { error: q.erro };
            if (tabela === 'pessoas' && q.select === 'id, tipo_pulseira_id') return { data: filtrar(global.__mockDb.pessoas, q.filtro), error: null };
            if (tabela === 'pessoas' && q.select === 'id, status_acesso') return { data: global.__mockDb.pessoasStatus, error: null };
            if (tabela === 'evento_tipos_pulseira') return { data: filtrar(global.__mockDb.tipos, q.filtro), error: null };
            if (tabela === 'logs_acesso' && q.select === 'pessoa_id, tipo, created_at') return { data: global.__mockDb.logsDentro, error: null };
            if (tabela === 'logs_acesso') return { data: global.__mockDb.logs, error: null };
            return { data: [], error: null };
        };
        const b = {
            select: (s) => { q.select = s; return b; },
            eq: () => b, gte: () => b, order: () => b, limit: () => b,
            not: () => b, // liberações expiram no reset: sem liberação no mock
            in: (c, v) => { q.filtro = { c, v }; return b; },
            range: async () => resultado(),
            maybeSingle: async () => ({
                data: tabela === 'pessoas' ? global.__mockDb.pessoaUnica
                    : tabela === 'evento_tipos_pulseira' ? global.__mockDb.tipoUnico
                        : tabela === 'eventos' ? { horario_reset: '06:00:00' } : null,
                error: null
            }),
            insert: (linhas) => {
                const lista = Array.isArray(linhas) ? linhas : [linhas];
                global.__mockDb.inserts.push({ tabela, linhas: lista });
                return Promise.resolve({ error: global.__mockDb.semColunas && tem(lista) ? erroColuna : null });
            },
            update: (dados) => {
                q.acao = 'update';
                global.__mockDb.updates.push({ tabela, dados });
                q.erro = global.__mockDb.semColunas && tem([dados]) ? erroColuna : null;
                return b;
            },
            then: (ok, ko) => Promise.resolve(resultado()).then(ok, ko)
        };
        return b;
    };
    return { supabase: { from: consulta } };
});

global.__mockDb = null; // preenchido no beforeEach (o mock acima lê daqui)

const cron = require('../src/modules/events/cron.controller');
const turno = require('../src/modules/checkin/turnoAnterior.service');
const { etapasDasPessoas } = require('../src/modules/checkin/services/entradaEtapa');
const logger = require('../src/services/logger');

const dia = 24 * 60 * 60 * 1000;
// Instante local (UTC-3) de N dias atrás, como Date
const instanteLocal = (diasAtras, h, m) => {
    const d = new Date(Date.now() - diasAtras * dia);
    const [a, mes, dd] = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(d).split('-');
    return new Date(`${a}-${mes}-${dd}T${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:00-03:00`);
};
// Texto como o banco guarda logs_acesso.created_at (UTC sem fuso)
const comoBanco = (date) => date.toISOString().replace('Z', '');

beforeEach(() => {
    jest.clearAllMocks();
    global.__mockDb = mockDb;
    Object.assign(mockDb, {
        pessoas: [], tipos: [], pessoasStatus: [], logsDentro: [], logs: [],
        pessoaUnica: null, tipoUnico: null, inserts: [], updates: [], semColunas: false
    });
});

describe('etapasDasPessoas', () => {
    it('usa a fase do lote de cada pessoa e "todas" para quem não tem lote', async () => {
        mockDb.pessoas = [{ id: 'p1', tipo_pulseira_id: 't1' }, { id: 'p2', tipo_pulseira_id: null }];
        mockDb.tipos = [{ id: 't1', fase: 'showday' }];

        const etapas = await etapasDasPessoas(null, ['p1', 'p2']);

        expect(etapas.get('p1')).toBe('evento'); // showday = evento
        expect(etapas.get('p2')).toBe('todas');
    });
});

describe('fechamento de turno do cron', () => {
    beforeEach(() => {
        mockDb.pessoas = [{ id: 'p1', tipo_pulseira_id: 't1' }, { id: 'p2', tipo_pulseira_id: null }];
        mockDb.tipos = [{ id: 't1', fase: 'showday' }];
        mockDb.pessoasStatus = [{ id: 'p1', status_acesso: 'checkin_feito' }, { id: 'p2', status_acesso: 'checkin_feito' }];
        mockDb.logsDentro = [{ pessoa_id: 'p1', tipo: 'checkin', created_at: comoBanco(instanteLocal(0, 8, 0)) }];
    });

    const saidasForcadas = () => mockDb.inserts
        .filter(i => i.tabela === 'logs_acesso' && i.linhas.some(l => l.observacao === 'CHECKOUT_FORCADO_CRON'))
        .flatMap(i => i.linhas);

    it('a saída forçada leva etapa da pessoa e dia civil do instante da saída', async () => {
        await cron.resetTurnos('e1', { arquivar: false });

        const saidas = saidasForcadas();
        const p1 = saidas.find(s => s.pessoa_id === 'p1');
        const p2 = saidas.find(s => s.pessoa_id === 'p2');
        expect(p1).toEqual(expect.objectContaining({ tipo: 'checkout', metodo: 'manual', etapa: 'evento', dia_civil: getHojeLocal() }));
        expect(p2).toEqual(expect.objectContaining({ etapa: 'todas', dia_civil: getHojeLocal() }));
        expect(logger.warn).not.toHaveBeenCalledWith(expect.stringContaining('20261118_logs_entrada_etapa'));
    });

    it('sem as colunas no banco: grava a saída sem etapa e avisa no log', async () => {
        mockDb.semColunas = true;

        await cron.resetTurnos('e1', { arquivar: false });

        const tentativas = mockDb.inserts.filter(i => i.linhas.some(l => l.observacao === 'CHECKOUT_FORCADO_CRON'));
        expect(tentativas).toHaveLength(2);
        const aposFallback = tentativas[1].linhas;
        expect(aposFallback.every(l => !('etapa' in l) && !('dia_civil' in l))).toBe(true);
        expect(aposFallback.map(l => l.pessoa_id).sort()).toEqual(['p1', 'p2']);
        expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining('20261118_logs_entrada_etapa'));
    });
});

describe('correção de turno anterior (troca de turno)', () => {
    beforeEach(() => {
        mockDb.pessoaUnica = { tipo_pulseira_id: 't1' };
        mockDb.tipoUnico = { fase: 'showday' };
    });

    it('a saída forçada corrigida recebe a etapa e o dia civil do horário informado (dia anterior)', async () => {
        mockDb.logs = [ // mais recente primeiro
            { id: 'f1', tipo: 'checkout', created_at: comoBanco(instanteLocal(2, 6, 0)), observacao: 'CHECKOUT_FORCADO_CRON' },
            { id: 'c1', tipo: 'checkin', created_at: comoBanco(instanteLocal(3, 14, 0)), observacao: null }
        ];
        const saida = instanteLocal(2, 22, 30);

        await turno.corrigir({ pessoa_id: 'p1', evento_id: 'e1', saida_em: saida.toISOString(), usuario_id: 'u1' });

        const atualizacao = mockDb.updates.find(u => u.tabela === 'logs_acesso').dados;
        expect(atualizacao).toEqual(expect.objectContaining({
            created_at: saida.toISOString(), observacao: 'SAIDA_CORRIGIDA', etapa: 'evento',
            dia_civil: getHojeLocal(saida)
        }));
        expect(atualizacao.dia_civil).not.toBe(getHojeLocal()); // saída de dias atrás, não "hoje"
    });

    it('sem saída automática anterior: cria a saída com etapa e dia civil', async () => {
        mockDb.logs = [{ id: 'c1', tipo: 'checkin', created_at: comoBanco(instanteLocal(3, 14, 0)), observacao: null }];
        const saida = instanteLocal(3, 22, 0);

        await turno.corrigir({ pessoa_id: 'p1', evento_id: 'e1', saida_em: saida.toISOString(), usuario_id: 'u1' });

        const insercao = mockDb.inserts.find(i => i.tabela === 'logs_acesso').linhas[0];
        expect(insercao).toEqual(expect.objectContaining({
            tipo: 'checkout', pessoa_id: 'p1', evento_id: 'e1', etapa: 'evento', dia_civil: getHojeLocal(saida)
        }));
    });

    it('sem as colunas no banco: corrige o turno sem etapa e avisa no log', async () => {
        mockDb.semColunas = true;
        mockDb.logs = [
            { id: 'f1', tipo: 'checkout', created_at: comoBanco(instanteLocal(2, 6, 0)), observacao: 'CHECKOUT_FORCADO_CRON' },
            { id: 'c1', tipo: 'checkin', created_at: comoBanco(instanteLocal(3, 14, 0)), observacao: null }
        ];

        const r = await turno.corrigir({ pessoa_id: 'p1', evento_id: 'e1', saida_em: instanteLocal(2, 22, 30).toISOString(), usuario_id: 'u1' });

        expect(r.substituiu_saida_automatica).toBe(true);
        const ultimo = mockDb.updates.filter(u => u.tabela === 'logs_acesso').at(-1).dados;
        expect(ultimo).toEqual(expect.objectContaining({ observacao: 'SAIDA_CORRIGIDA' }));
        expect(ultimo).not.toHaveProperty('etapa');
        expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining('20261118_logs_entrada_etapa'));
    });
});
