/**
 * Pré-cadastro: documento que não sobe para o Storage barra o cadastro com o nome do que
 * faltou, e os arquivos que já tinham subido são apagados (a pessoa reenvia o formulário).
 */
const estado = { uploads: 0, falharNo: 0, removidos: [], inseridos: [] };

jest.mock('../src/services/logger', () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() }));
jest.mock('../src/config/supabase', () => {
    const consulta = (tabela) => {
        const q = {
            select: () => q, eq: () => q, in: () => q, order: () => q, limit: () => q,
            single: async () => (tabela === 'empresas' ? { data: { id: 'emp1', evento_id: 'ev1', max_colaboradores: 0 } } : { data: null }),
            maybeSingle: async () => ({ data: null }),
            insert: (linhas) => { estado.inseridos.push({ tabela, linhas }); return q; },
            update: () => q,
            then: (ok) => ok({ data: null, error: null })
        };
        return q;
    };
    return {
        supabase: {
            from: consulta,
            storage: { from: () => ({ remove: async (caminhos) => { estado.removidos.push(...caminhos); return {}; } }) }
        },
        uploadImage: async (bucket, path) => {
            estado.uploads++;
            return estado.uploads === estado.falharNo ? { success: false, error: 'storage indisponível' } : { success: true, path, url: `https://x/${path}` };
        }
    };
});

const controller = require('../src/modules/system/public.controller');
const PDF = 'data:application/pdf;base64,JVBERi0xLjQ=';
const resposta = () => ({ status(c) { this.codigo = c; return this; }, json(d) { this.dados = d; return this; } });
const ficha = (documentos) => ({ params: { token: 'tok' }, body: { nome: 'Fulano', cpf: '52998224725', aceite_lgpd: true, documentos } });

beforeEach(() => { estado.uploads = 0; estado.removidos = []; estado.inseridos = []; });

it('segundo documento falha: 502 com o nome, apaga o primeiro e não grava a pessoa', async () => {
    estado.falharNo = 2;
    const res = resposta();
    await controller.registerEmployee(ficha([{ name: 'aso.pdf', base64: PDF, label: 'ASO' }, { name: 'rg.pdf', base64: PDF, label: 'RG' }]), res);

    expect(res.codigo).toBe(502);
    expect(res.dados.documentos_nao_enviados).toEqual(['RG']);
    expect(res.dados.error).toBe('O documento RG ainda não foi enviado. Tente de novo.');
    expect(estado.removidos).toHaveLength(1);
    expect(estado.removidos[0]).toMatch(/_aso\.pdf$/);
    expect(estado.inseridos.filter(i => i.tabela === 'pessoas')).toHaveLength(0);
});

it('caminho do arquivo não repete a extensão', async () => {
    estado.falharNo = 2;
    const res = resposta();
    await controller.registerEmployee(ficha([{ name: 'meu aso.v2.PDF', base64: PDF }, { name: 'x.pdf', base64: PDF }]), res);
    expect(estado.removidos[0]).toMatch(/_meu_aso_v2\.pdf$/);
});

describe('documentos exigidos', () => {
    const requisitos = require('../src/modules/entities/documentoRequisitos.service');
    const tipos = [
        { id: 'rgf', nome: 'RG/CNH - Frente', ativo: true }, { id: 'rgv', nome: 'RG/CNH - Verso', ativo: true },
        { id: 'aso', nome: 'ASO', ativo: true, exige_validade: true }
    ];
    const config = { tipos, regras: { '*': ['rgf', 'rgv'], LIMPEZA: ['aso'] }, aviso_vencimento_dias: 15 };

    it('cadastro do operador não exige documento', () => {
        const r = requisitos.avaliar(config, { funcao: 'LIMPEZA', origem_cadastro: 'interno' }, []);
        expect(r.status_documentos).toBe('aprovado');
        expect(r.pendencias).toHaveLength(0);
    });

    it('pré-cadastro: mínimo + função entram nas pendências', () => {
        const r = requisitos.avaliar(config, { funcao: 'limpeza', origem_cadastro: 'externo' }, []);
        expect(r.status_documentos).toBe('pendente');
        expect(r.pendencias.map(p => p.nome)).toEqual(['RG/CNH - Frente', 'RG/CNH - Verso', 'ASO']);
    });
});
