/**
 * Escrita de foto_url (PUT/POST de pessoa): só data URI ou arquivo do nosso storage de fotos; outro
 * endereço → 400 antes de gravar.
 * Cadastro de dispositivo: senha obrigatória só para leitor Intelbras/Dahua/Hikvision; impressora
 * e câmera não exigem senha.
 */
const mockDb = { gravacoes: [], fotoAtual: null };

jest.mock('../src/services/logger', () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() }));
jest.mock('../src/modules/devices/sync.service', () => ({ syncUserToAllDevices: jest.fn(async () => {}) }));
jest.mock('../src/services/emailService', () => ({}));
jest.mock('../src/modules/devices/leitorCamera.service', () => ({ sincronizar: jest.fn(async () => {}) }));
jest.mock('../src/modules/devices/adapters/DeviceFactory', () => ({
    getDevice: jest.fn(() => ({ getRTSPUrl: () => 'rtsp://x', configureOnlineMode: async () => true }))
}));
jest.mock('../src/config/supabase', () => {
    const consulta = (tabela) => {
        const q = {};
        for (const m of ['select', 'eq', 'in', 'order']) q[m] = () => q;
        q.update = (v) => { mockDb.gravacoes.push({ tabela, op: 'update', v }); return q; };
        q.insert = (v) => { mockDb.gravacoes.push({ tabela, op: 'insert', v }); return q; };
        q.single = async () => ({ data: { id: 'novo', evento_id: 'ev1', control_token: 't', config: {}, foto_url: mockDb.fotoAtual }, error: null });
        q.maybeSingle = q.single;
        return q;
    };
    return { supabase: { from: consulta } };
});

const pessoaService = require('../src/modules/entities/pessoa.service');
const deviceController = require('../src/modules/devices/device.controller');

const BASE = 'http://dummy.supabase.co';

beforeEach(() => { mockDb.gravacoes.length = 0; mockDb.fotoAtual = null; });

describe('foto_url no PUT de pessoa', () => {
    const { supabase } = require('../src/config/supabase');

    it('aceita foto do nosso storage (selfies) e data URI', async () => {
        await expect(pessoaService.update(supabase, 'p1', { foto_url: `${BASE}/storage/v1/object/public/selfies/event_1/a.jpg` }, 'ev1')).resolves.toBeTruthy();
        await expect(pessoaService.update(supabase, 'p1', { foto_url: 'data:image/jpeg;base64,/9j/4AAQ' }, 'ev1')).resolves.toBeTruthy();
    });

    it('recusa com 400 foto de outro host ou de bucket de documentos, sem gravar', async () => {
        for (const foto_url of [
            'https://exemplo.com/a.jpg',
            'https://outro-projeto.supabase.co/storage/v1/object/public/selfies/a.jpg',
            `${BASE}/storage/v1/object/public/documentos_operacionais/pessoas/p1/rg.pdf`
        ]) {
            await expect(pessoaService.update(supabase, 'p1', { foto_url }, 'ev1')).rejects.toMatchObject({ status: 400 });
        }
        expect(mockDb.gravacoes).toHaveLength(0);
    });

    it('foto igual à já gravada passa sem validar (painel reenvia o objeto inteiro)', async () => {
        const antiga = 'https://projeto-antigo.supabase.co/storage/v1/object/public/selfies/a.jpg';
        mockDb.fotoAtual = antiga;
        await expect(pessoaService.update(supabase, 'p1', { foto_url: antiga, nome_completo: 'X' }, 'ev1')).resolves.toBeTruthy();
        // trocar por outro endereço de fora continua barrado
        await expect(pessoaService.update(supabase, 'p1', { foto_url: 'https://exemplo.com/b.jpg' }, 'ev1'))
            .rejects.toMatchObject({ status: 400 });
    });

    it('no create a validação continua valendo', () => {
        expect(() => pessoaService.validarFotoUrl('https://exemplo.com/a.jpg')).toThrow('Foto inválida');
    });
});

describe('senha no cadastro de dispositivo', () => {
    const resposta = () => {
        const r = { statusCode: 200, corpo: null };
        r.status = (c) => { r.statusCode = c; return r; };
        r.json = (b) => { r.corpo = b; return r; };
        return r;
    };
    const req = (body) => ({
        body, event: { id: 'ev1' }, user: { id: 'u1' },
        get: () => null, headers: {}, protocol: 'http', secure: false
    });
    const envOriginal = process.env.INTELBRAS_DEFAULT_PASS;
    beforeEach(() => { delete process.env.INTELBRAS_DEFAULT_PASS; });
    afterAll(() => { if (envOriginal !== undefined) process.env.INTELBRAS_DEFAULT_PASS = envOriginal; });

    it('leitor facial Intelbras sem senha: 400 e nada gravado', async () => {
        const res = resposta();
        await deviceController.create(req({ nome: 'Leitor', marca: 'intelbras', tipo: 'terminal_facial', ip_address: '10.0.0.5' }), res);
        expect(res.statusCode).toBe(400);
        expect(res.corpo.error).toContain('Senha do leitor');
        expect(mockDb.gravacoes).toHaveLength(0);
    });

    it('impressora sem senha: cadastra normalmente (sem senha padrão)', async () => {
        const res = resposta();
        await deviceController.create(req({ nome: 'Zebra', marca: 'zebra', tipo: 'impressora', ip_address: '10.0.0.9' }), res);
        expect(res.statusCode).toBe(201);
        const ins = mockDb.gravacoes.find(g => g.tabela === 'dispositivos_acesso' && g.op === 'insert').v[0];
        expect(ins.password_device).toBeNull();
        expect(ins.rtsp_url).toBe('');
    });

    it('câmera Intelbras sem senha também não é barrada', async () => {
        const res = resposta();
        await deviceController.create(req({ nome: 'Cam', marca: 'intelbras', tipo: 'camera', ip_address: '10.0.0.7' }), res);
        expect(res.statusCode).toBe(201);
    });
});
