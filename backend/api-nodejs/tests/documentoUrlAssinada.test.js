/**
 * GET /api/documentos/:origem/:id/url: link assinado de 600 s, só para documento do evento do usuário,
 * e nunca a URL pública gravada quando a assinatura falha.
 */
const mockDb = {
    linhas: {},
    assinar: null
};

jest.mock('../src/services/logger', () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() }));
jest.mock('../src/config/supabase', () => {
    const consulta = (tabela) => {
        const q = {};
        for (const m of ['select', 'eq', 'in', 'order', 'not', 'is', 'lt']) q[m] = () => q;
        q.maybeSingle = async () => ({ data: mockDb.linhas[tabela] || null, error: null });
        q.single = q.maybeSingle;
        q.then = (ok) => ok({ data: mockDb.linhas[tabela] ? [mockDb.linhas[tabela]] : [], error: null });
        return q;
    };
    return {
        supabase: {
            from: consulta,
            storage: { from: (bucket) => ({ createSignedUrl: (path, seg) => mockDb.assinar(bucket, path, seg) }) }
        },
        uploadImage: jest.fn()
    };
});

const documentoService = require('../src/modules/entities/documento.service');

const PUBLICA = 'http://dummy.supabase.co/storage/v1/object/public/documentos_operacionais/pessoas/p1/a.pdf';

beforeEach(() => {
    mockDb.linhas = {
        pessoa_documentos: { url_arquivo: PUBLICA, pessoa_id: 'p1' },
        pessoas: { evento_id: 'ev1' }
    };
    mockDb.assinar = async (bucket, path, seg) => ({ data: { signedUrl: `http://dummy.supabase.co/storage/v1/object/sign/${bucket}/${path}?token=tok` }, error: null });
});

it('devolve link assinado de 600 s para documento do evento do usuário', async () => {
    const spy = jest.fn(mockDb.assinar);
    mockDb.assinar = spy;
    const r = await documentoService.gerarUrlAssinada('pessoa', 'd1', 'ev1');
    expect(r).toMatchObject({ assinada: true, expira_em_segundos: 600 });
    expect(r.url).toContain('/object/sign/documentos_operacionais/pessoas/p1/a.pdf?token=');
    expect(spy).toHaveBeenCalledWith('documentos_operacionais', 'pessoas/p1/a.pdf', 600);
});

it('documento de outro evento responde 404 (sem assinar)', async () => {
    const spy = jest.fn(mockDb.assinar);
    mockDb.assinar = spy;
    await expect(documentoService.gerarUrlAssinada('pessoa', 'd1', 'ev-outro'))
        .rejects.toMatchObject({ status: 404 });
    expect(spy).not.toHaveBeenCalled();
});

it('sem contexto de evento (administrador geral) não restringe por evento', async () => {
    const r = await documentoService.gerarUrlAssinada('pessoa', 'd1', null);
    expect(r.assinada).toBe(true);
});

it('se o storage não assinar, responde 502 e não devolve a URL pública', async () => {
    mockDb.assinar = async () => ({ data: null, error: { message: 'storage fora do ar' } });
    const erro = await documentoService.gerarUrlAssinada('pessoa', 'd1', 'ev1').catch(e => e);
    expect(erro.status).toBe(502);
    expect(erro.message).not.toContain('/storage/v1/object/public/');
});

it('empresa: confere o evento da empresa, não o da pessoa', async () => {
    mockDb.linhas = {
        empresa_documentos: { url_arquivo: PUBLICA.replace('pessoas/p1', 'empresas/e1'), empresa_id: 'e1' },
        empresas: { evento_id: 'ev1' }
    };
    const r = await documentoService.gerarUrlAssinada('empresa', 'd2', 'ev1');
    expect(r.url).toContain('/empresas/e1/a.pdf?token=');
});

it('arquivo gravado em bucket que não é de documentos responde 422 (não assina)', async () => {
    const spy = jest.fn(mockDb.assinar);
    mockDb.assinar = spy;
    mockDb.linhas.pessoa_documentos = { url_arquivo: 'http://dummy.supabase.co/storage/v1/object/public/selfies/event_1/a.jpg', pessoa_id: 'p1' };
    await expect(documentoService.gerarUrlAssinada('pessoa', 'd1', 'ev1')).rejects.toMatchObject({ status: 422 });
    expect(spy).not.toHaveBeenCalled();
});

describe('listDocumentos (GET /documentos/:entityType/:entityId)', () => {
    // Cliente da requisição: devolve os documentos da pessoa
    const clienteDocs = (linhas) => {
        const q = {};
        for (const m of ['select', 'order', 'eq']) q[m] = () => q;
        q.then = (ok) => ok({ data: linhas, error: null });
        return { from: () => q };
    };

    it('pessoa de outro evento: 404, sem devolver links', async () => {
        const docs = [{ id: 'd1', url_arquivo: PUBLICA }];
        await expect(documentoService.listDocumentos(clienteDocs(docs), 'pessoa', 'p1', 'ev-outro'))
            .rejects.toMatchObject({ status: 404 });
    });

    it('pessoa do evento: devolve os documentos com link assinado', async () => {
        const { supabase } = require('../src/config/supabase');
        const original = supabase.storage.from;
        supabase.storage.from = (bucket) => ({
            createSignedUrls: async (paths) => ({ data: paths.map(p => ({ path: p, signedUrl: `assinado:${bucket}/${p}` })), error: null })
        });
        try {
            const docs = [{ id: 'd1', url_arquivo: PUBLICA }];
            const r = await documentoService.listDocumentos(clienteDocs(docs), 'pessoa', 'p1', 'ev1');
            expect(r[0].url_arquivo).toBe('assinado:documentos_operacionais/pessoas/p1/a.pdf');
        } finally {
            supabase.storage.from = original;
        }
    });
});
