/**
 * Cópia para o Google Drive: pastas Evento / Empresa / "NOME - CPF", nome do arquivo com a
 * validade, registro em drive_copias e nenhuma cópia repetida.
 */
const gravados = [];
jest.mock('../src/services/logger', () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() }));
jest.mock('../src/config/supabase', () => {
    const linhas = {
        drive_conexao: { id: 1, email: 'conta@gmail.com', refresh_token: 'rt', pasta_raiz_id: 'raiz' },
        pessoa_documentos: { id: 'd1', titulo: 'ASO', data_validade: '2027-06-30', pessoa_id: 'p1', url_arquivo: 'https://x.supabase.co/storage/v1/object/public/documentos/event_1/docs/1_aso.pdf' },
        pessoas: { nome_completo: 'MARIA SILVA', cpf: '52998224725', evento_id: 'ev1', empresas: { nome: 'DAK' }, eventos: { nome: 'Show X' } }
    };
    const copias = {};
    const consulta = (tabela) => {
        const q = {
            select: () => q, eq: () => q, update: () => q, delete: () => q,
            maybeSingle: async () => ({ data: tabela === 'drive_copias' ? (copias.d1 || null) : linhas[tabela] }),
            upsert: async (row) => { gravados.push({ tabela, row }); if (tabela === 'drive_copias') copias[row.documento_id] = row; return {}; },
            then: (ok) => ok({ data: null, error: null })
        };
        return q;
    };
    return {
        supabase: {
            from: consulta,
            storage: { from: () => ({ download: async () => ({ data: new Blob([Buffer.from('%PDF-1.4')]) }) }) }
        }
    };
});

process.env.GOOGLE_CLIENT_ID = 'cid';
process.env.GOOGLE_CLIENT_SECRET = 'sec';
const chamadas = [];
global.fetch = jest.fn(async (url, opts = {}) => {
    chamadas.push({ url, opts });
    const json = (d) => ({ ok: true, status: 200, json: async () => d, text: async () => JSON.stringify(d) });
    if (url.includes('oauth2.googleapis.com/token')) return json({ access_token: 'at', expires_in: 3600 });
    if (url.includes('/files/raiz?')) return json({ id: 'raiz', trashed: false });
    if (url.includes('/files?q=')) return json({ files: [] });                       // pasta ainda não existe
    if (url.includes('upload/drive')) return json({ id: 'arquivo1' });
    if (url.includes('drive/v3/files?fields=id')) {                                  // cria pasta
        return json({ id: `pasta-${JSON.parse(opts.body).name}` });
    }
    throw new Error(`inesperado: ${url}`);
});

const drive = require('../src/modules/integracoes/drive.service');

it('copia para Evento / Empresa / Pessoa com a validade no nome e registra', async () => {
    const r = await drive.copiar('pessoa', 'd1');
    expect(r.drive_file_id).toBe('arquivo1');

    const pastasCriadas = chamadas.filter(c => c.url.includes('drive/v3/files?fields=id')).map(c => JSON.parse(c.opts.body));
    expect(pastasCriadas.map(p => p.name)).toEqual(['Show X', 'DAK', 'MARIA SILVA - 529.982.247-25']);
    expect(pastasCriadas[1].parents).toEqual(['pasta-Show X']);

    const upload = chamadas.find(c => c.url.includes('upload/drive'));
    const corpo = upload.opts.body.toString();
    expect(corpo).toContain('"name":"ASO (válido até 30-06-2027).pdf"');
    expect(corpo).toContain('"parents":["pasta-MARIA SILVA - 529.982.247-25"]');
    expect(corpo).toContain('%PDF-1.4');

    expect(gravados.find(g => g.tabela === 'drive_copias').row).toMatchObject({ status: 'copiado', drive_file_id: 'arquivo1', evento_id: 'ev1' });
});

it('documento já copiado não é enviado de novo', async () => {
    const antes = chamadas.length;
    const r = await drive.copiar('pessoa', 'd1');
    expect(r.ja_copiado).toBe(true);
    expect(chamadas.length).toBe(antes);
});
