'use strict';

/**
 * Alertas disparados por câmera só com reconhecimento confiável.
 * O motor marca matched_person.alerta_ok (rosto >= 64 px e semelhança >= 0,55 por padrão). Regras:
 *  - alerta_ok = false: pessoa bloqueada não gera alerta; watchlist vira "possível" sem disparo;
 *  - alerta_ok = true: alerta normal;
 *  - campo ausente (motor antigo): alerta como antes.
 */

const mockEmit = jest.fn();
const mockMarcarAlerta = jest.fn();
const mockRegistrarAlerta = jest.fn(() => Promise.resolve());
const mockVerificarCPF = jest.fn();

jest.mock('../src/config/supabase', () => ({
    supabase: { from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null }) }) }) }) }
}));
jest.mock('../src/services/logger', () => ({ info: () => {}, warn: () => {}, debug: () => {}, error: () => {} }));
jest.mock('../src/services/agentService', () => ({}));
jest.mock('../src/services/videoRelay', () => ({}));
jest.mock('../src/services/mp4Relay', () => ({}));
jest.mock('../src/modules/system/iaConfig.service', () => ({}));
jest.mock('../src/modules/system/gravacao.service', () => ({ marcarAlerta: (...a) => mockMarcarAlerta(...a) }));
jest.mock('../src/modules/system/notificacao.service', () => ({ criar: () => Promise.resolve() }));
jest.mock('../src/modules/system/watchlist.service', () => ({
    verificarCPF: (...a) => mockVerificarCPF(...a),
    isAlertaAtivo: () => false,
    registrarAlerta: (...a) => mockRegistrarAlerta(...a)
}));
jest.mock('../src/services/websocketService', () => ({ io: null }));

const { processarDeteccoesCamera } = require('../src/modules/system/camera.controller');

const cam = { id: 'cam1', nome: 'Portaria', evento_id: 'E1', area: { nome_area: 'Entrada' } };
const face = (mp, rosto_px = 120) => ({ rosto_px, face_crop_base64: null, matched_person: { id: 'p1', nome: 'Fulano', cpf: '11111111111', similarity: 0.8, foto_url: 'x', ...mp } });
const alertasDeArea = () => mockEmit.mock.calls.filter(c => c[0] === 'area_alert');

beforeEach(() => {
    mockEmit.mockClear();
    mockMarcarAlerta.mockClear();
    mockRegistrarAlerta.mockClear();
    mockVerificarCPF.mockReset();
    global.io = { to: () => ({ emit: mockEmit }) };
});
afterAll(() => { delete global.io; });

describe('pessoa bloqueada vista pela câmera', () => {
    test('reconhecimento sem confiança (alerta_ok=false) não alerta', async () => {
        mockVerificarCPF.mockResolvedValue(null);
        await processarDeteccoesCamera({ ...cam, id: 'camA' }, [face({ bloqueado: true, alerta_ok: false }, 40)], null);
        expect(alertasDeArea()).toHaveLength(0);
        expect(mockMarcarAlerta).not.toHaveBeenCalled();
    });

    test('reconhecimento confiável (alerta_ok=true) alerta', async () => {
        mockVerificarCPF.mockResolvedValue(null);
        await processarDeteccoesCamera({ ...cam, id: 'camB' }, [face({ bloqueado: true, alerta_ok: true })], null);
        expect(alertasDeArea()).toHaveLength(1);
        expect(alertasDeArea()[0][1]).toMatchObject({ tipo: 'pessoa_bloqueada', pessoa_nome: 'Fulano' });
    });
});

describe('watchlist', () => {
    test('sem confiança: não dispara, fica marcado como possível', async () => {
        mockVerificarCPF.mockResolvedValue({ id: 'w1', nivel_alerta: 'alto' });
        const r = face({ alerta_ok: false }, 50);
        await processarDeteccoesCamera({ ...cam, id: 'camC' }, [r], null);
        expect(mockRegistrarAlerta).not.toHaveBeenCalled();
        expect(r.matched_person.watchlist_possivel).toBe(true);
        expect(r.matched_person.is_watchlist).toBeUndefined();
    });

    test('confiável: dispara o alerta', async () => {
        mockVerificarCPF.mockResolvedValue({ id: 'w1', nivel_alerta: 'alto' });
        await processarDeteccoesCamera({ ...cam, id: 'camD' }, [face({ alerta_ok: true })], null);
        expect(mockRegistrarAlerta).toHaveBeenCalledTimes(1);
    });

    test('motor antigo (sem alerta_ok): dispara como antes', async () => {
        mockVerificarCPF.mockResolvedValue({ id: 'w1', nivel_alerta: 'alto' });
        await processarDeteccoesCamera({ ...cam, id: 'camE' }, [face({})], null);
        expect(mockRegistrarAlerta).toHaveBeenCalledTimes(1);
    });
});
