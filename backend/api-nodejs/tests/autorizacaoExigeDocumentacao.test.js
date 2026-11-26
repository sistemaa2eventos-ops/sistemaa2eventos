// "autorizado" só com documentação validada: motivoSemAutorizacao decide se a pessoa pode ficar autorizada.

let mockPessoa = null;
let mockAvaliacao = null;

jest.mock('../src/config/supabase', () => {
    const builder = (tabela) => {
        const b = {
            select: () => b,
            eq: () => b,
            single: async () => ({ data: tabela === 'pessoas' ? mockPessoa : null, error: null }),
        };
        return b;
    };
    return { supabase: { from: (t) => builder(t) }, uploadImage: jest.fn() };
});

jest.mock('../src/services/storageSeguro', () => ({
    caminhoDeStorage: jest.fn(), urlAssinada: jest.fn(), assinarLinhas: jest.fn(),
    SEGUNDOS_PADRAO: 60, BUCKETS_DOCUMENTO: [],
}));
jest.mock('../src/services/logger', () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() }));

const mockAvaliarPessoa = jest.fn();
jest.mock('../src/modules/entities/documentoRequisitos.service', () => {
    const real = { avaliarPessoa: (...a) => mockAvaliarPessoa(...a) };
    return Object.assign(real, { normalizarFuncao: (f) => String(f || '').toUpperCase(), FUNCAO_PADRAO: '*' });
});

const documentoService = require('../src/modules/entities/documento.service');

beforeEach(() => {
    mockPessoa = { id: 'p1', evento_id: 'ev1', funcao: 'Montador', origem_cadastro: 'externo' };
    mockAvaliarPessoa.mockReset();
});

test('documento exigido pendente impede autorizar e nomeia o documento', async () => {
    mockAvaliarPessoa.mockResolvedValue({
        status_documentos: 'pendente', regras_ativas: true,
        pendencias: [{ nome: 'NR-35', motivo: 'nao_enviado' }],
    });
    const motivo = await documentoService.motivoSemAutorizacao('p1');
    expect(motivo).toMatch(/NR-35/);
    expect(motivo).toMatch(/pendente/);
});

test('documentação validada permite autorizar', async () => {
    mockAvaliarPessoa.mockResolvedValue({ status_documentos: 'aprovado', regras_ativas: true, pendencias: [] });
    expect(await documentoService.motivoSemAutorizacao('p1')).toBeNull();
});

test('evento sem regras: documento em análise também impede autorizar (pendente é pendente)', async () => {
    mockAvaliarPessoa.mockResolvedValue({ status_documentos: 'em_analise', regras_ativas: false, pendencias: [] });
    expect(await documentoService.motivoSemAutorizacao('p1')).toMatch(/em_analise/);
});

test('evento sem regras com documentos aprovados libera', async () => {
    mockAvaliarPessoa.mockResolvedValue({ status_documentos: 'aprovado', regras_ativas: false, pendencias: [] });
    expect(await documentoService.motivoSemAutorizacao('p1')).toBeNull();
});

test('cadastro interno (isento, avaliado como aprovado) não bloqueia autorização', async () => {
    mockAvaliarPessoa.mockResolvedValue({ status_documentos: 'aprovado', regras_ativas: false, pendencias: [], isento: true });
    expect(await documentoService.motivoSemAutorizacao('p1')).toBeNull();
});

test('pessoa inexistente não gera motivo (quem chama decide)', async () => {
    mockPessoa = null;
    expect(await documentoService.motivoSemAutorizacao('x')).toBeNull();
});

test('obrigatórios mostram a situação de cada um (ok, falta, em análise, vencido)', () => {
    const av = {
        exigidos: [{ id: 'a', nome: 'ASO' }, { id: 'b', nome: 'NR-35' }, { id: 'c', nome: 'NR-10' }, { id: 'd', nome: 'CNPJ' }],
        pendencias: [
            { tipo_documento_id: 'b', motivo: 'em_analise' },
            { tipo_documento_id: 'c', motivo: 'nao_enviado' },
            { tipo_documento_id: 'd', motivo: 'vencido' },
        ],
    };
    expect(documentoService._obrigatoriosComSituacao(av)).toEqual([
        { id: 'a', nome: 'ASO', situacao: 'ok' },
        { id: 'b', nome: 'NR-35', situacao: 'em_analise' },
        { id: 'c', nome: 'NR-10', situacao: 'falta_anexar' },
        { id: 'd', nome: 'CNPJ', situacao: 'vencido' },
    ]);
});
