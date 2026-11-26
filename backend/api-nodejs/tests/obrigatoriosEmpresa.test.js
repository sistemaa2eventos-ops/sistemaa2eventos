// Obrigatórios de empresa: cada tipo configurado para empresas mostra a situação do documento enviado.

jest.mock('../src/config/supabase', () => ({ supabase: { from: () => ({}) }, uploadImage: jest.fn() }));
jest.mock('../src/services/storageSeguro', () => ({
    caminhoDeStorage: jest.fn(), urlAssinada: jest.fn(), assinarLinhas: jest.fn(),
    SEGUNDOS_PADRAO: 60, BUCKETS_DOCUMENTO: [],
}));
jest.mock('../src/services/logger', () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() }));
jest.mock('../src/modules/entities/documentoRequisitos.service', () => ({
    documentoValido: (d, hoje) => d.status === 'aprovado' && (!d.data_validade || d.data_validade >= hoje),
    getConfig: jest.fn(), normalizarFuncao: (f) => f, FUNCAO_PADRAO: '*',
}));

const documentoService = require('../src/modules/entities/documento.service');

const tiposPorId = { cnpj: { nome: 'CNPJ' }, alvara: { nome: 'Alvará' }, gro: { nome: 'NR-1' }, seguro: { nome: 'Seguro' } };

test('mapeia a situação de cada obrigatório da empresa', () => {
    const docs = [
        { tipo_documento_id: 'cnpj', status: 'aprovado', data_validade: null },
        { tipo_documento_id: 'alvara', status: 'aprovado', data_validade: '2020-01-01' },
        { tipo_documento_id: 'gro', status: 'em_analise' },
        { tipo_documento_id: 'seguro', status: 'reprovado' },
    ];
    const r = documentoService._obrigatoriosEmpresa(['cnpj', 'alvara', 'gro', 'seguro', 'nao-anexado'], tiposPorId, docs, '2026-11-26');
    expect(r).toEqual([
        { id: 'cnpj', nome: 'CNPJ', situacao: 'ok' },
        { id: 'alvara', nome: 'Alvará', situacao: 'vencido' },
        { id: 'gro', nome: 'NR-1', situacao: 'em_analise' },
        { id: 'seguro', nome: 'Seguro', situacao: 'reprovado' },
        { id: 'nao-anexado', nome: undefined, situacao: 'falta_anexar' },
    ]);
});
