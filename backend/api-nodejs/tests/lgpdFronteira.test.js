/**
 * LGPD: foto apagada em qualquer formato de URL, vetor removido do motor de IA, retenção que
 * pagina (PostgREST corta em 1000) e filtro de CPF válido.
 */
const mockDb = {
    resposta: () => ({ data: null, error: null }),
    chamadas: [],
    updates: []
};

jest.mock('../src/services/logger', () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() }));
jest.mock('../src/config/supabase', () => {
    const consulta = (tabela) => {
        const q = { _range: null, _f: [] };
        const reg = (nome, args) => mockDb.chamadas.push({ tabela, nome, args });
        for (const m of ['select', 'eq', 'neq', 'in', 'is', 'not', 'lt', 'gt', 'order', 'limit', 'ilike', 'insert', 'upsert', 'delete', 'update']) {
            q[m] = (...args) => {
                reg(m, args);
                q._f.push([m, ...args]);
                if (m === 'update') mockDb.updates.push({ tabela, valores: args[0] });
                return q;
            };
        }
        q.range = (de, ate) => { reg('range', [de, ate]); q._range = [de, ate]; return q; };
        const resolver = () => Promise.resolve(mockDb.resposta(tabela, q));
        q.single = async () => { const r = await resolver(); return { ...r, data: Array.isArray(r.data) ? r.data[0] : r.data }; };
        q.maybeSingle = q.single;
        q.then = (ok, ko) => resolver().then(ok, ko);
        return q;
    };
    return {
        supabase: { from: consulta, storage: { from: () => ({}) } },
        deleteImage: jest.fn(async () => ({ success: true }))
    };
});
jest.mock('../src/modules/devices/sync.service', () => ({ deleteUserFromAllDevices: jest.fn(async () => {}) }));
jest.mock('../src/services/motorIa', () => ({ removerPessoasDoMotor: jest.fn(async () => ({ enviados: 1, falhas: 0 })) }));

const { deleteImage } = require('../src/config/supabase');
const motorIa = require('../src/services/motorIa');
const lgpd = require('../src/modules/system/lgpd.service');

const BASE = 'http://dummy.supabase.co';
const PESSOA_ID = '11111111-2222-3333-4444-555555555555';

beforeEach(() => {
    mockDb.chamadas.length = 0;
    mockDb.updates.length = 0;
    mockDb.resposta = () => ({ data: null, error: null });
    deleteImage.mockClear();
    motorIa.removerPessoasDoMotor.mockClear();
    motorIa.removerPessoasDoMotor.mockImplementation(async () => ({ enviados: 1, falhas: 0 }));
});

describe('anonymizePerson', () => {
    const pessoa = (foto) => ({
        id: PESSOA_ID, nome: 'Fulana', cpf: '52998224725', foto_url: foto, face_encoding: [0.1], evento_id: 'ev1'
    });

    it('apaga a foto mesmo quando a URL gravada é assinada (sign), não só a pública', async () => {
        mockDb.resposta = (tabela) => tabela === 'pessoas' ? { data: pessoa(`${BASE}/storage/v1/object/sign/selfies/event_1/cpf.jpg?token=x`) } : { data: [], error: null };
        await lgpd.anonymizePerson(PESSOA_ID, 'op1');
        expect(deleteImage).toHaveBeenCalledWith('selfies', 'event_1/cpf.jpg');
    });

    it('apaga a foto de URL pública com espaços codificados', async () => {
        mockDb.resposta = (tabela) => tabela === 'pessoas' ? { data: pessoa(`${BASE}/storage/v1/object/public/selfies/event_1/foto%20a.jpg`) } : { data: [], error: null };
        await lgpd.anonymizePerson(PESSOA_ID, 'op1');
        expect(deleteImage).toHaveBeenCalledWith('selfies', 'event_1/foto a.jpg');
    });

    it('pede ao motor de IA que tire a pessoa do índice', async () => {
        mockDb.resposta = (tabela) => tabela === 'pessoas' ? { data: pessoa(null) } : { data: [], error: null };
        await lgpd.anonymizePerson(PESSOA_ID, 'op1');
        expect(motorIa.removerPessoasDoMotor).toHaveBeenCalledWith([PESSOA_ID]);
    });

    it('se o motor falhar, a anonimização continua valendo (não é desfeita)', async () => {
        motorIa.removerPessoasDoMotor.mockImplementation(async () => { throw new Error('motor fora do ar'); });
        mockDb.resposta = (tabela) => tabela === 'pessoas' ? { data: pessoa(null) } : { data: [], error: null };
        await expect(lgpd.anonymizePerson(PESSOA_ID, 'op1')).resolves.toMatchObject({ success: true });
        const anon = mockDb.updates.find(u => u.tabela === 'pessoas');
        expect(anon.valores).toMatchObject({ cpf: null, face_encoding: null, ativo: false });
    });

    it('usa as colunas do schema atual e um status_acesso aceito pelo CHECK', async () => {
        mockDb.resposta = (tabela) => tabela === 'pessoas' ? { data: pessoa(null) } : { data: [], error: null };
        await lgpd.anonymizePerson(PESSOA_ID, 'op1');

        const select = mockDb.chamadas.find(c => c.tabela === 'pessoas' && c.nome === 'select');
        expect(select.args[0]).toContain('nome_completo');
        expect(select.args[0].split(',').map(s => s.trim())).not.toContain('nome');

        const valores = mockDb.updates.find(u => u.tabela === 'pessoas').valores;
        expect(valores).not.toHaveProperty('nome');
        expect(valores.nome_completo).toMatch(/^\[ANONIMIZADO\] ANON_/);
        expect(valores.documento_foto).toBeNull();
        const CHECK = ['pendente', 'autorizado', 'recusado', 'bloqueado', 'verificacao', 'checkin_feito', 'checkout_feito'];
        expect(CHECK).toContain(valores.status_acesso);
        // Todas as colunas existem no schema (01_initial_schema + 08_iam_ecm_expansion + 20260415_refactor_pessoas)
        const SCHEMA = ['nome_completo', 'nome_credencial', 'cpf', 'email', 'telefone', 'documento', 'documento_foto',
            'passaporte', 'nome_mae', 'data_nascimento', 'foto_url', 'face_encoding', 'qr_code', 'observacao',
            'bloqueado', 'motivo_bloqueio', 'status_acesso', 'ativo', 'updated_at'];
        expect(Object.keys(valores).filter(k => !SCHEMA.includes(k))).toEqual([]);
    });

    it('auditoria no formato aceito por audit_logs (acao UPDATE, user_id só UUID)', async () => {
        mockDb.resposta = (tabela) => tabela === 'pessoas' ? { data: pessoa(null) } : { data: [], error: null };
        await lgpd.anonymizePerson(PESSOA_ID, 'SYSTEM_RETENTION_JOB');
        const ins = mockDb.chamadas.find(c => c.tabela === 'audit_logs' && c.nome === 'insert').args[0][0];
        expect(ins).toMatchObject({ acao: 'UPDATE', recurso: 'PESSOAS', recurso_id: PESSOA_ID, user_id: null, evento_id: 'ev1' });
        expect(ins.detalhes).toMatchObject({ _acao_original: 'LGPD_ANONYMIZE', operador: 'SYSTEM_RETENTION_JOB' });
        expect(ins).not.toHaveProperty('usuario_id');

        mockDb.chamadas.length = 0;
        const OPERADOR = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
        await lgpd.anonymizePerson(PESSOA_ID, OPERADOR);
        expect(mockDb.chamadas.find(c => c.tabela === 'audit_logs' && c.nome === 'insert').args[0][0].user_id).toBe(OPERADOR);
    });

    it('apaga os arquivos (buckets de documento) e as linhas de pessoa_documentos', async () => {
        const { supabase } = require('../src/config/supabase');
        const original = supabase.storage.from;
        const removidos = [];
        supabase.storage.from = (bucket) => ({ remove: async (caminhos) => { removidos.push({ bucket, caminhos }); return { error: null }; } });
        try {
            mockDb.resposta = (tabela) => {
                if (tabela === 'pessoas') return { data: pessoa(null) };
                if (tabela === 'pessoa_documentos') return { data: [
                    { id: 'd1', url_arquivo: `${BASE}/storage/v1/object/public/documentos_operacionais/pessoas/p1/rg.pdf` },
                    { id: 'd2', url_arquivo: `${BASE}/storage/v1/object/public/documentos/event_1/aso.pdf` },
                    { id: 'd3', url_arquivo: `${BASE}/storage/v1/object/public/selfies/event_1/x.jpg` } // não é bucket de documento
                ], error: null };
                return { data: [], error: null };
            };
            await lgpd.anonymizePerson(PESSOA_ID, 'op1');
            expect(removidos).toEqual([
                { bucket: 'documentos_operacionais', caminhos: ['pessoas/p1/rg.pdf'] },
                { bucket: 'documentos', caminhos: ['event_1/aso.pdf'] }
            ]);
            expect(mockDb.chamadas.some(c => c.tabela === 'pessoa_documentos' && c.nome === 'delete')).toBe(true);
        } finally {
            supabase.storage.from = original;
        }
    });

    it('no job de retenção espera a remoção nos leitores (com tempo limite)', async () => {
        const syncService = require('../src/modules/devices/sync.service');
        let terminou = false;
        syncService.deleteUserFromAllDevices.mockImplementationOnce(() => new Promise(ok => setTimeout(() => { terminou = true; ok(); }, 30)));
        mockDb.resposta = (tabela) => tabela === 'pessoas' ? { data: pessoa(null) } : { data: [], error: null };
        await lgpd.anonymizePerson(PESSOA_ID, 'SYSTEM_RETENTION_JOB', { aguardarLeitores: true });
        expect(terminou).toBe(true);

        // leitor travado: desiste no limite e segue
        syncService.deleteUserFromAllDevices.mockImplementationOnce(() => new Promise(() => {}));
        await expect(lgpd.anonymizePerson(PESSOA_ID, 'SYSTEM_RETENTION_JOB', { aguardarLeitores: true, timeoutLeitoresMs: 20 }))
            .resolves.toMatchObject({ success: true });
    });

    it('foto usada por OUTRA pessoa: não apaga o arquivo, só limpa o campo', async () => {
        const foto = `${BASE}/storage/v1/object/public/selfies/event_1/compartilhada.jpg`;
        mockDb.resposta = (tabela, q) => {
            if (tabela !== 'pessoas') return { data: [], error: null };
            // consulta "outra pessoa usa este arquivo?" (tem .neq('id', ...))
            if (q._f.some(([m]) => m === 'neq')) {
                // busca por nome do arquivo em foto_url: outra pessoa tem o mesmo arquivo (variante /sign/)
                const porFoto = q._f.some(([m, c, v]) => m === 'ilike' && c === 'foto_url' && v.includes('compartilhada.jpg'));
                return { data: porFoto ? [{ id: 'outra', foto_url: foto.replace('/public/', '/sign/') + '?token=t' }] : [], error: null };
            }
            return { data: pessoa(foto) };
        };
        await lgpd.anonymizePerson(PESSOA_ID, 'op1');
        expect(deleteImage).not.toHaveBeenCalled();
        expect(mockDb.updates.find(u => u.tabela === 'pessoas').valores.foto_url).toBeNull();
        // o log não leva CPF
        const logger = require('../src/services/logger');
        expect(JSON.stringify(logger.warn.mock.calls)).not.toContain('52998224725');
    });

    it('foto só desta pessoa: apaga o arquivo', async () => {
        const foto = `${BASE}/storage/v1/object/public/selfies/event_1/so-dela.jpg`;
        mockDb.resposta = (tabela, q) => {
            if (tabela !== 'pessoas') return { data: [], error: null };
            if (q._f.some(([m]) => m === 'neq')) return { data: [], error: null };
            return { data: pessoa(foto) };
        };
        await lgpd.anonymizePerson(PESSOA_ID, 'op1');
        expect(deleteImage).toHaveBeenCalledWith('selfies', 'event_1/so-dela.jpg');
    });

    it('não apaga do Storage foto que aponte para bucket de documentos', async () => {
        mockDb.resposta = (tabela) => tabela === 'pessoas' ? { data: pessoa(`${BASE}/storage/v1/object/public/documentos_operacionais/pessoas/p1/a.pdf`) } : { data: [], error: null };
        await lgpd.anonymizePerson(PESSOA_ID, 'op1');
        expect(deleteImage).not.toHaveBeenCalled();
    });
});

describe('processRetentionBatch', () => {
    it('filtra CPF nulo com .not (e não com .is("cpf", "not.null"))', async () => {
        const ids = Array.from({ length: 3 }, (_, i) => ({ id: `p${i}` }));
        mockDb.resposta = (tabela) => tabela === 'eventos' ? { data: [{ id: 'ev1' }] } : { data: ids, error: null };
        const spy = jest.spyOn(lgpd, 'anonymizePerson').mockResolvedValue({});
        await lgpd.processRetentionBatch(90);
        const filtro = mockDb.chamadas.find(c => c.tabela === 'pessoas' && c.nome === 'not');
        expect(filtro.args).toEqual(['cpf', 'is', null]);
        expect(mockDb.chamadas.some(c => c.nome === 'is' && c.args[1] === 'not.null')).toBe(false);
        spy.mockRestore();
    });

    it('percorre todas as pessoas do evento (mais de 1000) e conta as anonimizadas', async () => {
        const todas = Array.from({ length: 1500 }, (_, i) => ({ id: `p${String(i).padStart(4, '0')}` }));
        mockDb.resposta = (tabela, q) => {
            if (tabela === 'eventos') return { data: [{ id: 'ev1' }] };
            const [de, ate] = q._range || [0, 999];
            return { data: todas.slice(de, ate + 1), error: null };
        };
        const spy = jest.spyOn(lgpd, 'anonymizePerson').mockResolvedValue({});
        const r = await lgpd.processRetentionBatch(90);
        expect(r.processed).toBe(1500);
        expect(spy).toHaveBeenCalledTimes(1500);
        // o job espera a remoção nos leitores antes de sair (process.exit)
        expect(spy.mock.calls[0][2]).toEqual({ aguardarLeitores: true });
        spy.mockRestore();
    });

    it('uma pessoa com erro não interrompe o job', async () => {
        const ids = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];
        mockDb.resposta = (tabela) => tabela === 'eventos' ? { data: [{ id: 'ev1' }] } : { data: ids, error: null };
        const spy = jest.spyOn(lgpd, 'anonymizePerson')
            .mockImplementationOnce(async () => { throw new Error('falhou'); })
            .mockResolvedValue({});
        const r = await lgpd.processRetentionBatch(90);
        expect(r).toEqual({ processed: 2, falhas: 1 });
        spy.mockRestore();
    });
});

describe('exportUserData', () => {
    it('entrega os documentos com link assinado de 7 dias (vai por e-mail), não a URL pública', async () => {
        mockDb.resposta = (tabela) => {
            if (tabela === 'pessoas') return { data: { id: PESSOA_ID, nome: 'x' } };
            if (tabela === 'pessoa_documentos') return { data: [{ id: 'd1', url_arquivo: `${BASE}/storage/v1/object/public/documentos_operacionais/pessoas/p1/a.pdf` }] };
            return { data: [], error: null };
        };
        const { supabase } = require('../src/config/supabase');
        let validade = null;
        supabase.storage.from = () => ({
            createSignedUrls: async (paths, seg) => {
                validade = seg;
                return { data: paths.map(p => ({ path: p, signedUrl: `${BASE}/storage/v1/object/sign/documentos_operacionais/${p}?token=q` })), error: null };
            }
        });
        const exp = await lgpd.exportUserData(PESSOA_ID);
        expect(exp.titular.documentos[0].url_arquivo).toContain('/object/sign/documentos_operacionais/pessoas/p1/a.pdf?token=');
        expect(validade).toBe(7 * 24 * 3600);
    });
});
