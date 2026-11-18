/**
 * Fronteira de armazenamento: lê URLs gravadas (public, sign, authenticated) e caminhos puros
 * com o service role. Só o host do projeto, só os buckets permitidos, sem "..", com timeout,
 * e sem o caminho do arquivo (contém CPF) nas mensagens.
 */
const mockDb = {
    chamadas: [],
    storage: { createSignedUrl: null, createSignedUrls: null, download: null }
};

jest.mock('../src/services/logger', () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() }));
jest.mock('../src/config/supabase', () => ({
    supabase: {
        from: () => ({}),
        storage: {
            from: (bucket) => ({
                createSignedUrl: (...args) => { mockDb.chamadas.push({ bucket, metodo: 'createSignedUrl', args }); return mockDb.storage.createSignedUrl(bucket, ...args); },
                createSignedUrls: (...args) => { mockDb.chamadas.push({ bucket, metodo: 'createSignedUrls', args }); return mockDb.storage.createSignedUrls(bucket, ...args); },
                download: (...args) => { mockDb.chamadas.push({ bucket, metodo: 'download', args }); return mockDb.storage.download(bucket, ...args); }
            })
        }
    }
}));

const logger = require('../src/services/logger');
const {
    caminhoDeStorage, urlAssinada, baixarArquivo, assinarLinhas, assinarFotos, fotoUrlAceitavel,
    BUCKETS_FOTO, BUCKETS_DOCUMENTO
} = require('../src/services/storageSeguro');

const BASE = 'http://dummy.supabase.co'; // host do SUPABASE_URL do jest.setup
const bytes = (t) => { const b = Buffer.from(t); return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength); };

beforeEach(() => {
    mockDb.chamadas.length = 0;
    logger.warn.mockClear();
    mockDb.storage.createSignedUrl = async (bucket, path) => ({ data: { signedUrl: `${BASE}/storage/v1/object/sign/${bucket}/${path}?token=t` }, error: null });
    mockDb.storage.createSignedUrls = async () => ({ data: [], error: null });
    mockDb.storage.download = async () => ({ data: null, error: { message: 'não configurado' } });
});

describe('caminhoDeStorage', () => {
    it('lê URL pública do projeto e decodifica o caminho', () => {
        expect(caminhoDeStorage(`${BASE}/storage/v1/object/public/selfies/event_1/foto%20um.jpg`))
            .toEqual({ bucket: 'selfies', path: 'event_1/foto um.jpg' });
    });

    it('lê URL assinada (sign) sem o token e URL authenticated', () => {
        expect(caminhoDeStorage(`${BASE}/storage/v1/object/sign/documentos_operacionais/pessoas/p1/a.pdf?token=abc`))
            .toEqual({ bucket: 'documentos_operacionais', path: 'pessoas/p1/a.pdf' });
        expect(caminhoDeStorage(`${BASE}/storage/v1/object/authenticated/documentos/x/y.png`))
            .toEqual({ bucket: 'documentos', path: 'x/y.png' });
    });

    it('URL de outro host não é arquivo do projeto', () => {
        expect(caminhoDeStorage('https://outro-projeto.supabase.co/storage/v1/object/public/selfies/a.jpg')).toBeNull();
        expect(caminhoDeStorage('https://exemplo.com/foto.jpg')).toBeNull();
    });

    it('aceita "bucket/caminho" e caminho puro com bucketPadrao', () => {
        expect(caminhoDeStorage('selfies/event_1/a.jpg')).toEqual({ bucket: 'selfies', path: 'event_1/a.jpg' });
        expect(caminhoDeStorage('foto.jpg', { bucketPadrao: 'avatars' })).toEqual({ bucket: 'avatars', path: 'foto.jpg' });
    });

    it('respeita a lista de buckets permitidos', () => {
        const doc = `${BASE}/storage/v1/object/public/documentos_operacionais/pessoas/p1/a.pdf`;
        expect(caminhoDeStorage(doc, { buckets: BUCKETS_FOTO })).toBeNull();
        expect(caminhoDeStorage(doc, { buckets: BUCKETS_DOCUMENTO })).toEqual({ bucket: 'documentos_operacionais', path: 'pessoas/p1/a.pdf' });
        expect(caminhoDeStorage('documentos/x.pdf', { buckets: BUCKETS_FOTO })).toBeNull();
    });

    it('recusa "..", inclusive codificado mais de uma vez', () => {
        expect(caminhoDeStorage(`${BASE}/storage/v1/object/public/selfies/a/%2e%2e/segredo.txt`)).toBeNull();
        expect(caminhoDeStorage(`${BASE}/storage/v1/object/public/selfies/a/%252e%252e/segredo.txt`)).toBeNull();
        expect(caminhoDeStorage('selfies/../documentos/x.pdf')).toBeNull();
    });

    it('recusa data URI e vazio', () => {
        expect(caminhoDeStorage('data:image/jpeg;base64,AAAA')).toBeNull();
        expect(caminhoDeStorage('')).toBeNull();
        expect(caminhoDeStorage(null)).toBeNull();
    });
});

describe('fotoUrlAceitavel (escrita de foto_url)', () => {
    it('aceita vazio, data URI de imagem e foto do nosso storage', () => {
        expect(fotoUrlAceitavel(null)).toBe(true);
        expect(fotoUrlAceitavel('')).toBe(true);
        expect(fotoUrlAceitavel('data:image/jpeg;base64,/9j/4AAQ')).toBe(true);
        expect(fotoUrlAceitavel(`${BASE}/storage/v1/object/public/selfies/event_1/a.jpg`)).toBe(true);
    });

    it('recusa outro host, bucket de documentos e texto qualquer', () => {
        expect(fotoUrlAceitavel('https://exemplo.com/a.jpg')).toBe(false);
        expect(fotoUrlAceitavel(`${BASE}/storage/v1/object/public/documentos_operacionais/pessoas/p1/a.pdf`)).toBe(false);
        expect(fotoUrlAceitavel('javascript:alert(1)')).toBe(false);
        expect(fotoUrlAceitavel({ url: 'x' })).toBe(false);
    });
});

describe('documentoFotoAceitavel (escrita de documento_foto)', () => {
    const { documentoFotoAceitavel } = require('../src/services/storageSeguro');

    it('aceita vazio, data URI de imagem/PDF e arquivo do nosso storage (foto ou documento)', () => {
        expect(documentoFotoAceitavel(null)).toBe(true);
        expect(documentoFotoAceitavel('data:image/png;base64,iVBOR')).toBe(true);
        expect(documentoFotoAceitavel('data:application/pdf;base64,JVBER')).toBe(true);
        expect(documentoFotoAceitavel(`${BASE}/storage/v1/object/public/documentos/event_1/rg.jpg`)).toBe(true);
        expect(documentoFotoAceitavel(`${BASE}/storage/v1/object/public/selfies/event_1/rg.jpg`)).toBe(true);
    });

    it('recusa outro host, bucket fora da lista e data URI que não é imagem/PDF', () => {
        expect(documentoFotoAceitavel('https://exemplo.com/rg.jpg')).toBe(false);
        expect(documentoFotoAceitavel(`${BASE}/storage/v1/object/public/snapshots/x.jpg`)).toBe(false);
        expect(documentoFotoAceitavel('data:text/html;base64,PHNjcmlwdD4=')).toBe(false);
    });
});

describe('urlAssinada e baixarArquivo', () => {
    it('gera link assinado de 600 s com service role', async () => {
        const url = await urlAssinada('documentos_operacionais', 'pessoas/p1/a.pdf');
        expect(url).toContain('/object/sign/documentos_operacionais/pessoas/p1/a.pdf?token=');
        expect(mockDb.chamadas.find(c => c.metodo === 'createSignedUrl').args).toEqual(['pessoas/p1/a.pdf', 600]);
    });

    it('baixa os bytes do arquivo com service role (Buffer)', async () => {
        mockDb.storage.download = async () => ({ data: { arrayBuffer: async () => bytes('%PDF-1.4') }, error: null });
        const buf = await baixarArquivo(`${BASE}/storage/v1/object/public/selfies/event_1/a.jpg`, { buckets: BUCKETS_FOTO });
        expect(buf.toString()).toBe('%PDF-1.4');
        expect(mockDb.chamadas.find(c => c.metodo === 'download')).toMatchObject({ bucket: 'selfies', args: ['event_1/a.jpg'] });
    });

    it('erros sem o caminho do arquivo (contém CPF) na mensagem', async () => {
        mockDb.storage.download = async () => ({ data: null, error: { message: 'Object not found: event_1/52998224725.jpg' } });
        const erro = await baixarArquivo(`${BASE}/storage/v1/object/public/selfies/event_1/52998224725.jpg`).catch(e => e);
        expect(erro.message).toContain('bucket selfies');
        expect(erro.message).not.toContain('52998224725');

        mockDb.storage.createSignedUrl = async () => ({ data: null, error: { message: 'x' } });
        const erro2 = await urlAssinada('selfies', 'event_1/52998224725.jpg').catch(e => e);
        expect(erro2.message).not.toContain('52998224725');
    });

    it('recusa endereço fora do storage e bucket fora da lista', async () => {
        await expect(baixarArquivo('https://exemplo.com/a.jpg')).rejects.toThrow('fora do armazenamento');
        await expect(baixarArquivo(`${BASE}/storage/v1/object/public/documentos/a.pdf`, { buckets: BUCKETS_FOTO }))
            .rejects.toThrow('fora do armazenamento');
        expect(mockDb.chamadas).toHaveLength(0);
    });

    it('desiste com erro claro quando o storage não responde no prazo', async () => {
        mockDb.storage.download = () => new Promise(() => {}); // nunca responde
        await expect(baixarArquivo(`${BASE}/storage/v1/object/public/selfies/a.jpg`, { timeoutMs: 50 }))
            .rejects.toThrow('Tempo esgotado');
    });
});

describe('assinarLinhas e assinarFotos', () => {
    const assinaTudo = async (bucket, paths, seg) => ({
        data: paths.map(p => ({ path: p, signedUrl: `${BASE}/storage/v1/object/sign/${bucket}/${p}?token=z&s=${seg}`, error: null })),
        error: null
    });

    it('troca url_arquivo por link assinado em lote, só nos buckets de documento', async () => {
        mockDb.storage.createSignedUrls = assinaTudo;
        const linhas = [
            { id: 1, url_arquivo: `${BASE}/storage/v1/object/public/documentos_operacionais/pessoas/p1/a.pdf` },
            { id: 2, url_arquivo: `${BASE}/storage/v1/object/public/documentos_operacionais/pessoas/p1/b.pdf` },
            { id: 3, url_arquivo: 'https://exemplo.com/c.pdf' },
            { id: 4, url_arquivo: `${BASE}/storage/v1/object/public/selfies/event_1/x.jpg` }
        ];
        await assinarLinhas(linhas);
        expect(linhas[0].url_arquivo).toContain('/sign/documentos_operacionais/pessoas/p1/a.pdf?token=z');
        expect(linhas[1].url_arquivo).toContain('/sign/documentos_operacionais/pessoas/p1/b.pdf?token=z');
        expect(linhas[2].url_arquivo).toBe('https://exemplo.com/c.pdf');
        expect(linhas[3].url_arquivo).toContain('/object/public/selfies/'); // bucket de foto: não assina
        expect(mockDb.chamadas.filter(c => c.metodo === 'createSignedUrls')).toHaveLength(1);
    });

    it('validade configurável (portabilidade: 7 dias)', async () => {
        mockDb.storage.createSignedUrls = assinaTudo;
        const linhas = [{ url_arquivo: `${BASE}/storage/v1/object/public/documentos/a.pdf` }];
        await assinarLinhas(linhas, { segundos: 604800 });
        expect(mockDb.chamadas.find(c => c.metodo === 'createSignedUrls').args[1]).toBe(604800);
    });

    it('mantém o valor gravado quando o storage não assina, e o log não leva o caminho', async () => {
        mockDb.storage.createSignedUrls = async () => { throw new Error('storage fora do ar'); };
        const original = `${BASE}/storage/v1/object/public/documentos_operacionais/pessoas/52998224725/a.pdf`;
        const linhas = [{ url_arquivo: original }];
        await assinarLinhas(linhas);
        expect(linhas[0].url_arquivo).toBe(original);
        expect(JSON.stringify(logger.warn.mock.calls)).not.toContain('52998224725');
    });

    it('assinarFotos devolve id → link só para fotos dos buckets de foto', async () => {
        mockDb.storage.createSignedUrls = assinaTudo;
        const mapa = await assinarFotos([
            { id: 'a', foto_url: `${BASE}/storage/v1/object/public/selfies/e1/a.jpg` },
            { id: 'b', foto_url: `${BASE}/storage/v1/object/public/avatars/b.jpg` },
            { id: 'c', foto_url: `${BASE}/storage/v1/object/public/documentos/c.pdf` },
            { id: 'd', foto_url: 'data:image/jpeg;base64,AAAA' }
        ]);
        expect([...mapa.keys()].sort()).toEqual(['a', 'b']);
        expect(mockDb.chamadas.filter(c => c.metodo === 'createSignedUrls').map(c => c.bucket).sort()).toEqual(['avatars', 'selfies']);
    });
});
