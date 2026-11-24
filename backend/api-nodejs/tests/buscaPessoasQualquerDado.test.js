// Busca de pessoas (check-in, check-out, fiscalização): qualquer dado do cadastro ou da empresa,
// sem acento, várias palavras (todas precisam aparecer), sempre em ordem alfabética.

const mockBanco = {
    vinculos: [
        { id: 'v1', pessoa_id: 'p1', empresa_id: 'e1', status_aprovacao: 'aprovado' },
        { id: 'v2', pessoa_id: 'p2', empresa_id: 'e1', status_aprovacao: 'aprovado' },
        { id: 'v3', pessoa_id: 'p3', empresa_id: 'e2', status_aprovacao: 'aprovado' },
        { id: 'v4', pessoa_id: 'p4', empresa_id: 'e2', status_aprovacao: 'aprovado' },
    ],
    empresas: [
        { id: 'e1', nome: 'DAKOTA EVENTOS', cnpj: '11222333000144' },
        { id: 'e2', nome: 'LUZ & SOM', cnpj: '55666777000188' },
    ],
    pessoas: [
        { id: 'p1', nome_completo: 'ZÉLIA SOUZA', cpf: '12345678900', funcao: 'ELETRICISTA', numero_pulseira: '1000', telefone: '(41) 99999-1111' },
        { id: 'p2', nome_completo: 'ANDRÉ LIMA', cpf: '98765432100', funcao: 'SEGURANÇA', numero_pulseira: '1001' },
        { id: 'p3', nome_completo: 'JOÃO PEREIRA', cpf: '11122233344', funcao: 'ELETRICISTA', numero_pulseira: null },
        { id: 'p4', nome_completo: 'BRUNO COSTA', cpf: '55544433322', funcao: 'PRODUTOR', email: 'bruno@luz.com' },
    ],
    filtrosOr: [],
};

jest.mock('../src/config/supabase', () => ({ supabase: {} }));
jest.mock('../src/services/logger', () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() }));
jest.mock('../src/modules/devices/sync.service', () => ({}));
jest.mock('../src/services/emailService', () => ({}));
jest.mock('../src/utils/qrGenerator', () => ({}));

// Simula o ilike do PostgREST: "%" = qualquer sequência, "_" = um caractere, sem diferença de maiúsculas
const casaIlike = (valor, padrao) => {
    if (valor == null) return false;
    const re = new RegExp('^' + padrao.split('').map(ch => (ch === '%' ? '.*' : ch === '_' ? '.' : ch.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))).join('') + '$', 'i');
    return re.test(String(valor));
};
const aplicarOr = (linha, filtro) => filtro.split(',').some((parte) => {
    const [campo, , ...resto] = parte.split('.');
    return casaIlike(linha[campo], resto.join('.'));
});

function mockConsulta(tabela) {
    const st = { eq: {}, in: null, or: null };
    const q = {
        select: () => q,
        eq: (c, v) => { st.eq[c] = v; return q; },
        in: (c, v) => { st.in = { c, v }; return q; },
        or: (f) => { st.or = f; mockBanco.filtrosOr.push(f); return q; },
        order: () => q, limit: () => q, range: () => q,
        then: (ok, erro) => {
            let linhas = { pessoa_evento_empresa: mockBanco.vinculos, empresas: mockBanco.empresas, pessoas: mockBanco.pessoas, pessoa_areas_acesso: [] }[tabela] || [];
            if (st.in) linhas = linhas.filter(l => st.in.v.includes(l[st.in.c]));
            if (st.or) linhas = linhas.filter(l => aplicarOr(l, st.or));
            return Promise.resolve({ data: linhas, error: null }).then(ok, erro);
        },
    };
    return q;
}
const mockClient = { from: (t) => mockConsulta(t) };

const pessoaService = require('../src/modules/entities/pessoa.service');
const buscar = async (q) => (await pessoaService.searchPessoas(mockClient, 'ev1', q)).map(p => p.nome);

beforeEach(() => { mockBanco.filtrosOr = []; });

test('nome da empresa traz todos os funcionários dela, em ordem alfabética', async () => {
    expect(await buscar('dakota')).toEqual(['ANDRÉ LIMA', 'ZÉLIA SOUZA']);
});

test('função traz todas as pessoas com a função, em ordem alfabética', async () => {
    expect(await buscar('eletricista')).toEqual(['JOÃO PEREIRA', 'ZÉLIA SOUZA']);
});

test('sem acento acha nome e função com acento', async () => {
    expect(await buscar('joao')).toEqual(['JOÃO PEREIRA']);
    expect(await buscar('seguranca')).toEqual(['ANDRÉ LIMA']);
});

test('várias palavras: todas precisam aparecer (função + empresa)', async () => {
    expect(await buscar('eletricista dakota')).toEqual(['ZÉLIA SOUZA']);
});

test('CPF com pontuação, telefone, e-mail e pulseira', async () => {
    expect(await buscar('123.456.789-00')).toEqual(['ZÉLIA SOUZA']);
    expect(await buscar('99999')).toEqual(['ZÉLIA SOUZA']);
    expect(await buscar('bruno@luz')).toEqual(['BRUNO COSTA']);
    expect(await buscar('1001')).toEqual(['ANDRÉ LIMA']);
});

test('caracteres que quebrariam o filtro do banco não vão crus', async () => {
    await buscar('a,b(c)');
    expect(mockBanco.filtrosOr.length).toBeGreaterThan(0);
    for (const f of mockBanco.filtrosOr) expect(f).not.toMatch(/[()]/);
});

test('empresa no resultado é a do vínculo', async () => {
    const [r] = await pessoaService.searchPessoas(mockClient, 'ev1', 'bruno');
    expect(r.empresa_nome).toBe('LUZ & SOM');
    expect(r.vinculo_id).toBe('v4');
});
