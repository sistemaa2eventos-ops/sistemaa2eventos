// Excluir função: recusa com participante usando a função (409); sem uso, tira da lista e das regras dela.

let mockPessoas = [];
let mockApagadas = [];
let mockEventoConfig = {};

jest.mock('../src/utils/buscarTodos', () => ({
    buscarTodos: async () => ({ data: mockPessoas, error: null }),
}));
jest.mock('../src/config/supabase', () => {
    const builder = (tabela) => {
        const b = {
            select: () => b,
            eq: (col, val) => { b._filtros = { ...(b._filtros || {}), [col]: val }; return b; },
            single: () => b,
            maybeSingle: () => b,
            update: () => { b._upd = true; return b; },
            delete: () => { b._del = true; return b; },
            then: (ok, ko) => {
                let r = { data: null, error: null };
                if (tabela === 'eventos' && b._upd) r = { data: [{ id: 'ev1' }], error: null };
                else if (tabela === 'eventos') r = { data: { config: mockEventoConfig }, error: null };
                else if (tabela === 'evento_documentos_funcao' && b._del) mockApagadas.push(b._filtros?.funcao);
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
jest.mock('../src/middleware/eventMiddleware', () => ({ invalidarEvento: jest.fn() }));
jest.mock('../src/modules/entities/documentoRequisitos.service', () => ({
    invalidarConfig: jest.fn(),
    getConfig: jest.fn().mockResolvedValue({ tipos: [], regras: {} }),
    normalizarFuncao: (f) => String(f || '').trim().replace(/\s+/g, ' ').toUpperCase(),
    FUNCAO_PADRAO: '*',
}));

const documentoService = require('../src/modules/entities/documento.service');

beforeEach(() => {
    mockPessoas = [];
    mockApagadas = [];
    mockEventoConfig = { funcoes_extra: ['ELETRICISTA', 'DONO'] };
});

test('recusa excluir função usada por participante (409), inclusive com grafia diferente', async () => {
    mockPessoas = [{ funcao: 'dono' }, { funcao: ' DONO ' }];
    await expect(documentoService.excluirFuncao('ev1', 'DONO')).rejects.toMatchObject({ status: 409 });
    expect(mockApagadas).toHaveLength(0);
});

test('exclui função sem participantes: tira das extras e apaga as regras dela', async () => {
    mockPessoas = [{ funcao: 'PRODUTOR' }];
    await documentoService.excluirFuncao('ev1', 'eletricista');
    expect(mockApagadas).toEqual(['ELETRICISTA']);
});

test('não exclui o padrão "Todos"', async () => {
    await expect(documentoService.excluirFuncao('ev1', '*')).rejects.toMatchObject({ status: 400 });
});
