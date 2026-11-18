/**
 * Remoção de pessoas do índice do motor de IA (POST /api/rostos com "remover").
 * Vai direto (PYTHON_MICROSERVICE_URL) e pelos agentes conectados; nunca lança erro.
 */
jest.mock('../src/services/logger', () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() }));
jest.mock('axios', () => ({ post: jest.fn(async () => ({ data: { success: true } })) }));
jest.mock('../src/services/agentService', () => ({
    agents: new Map(),
    sendCommand: jest.fn(async () => ({ ok: true, status: 200, json: { success: true } }))
}));

const axios = require('axios');
const agentService = require('../src/services/agentService');
const { removerPessoasDoMotor } = require('../src/services/motorIa');

const envOriginal = { ...process.env };

beforeEach(() => {
    process.env = { ...envOriginal };
    delete process.env.PYTHON_MICROSERVICE_URL;
    delete process.env.IA_CHAVE_INTERNA;
    process.env.NODE_ENV = 'test';
    axios.post.mockClear();
    agentService.sendCommand.mockClear();
    agentService.agents.clear();
});

afterAll(() => { process.env = envOriginal; });

it('envia remover com a lista de ids, sem pessoas, pela URL direta com X-IA-Chave', async () => {
    process.env.PYTHON_MICROSERVICE_URL = 'http://motor.local:8000';
    process.env.IA_CHAVE_INTERNA = 'chave-interna-de-teste';
    const r = await removerPessoasDoMotor(['p1', 'p1', 'p2']);
    expect(axios.post).toHaveBeenCalledWith(
        'http://motor.local:8000/api/rostos',
        { pessoas: [], remover: ['p1', 'p2'] },
        expect.objectContaining({ headers: { 'X-IA-Chave': 'chave-interna-de-teste' } })
    );
    expect(r).toEqual({ enviados: 1, falhas: 0 });
});

it('manda ia_post /api/rostos para cada agente conectado', async () => {
    process.env.NODE_ENV = 'production'; // sem motor direto: só os agentes
    agentService.agents.set('ag1', {});
    agentService.agents.set('ag2', {});
    const r = await removerPessoasDoMotor(['p9']);
    expect(agentService.sendCommand).toHaveBeenCalledTimes(2);
    expect(agentService.sendCommand.mock.calls[0][1]).toBe('ia_post');
    expect(agentService.sendCommand.mock.calls[0][2]).toMatchObject({ path: '/api/rostos', body: { pessoas: [], remover: ['p9'] } });
    expect(r).toEqual({ enviados: 2, falhas: 0 });
});

it('conta falha de agente e de envio direto sem lançar erro', async () => {
    process.env.PYTHON_MICROSERVICE_URL = 'http://motor.local:8000';
    axios.post.mockImplementationOnce(async () => { throw new Error('ECONNREFUSED'); });
    agentService.agents.set('ag1', {});
    agentService.sendCommand.mockImplementationOnce(async () => { throw new Error('Agente não está conectado'); });
    const r = await removerPessoasDoMotor(['p1']);
    expect(r).toEqual({ enviados: 0, falhas: 2 });
});

it('sem ids ou sem motor alcançável, não envia nada', async () => {
    expect(await removerPessoasDoMotor([])).toEqual({ enviados: 0, falhas: 0 });
    process.env.NODE_ENV = 'production';
    expect(await removerPessoasDoMotor(['p1'])).toEqual({ enviados: 0, falhas: 0 });
    expect(axios.post).not.toHaveBeenCalled();
});
