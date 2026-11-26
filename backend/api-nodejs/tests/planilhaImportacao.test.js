// Importação da planilha da empresa: cria pré-cadastro, atualiza o pendente, não desfaz o que o
// participante corrigiu, recusa CPF de outra empresa e respeita a cota.
const ExcelJS = require('exceljs');

let mockPessoasExistentes = [];
let mockEmpresa = null;
let mockContagemEmpresa = 0;
let mockGravacoes = [];

jest.mock('../src/services/logger', () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() }));
jest.mock('../src/middleware/eventMiddleware', () => ({ invalidarEvento: jest.fn() }));
jest.mock('../src/config/supabase', () => {
    const builder = (tabela) => {
        const q = { tabela, acao: 'select', filtros: {}, payload: null, head: false };
        const resolver = () => {
            if (q.acao === 'insert') {
                mockGravacoes.push({ tabela, acao: 'insert', payload: q.payload });
                return { data: { id: `novo-${mockGravacoes.length}` }, error: null };
            }
            if (q.acao === 'update') {
                mockGravacoes.push({ tabela, acao: 'update', payload: q.payload, id: q.filtros.id });
                return { data: null, error: null };
            }
            if (tabela === 'eventos') return { data: { nome: 'Evento X', config: {} }, error: null };
            if (tabela === 'empresas') return { data: mockEmpresa, error: null };
            if (tabela === 'pessoas' && q.head) return { count: mockContagemEmpresa, error: null };
            if (tabela === 'pessoas') return { data: mockPessoasExistentes.filter(p => (q.filtros.cpf || []).includes(p.cpf)), error: null };
            return { data: null, error: null };
        };
        const b = {
            select: (_c, opts) => { if (opts?.head) q.head = true; return b; },
            eq: (c, v) => { q.filtros[c] = v; return b; },
            in: (c, v) => { q.filtros[c] = v; return b; },
            insert: (rows) => { q.acao = 'insert'; q.payload = rows[0]; return b; },
            update: (p) => { q.acao = 'update'; q.payload = p; return b; },
            single: () => b,
            maybeSingle: () => b,
            then: (ok, ko) => Promise.resolve(resolver()).then(ok, ko),
        };
        return b;
    };
    return { supabase: { from: (t) => builder(t) } };
});

const planilha = require('../src/modules/planilha/planilha.service');

const CPF_NOVO = '52998224725';
const CPF_PENDENTE = '01234567890';
const CPF_CONCLUIDO = '11144477735';
const CPF_OUTRA = '39053344705';

const montarArquivo = async (linhas) => {
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('x');
    ws.addRow(['NOME COMPLETO', 'CPF', 'FUNÇÃO', 'E-MAIL']);
    for (const l of linhas) ws.addRow(l);
    return Buffer.from(await wb.xlsx.writeBuffer());
};

beforeEach(() => {
    mockGravacoes = [];
    mockContagemEmpresa = 0;
    mockEmpresa = { id: 'emp1', nome: 'GYN', max_colaboradores: 0 };
    mockPessoasExistentes = [
        // pré-cadastro da planilha, ainda não concluído
        { id: 'p-pend', cpf: CPF_PENDENTE, empresa_id: 'emp1', origem_cadastro: 'externo', aceite_lgpd: false, created_by: 'op1', nome_completo: 'Nome Antigo', funcao: 'LIMPEZA', email: null },
        // participante já concluiu pelo link (corrigiu o nome)
        { id: 'p-conc', cpf: CPF_CONCLUIDO, empresa_id: 'emp1', origem_cadastro: 'externo', aceite_lgpd: true, created_by: 'op1', nome_completo: 'Nome Corrigido', funcao: 'DONO', email: null },
        // de outra empresa
        { id: 'p-outra', cpf: CPF_OUTRA, empresa_id: 'emp2', origem_cadastro: 'externo', aceite_lgpd: true, created_by: null, nome_completo: 'Outra' }
    ];
});

test('aplica cada regra e conta o resultado', async () => {
    const buffer = await montarArquivo([
        ['Ana Nova', CPF_NOVO, 'PRODUTOR', 'ana@x.com'],
        ['Nome Planilha', CPF_PENDENTE, 'PRODUÇÃO', 'p@x.com'],
        ['Nome Planilha 2', CPF_CONCLUIDO, 'OUTRA', 'c@x.com'],
        ['Fulano', CPF_OUTRA, 'DONO', '']
    ]);
    const r = await planilha.importar({ eventoId: 'ev1', empresaId: 'emp1', buffer, usuarioId: 'op1' });

    expect(r).toMatchObject({ criados: 1, atualizados: 2, ignorados: 0 });
    expect(r.erros).toEqual([{ linha: 5, motivo: 'CPF já cadastrado em outra empresa deste evento' }]);

    const insert = mockGravacoes.find(g => g.tabela === 'pessoas' && g.acao === 'insert');
    expect(insert.payload).toMatchObject({
        cpf: CPF_NOVO, nome_completo: 'Ana Nova', empresa_id: 'emp1', origem_cadastro: 'externo',
        aceite_lgpd: false, created_by: 'op1', status_acesso: 'pendente', nome_credencial: 'Ana Nova'
    });
    expect(mockGravacoes.some(g => g.tabela === 'pessoa_evento_empresa' && g.acao === 'insert')).toBe(true);

    // Pendente: a planilha substitui
    const updPend = mockGravacoes.find(g => g.acao === 'update' && g.id === 'p-pend');
    expect(updPend.payload).toMatchObject({ nome_completo: 'Nome Planilha', funcao: 'PRODUÇÃO', email: 'p@x.com' });

    // Concluído: só o que estava vazio (e-mail); nome e função corrigidos pela pessoa ficam
    const updConc = mockGravacoes.find(g => g.acao === 'update' && g.id === 'p-conc');
    expect(updConc.payload.email).toBe('c@x.com');
    expect(updConc.payload.nome_completo).toBeUndefined();
    expect(updConc.payload.funcao).toBeUndefined();
});

test('respeita a cota da empresa ao criar', async () => {
    mockEmpresa = { id: 'emp1', nome: 'GYN', max_colaboradores: 3 };
    mockContagemEmpresa = 2; // 1 vaga
    mockPessoasExistentes = [];
    const buffer = await montarArquivo([
        ['Ana', CPF_NOVO, 'DONO', ''],
        ['Bia', CPF_PENDENTE, 'DONO', '']
    ]);
    const r = await planilha.importar({ eventoId: 'ev1', empresaId: 'emp1', buffer, usuarioId: 'op1' });
    expect(r.criados).toBe(1);
    expect(r.erros[0]).toMatchObject({ linha: 3 });
    expect(r.erros[0].motivo).toMatch(/Cota da empresa/);
});

test('pré-cadastro pendente só vale para a mesma empresa e sem aceite', () => {
    const { ehPreCadastroPendente } = planilha;
    const base = { empresa_id: 'emp1', origem_cadastro: 'externo', aceite_lgpd: false, created_by: 'op1' };
    expect(ehPreCadastroPendente(base, 'emp1')).toBe(true);
    expect(ehPreCadastroPendente({ ...base, aceite_lgpd: true }, 'emp1')).toBe(false);
    expect(ehPreCadastroPendente({ ...base, empresa_id: 'emp2' }, 'emp1')).toBe(false);
    expect(ehPreCadastroPendente({ ...base, created_by: null }, 'emp1')).toBe(true); // incluído pelo portal da empresa
    expect(ehPreCadastroPendente({ ...base, origem_cadastro: 'interno' }, 'emp1')).toBe(false);
});
