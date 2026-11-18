/**
 * Arquivo compartilhado entre cadastros: comparação pelo par bucket/caminho normalizado (variantes
 * /public/, /sign/ com token e /authenticated/ são o mesmo arquivo). Escrita na forma canônica.
 */
const mockDb = { gravadas: [] };

jest.mock('../src/services/logger', () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() }));
jest.mock('../src/config/supabase', () => ({
    supabase: {
        from: () => {
            const f = [];
            const q = {
                select: () => q,
                eq: (c, v) => { f.push(['eq', c, v]); return q; },
                neq: (c, v) => { f.push(['neq', c, v]); return q; },
                ilike: (c, v) => { f.push(['ilike', c, v]); return q; },
                limit: () => q,
                then: (ok, ko) => {
                    // ILIKE '%texto%' com \ de escape
                    const like = (texto, padrao) => {
                        const meio = padrao.slice(1, -1).replace(/\\(.)/g, '$1');
                        return typeof texto === 'string' && texto.toLowerCase().includes(meio.toLowerCase());
                    };
                    const data = mockDb.gravadas.filter(p => f.every(([op, c, v]) =>
                        (op === 'eq' ? p[c] === v : op === 'neq' ? p[c] !== v : like(p[c], v))));
                    return Promise.resolve({ data, error: null }).then(ok, ko);
                }
            };
            return q;
        }
    }
}));

const { arquivoUsadoPorOutraPessoa, formaCanonica } = require('../src/services/storageSeguro');

const BASE = 'http://dummy.supabase.co'; // host do SUPABASE_URL do jest.setup

beforeEach(() => { mockDb.gravadas = []; });

describe('arquivoUsadoPorOutraPessoa', () => {
    const publica = `${BASE}/storage/v1/object/public/selfies/event_1/foto%20a.jpg`;

    it('acha o mesmo arquivo gravado como /sign/ com token', async () => {
        mockDb.gravadas = [{ id: 'outra', foto_url: `${BASE}/storage/v1/object/sign/selfies/event_1/foto%20a.jpg?token=xyz`, documento_foto: null }];
        expect(await arquivoUsadoPorOutraPessoa(publica, 'eu')).toBe(true);
    });

    it('acha o mesmo arquivo como /authenticated/ em documento_foto', async () => {
        mockDb.gravadas = [{ id: 'outra', foto_url: null, documento_foto: `${BASE}/storage/v1/object/authenticated/selfies/event_1/foto%20a.jpg` }];
        expect(await arquivoUsadoPorOutraPessoa(publica, 'eu')).toBe(true);
    });

    it('mesmo nome de arquivo em outra pasta ou outro bucket não conta', async () => {
        mockDb.gravadas = [
            { id: 'outra', foto_url: `${BASE}/storage/v1/object/public/selfies/event_2/foto%20a.jpg` },
            { id: 'outra2', foto_url: `${BASE}/storage/v1/object/public/avatars/event_1/foto%20a.jpg` }
        ];
        expect(await arquivoUsadoPorOutraPessoa(publica, 'eu')).toBe(false);
    });

    it('a própria pessoa não conta', async () => {
        mockDb.gravadas = [{ id: 'eu', foto_url: publica }];
        expect(await arquivoUsadoPorOutraPessoa(publica, 'eu')).toBe(false);
    });

    it('data URI: só igualdade exata', async () => {
        mockDb.gravadas = [{ id: 'outra', foto_url: 'data:image/png;base64,AAAA' }];
        expect(await arquivoUsadoPorOutraPessoa('data:image/png;base64,AAAA', 'eu')).toBe(true);
        expect(await arquivoUsadoPorOutraPessoa('data:image/png;base64,BBBB', 'eu')).toBe(false);
    });
});

describe('formaCanonica', () => {
    it('URL pública do nosso host, sem query; data URI e outro host ficam iguais', () => {
        expect(formaCanonica(`${BASE}/storage/v1/object/sign/selfies/e/foto%20a.jpg?token=abc`))
            .toBe(`${BASE}/storage/v1/object/public/selfies/e/foto%20a.jpg`);
        expect(formaCanonica(`${BASE}/storage/v1/object/authenticated/documentos/x.pdf`))
            .toBe(`${BASE}/storage/v1/object/public/documentos/x.pdf`);
        expect(formaCanonica('data:image/png;base64,AAAA')).toBe('data:image/png;base64,AAAA');
        expect(formaCanonica('https://exemplo.com/a.jpg')).toBe('https://exemplo.com/a.jpg');
    });
});
