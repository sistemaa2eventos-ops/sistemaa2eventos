/**
 * Validação de ambiente: em produção, JWT_SECRET é obrigatório (e não pode ser o valor de desenvolvimento);
 * fora de produção, o comportamento segue como antes. Sem senha padrão para o leitor Intelbras.
 */
jest.mock('../src/services/logger', () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() }));

const { validateEnvironment } = require('../src/config/env');

const envOriginal = { ...process.env };
const base = { SUPABASE_URL: 'https://projeto.supabase.co', SUPABASE_ANON_KEY: 'anon-de-teste', NODE_ENV: 'development' };
let exitSpy;
let errSpy;

beforeEach(() => {
    process.env = { ...envOriginal, ...base };
    delete process.env.JWT_SECRET;
    delete process.env.INTELBRAS_DEFAULT_PASS;
    exitSpy = jest.spyOn(process, 'exit').mockImplementation(() => { throw new Error('process.exit'); });
    errSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
    exitSpy.mockRestore();
    errSpy.mockRestore();
});

afterAll(() => { process.env = envOriginal; });

it('em produção sem JWT_SECRET, a inicialização para com mensagem clara', () => {
    process.env.NODE_ENV = 'production';
    expect(() => validateEnvironment()).toThrow('process.exit');
    expect(exitSpy).toHaveBeenCalledWith(1);
    expect(errSpy.mock.calls.flat().join(' ')).toContain('JWT_SECRET');
});

it('em produção, recusa o valor de desenvolvimento do JWT_SECRET', () => {
    process.env.NODE_ENV = 'production';
    process.env.JWT_SECRET = 'dev-secret-change-in-production';
    expect(() => validateEnvironment()).toThrow('process.exit');
});

it('em produção com JWT_SECRET próprio, sobe normalmente', () => {
    process.env.NODE_ENV = 'production';
    process.env.JWT_SECRET = 'segredo-forte-de-teste-123456';
    validateEnvironment();
    expect(exitSpy).not.toHaveBeenCalled();
});

it('fora de produção, sem JWT_SECRET, sobe como antes', () => {
    validateEnvironment();
    expect(exitSpy).not.toHaveBeenCalled();
});

it('o objeto de configuração não leva segredos que ninguém lê (JWT_SECRET, INTELBRAS_DEFAULT_PASS)', () => {
    process.env.JWT_SECRET = 'segredo-forte-de-teste-123456';
    process.env.INTELBRAS_DEFAULT_PASS = 'senha-de-teste';
    const cfg = validateEnvironment();
    expect(cfg).not.toHaveProperty('JWT_SECRET');
    expect(cfg).not.toHaveProperty('INTELBRAS_DEFAULT_PASS');
    expect(JSON.stringify(cfg)).not.toContain('admin123');
});
