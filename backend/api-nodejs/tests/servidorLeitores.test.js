'use strict';

/**
 * Endereço que os leitores usam para chamar o servidor, salvo no painel por evento (+ padrão geral).
 */

let mockConfig = {};
jest.mock('../src/config/supabase', () => ({
    supabase: {
        from: () => {
            const q = {
                select() { return q; }, eq() { return q; },
                maybeSingle: async () => ({ data: { config: mockConfig }, error: null }),
                update(v) { mockConfig = v.config; return { eq: async () => ({ error: null }) }; }
            };
            return q;
        }
    }
}));

const svc = require('../src/modules/devices/servidorLeitores.service');

beforeEach(() => {
    mockConfig = { ia_facial: { perfil: 'x' } };
    delete process.env.HARDWARE_CALLBACK_HOST;
    delete process.env.HARDWARE_CALLBACK_PORT;
    delete process.env.SERVER_IP;
    delete process.env.SERVER_PORT;
});

test('aceita IP, domínio, host:porta e URL', () => {
    expect(svc.validarEndereco({ host: '192.168.1.129', porta: '3001' }).valor).toEqual({ host: '192.168.1.129', porta: 3001 });
    expect(svc.validarEndereco({ host: 'leitores.nzt.app.br', porta: 80 }).valor).toEqual({ host: 'leitores.nzt.app.br', porta: 80 });
    expect(svc.validarEndereco({ host: '10.0.0.5:3001' }).valor).toEqual({ host: '10.0.0.5', porta: 3001 });
    expect(svc.validarEndereco({ host: 'https://leitores.nzt.app.br' }).valor).toEqual({ host: 'leitores.nzt.app.br', porta: 443 });
    expect(svc.validarEndereco({ host: '  ', porta: '' }).valor).toBeNull();
});

test('recusa caminho, espaço e porta fora da faixa', () => {
    expect(svc.validarEndereco({ host: 'x.com/api' }).erro).toBeTruthy();
    expect(svc.validarEndereco({ host: 'meu servidor' }).erro).toBeTruthy();
    expect(svc.validarEndereco({ host: '1.2.3.4', porta: 70000 }).erro).toBeTruthy();
    expect(svc.validarEndereco({ host: '1.2.3.4', porta: 0 }).erro).toBeTruthy();
});

test('evento > padrão > .env, e salvar não apaga o resto da configuração', async () => {
    process.env.HARDWARE_CALLBACK_HOST = '192.168.1.1';
    process.env.HARDWARE_CALLBACK_PORT = '3001';
    let r = await svc.obter('E1');
    expect(r.origem).toBe('servidor');
    expect(await svc.enderecoPara('E1')).toBeNull(); // sem nada salvo: a regra antiga (.env) decide

    r = await svc.salvar('E1', { padrao: { host: 'leitores.nzt.app.br', porta: 80 } });
    expect(r.origem).toBe('padrao');
    r = await svc.salvar('E1', { evento: { host: '192.168.0.50', porta: 3001 } });
    expect(r.origem).toBe('evento');
    expect(await svc.enderecoPara('E1')).toEqual({ host: '192.168.0.50', porta: 3001 });
    expect(await svc.enderecoPara('E2')).toEqual({ host: 'leitores.nzt.app.br', porta: 80 });
    expect(mockConfig.ia_facial).toEqual({ perfil: 'x' });

    // Host em branco apaga o do evento (volta ao padrão)
    r = await svc.salvar('E1', { evento: { host: '' } });
    expect(r.origem).toBe('padrao');
});

test('endereço inválido não é gravado', async () => {
    await expect(svc.salvar('E1', { evento: { host: 'a b' } })).rejects.toMatchObject({ status: 400 });
    expect(mockConfig.leitores_servidor).toBeUndefined();
});
