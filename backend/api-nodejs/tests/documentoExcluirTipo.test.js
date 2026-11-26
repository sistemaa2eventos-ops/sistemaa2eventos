// Excluir tipo de documento: recusa quando já há documento enviado com o tipo; exclui quando não há.

let mockUsos = { pessoas: 0, empresas: 0 };
let mockExcluidos = [];

// Depois de excluir, a configuração é recarregada: não precisa de dados reais aqui
jest.mock('../src/utils/buscarTodos', () => ({ buscarTodos: async () => ({ data: [], error: null }) }));

jest.mock('../src/config/supabase', () => {
    const builder = (tabela) => {
        const b = {
            select: () => b,
            eq: () => b,
            delete: () => { b._del = true; return b; },
            maybeSingle: () => b,
            single: () => b,
            then: (ok, ko) => {
                let r;
                if (b._del) { mockExcluidos.push(tabela); r = { data: [{ id: 't1' }], error: null }; }
                else if (tabela === 'pessoa_documentos') r = { count: mockUsos.pessoas, error: null };
                else if (tabela === 'empresa_documentos') r = { count: mockUsos.empresas, error: null };
                else r = { data: [], error: null };
                return Promise.resolve(r).then(ok, ko);
            },
        };
        return b;
    };
    return { supabase: { from: (t) => builder(t) } };
});
jest.mock('../src/services/logger', () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() }));
jest.mock('../src/services/storageSeguro', () => ({
    caminhoDeStorage: jest.fn(), urlAssinada: jest.fn(), assinarLinhas: jest.fn(),
    SEGUNDOS_PADRAO: 60, BUCKETS_DOCUMENTO: [],
}));
jest.mock('../src/modules/entities/documentoRequisitos.service', () => ({
    invalidarConfig: jest.fn(), getConfig: jest.fn().mockResolvedValue({ tipos: [], regras: {} }),
    normalizarFuncao: (f) => String(f || '').toUpperCase(), FUNCAO_PADRAO: '*',
}));

const documentoService = require('../src/modules/entities/documento.service');

beforeEach(() => {
    mockUsos = { pessoas: 0, empresas: 0 };
    mockExcluidos = [];
});

test('recusa excluir tipo com documento de pessoa enviado (409)', async () => {
    mockUsos = { pessoas: 2, empresas: 0 };
    await expect(documentoService.excluirTipo('ev1', 't1')).rejects.toMatchObject({ status: 409 });
    expect(mockExcluidos).toHaveLength(0);
});

test('recusa excluir tipo com documento de empresa enviado (409)', async () => {
    mockUsos = { pessoas: 0, empresas: 1 };
    await expect(documentoService.excluirTipo('ev1', 't1')).rejects.toMatchObject({ status: 409 });
});

test('exclui tipo sem nenhum documento enviado', async () => {
    await documentoService.excluirTipo('ev1', 't1');
    expect(mockExcluidos).toContain('evento_tipos_documento');
});
