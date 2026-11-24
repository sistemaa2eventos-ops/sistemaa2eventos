/**
 * B8: o 409 de bloqueio de entrada leva a etapa bloqueada no corpo da resposta (campo etapa no topo e em details),
 * para a liberação do controlador usar a etapa certa.
 * - checkin.service.registrarAcesso devolve detalhes.etapa (regra de entrada real, com banco simulado);
 * - ApiResponse.error copia etapa para o topo do corpo.
 * Supabase, validação, fila e websocket simulados: nada é gravado de verdade.
 */

const mockEstado = { ultimoLog: null, liberacao: null };

jest.mock('../src/config/supabase', () => {
    const linhaDe = (tabela) => {
        if (tabela === 'logs_acesso') return mockEstado.ultimoLog ? { ...mockEstado.ultimoLog } : null;
        if (tabela === 'liberacoes_reentrada') return mockEstado.liberacao ? { ...mockEstado.liberacao } : null;
        return null;
    };
    return {
        supabase: {
            from: (tabela) => {
                const filtros = {};
                const q = {};
                for (const m of ['select', 'neq', 'in', 'is', 'order', 'limit', 'gt']) q[m] = () => q;
                q.eq = (coluna, valor) => { filtros[coluna] = valor; return q; };
                // Consulta por id (reenvio): só acha a linha com esse id, como o banco faria
                const achar = () => {
                    const linha = linhaDe(tabela);
                    if (filtros.id !== undefined && (!linha || linha.id !== filtros.id)) return null;
                    return linha;
                };
                q.maybeSingle = async () => ({ data: achar(), error: null });
                q.single = async () => ({ data: achar(), error: null });
                q.then = (ok, ko) => Promise.resolve({ data: null, error: null }).then(ok, ko);
                return q;
            },
            rpc: async () => ({ error: null })
        }
    };
});
jest.mock('../src/services/logger', () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() }));
jest.mock('../src/services/websocketService', () => ({ emit: jest.fn() }));
jest.mock('../src/services/cacheService', () => ({ invalidatePessoa: jest.fn() }));
jest.mock('../src/modules/system/watchlist.service', () => ({ verificarCPF: jest.fn(async () => null) }));
jest.mock('../src/modules/checkin/services/validation.service', () => ({
    determineSmartAccessType: jest.fn(async () => 'checkin'),
    validateAccessRules: jest.fn(),
    ultimoLogPessoa: jest.fn(async () => null)
}));
jest.mock('../src/modules/checkin/services/database.service', () => ({
    registerAccessTransaction: jest.fn(async () => ({ success: true })),
    logDeniedAccess: jest.fn(async () => {})
}));

const ValidationService = require('../src/modules/checkin/services/validation.service');
const { bloqueioDeEntrada } = require('../src/modules/checkin/services/entradaEtapa');
const checkinService = require('../src/modules/checkin/checkin.service');
const ApiResponse = require('../src/utils/apiResponse');
const { supabase } = require('../src/config/supabase');

const PESSOA = { id: 'p1', evento_id: 'e1', nome_completo: 'Maria Silva', cpf: '52998224725', status_acesso: 'autorizado', empresas: null };

const resposta = () => {
    const res = {};
    res.status = jest.fn(() => res);
    res.json = jest.fn(() => res);
    return res;
};

// A validação lança o mesmo 409 que a regra de entrada real lançaria (banco simulado acima)
const lancarBloqueio = () => {
    ValidationService.validateAccessRules.mockImplementation(async (eventoId, pessoa, tipo, metodo, timestamp, confianca, areaId, ctx) => {
        const erro = await bloqueioDeEntrada(supabase, { evento_id: eventoId, pessoa_id: pessoa.id, ...ctx.entrada });
        if (erro) throw erro;
    });
};

// Área de portão (controla entrada). A área geral (area_id nulo) é livre desde a 20261119f: ver o teste no fim
const AREA_PORTAO = 'area-portao';
const acesso = (area_id = AREA_PORTAO) => ({
    pessoa_id: 'p1', pessoa: { ...PESSOA }, evento_id: 'e1', metodo: 'pulseira', dispositivo_id: 'web-dashboard',
    created_by: 'op1', area_id, etapa: 'montagem', tipo: 'checkin'
});

beforeEach(() => {
    jest.clearAllMocks();
    mockEstado.ultimoLog = null;
    mockEstado.liberacao = null;
});

describe('checkin.service.registrarAcesso devolve a etapa no 409', () => {
    it('pessoa dentro: detalhes com codigo, liberavel false e etapa', async () => {
        mockEstado.ultimoLog = { id: 'log-antigo', tipo: 'checkin', created_at: '2026-11-19T12:00:00Z' };
        lancarBloqueio();

        const r = await checkinService.registrarAcesso(supabase, acesso());

        expect(r.status).toBe(409);
        expect(r.detalhes).toEqual({ codigo: 'ENTRADA_BLOQUEADA', liberavel: false, etapa: 'montagem' });
    });

    it('saiu sem liberação: liberavel true e a mesma etapa', async () => {
        mockEstado.ultimoLog = { id: 'log-saida', tipo: 'checkout', created_at: '2026-11-19T12:00:00Z' };
        lancarBloqueio();

        const r = await checkinService.registrarAcesso(supabase, acesso());

        expect(r.status).toBe(409);
        expect(r.detalhes).toEqual({ codigo: 'ENTRADA_BLOQUEADA', liberavel: true, etapa: 'montagem' });
    });
});

describe('área geral (sem área) é livre: pessoa dentro não recebe 409 (20261119f)', () => {
    it('pessoa dentro na área geral: a entrada não é bloqueada', async () => {
        mockEstado.ultimoLog = { id: 'log-antigo', tipo: 'checkin', created_at: '2026-11-19T12:00:00Z' };
        lancarBloqueio();

        const r = await checkinService.registrarAcesso(supabase, acesso(null));

        expect(r.detalhes?.codigo).not.toBe('ENTRADA_BLOQUEADA');
        expect(r.status).not.toBe(409);
    });
});

describe('ApiResponse.error leva a etapa para o topo do corpo', () => {
    it('etapa aparece no topo e em details (junto de codigo e liberavel)', async () => {
        mockEstado.ultimoLog = { id: 'log-antigo', tipo: 'checkin', created_at: '2026-11-19T12:00:00Z' };
        lancarBloqueio();
        const r = await checkinService.registrarAcesso(supabase, acesso());

        const res = resposta();
        ApiResponse.error(res, r.error, r.status, r.detalhes);

        expect(res.status).toHaveBeenCalledWith(409);
        const corpo = res.json.mock.calls[0][0];
        expect(corpo.codigo).toBe('ENTRADA_BLOQUEADA');
        expect(corpo.liberavel).toBe(false);
        expect(corpo.etapa).toBe('montagem');
        expect(corpo.details.etapa).toBe('montagem');
    });

    it('erro sem bloqueio não ganha etapa no corpo', () => {
        const res = resposta();
        ApiResponse.error(res, 'Pulseira inválida', 400, null);
        const corpo = res.json.mock.calls[0][0];
        expect(corpo).not.toHaveProperty('etapa');
        expect(corpo).not.toHaveProperty('codigo');
    });
});
