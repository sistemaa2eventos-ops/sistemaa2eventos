/**
 * Biometria pendente: a foto sai do storage com service role (o bucket selfies pode ficar privado),
 * sem fetch na URL pública; foto fora do storage do sistema continua recusada.
 */
const mockDb = { chamadas: [], download: null };

jest.mock('../src/services/logger', () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() }));
jest.mock('../src/config/supabase', () => ({
    supabase: {
        from: () => ({}),
        storage: { from: (bucket) => ({ download: async (path) => { mockDb.chamadas.push({ bucket, path }); return mockDb.download(); } }) }
    }
}));

const { fotoEmBase64 } = require('../src/modules/system/biometriaAgente.service');
const imageProcessor = require('../src/utils/imageProcessor');

const BASE = 'https://dummy.supabase.co'; // mesmo host do SUPABASE_URL do jest.setup
const bytes = (t) => { const b = Buffer.from(t); return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength); };
let fetchOriginal;
const envOriginal = process.env.SUPABASE_URL;

beforeEach(() => {
    process.env.SUPABASE_URL = BASE;
    mockDb.chamadas.length = 0;
    mockDb.download = async () => ({ data: { arrayBuffer: async () => bytes('FOTO') }, error: null });
    fetchOriginal = global.fetch;
    global.fetch = jest.fn(async () => { throw new Error('fetch não deveria ser chamado'); });
});
afterEach(() => { global.fetch = fetchOriginal; });
afterAll(() => { process.env.SUPABASE_URL = envOriginal; });

it('baixa a selfie com service role, sem fetch na URL pública', async () => {
    const b64 = await fotoEmBase64(`${BASE}/storage/v1/object/public/selfies/event_1/cpf.jpg`);
    expect(b64).toBe(Buffer.from('FOTO').toString('base64'));
    expect(mockDb.chamadas).toEqual([{ bucket: 'selfies', path: 'event_1/cpf.jpg' }]);
    expect(global.fetch).not.toHaveBeenCalled();
});

it('recusa foto fora do storage do sistema (outro host)', async () => {
    await expect(fotoEmBase64('https://outro.exemplo.com/storage/v1/object/public/selfies/a.jpg'))
        .rejects.toThrow('fora do armazenamento');
    expect(mockDb.chamadas).toHaveLength(0);
});

it('imageProcessor: URL do storage também sai por service role', async () => {
    const buf = await imageProcessor.optimizeForHardware(`${BASE}/storage/v1/object/public/avatars/x.jpg`)
        .catch(() => null); // bytes de teste não são JPEG válido para o sharp
    expect(mockDb.chamadas).toEqual([{ bucket: 'avatars', path: 'x.jpg' }]);
    expect(global.fetch).not.toHaveBeenCalled();
    void buf;
});
