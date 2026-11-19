/**
 * Bypass de cota em credenciamento: não há mais tratamento especial. Credenciamento é entrada comum:
 * com bypass de cota, grava a nota '⚠️ BYPASS_COTA' como qualquer outra entrada; sem bypass, observacao vazia.
 * (Antes, o marcador CREDENCIAMENTO substituía a nota de bypass.)
 * Nada é gravado no Supabase: a persistência é simulada.
 */

const mockValidation = {
    determineSmartAccessType: jest.fn(async () => 'checkin'),
    validateAccessRules: jest.fn(async () => ({ quotaBypassed: true, cooldown: 0, targetConfidence: 0 })),
    ultimoLogPessoa: jest.fn(async () => null)
};

jest.mock('../src/config/supabase', () => ({ supabase: { from: () => ({}) } }));
jest.mock('../src/services/logger', () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() }));
jest.mock('../src/services/websocketService', () => ({ emit: jest.fn() }));
jest.mock('../src/services/cacheService', () => ({ invalidatePessoa: jest.fn() }));
jest.mock('../src/modules/checkin/services/validation.service', () => ({
    determineSmartAccessType: (...a) => mockValidation.determineSmartAccessType(...a),
    validateAccessRules: (...a) => mockValidation.validateAccessRules(...a),
    ultimoLogPessoa: (...a) => mockValidation.ultimoLogPessoa(...a)
}));
jest.mock('../src/modules/checkin/services/database.service', () => ({
    registerAccessTransaction: jest.fn(async () => ({ success: true })),
    logDeniedAccess: jest.fn(async () => {})
}));
jest.mock('../src/modules/system/watchlist.service', () => ({
    verificarCPF: jest.fn(async () => null),
    registrarAlerta: jest.fn(async () => {})
}));

const DatabaseService = require('../src/modules/checkin/services/database.service');
const checkinService = require('../src/modules/checkin/checkin.service');

const BYPASS = '⚠️ BYPASS_COTA (Capacidade Excedida)';
const PESSOA = { id: 'p1', evento_id: 'ev1', nome_completo: 'Maria Silva', cpf: '52998224725', status_acesso: 'pendente', empresas: null };
const SYNC = 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d';

// Dados do acesso; etapa informada para não consultar a fase do lote
const acesso = (extra = {}) => ({
    pessoa_id: 'p1', pessoa: PESSOA, evento_id: 'ev1', metodo: 'barcode',
    dispositivo_id: 'web-dashboard', created_by: 'op1', area_id: null, sync_id: SYNC, etapa: 'evento',
    ...extra
});

// Observação gravada no registro de acesso (3º argumento do registerAccessTransaction é o payload)
const observacaoGravada = () => DatabaseService.registerAccessTransaction.mock.calls.at(-1)[2].observacao;

beforeEach(() => {
    jest.clearAllMocks();
    mockValidation.determineSmartAccessType.mockResolvedValue('checkin');
    mockValidation.validateAccessRules.mockResolvedValue({ quotaBypassed: true, cooldown: 0, targetConfidence: 0 });
    DatabaseService.registerAccessTransaction.mockResolvedValue({ success: true });
});

describe('bypass de cota em credenciamento (sem tratamento especial)', () => {
    it('credenciamento com bypass de cota grava a nota de bypass, como qualquer entrada', async () => {
        await checkinService.registrarAcesso({}, acesso({ metodo: 'pulseira', tipo: 'checkin' }));
        expect(DatabaseService.registerAccessTransaction).toHaveBeenCalledTimes(1);
        expect(observacaoGravada()).toBe(BYPASS);
    });

    it('credenciamento sem bypass grava observacao vazia (sem marcador)', async () => {
        mockValidation.validateAccessRules.mockResolvedValue({ quotaBypassed: false, cooldown: 0, targetConfidence: 0 });
        await checkinService.registrarAcesso({}, acesso({ metodo: 'pulseira' }));
        expect(observacaoGravada()).toBeNull();
    });

    it('passagem de leitor com bypass grava a nota de bypass', async () => {
        await checkinService.registrarAcesso({}, acesso({ metodo: 'barcode' }));
        expect(observacaoGravada()).toBe(BYPASS);
    });

    it('passagem sem bypass e sem observação grava null', async () => {
        mockValidation.validateAccessRules.mockResolvedValue({ quotaBypassed: false, cooldown: 0, targetConfidence: 0 });
        await checkinService.registrarAcesso({}, acesso());
        expect(observacaoGravada()).toBeNull();
    });

    it('o contexto da entrada não carrega flag de credenciamento (regra única para todas as entradas)', async () => {
        const ctxs = [];
        mockValidation.validateAccessRules.mockImplementation(async (...args) => { ctxs.push(args[7]); return { quotaBypassed: true }; });
        await checkinService.registrarAcesso({}, acesso({ metodo: 'pulseira' }));
        expect(ctxs[0].entrada).toEqual(expect.objectContaining({ etapa: 'evento', logId: SYNC }));
        expect(ctxs[0].entrada).not.toHaveProperty('credenciamento');
    });
});
