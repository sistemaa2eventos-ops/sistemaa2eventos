'use strict';

/**
 * Modelos de câmera editáveis no painel: o padrão de endereço precisa ser válido e seguro (sem senha
 * no modelo, só marcadores conhecidos); sem a migration, os modelos de fábrica continuam valendo.
 */
let mockErro = null;
let mockLinhas = [];
let mockInserido = null;

jest.mock('../src/config/supabase', () => ({
    supabase: {
        from: () => {
            const q = {
                select() { return q; }, order() { return q; }, eq() { return q; },
                insert(l) { mockInserido = l; return q; },
                single: async () => (mockErro ? { data: null, error: mockErro } : { data: { id: 'novo', ...mockInserido }, error: null }),
                then(ok) { return Promise.resolve(mockErro ? { data: null, error: mockErro } : { data: mockLinhas, error: null }).then(ok); }
            };
            return q;
        }
    }
}));

const s = require('../src/modules/system/modelosCamera.service');

beforeEach(() => { mockErro = null; mockLinhas = []; mockInserido = null; });

describe('padrão de endereço', () => {
    test('aceita o padrão com marcadores conhecidos', () => {
        expect(s.validarPadrao('rtsp://{auth}{ip}:{porta}/cam/realmonitor?channel={canal}&subtype=0', 'x'))
            .toBe('rtsp://{auth}{ip}:{porta}/cam/realmonitor?channel={canal}&subtype=0');
    });
    test.each([
        ['http://{ip}/video', /rtsp:\/\//],
        ['rtsp://192.168.1.10/stream', /\{ip\}/],
        ['rtsp://{ip}/{usuario}', /marcador desconhecido \{usuario\}/],
        ['rtsp://admin:senha@{ip}/live', /use \{auth\}/],
        ['rtsp://{ip}/ live', /espaços/]
    ])('recusa %s', (padrao, erro) => {
        expect(() => s.validarPadrao(padrao, 'Endereço')).toThrow(erro);
    });
    test('vazio vira null (modelo Genérica: endereço completo vai na câmera)', () => {
        expect(s.validarPadrao('', 'x')).toBeNull();
    });
});

describe('cadastro', () => {
    test('nome e porta validados; nome da webcam é reservado', () => {
        expect(() => s.validar({ nome: 'X' })).toThrow(/Nome/);
        expect(() => s.validar({ nome: 'Câmera', porta_padrao: 70000 })).toThrow(/Porta/);
        expect(() => s.validar({ nome: 'RTSP / OBS / Webcam' })).toThrow(/reservado/);
        expect(() => s.validar({ nome: 'Sub sem principal', rtsp_sub: 'rtsp://{ip}/2' })).toThrow(/principal/);
    });
    test('criar grava só os campos validados', async () => {
        const m = await s.criar({ nome: ' Axis ', rtsp_principal: 'rtsp://{auth}{ip}:{porta}/axis-media/media.amp', de_fabrica: true, id: 'x' });
        expect(m.nome).toBe('Axis');
        expect(mockInserido).not.toHaveProperty('de_fabrica');
        expect(mockInserido).not.toHaveProperty('id');
    });
    test('nome repetido: mensagem clara', async () => {
        mockErro = { code: '23505', message: 'duplicate key' };
        await expect(s.criar({ nome: 'Intelbras' })).rejects.toThrow(/Já existe/);
    });
});

describe('lista', () => {
    test('sem a migration: modelos de fábrica, só leitura', async () => {
        mockErro = { code: '42P01', message: 'relation "modelos_camera" does not exist' };
        const r = await s.listar();
        expect(r.editavel).toBe(false);
        expect(r.modelos.map(m => m.nome)).toEqual(['Mercusys / Tapo', 'Intelbras', 'Dahua', 'Hikvision', 'Genérica']);
    });
    test('com a tabela: o que está no banco', async () => {
        mockLinhas = [{ id: '1', nome: 'Axis' }];
        expect(await s.listar()).toEqual({ modelos: [{ id: '1', nome: 'Axis' }], editavel: true });
    });
    test('modelos de fábrica passam na própria validação', () => {
        for (const m of s.MODELOS_DE_FABRICA) expect(() => s.validar(m)).not.toThrow();
    });
});
