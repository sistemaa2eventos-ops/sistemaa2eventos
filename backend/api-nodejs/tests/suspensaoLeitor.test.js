'use strict';

/**
 * Bloqueado/expulso no leitor: pode ser desbloqueado a qualquer momento (com motivo), então FICA no
 * leitor com o rosto, mas SUSPENSO (validade vencida: o leitor nega até o sistema liberar de novo).
 * Regras cobertas:
 *  - bloqueado/expulso em leitor da área dele: suspende (não apaga, não cadastra normal);
 *  - leitor configurado "remover" (config.bloqueado_no_leitor): remove;
 *  - equipamento sem suporte a suspensão (ex.: adaptador Hikvision): remove (mais seguro);
 *  - leitor fora do ar: comando suspend_user vai para a fila do leitor;
 *  - recusado/inativo: sai de todos os leitores;
 *  - desbloqueado: cadastro normal de novo (validade normal);
 *  - Intelbras: suspensão mantém o usuário e grava validade vencida; quem não está no leitor não é criado.
 */

const mockFila = [];
let mockTerminais = [];

jest.mock('../src/config/pgEdge', () => ({ getPgConnection: () => null }));
jest.mock('../src/services/audit.service', () => ({}));
jest.mock('../src/services/storageSeguro', () => ({ ehDoNossoStorage: () => false, baixarArquivo: async () => Buffer.alloc(0), BUCKETS_FOTO: [] }));
jest.mock('../src/utils/imageProcessor', () => ({ optimizeToBase64: async () => 'FOTO' }));
jest.mock('../src/services/logger', () => ({ info: () => {}, warn: () => {}, debug: () => {}, error: () => {} }));
jest.mock('../src/config/supabase', () => ({
    supabase: {
        from: (tabela) => {
            const q = {
                select() { return q; }, eq() { return q; }, in() { return q; }, delete() { return q; },
                single: async () => ({ data: { evento_id: 'E1' } }),
                maybeSingle: async () => ({ data: null }),
                insert: async (linha) => { mockFila.push(linha); return { error: null }; },
                then(ok) { return Promise.resolve({ data: tabela === 'dispositivos_acesso' ? mockTerminais : [], error: null }).then(ok); }
            };
            return q;
        }
    }
}));

// Equipamentos falsos: um que suspende (como a Intelbras) e um sem suporte (como o adaptador Hikvision)
const mockChamadas = [];
jest.mock('../src/modules/devices/adapters/DeviceFactory', () => {
    const AccessDevice = jest.requireActual('../src/modules/devices/adapters/AccessDevice');
    class ComSuspensao extends AccessDevice {
        async enrollUser(p) { mockChamadas.push(`enroll:${this.config.nome}`); }
        async deleteUser(id) { mockChamadas.push(`delete:${this.config.nome}`); }
        async suspendUser(p) { mockChamadas.push(`suspend:${this.config.nome}`); return true; }
    }
    class SemSuspensao extends AccessDevice {
        async enrollUser(p) { mockChamadas.push(`enroll:${this.config.nome}`); }
        async deleteUser(id) { mockChamadas.push(`delete:${this.config.nome}`); }
    }
    return { getDevice: (t) => (t.marca === 'semSuspensao' ? new SemSuspensao(t) : new ComSuspensao(t)) };
});

const syncService = require('../src/modules/devices/sync.service');

const terminal = (nome, extra = {}) => ({ id: nome, nome, area_id: 'A1', status_online: 'online', marca: 'intelbras', config: {}, ...extra });
const pessoa = (extra = {}) => ({ id: 'p1', cpf: '11111111111', nome_completo: 'Fulano', evento_id: 'E1', foto_url: 'https://x/foto.jpg', status_acesso: 'autorizado', bloqueado: false, ativo: true, areas_autorizadas: ['A1'], ...extra });
const unicas = (lista) => [...new Set(lista)]; // remoção tenta os 2 ids de hardware (CPF e UUID)

beforeEach(() => { mockChamadas.length = 0; mockFila.length = 0; });

test('expulso no leitor da área dele: suspende, não apaga nem cadastra normal', async () => {
    mockTerminais = [terminal('Portaria')];
    const r = await syncService.syncUserToAllDevices(pessoa({ status_acesso: 'expulso', bloqueado: true }), { terminais: mockTerminais, areasPorPessoa: new Map(), areasPorPulseira: new Map() });
    expect(mockChamadas).toEqual(['suspend:Portaria']);
    expect(r.suspensos).toEqual(['Portaria']);
});

test('bloqueado: leitor de outra área continua sem a pessoa', async () => {
    mockTerminais = [terminal('Portaria'), terminal('Camarim', { area_id: 'A9' })];
    await syncService.syncUserToAllDevices(pessoa({ bloqueado: true }), { terminais: mockTerminais, areasPorPessoa: new Map(), areasPorPulseira: new Map() });
    expect(unicas(mockChamadas).sort()).toEqual(['delete:Camarim', 'suspend:Portaria']);
});

test('empresa bloqueada: funcionário fica suspenso no leitor', async () => {
    mockTerminais = [terminal('Portaria')];
    const r = await syncService.syncUserToAllDevices(pessoa({ empresas: { ativo: false } }), { terminais: mockTerminais, areasPorPessoa: new Map(), areasPorPulseira: new Map() });
    expect(mockChamadas).toEqual(['suspend:Portaria']);
    expect(r.suspensos).toEqual(['Portaria']);
});

test('empresa ativa ou sem empresa: não suspende', () => {
    expect(syncService._statusSuspendeNosTerminais(pessoa({ empresas: { ativo: true } }))).toBe(false);
    expect(syncService._statusSuspendeNosTerminais(pessoa({ empresas: null }))).toBe(false);
    expect(syncService._statusSuspendeNosTerminais(pessoa({ empresas: [{ ativo: false }] }))).toBe(true);
    // recusado continua saindo do leitor mesmo com a empresa bloqueada
    expect(syncService._statusSuspendeNosTerminais(pessoa({ status_acesso: 'recusado', empresas: { ativo: false } }))).toBe(false);
});

test('leitor esvaziado (fim do evento): não recebe cadastro nem suspensão', async () => {
    mockTerminais = [terminal('Portaria', { config: { esvaziado_em: '2026-11-19T20:00:00Z' } }), terminal('Camarim')];
    await syncService.syncUserToAllDevices(pessoa({ foto_url: 'data:image/jpeg;base64,/9j/AAAA' }), { terminais: mockTerminais, areasPorPessoa: new Map(), areasPorPulseira: new Map() });
    expect(mockChamadas).toEqual(['enroll:Camarim']);
    mockChamadas.length = 0;
    await syncService.syncUserToAllDevices(pessoa({ bloqueado: true }), { terminais: [mockTerminais[0]], areasPorPessoa: new Map(), areasPorPulseira: new Map() });
    expect(mockChamadas).toEqual([]);
    expect(mockFila).toEqual([]);
});

test('leitor configurado para remover bloqueados: remove', async () => {
    mockTerminais = [terminal('Portaria', { config: { bloqueado_no_leitor: 'remover' } })];
    await syncService.syncUserToAllDevices(pessoa({ bloqueado: true }), { terminais: mockTerminais, areasPorPessoa: new Map(), areasPorPulseira: new Map() });
    expect(unicas(mockChamadas)).toEqual(['delete:Portaria']);
});

test('equipamento sem suporte à suspensão: remove (mais seguro)', async () => {
    mockTerminais = [terminal('Hik', { marca: 'semSuspensao' })];
    const r = await syncService.syncUserToAllDevices(pessoa({ status_acesso: 'bloqueado' }), { terminais: mockTerminais, areasPorPessoa: new Map(), areasPorPulseira: new Map() });
    expect(unicas(mockChamadas)).toEqual(['delete:Hik']);
    expect(r.removidos).toEqual(['Hik']);
});

test('leitor fora do ar: suspensão vai para a fila do leitor', async () => {
    mockTerminais = [terminal('Portaria', { status_online: 'offline' })];
    await syncService.syncUserToAllDevices(pessoa({ bloqueado: true }), { terminais: mockTerminais, areasPorPessoa: new Map(), areasPorPulseira: new Map() });
    expect(mockChamadas).toEqual([]);
    expect(mockFila.map(l => l.tipo_comando)).toEqual(['suspend_user']);
});

test('desbloqueado: cadastro normal de novo', async () => {
    mockTerminais = [terminal('Portaria')];
    // Foto embutida: o sistema só baixa fotos do próprio armazenamento
    await syncService.syncUserToAllDevices(pessoa({ foto_url: 'data:image/jpeg;base64,/9j/AAAA' }), { terminais: mockTerminais, areasPorPessoa: new Map(), areasPorPulseira: new Map() });
    expect(mockChamadas).toEqual(['enroll:Portaria']);
});

test('recusado e inativo: não suspendem, saem do leitor', () => {
    expect(syncService._statusSoRemoveDosTerminais(pessoa({ status_acesso: 'recusado' }))).toBe(true);
    expect(syncService._statusSoRemoveDosTerminais(pessoa({ ativo: false, bloqueado: true }))).toBe(true);
    expect(syncService._statusSuspendeNosTerminais(pessoa({ ativo: false, bloqueado: true }))).toBe(false);
    expect(syncService._statusSuspendeNosTerminais(pessoa({ status_acesso: 'expulso' }))).toBe(true);
    expect(syncService._statusSuspendeNosTerminais(pessoa())).toBe(false);
});

describe('Intelbras', () => {
    const IntelbrasService = jest.requireActual('../src/modules/devices/intelbras.service');
    const novo = () => new IntelbrasService({ ip_address: '10.0.0.1', porta: 80, user_device: 'u', password_device: 'p', id: 'leitor-teste' });

    test('suspensão mantém o usuário e grava a validade vencida (rosto não é tocado)', async () => {
        const s = novo();
        s._userExists = async () => true;
        const posts = [];
        s._postJson = async (caminho, params, dados) => { posts.push({ caminho, params, dados }); };
        expect(await s.suspendUser(pessoa())).toBe(true);
        expect(posts).toHaveLength(1);
        expect(posts[0].caminho).toBe('/cgi-bin/AccessUser.cgi');
        expect(posts[0].params).toEqual({ action: 'updateMulti' });
        expect(posts[0].dados.UserList[0]).toMatchObject({ UserID: '11111111111', ValidTo: '2000-01-01 00:00:01' });
    });

    test('quem não está no leitor não é criado (não há o que negar)', async () => {
        const s = novo();
        s._userExists = async () => false;
        s._postJson = async () => { throw new Error('não devia chamar'); };
        expect(await s.suspendUser(pessoa())).toBe(false);
    });

    test('cadastro normal grava a validade normal (desfaz a suspensão)', () => {
        expect(IntelbrasService.registroUsuario('1', 'X', false).ValidTo).toBe('2037-12-31 23:59:59');
    });
});
