/**
 * Credenciamento é passagem comum: entrega sem pulseira e entrega com pulseira gravam checkin com a observacao
 * CREDENCIAMENTO, que é só informação (nenhuma regra lê o texto; ver acessosRecusados.test.js). Sem tratamento
 * especial: entram no toggle, na entrada única e nas contagens como qualquer entrada.
 * A origem também fica no metodo ('manual' sem pulseira, 'pulseira' com pulseira).
 * Supabase, validação e persistência simulados: nada é gravado de verdade.
 */

jest.mock('../src/config/supabase', () => ({
    // Cliente de serviço: a checagem de entrada (pré-checagem do credenciamento) lê logs_acesso e não acha passagem
    supabase: {
        from: () => {
            const q = {};
            for (const m of ['select', 'eq', 'neq', 'in', 'is', 'order', 'limit']) q[m] = () => q;
            q.maybeSingle = async () => ({ data: null, error: null });
            q.then = (ok, ko) => Promise.resolve({ data: [], error: null }).then(ok, ko);
            return q;
        },
        rpc: jest.fn(async () => ({ error: null }))
    }
}));
jest.mock('../src/services/logger', () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() }));
jest.mock('../src/services/websocketService', () => ({ emit: jest.fn() }));
jest.mock('../src/services/cacheService', () => ({ invalidatePessoa: jest.fn() }));
jest.mock('../src/services/webhookDispatcher', () => ({ dispatchCheckin: jest.fn() }));
jest.mock('../src/modules/system/watchlist.service', () => ({ verificarCPF: jest.fn(async () => null), registrarAlerta: jest.fn(async () => {}) }));
jest.mock('../src/modules/pulseiras/pulseira.service', () => ({
    numeroBloqueado: jest.fn(async () => null),
    registrarEntrega: jest.fn()
}));
jest.mock('../src/modules/pulseiras/loteSelecao', () => ({
    buscarLotesDaFaixa: jest.fn(async () => []),
    escolherLote: jest.fn(async () => ({
        lote: { id: 'tp-montagem', nome_tipo: 'Montagem', cor_hex: '#ffffff', alerta_duplicidade: false, fase: 'montagem', pulseira_areas_permitidas: [] }
    }))
}));
jest.mock('../src/modules/checkin/codigoLeitor', () => ({ buscarPessoaPorCodigo: jest.fn() }));
jest.mock('../src/modules/checkin/services/validation.service', () => ({
    determineSmartAccessType: jest.fn(async () => 'checkin'),
    validateAccessRules: jest.fn(async () => ({ quotaBypassed: false, cooldown: 0, targetConfidence: 0 })),
    ultimoLogPessoa: jest.fn(async () => null)
}));
jest.mock('../src/modules/checkin/services/database.service', () => ({
    registerAccessTransaction: jest.fn(async () => ({ success: true })),
    logDeniedAccess: jest.fn(async () => {})
}));

const DatabaseService = require('../src/modules/checkin/services/database.service');
const controller = require('../src/modules/checkin/checkin.controller');

const PESSOA = {
    id: 'p1', evento_id: 'e1', nome_completo: 'Maria Silva', cpf: '52998224725',
    status_acesso: 'autorizado', numero_pulseira: null, tipo_pulseira_id: null, empresas: null
};

// Cliente do Supabase: qualquer encadeamento devolve a própria consulta; single/maybeSingle devolvem a pessoa;
// await sem single devolve erro nulo (gravações)
const clienteComPessoa = () => {
    const consulta = () => {
        const q = {};
        for (const metodo of ['select', 'eq', 'neq', 'in', 'is', 'or', 'order', 'limit', 'update', 'upsert']) q[metodo] = () => q;
        q.single = async () => ({ data: { ...PESSOA }, error: null });
        q.maybeSingle = async () => ({ data: { ...PESSOA }, error: null });
        q.then = (ok, ko) => Promise.resolve({ data: null, error: null }).then(ok, ko);
        return q;
    };
    return { from: () => consulta() };
};

const resposta = () => {
    const res = {};
    res.status = jest.fn(() => res);
    res.json = jest.fn(() => res);
    return res;
};

const requisicao = (body = {}) => ({
    body: { pessoa_id: 'p1', numero_pulseira: '', ...body },
    event: { id: 'e1' },
    user: { id: 'op1' },
    supabase: clienteComPessoa()
});

const payloadGravado = () => DatabaseService.registerAccessTransaction.mock.calls.at(-1)[2];

beforeEach(() => {
    jest.clearAllMocks();
    DatabaseService.registerAccessTransaction.mockResolvedValue({ success: true });
});

describe('credenciamento sem pulseira (passagem comum)', () => {
    it('grava checkin pelo método manual, com a observacao CREDENCIAMENTO (informativa)', async () => {
        const res = resposta();
        await controller.credenciarPulseira(requisicao(), res);

        expect(DatabaseService.registerAccessTransaction).toHaveBeenCalledTimes(1);
        expect(payloadGravado()).toEqual(expect.objectContaining({ tipo: 'checkin', evento_id: 'e1', pessoa_id: 'p1', metodo: 'manual' }));
        expect(payloadGravado().observacao).toBe('CREDENCIAMENTO');
        expect(res.status).toHaveBeenCalledWith(200);
    });

    it('sem número de pulseira (nulo ou em branco) também grava checkin comum', async () => {
        for (const numero_pulseira of [undefined, null, '   ']) {
            DatabaseService.registerAccessTransaction.mockClear();
            await controller.credenciarPulseira(requisicao({ numero_pulseira }), resposta());
            expect(payloadGravado().tipo).toBe('checkin');
            expect(payloadGravado().observacao).toBe('CREDENCIAMENTO');
        }
    });
});

describe('credenciamento com pulseira (entrada comum pelo lote)', () => {
    it('grava checkin pelo método pulseira, na etapa do lote, com a observacao CREDENCIAMENTO', async () => {
        const res = resposta();
        await controller.credenciarPulseira(requisicao({ numero_pulseira: '1234' }), res);

        expect(DatabaseService.registerAccessTransaction).toHaveBeenCalledTimes(1);
        expect(payloadGravado()).toEqual(expect.objectContaining({ tipo: 'checkin', metodo: 'pulseira', etapa: 'montagem' }));
        expect(payloadGravado().observacao).toBe('CREDENCIAMENTO');
        expect(res.status).toHaveBeenCalledWith(200);
    });
});
