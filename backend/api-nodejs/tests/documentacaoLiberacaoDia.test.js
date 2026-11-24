// Entrada com documentação pendente: só barra com documentos exigidos para a função e sem liberação do dia/turno.

let mockLiberacaoDoDia = null;
const mockConsultas = [];

jest.mock('../src/config/supabase', () => {
    const builder = (tabela) => {
        const filtros = {};
        const b = {
            select: () => b,
            eq: (col, val) => { filtros[col] = val; return b; },
            maybeSingle: async () => {
                mockConsultas.push({ tabela, filtros: { ...filtros } });
                return { data: tabela === 'documento_liberacoes' ? mockLiberacaoDoDia : null, error: null };
            },
        };
        return b;
    };
    return { supabase: { from: (t) => builder(t) } };
});

const mockAvaliarPessoa = jest.fn();
jest.mock('../src/modules/entities/documentoRequisitos.service', () => ({ avaliarPessoa: (...a) => mockAvaliarPessoa(...a) }));
jest.mock('../src/utils/dateUtils', () => ({ getHojeLocal: () => '2026-11-24' }));

const AuditoriaService = require('../src/modules/auditoria/auditoria.service');

const pessoa = { id: 'p1', nome_completo: 'Fulano', funcao: 'Montador', status_acesso: 'pendente' };

beforeEach(() => {
    mockLiberacaoDoDia = null;
    mockConsultas.length = 0;
    mockAvaliarPessoa.mockReset();
});

test('evento sem documentos exigidos não barra, mesmo com status pendente', async () => {
    mockAvaliarPessoa.mockResolvedValue({ status_documentos: 'pendente', regras_ativas: false, pendencias: [] });
    const s = await AuditoriaService.situacaoParaEntrada('ev1', pessoa);
    expect(s.bloqueado).toBe(false);
    expect(s.exige_liberacao).toBe(false);
});

test('documentação aprovada não barra', async () => {
    mockAvaliarPessoa.mockResolvedValue({ status_documentos: 'aprovado', regras_ativas: true, pendencias: [] });
    expect((await AuditoriaService.situacaoParaEntrada('ev1', pessoa)).bloqueado).toBe(false);
});

test('pendente sem liberação é barrado e lista o que falta', async () => {
    mockAvaliarPessoa.mockResolvedValue({ status_documentos: 'pendente', regras_ativas: true, pendencias: [{ nome: 'ASO' }, { nome: 'NR-35' }] });
    const s = await AuditoriaService.situacaoParaEntrada('ev1', pessoa);
    expect(s.bloqueado).toBe(true);
    expect(s.pendencias).toEqual(['ASO', 'NR-35']);
});

test('liberação do dia consulta a data local de hoje e libera', async () => {
    mockAvaliarPessoa.mockResolvedValue({ status_documentos: 'em_analise', regras_ativas: true, pendencias: [] });
    mockLiberacaoDoDia = { motivo: 'ASO amanhã' };
    const s = await AuditoriaService.situacaoParaEntrada('ev1', pessoa);
    expect(s.bloqueado).toBe(false);
    expect(s.motivo_liberacao).toBe('ASO amanhã');
    expect(mockConsultas.find(c => c.tabela === 'documento_liberacoes').filtros.data_liberacao).toBe('2026-11-24');
});

test('liberação do turno vigente também libera; vencida não', async () => {
    mockAvaliarPessoa.mockResolvedValue({ status_documentos: 'pendente', regras_ativas: true, pendencias: [] });
    const futuro = new Date(Date.now() + 3600e3).toISOString();
    const passado = new Date(Date.now() - 3600e3).toISOString();
    expect((await AuditoriaService.situacaoParaEntrada('ev1', { ...pessoa, liberacao_manual_ate: futuro })).bloqueado).toBe(false);
    expect((await AuditoriaService.situacaoParaEntrada('ev1', { ...pessoa, liberacao_manual_ate: passado })).bloqueado).toBe(true);
});
