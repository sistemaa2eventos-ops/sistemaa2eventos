/**
 * As rotas passam os métodos do controller soltos (sem o objeto). Os que usam
 * this._helper() precisam funcionar assim — invite e listUsers davam 500.
 */
jest.mock('../src/config/supabase', () => ({ supabase: {}, supabasePublic: {} }));
jest.mock('../src/services/logger', () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() }));

const authController = require('../src/modules/auth/auth.controller');

describe('métodos do authController passados soltos ao router', () => {
    it.each(['invite', 'listUsers', 'register', 'resendInvite', 'forgotPassword'])('%s está ligado ao controller', (nome) => {
        expect(authController[nome].name).toBe(`bound ${nome}`);
    });
});
