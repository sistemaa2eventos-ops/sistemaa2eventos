'use strict';

/**
 * Botão "Diagnosticar" do leitor: cada problema comum de campo vira um item com estado, detalhe,
 * como corrigir e (quando dá) uma ação de um clique. Nada é alterado no leitor.
 */

let mockPessoas = [];
let mockFilaPendente = 0;

jest.mock('../src/config/supabase', () => ({
    supabase: {
        from: () => {
            const q = { select() { return q; }, eq() { return q; }, in() { return q; },
                then(ok) { return Promise.resolve({ data: [], count: mockFilaPendente, error: null }).then(ok); } };
            return q;
        }
    }
}));
jest.mock('../src/utils/buscarTodos', () => ({ buscarTodos: async () => ({ data: mockPessoas, error: null }) }));
jest.mock('../src/utils/dateUtils', () => ({ getNowLocal: () => '2026-11-19T10:00:00' }));

const { diagnosticarLeitor, segundosLocais, lerTabela } = require('../src/modules/devices/diagnostico.service');

const leitor = (extra = {}) => ({
    id: 'L1', nome: 'Portaria', marca: 'intelbras', ip_address: '192.168.1.52', porta: 80, password_device: 'x',
    area_id: 'A1', evento_id: 'E1', agent_id: 'AG1', last_push_at: new Date().toISOString(), config: {}, ...extra
});

/** Leitor Intelbras falso: hora, modo online e contagem configuráveis */
function leitorFalso({ status = 200, hora = '2026-11-19 10:00:05', online = '1', endereco = 'leitores.nzt.app.br', usuarios = 3, falha = null } = {}) {
    return {
        async _request() {
            if (falha) throw new Error(falha);
            return { status, ok: status === 200, text: `result=${hora}` };
        },
        async _get(caminho, params) {
            if (params.name === 'Intelbras_ModeCfg') return `table.Intelbras_ModeCfg.DeviceMode=${online}\n`;
            return `table.PictureHttpUpload.Enable=true\ntable.PictureHttpUpload.UploadServerList[0].Address=${endereco}\ntable.PictureHttpUpload.UploadServerList[0].Port=80\n`;
        },
        async countUsers() { return usuarios; }
    };
}

const syncFalso = {
    _carregarContextoSync: async () => ({ terminais: [], areasPorPessoa: new Map(), areasPorPulseira: new Map() }),
    _statusSoRemoveDosTerminais: (p) => p.status_acesso === 'recusado',
    _statusSuspendeNosTerminais: (p) => !!p.bloqueado,
    _terminalRemoveBloqueado: () => false,
    _getPessoaAreaIds: async (p) => new Set(p.areas || []),
    _terminalAceitaPessoa: (t, areas) => !t.area_id || areas.has(t.area_id)
};
const agente = (conectado = true) => ({ agents: new Map(conectado ? [['AG1', {}]] : []) });
const porChave = (r) => Object.fromEntries(r.itens.map(i => [i.chave, i]));

beforeEach(() => {
    mockFilaPendente = 0;
    mockPessoas = [
        { id: 'p1', foto_url: 'f', areas: ['A1'] },
        { id: 'p2', foto_url: 'f', areas: ['A1'], bloqueado: true }, // suspenso: conta
        { id: 'p3', foto_url: 'f', areas: ['A1'] },
        { id: 'p4', foto_url: 'f', areas: ['A9'] },                   // outra área: não conta
        { id: 'p5', foto_url: 'f', areas: ['A1'], status_acesso: 'recusado' } // recusado: não conta
    ];
});

test('tudo certo', async () => {
    const r = await diagnosticarLeitor(leitor(), { service: leitorFalso(), agentService: agente(), syncService: syncFalso, naNuvem: true });
    const i = porChave(r);
    expect(r.resumo).toBe('Tudo certo');
    expect(i.pessoas.detalhe).toBe('No leitor: 3 · deveriam estar: 3');
    expect(i.relogio.estado).toBe('ok');
});

test('senha errada: erro com ação de editar, e o resto do leitor fica sem testar', async () => {
    const r = await diagnosticarLeitor(leitor(), { service: leitorFalso({ status: 401 }), agentService: agente(), syncService: syncFalso, naNuvem: true });
    const i = porChave(r);
    expect(i.comunicacao).toMatchObject({ estado: 'erro', acao: 'editar' });
    expect(i.relogio.estado).toBe('nao_testado');
    expect(i.modo_online).toBeUndefined();
});

test('leitor sem resposta (rede/IP): erro explicando o que conferir', async () => {
    const r = await diagnosticarLeitor(leitor(), { service: leitorFalso({ falha: 'Dispositivo indisponível ou rede lenta (Timeout)' }), agentService: agente(), syncService: syncFalso, naNuvem: true });
    expect(porChave(r).comunicacao.estado).toBe('erro');
    expect(porChave(r).comunicacao.como_corrigir).toMatch(/IP/);
});

test('relógio 5 min adiantado: erro com ação de acertar', async () => {
    const r = await diagnosticarLeitor(leitor(), { service: leitorFalso({ hora: '2026-11-19 10:05:00' }), agentService: agente(), syncService: syncFalso, naNuvem: true });
    expect(porChave(r).relogio).toMatchObject({ estado: 'erro', acao: 'acertar_relogio', detalhe: 'Diferença de 300 s adiantado' });
});

test('leitor fora do modo online: erro com ação Config Online', async () => {
    const r = await diagnosticarLeitor(leitor(), { service: leitorFalso({ online: '0' }), agentService: agente(), syncService: syncFalso, naNuvem: true });
    expect(porChave(r).modo_online).toMatchObject({ estado: 'erro', acao: 'config_online' });
});

test('pessoas a mais no leitor: pede Limpar e sincronizar', async () => {
    const r = await diagnosticarLeitor(leitor(), { service: leitorFalso({ usuarios: 40 }), agentService: agente(), syncService: syncFalso, naNuvem: true });
    expect(porChave(r).pessoas).toMatchObject({ estado: 'erro', acao: 'limpar_sincronizar' });
});

test('agente desconectado e leitor sem área: erros e alertas de cadastro', async () => {
    const r = await diagnosticarLeitor(leitor({ area_id: null }), { service: leitorFalso(), agentService: agente(false), syncService: syncFalso, naNuvem: true });
    const i = porChave(r);
    expect(i.agente.estado).toBe('erro');
    expect(i.cadastro).toMatchObject({ estado: 'alerta', acao: 'editar' });
});

test('na nuvem sem agente: erro (a nuvem não alcança a rede do evento)', async () => {
    const r = await diagnosticarLeitor(leitor({ agent_id: null }), { service: leitorFalso(), agentService: agente(), syncService: syncFalso, naNuvem: true });
    expect(porChave(r).agente).toMatchObject({ estado: 'erro', acao: 'editar' });
});

test('Hikvision: avisa suporte limitado e não tenta os testes da Intelbras', async () => {
    const r = await diagnosticarLeitor(leitor({ marca: 'hikvision' }), { service: leitorFalso(), agentService: agente(), syncService: syncFalso, naNuvem: true });
    const i = porChave(r);
    expect(i.suporte.estado).toBe('alerta');
    expect(i.comunicacao).toBeUndefined();
});

test('comandos esperando o leitor: alerta com ação de reprocessar', async () => {
    mockFilaPendente = 4;
    const r = await diagnosticarLeitor(leitor(), { service: leitorFalso(), agentService: agente(), syncService: syncFalso, naNuvem: true });
    expect(porChave(r).fila).toMatchObject({ estado: 'alerta', acao: 'fila' });
});

test('auxiliares: hora local e tabela do configManager', () => {
    expect(segundosLocais('2026-11-19 10:00:30') - segundosLocais('2026-11-19T10:00:00')).toBe(30);
    expect(lerTabela('table.A.B=1\r\ntable.C=x y\n')).toEqual({ 'A.B': '1', C: 'x y' });
});
