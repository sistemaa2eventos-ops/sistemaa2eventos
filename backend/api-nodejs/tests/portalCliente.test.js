/**
 * Portal do cliente (B2C):
 *  - selfie vai para o bucket selfies (o bucket 'fotos' não existe) e foto_url passa pela validação;
 *  - documento vai para o bucket documentos (o 'docs' não existe) e url_arquivo deixa de ser null;
 *  - GET /ticket/foto-url devolve a foto do próprio ticket assinada, com a mesma autenticação de /meu-ticket.
 */
const mockDb = { usuario: null, pessoas: [], uploads: [], gravacoes: [] };

jest.mock('../src/services/logger', () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() }));
jest.mock('../src/middleware/auth', () => ({
    authenticate: (req, _res, next) => { req.user = mockDb.usuario; next(); }
}));
jest.mock('../src/modules/devices/sync.service', () => ({ syncUserToAllDevices: jest.fn(async () => {}) }));
jest.mock('../src/config/supabase', () => {
    const consulta = (tabela) => {
        const q = {};
        for (const m of ['select', 'eq', 'order']) q[m] = () => q;
        q.update = (v) => { mockDb.gravacoes.push({ tabela, op: 'update', v }); return q; };
        q.insert = (v) => { mockDb.gravacoes.push({ tabela, op: 'insert', v }); return q; };
        q.maybeSingle = async () => ({ data: mockDb.pessoas[0] || null, error: null });
        q.single = async () => ({ data: { id: 'doc1' }, error: null });
        q.then = (ok) => ok({ data: null, error: null });
        return q;
    };
    return {
        supabase: {
            from: consulta,
            storage: {
                from: (bucket) => ({
                    createSignedUrl: async (path, seg) => ({ data: { signedUrl: `assinado:${bucket}/${path}?s=${seg}` }, error: null })
                })
            }
        },
        uploadImage: jest.fn(async (bucket, path) => {
            mockDb.uploads.push({ bucket, path });
            return { success: true, path, url: `http://dummy.supabase.co/storage/v1/object/public/${bucket}/${path}` };
        })
    };
});

const express = require('express');
const request = require('supertest');
const clienteRoutes = require('../src/modules/portal/cliente.routes');

const app = express();
app.use(express.json());
app.use('/api/portal/cliente', clienteRoutes);

const PID = '11111111-2222-3333-4444-555555555555';

beforeEach(() => {
    mockDb.usuario = { id: PID, role: 'cliente' };
    mockDb.pessoas = [];
    mockDb.uploads.length = 0;
    mockDb.gravacoes.length = 0;
});

it('selfie: grava no bucket selfies e atualiza foto_url com a URL devolvida', async () => {
    const r = await request(app).post('/api/portal/cliente/selfie').send({ fotoBase64: 'data:image/jpeg;base64,/9j/4AAQ' });
    expect(r.status).toBe(200);
    expect(mockDb.uploads[0].bucket).toBe('selfies');
    const up = mockDb.gravacoes.find(g => g.tabela === 'pessoas' && g.op === 'update');
    expect(up.v.foto_url).toBe(`http://dummy.supabase.co/storage/v1/object/public/selfies/${mockDb.uploads[0].path}`);
});

it('documento: grava no bucket documentos e url_arquivo não fica null', async () => {
    const r = await request(app).post('/api/portal/cliente/documento')
        .field('titulo', 'Meia entrada').field('tipo_doc', 'meia_entrada')
        .attach('arquivo', Buffer.from('%PDF-1.4'), { filename: 'comprovante.pdf', contentType: 'application/pdf' });
    expect(r.status).toBe(201);
    expect(mockDb.uploads[0].bucket).toBe('documentos');
    const ins = mockDb.gravacoes.find(g => g.tabela === 'pessoa_documentos' && g.op === 'insert').v[0];
    expect(ins.url_arquivo).toMatch(/^http:\/\/dummy\.supabase\.co\/storage\/v1\/object\/public\/documentos\//);
});

describe('GET /api/portal/cliente/ticket/foto-url', () => {
    it('devolve a foto do próprio ticket assinada por 600 s', async () => {
        mockDb.pessoas = [{ id: PID, foto_url: 'http://dummy.supabase.co/storage/v1/object/public/selfies/biometria/a.jpg' }];
        const r = await request(app).get('/api/portal/cliente/ticket/foto-url');
        expect(r.status).toBe(200);
        expect(r.body).toEqual({ success: true, data: { url: 'assinado:selfies/biometria/a.jpg?s=600', expira_em_segundos: 600 } });
    });

    it('sem foto: url null', async () => {
        mockDb.pessoas = [{ id: PID, foto_url: null }];
        const r = await request(app).get('/api/portal/cliente/ticket/foto-url');
        expect(r.body).toEqual({ success: true, data: { url: null } });
    });

    it('foto gravada em bucket de documentos: 422, sem link', async () => {
        mockDb.pessoas = [{ id: PID, foto_url: 'http://dummy.supabase.co/storage/v1/object/public/documentos_operacionais/x.pdf' }];
        expect((await request(app).get('/api/portal/cliente/ticket/foto-url')).status).toBe(422);
    });

    it('quem não é cliente: 403 (mesma proteção do portal)', async () => {
        mockDb.usuario = { id: 'op', role: 'operador' };
        expect((await request(app).get('/api/portal/cliente/ticket/foto-url')).status).toBe(403);
    });
});
