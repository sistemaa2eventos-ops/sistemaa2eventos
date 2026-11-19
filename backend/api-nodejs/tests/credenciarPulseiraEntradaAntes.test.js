/**
 * M5: credenciar pulseira checa a regra de entrada ANTES de gravar qualquer coisa.
 * - pessoa DENTRO na etapa/dia/área → 409 ENTRADA_BLOQUEADA (liberavel false), sem gravar pulseira, áreas
 *   nem ajuste de lote, e sem registrar a passagem;
 * - pessoa que SAIU sem liberação → 409 liberavel true, também sem gravar nada;
 * - pessoa livre → grava pulseira, áreas e a entrada (fluxo normal).
 * Supabase simulado: cada gravação (update, upsert, rpc) fica registrada em mockEstado.gravacoes.
 * Nada é gravado de verdade.
 */

const mockEstado = {
    pessoa: null, tipo: null, ultimoLog: null, liberacao: null,
    gravacoes: []
};

// Cliente simulado: leituras devolvem a linha configurada; escritas são só registradas
function mockCriarCliente() {
    const linhaDe = (tabela) => {
        if (tabela === 'pessoas') return mockEstado.pessoa ? { ...mockEstado.pessoa } : null;
        if (tabela === 'evento_tipos_pulseira') return mockEstado.tipo ? { ...mockEstado.tipo } : null;
        if (tabela === 'logs_acesso') return mockEstado.ultimoLog ? { ...mockEstado.ultimoLog } : null;
        if (tabela === 'liberacoes_reentrada') return mockEstado.liberacao ? { ...mockEstado.liberacao } : null;
        return null;
    };
    return {
        from: (tabela) => {
            const q = {};
            for (const m of ['select', 'eq', 'neq', 'in', 'is', 'order', 'limit', 'gt']) q[m] = () => q;
            q.single = async () => ({ data: linhaDe(tabela), error: null });
            q.maybeSingle = async () => ({ data: linhaDe(tabela), error: null });
            q.update = (dados) => { mockEstado.gravacoes.push({ tabela, op: 'update', dados }); return q; };
            q.upsert = (dados) => { mockEstado.gravacoes.push({ tabela, op: 'upsert', dados }); return q; };
            q.insert = (dados) => { mockEstado.gravacoes.push({ tabela, op: 'insert', dados }); return q; };
            q.then = (ok, ko) => Promise.resolve({ data: null, error: null }).then(ok, ko);
            return q;
        },
        rpc: async (nome, args) => {
            mockEstado.gravacoes.push({ tabela: 'rpc', op: nome, dados: args });
            return { error: null };
        }
    };
}

jest.mock('../src/config/supabase', () => ({ supabase: mockCriarCliente() }));
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
    escolherLote: jest.fn(async () => ({ lote: null }))
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
const pulseiraService = require('../src/modules/pulseiras/pulseira.service');
const controller = require('../src/modules/checkin/checkin.controller');

const PESSOA = {
    id: 'p1', evento_id: 'e1', nome_completo: 'Maria Silva', cpf: '52998224725',
    status_acesso: 'autorizado', numero_pulseira: null, tipo_pulseira_id: null, empresas: null
};
// Lote de montagem com uma área liberada (a área é o que NÃO pode ser gravada quando a pessoa está dentro)
const TIPO = {
    id: 'tp1', nome_tipo: 'Montagem', cor_hex: '#ffffff', alerta_duplicidade: false, fase: 'montagem',
    pulseira_areas_permitidas: [{ area_id: 'a1', evento_areas: { nome_area: 'Palco' } }]
};

const resposta = () => {
    const res = {};
    res.status = jest.fn(() => res);
    res.json = jest.fn(() => res);
    return res;
};
const requisicao = () => ({
    body: { pessoa_id: 'p1', numero_pulseira: '1234', tipo_pulseira_id: 'tp1' },
    event: { id: 'e1' },
    user: { id: 'op1' },
    supabase: mockCriarCliente()
});

const gravouPulseiraOuArea = () => mockEstado.gravacoes.some(g =>
    (g.tabela === 'pessoas' && g.op === 'update')
    || (g.tabela === 'pessoa_areas_acesso' && g.op === 'upsert')
    || (g.tabela === 'rpc' && g.op === 'ajustar_areas_pulseira'));

beforeEach(() => {
    jest.clearAllMocks();
    mockEstado.pessoa = { ...PESSOA };
    mockEstado.tipo = { ...TIPO };
    mockEstado.ultimoLog = null;
    mockEstado.liberacao = null;
    mockEstado.gravacoes = [];
    DatabaseService.registerAccessTransaction.mockResolvedValue({ success: true });
});

describe('pessoa DENTRO na etapa/dia/área', () => {
    beforeEach(() => {
        // último registro da etapa é uma entrada: a pessoa ainda está dentro
        mockEstado.ultimoLog = { id: 'log-antigo', tipo: 'checkin', created_at: '2026-11-19T12:00:00Z' };
    });

    it('responde 409 ENTRADA_BLOQUEADA (não liberável) com a etapa no corpo', async () => {
        const res = resposta();
        await controller.credenciarPulseira(requisicao(), res);

        expect(res.status).toHaveBeenCalledWith(409);
        const corpo = res.json.mock.calls[0][0];
        expect(corpo.success).toBe(false);
        expect(corpo.codigo).toBe('ENTRADA_BLOQUEADA');
        expect(corpo.liberavel).toBe(false);
        expect(corpo.etapa).toBe('montagem');
        expect(corpo.error).toMatch(/já está dentro/);
    });

    it('não grava pulseira, áreas nem ajuste de lote, não entrega a pulseira e não registra passagem', async () => {
        await controller.credenciarPulseira(requisicao(), resposta());

        expect(gravouPulseiraOuArea()).toBe(false);
        expect(mockEstado.gravacoes).toEqual([]);
        expect(pulseiraService.registrarEntrega).not.toHaveBeenCalled();
        expect(DatabaseService.registerAccessTransaction).not.toHaveBeenCalled();
    });
});

describe('pessoa que SAIU sem liberação de reentrada', () => {
    it('responde 409 com liberavel true e não grava nada', async () => {
        mockEstado.ultimoLog = { id: 'log-saida', tipo: 'checkout', created_at: '2026-11-19T12:00:00Z' };
        mockEstado.liberacao = null; // sem liberação posterior à saída

        const res = resposta();
        await controller.credenciarPulseira(requisicao(), res);

        expect(res.status).toHaveBeenCalledWith(409);
        const corpo = res.json.mock.calls[0][0];
        expect(corpo.codigo).toBe('ENTRADA_BLOQUEADA');
        expect(corpo.liberavel).toBe(true);
        expect(corpo.etapa).toBe('montagem');
        expect(gravouPulseiraOuArea()).toBe(false);
        expect(DatabaseService.registerAccessTransaction).not.toHaveBeenCalled();
    });
});

describe('pessoa livre (fluxo normal, não muda)', () => {
    it('grava pulseira, áreas e ajuste de lote, entrega a pulseira e registra a entrada na etapa do lote', async () => {
        mockEstado.ultimoLog = null;

        const res = resposta();
        await controller.credenciarPulseira(requisicao(), res);

        expect(res.status).toHaveBeenCalledWith(200);
        expect(mockEstado.gravacoes).toEqual(expect.arrayContaining([
            expect.objectContaining({ tabela: 'pessoas', op: 'update', dados: expect.objectContaining({ numero_pulseira: '1234' }) }),
            expect.objectContaining({ tabela: 'pessoa_areas_acesso', op: 'upsert' }),
            expect.objectContaining({ tabela: 'rpc', op: 'ajustar_areas_pulseira' })
        ]));
        expect(pulseiraService.registrarEntrega).toHaveBeenCalledTimes(1);
        expect(DatabaseService.registerAccessTransaction).toHaveBeenCalledTimes(1);
        expect(DatabaseService.registerAccessTransaction.mock.calls[0][2]).toEqual(expect.objectContaining({ tipo: 'checkin', etapa: 'montagem' }));
    });
});
