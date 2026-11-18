/**
 * Foto enviada aos leitores: URL do storage do sistema sai com service role (bucket pode ser privado),
 * caminho puro usa o bucket avatars, e URL externa mantém o download comum.
 * Também: senha do leitor sem valor padrão no código.
 */
const mockDb = { download: null, chamadas: [] };

jest.mock('../src/services/logger', () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() }));
jest.mock('../src/modules/devices/adapters/DeviceFactory', () => ({ getDevice: jest.fn() }));
jest.mock('../src/config/supabase', () => ({
    supabase: {
        from: () => ({}),
        storage: {
            from: (bucket) => ({
                download: async (path) => { mockDb.chamadas.push({ bucket, path }); return mockDb.download(bucket, path); }
            })
        }
    }
}));

const terminalSync = require('../src/modules/devices/terminalSync.service');
const IntelbrasService = require('../src/modules/devices/intelbras.service');
const HikvisionService = require('../src/modules/devices/hikvision.service');

const BASE = 'http://dummy.supabase.co';
// Buffer.from(texto).buffer é o pool inteiro do Node: fatia só os bytes do conteúdo
const arrayBufferDe = (texto) => { const b = Buffer.from(texto); return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength); };
const bytesOk = () => ({ data: { arrayBuffer: async () => arrayBufferDe('JPEG') }, error: null });

const envOriginal = { ...process.env };
let fetchOriginal;

beforeEach(() => {
    mockDb.chamadas.length = 0;
    mockDb.download = async () => bytesOk();
    fetchOriginal = global.fetch;
    global.fetch = jest.fn(async () => ({ ok: true, arrayBuffer: async () => arrayBufferDe('EXTERNA') }));
});

afterEach(() => { global.fetch = fetchOriginal; });

describe('terminalSync.getFotoBase64', () => {
    it('URL do storage (sign) é baixada com service role, sem fetch público', async () => {
        const r = await terminalSync.getFotoBase64(`${BASE}/storage/v1/object/sign/selfies/event_1/c.jpg?token=x`);
        expect(r).toBe(`data:image/jpeg;base64,${Buffer.from('JPEG').toString('base64')}`);
        expect(mockDb.chamadas).toEqual([{ bucket: 'selfies', path: 'event_1/c.jpg' }]);
        expect(global.fetch).not.toHaveBeenCalled();
    });

    it('caminho puro continua indo ao bucket avatars', async () => {
        await terminalSync.getFotoBase64('foto-antiga.jpg');
        expect(mockDb.chamadas).toEqual([{ bucket: 'avatars', path: 'foto-antiga.jpg' }]);
    });

    it('URL externa (fora do storage do sistema) mantém o download comum', async () => {
        const r = await terminalSync.getFotoBase64('https://fotos.exemplo.com/a.jpg');
        expect(global.fetch).toHaveBeenCalledWith('https://fotos.exemplo.com/a.jpg');
        expect(r).toContain('data:image/jpeg;base64,');
    });

    it('data URI volta como está', async () => {
        expect(await terminalSync.getFotoBase64('data:image/jpeg;base64,AAAA')).toBe('data:image/jpeg;base64,AAAA');
    });

    it('falha no download devolve null (mesmo retorno de antes)', async () => {
        mockDb.download = async () => ({ data: null, error: { message: 'Object not found' } });
        expect(await terminalSync.getFotoBase64(`${BASE}/storage/v1/object/public/selfies/x.jpg`)).toBeNull();
    });
});

describe('senha padrão do leitor', () => {
    beforeEach(() => {
        process.env = { ...envOriginal };
        delete process.env.INTELBRAS_DEFAULT_PASS;
    });
    afterAll(() => { process.env = envOriginal; });

    it('Intelbras sem senha cadastrada não usa admin123: recusa a chamada com erro claro', async () => {
        const dev = new IntelbrasService({ ip_address: '10.0.0.5', porta: 80, user_device: 'admin' });
        expect(dev.pass).toBeNull();
        await expect(dev._request('GET', '/cgi-bin/x')).rejects.toThrow('Senha do leitor 10.0.0.5 não configurada');
    });

    it('Intelbras usa a senha da variável de ambiente quando existe', () => {
        process.env.INTELBRAS_DEFAULT_PASS = 'senha-do-servidor';
        expect(new IntelbrasService({ ip_address: '10.0.0.5' }).pass).toBe('senha-do-servidor');
    });

    it('Hikvision sem senha recusa a conexão (não usa admin123)', async () => {
        const dev = new HikvisionService({ ip_address: '10.0.0.6' });
        expect(dev.pass).toBeNull();
        await expect(dev.getDigestClient()).rejects.toThrow('Senha do leitor 10.0.0.6 não configurada');
    });
});
