/**
 * Rotas de foto do painel:
 *  - GET /api/fotos/:pessoaId/url → link assinado; admin/admin_master sem filtro de evento (inclusive
 *    sem evento selecionado), demais só no evento permitido (isAllowedEvent);
 *  - POST /api/fotos/urls { ids } → links em lote (até 100), um createSignedUrls por bucket.
 * Também: foto_url gravada pelo cliente só do nosso storage de fotos (ou data URI).
 */
const mockDb = { usuario: null, pessoas: [], filtros: [], lotes: [] };

jest.mock('../src/services/logger', () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() }));
jest.mock('../src/middleware/auth', () => ({
    authenticate: (req, _res, next) => { req.user = mockDb.usuario; next(); },
    extractRole: (u) => u?.role
}));
jest.mock('../src/config/supabase', () => {
    const consulta = () => {
        const filtros = [];
        const q = {
            select: () => q,
            eq: (c, v) => { filtros.push(['eq', c, v]); return q; },
            in: (c, v) => { filtros.push(['in', c, v]); return q; }
        };
        const linhas = () => {
            mockDb.filtros.push(...filtros);
            return mockDb.pessoas.filter(p => filtros.every(([op, c, v]) => (op === 'eq' ? p[c] === v : v.includes(p[c]))));
        };
        q.maybeSingle = async () => ({ data: linhas()[0] || null, error: null });
        q.then = (ok) => ok({ data: linhas(), error: null });
        return q;
    };
    return {
        supabase: {
            from: consulta,
            storage: {
                from: (bucket) => ({
                    createSignedUrl: async (path, seg) => ({ data: { signedUrl: `assinado:${bucket}/${path}?s=${seg}` }, error: null }),
                    createSignedUrls: async (paths, seg) => {
                        mockDb.lotes.push({ bucket, paths });
                        return { data: paths.map(p => ({ path: p, signedUrl: `assinado:${bucket}/${p}?s=${seg}` })), error: null };
                    }
                })
            }
        }
    };
});

const express = require('express');
const request = require('supertest');
const fotoRoutes = require('../src/modules/entities/foto.routes');

const app = express();
app.use(express.json());
app.use('/api/fotos', fotoRoutes);

const BASE = 'http://dummy.supabase.co';
const ID = (n) => `00000000-0000-0000-0000-${String(n).padStart(12, '0')}`;
const operador = (permitidos = ['ev1']) => ({
    id: 'u1', role: 'operador', evento_id: 'ev1',
    isAllowedEvent: (e) => permitidos.includes(e)
});

beforeEach(() => {
    mockDb.filtros.length = 0;
    mockDb.lotes.length = 0;
    mockDb.pessoas = [
        { id: ID(1), evento_id: 'ev1', foto_url: `${BASE}/storage/v1/object/public/selfies/event_1/a.jpg` },
        { id: ID(2), evento_id: 'ev2', foto_url: `${BASE}/storage/v1/object/public/avatars/b.jpg` },
        { id: ID(3), evento_id: 'ev1', foto_url: `${BASE}/storage/v1/object/public/documentos_operacionais/pessoas/x.pdf` },
        { id: ID(4), evento_id: 'ev1', foto_url: null },
        { id: ID(5), evento_id: 'ev1', foto_url: 'data:image/jpeg;base64,AAAA' }
    ];
});

describe('GET /api/fotos/:pessoaId/url', () => {
    it('operador: foto do próprio evento sai assinada por 600 s', async () => {
        mockDb.usuario = operador();
        const r = await request(app).get(`/api/fotos/${ID(1)}/url`);
        expect(r.status).toBe(200);
        expect(r.body.data).toMatchObject({ url: 'assinado:selfies/event_1/a.jpg?s=600', assinada: true });
        expect(mockDb.filtros).toContainEqual(['eq', 'evento_id', 'ev1']);
    });

    it('operador: pessoa de outro evento responde 404', async () => {
        mockDb.usuario = operador();
        expect((await request(app).get(`/api/fotos/${ID(2)}/url`)).status).toBe(404);
    });

    it('operador pedindo evento fora da lista de permitidos: 403', async () => {
        mockDb.usuario = operador(['ev1']);
        const r = await request(app).get(`/api/fotos/${ID(2)}/url`).set('x-evento-id', 'ev2');
        expect(r.status).toBe(403);
    });

    it('admin_master sem evento selecionado: funciona, sem filtro de evento', async () => {
        mockDb.usuario = { id: 'm', role: 'admin_master', evento_id: null };
        const r = await request(app).get(`/api/fotos/${ID(2)}/url`);
        expect(r.status).toBe(200);
        expect(r.body.data.url).toBe('assinado:avatars/b.jpg?s=600');
        expect(mockDb.filtros.some(([, c]) => c === 'evento_id')).toBe(false);
    });

    it('admin também não é filtrado por evento', async () => {
        mockDb.usuario = { id: 'a', role: 'admin', evento_id: 'ev1' };
        expect((await request(app).get(`/api/fotos/${ID(2)}/url`)).status).toBe(200);
    });

    it('foto gravada em bucket de documentos: 422, sem link', async () => {
        mockDb.usuario = operador();
        const r = await request(app).get(`/api/fotos/${ID(3)}/url`);
        expect(r.status).toBe(422);
        expect(JSON.stringify(r.body)).not.toContain('documentos_operacionais');
    });
});

describe('POST /api/fotos/urls', () => {
    it('devolve um link por pessoa (null para sem foto, outro evento ou bucket errado)', async () => {
        mockDb.usuario = operador();
        const ids = [ID(1), ID(2), ID(3), ID(4), ID(5)];
        const r = await request(app).post('/api/fotos/urls').send({ ids });
        expect(r.status).toBe(200);
        expect(r.body.data.expira_em_segundos).toBe(600);
        expect(r.body.data.urls).toEqual({
            [ID(1)]: 'assinado:selfies/event_1/a.jpg?s=600',
            [ID(2)]: null,                                  // outro evento
            [ID(3)]: null,                                  // bucket de documentos
            [ID(4)]: null,                                  // sem foto
            [ID(5)]: 'data:image/jpeg;base64,AAAA'          // data URI: não há o que assinar
        });
        expect(mockDb.lotes).toEqual([{ bucket: 'selfies', paths: ['event_1/a.jpg'] }]);
    });

    it('admin_master: todas as pessoas, um createSignedUrls por bucket', async () => {
        mockDb.usuario = { id: 'm', role: 'admin_master', evento_id: null };
        const r = await request(app).post('/api/fotos/urls').send({ ids: [ID(1), ID(2)] });
        expect(r.body.data.urls[ID(2)]).toBe('assinado:avatars/b.jpg?s=600');
        expect(mockDb.lotes.map(l => l.bucket).sort()).toEqual(['avatars', 'selfies']);
    });

    it('mais de 100 ids: 400', async () => {
        mockDb.usuario = operador();
        const ids = Array.from({ length: 101 }, (_, i) => ID(i + 1));
        expect((await request(app).post('/api/fotos/urls').send({ ids })).status).toBe(400);
    });

    it('lista vazia ou ausente: 400', async () => {
        mockDb.usuario = operador();
        expect((await request(app).post('/api/fotos/urls').send({ ids: [] })).status).toBe(400);
        expect((await request(app).post('/api/fotos/urls').send({})).status).toBe(400);
    });

    it('id que não é UUID volta null, sem derrubar o lote', async () => {
        mockDb.usuario = operador();
        const r = await request(app).post('/api/fotos/urls').send({ ids: ['1 or 1=1', ID(1), 'abc'] });
        expect(r.status).toBe(200);
        expect(r.body.data.urls).toEqual({
            '1 or 1=1': null,
            [ID(1)]: 'assinado:selfies/event_1/a.jpg?s=600',
            abc: null
        });
        expect(mockDb.filtros).toContainEqual(['in', 'id', [ID(1)]]); // só os válidos vão ao banco
    });

    it('só ids inválidos: 200 com tudo null, sem consultar o banco', async () => {
        mockDb.usuario = operador();
        const r = await request(app).post('/api/fotos/urls').send({ ids: ['x', 'y'] });
        expect(r.status).toBe(200);
        expect(r.body.data.urls).toEqual({ x: null, y: null });
        expect(mockDb.filtros).toHaveLength(0);
    });
});
