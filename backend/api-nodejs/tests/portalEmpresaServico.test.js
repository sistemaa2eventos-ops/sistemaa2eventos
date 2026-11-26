// Portal da empresa: login pela chave certa, isolamento por empresa nas solicitações e aprovação
// que só executa depois de decidida por um operador.
process.env.JWT_SECRET = 'segredo-de-teste-portal';

const mockTabelas = {};
const mockGravacoes = [];

jest.mock('../src/services/logger', () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() }));
jest.mock('../src/config/supabase', () => {
    const builder = (tabela) => {
        const q = { tabela, filtros: {}, acao: 'select', payload: null };
        const linhas = () => (mockTabelas[tabela] || []).filter(l => Object.entries(q.filtros).every(([c, v]) => {
            if (c === '__ilike') return String(l.email || '').toLowerCase() === v;
            if (c === '__notnull') return l[v] !== null && l[v] !== undefined;
            return l[c] === v;
        }));
        const resolver = (unico) => {
            if (q.acao !== 'select') {
                mockGravacoes.push({ tabela, acao: q.acao, payload: q.payload, filtros: { ...q.filtros } });
                if (q.acao === 'insert') return { data: { id: 'nova', ...q.payload }, error: null };
                const afetadas = linhas();
                return { data: unico ? afetadas[0] || null : afetadas, error: null };
            }
            const r = linhas();
            return { data: unico ? r[0] || null : r, error: null };
        };
        const b = {
            select: () => b,
            eq: (c, v) => { q.filtros[c] = v; return b; },
            ilike: (c, v) => { q.filtros.__ilike = v; return b; },
            not: (c) => { q.filtros.__notnull = c; return b; },
            in: () => b, order: () => b, limit: () => b,
            insert: (rows) => { q.acao = 'insert'; q.payload = rows[0]; return b; },
            update: (p) => { q.acao = 'update'; q.payload = p; return b; },
            single: () => ({ then: (ok, ko) => Promise.resolve(resolver(true)).then(ok, ko) }),
            maybeSingle: () => ({ then: (ok, ko) => Promise.resolve(resolver(true)).then(ok, ko) }),
            then: (ok, ko) => Promise.resolve(resolver(false)).then(ok, ko),
        };
        return b;
    };
    return { supabase: { from: (t) => builder(t) }, deleteImage: jest.fn() };
});
const mockDeletePessoa = jest.fn(async () => true);
jest.mock('../src/modules/entities/pessoa.service', () => ({ delete: (...a) => mockDeletePessoa(...a) }));
jest.mock('../src/modules/entities/documento.service', () => ({ situacaoEntidade: jest.fn(), sincronizarStatusPessoa: jest.fn(), uploadDocumento: jest.fn() }));
jest.mock('../src/modules/entities/empresaResumo.service', () => ({ resumoParticipantes: jest.fn() }));
jest.mock('../src/modules/planilha/planilha.service', () => ({ gravarLinhas: jest.fn() }));
jest.mock('../src/services/storageSeguro', () => ({ assinarLinhas: jest.fn(), caminhoDeStorage: jest.fn(), BUCKETS_DOCUMENTO: [] }));

const auth = require('../src/modules/portalEmpresa/portalEmpresaAuth');
const portal = require('../src/modules/portalEmpresa/portalEmpresa.service');
const admin = require('../src/modules/portalEmpresa/portalEmpresaAdmin.service');

const chaveA = auth.novaChave();
const chaveB = auth.novaChave();

beforeEach(() => {
    mockGravacoes.length = 0;
    mockDeletePessoa.mockClear();
    // Mesmo responsável em dois eventos: vale a empresa cuja chave confere
    mockTabelas.empresas = [
        { id: 'emp-a', evento_id: 'ev-1', nome: 'GYN', email: 'resp@gyn.com', ativo: true, ...chaveA.colunas, eventos: { nome: 'Evento 1' } },
        { id: 'emp-b', evento_id: 'ev-2', nome: 'GYN', email: 'Resp@GYN.com', ativo: true, ...chaveB.colunas, eventos: { nome: 'Evento 2' } }
    ];
    mockTabelas.pessoas = [
        { id: 'p1', empresa_id: 'emp-a', evento_id: 'ev-1', nome_completo: 'Ana' },
        { id: 'p2', empresa_id: 'emp-outra', evento_id: 'ev-1', nome_completo: 'De outra empresa' }
    ];
    mockTabelas.empresa_solicitacoes = [];
});

describe('login', () => {
    test('o mesmo e-mail em dois eventos entra na empresa da chave informada', async () => {
        const r = await portal.login({ email: 'RESP@gyn.com', chave: chaveB.chave.toLowerCase() });
        expect(r.empresa.id).toBe('emp-b');
        expect(auth.verificarToken(r.token)).toMatchObject({ empresa_id: 'emp-b', evento_id: 'ev-2' });
    });

    test('chave errada: 401 com mensagem que não diz qual dos dois errou', async () => {
        await expect(portal.login({ email: 'resp@gyn.com', chave: 'ZZZZ-ZZZZ-ZZZZ' }))
            .rejects.toMatchObject({ status: 401, message: 'E-mail ou chave de acesso incorretos.' });
    });

    test('empresa desativada não entra', async () => {
        mockTabelas.empresas[0].ativo = false;
        await expect(portal.login({ email: 'resp@gyn.com', chave: chaveA.chave })).rejects.toMatchObject({ status: 403 });
    });
});

describe('solicitações', () => {
    const empresaA = { id: 'emp-a', evento_id: 'ev-1', nome: 'GYN' };

    test('não pede exclusão de participante de outra empresa', async () => {
        await expect(portal.criarSolicitacao(empresaA, { tipo: 'excluir_participante', alvo_id: 'p2', motivo: 'saiu da equipe' }))
            .rejects.toMatchObject({ status: 404 });
    });

    test('exclusão exige motivo', async () => {
        await expect(portal.criarSolicitacao(empresaA, { tipo: 'excluir_participante', alvo_id: 'p1', motivo: '' }))
            .rejects.toMatchObject({ status: 400 });
    });

    test('pedido válido fica pendente e não exclui nada', async () => {
        await portal.criarSolicitacao(empresaA, { tipo: 'excluir_participante', alvo_id: 'p1', motivo: 'saiu da equipe' });
        const ins = mockGravacoes.find(g => g.tabela === 'empresa_solicitacoes' && g.acao === 'insert');
        expect(ins.payload).toMatchObject({ empresa_id: 'emp-a', tipo: 'excluir_participante', alvo_id: 'p1', alvo_resumo: 'Ana' });
        expect(mockDeletePessoa).not.toHaveBeenCalled();
    });

    test('portal não muda nome, CNPJ nem e-mail direto', async () => {
        await expect(portal.atualizarContato(empresaA, { email: 'novo@x.com' })).rejects.toMatchObject({ status: 400 });
    });
});

describe('decisão no painel', () => {
    const pendente = { id: 's1', evento_id: 'ev-1', empresa_id: 'emp-a', tipo: 'excluir_participante', alvo_id: 'p1', alvo_resumo: 'Ana', status: 'pendente', dados: {} };

    test('aprovar exclusão executa a exclusão do painel (com limpeza de arquivos)', async () => {
        mockTabelas.empresa_solicitacoes = [{ ...pendente }];
        await admin.aprovar('ev-1', 's1', { usuarioId: 'op1' });
        expect(mockDeletePessoa).toHaveBeenCalledWith(expect.anything(), 'p1', 'ev-1');
        const upd = mockGravacoes.find(g => g.tabela === 'empresa_solicitacoes' && g.acao === 'update');
        expect(upd.payload).toMatchObject({ status: 'aprovada', decidida_por: 'op1' });
    });

    test('solicitação já decidida não roda de novo', async () => {
        mockTabelas.empresa_solicitacoes = [{ ...pendente, status: 'recusada' }];
        await expect(admin.aprovar('ev-1', 's1', { usuarioId: 'op1' })).rejects.toMatchObject({ status: 409 });
        expect(mockDeletePessoa).not.toHaveBeenCalled();
    });

    test('recusar exige explicar o motivo à empresa', async () => {
        mockTabelas.empresa_solicitacoes = [{ ...pendente }];
        await expect(admin.recusar('ev-1', 's1', { usuarioId: 'op1', resposta: '' })).rejects.toMatchObject({ status: 400 });
    });
});
