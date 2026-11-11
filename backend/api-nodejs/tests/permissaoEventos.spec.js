const User = require('../src/models/User');

// Regras de troca de evento (decisões de 12/11): só administrador e Admin Master trocam livremente;
// operador opera só os eventos da lista; supervisor global mantém todos os eventos.
const u = (role, vinculo_tipo, eventos_permitidos = []) =>
    new User({ id: 'x', email: 'x@x', role, nivel_acesso: role, vinculo_tipo, eventos_permitidos, permissions: {} });

describe('isAllowedEvent', () => {
    const A = '11111111-1111-1111-1111-111111111111';
    const B = '22222222-2222-2222-2222-222222222222';
    const C = '33333333-3333-3333-3333-333333333333';

    test('admin_master opera qualquer evento', () => {
        expect(u('admin_master', 'global').isAllowedEvent(C)).toBe(true);
    });

    test('operador com lista opera só os eventos da lista', () => {
        const op = u('operador', 'especifico', [A, B]);
        expect(op.isAllowedEvent(A)).toBe(true);
        expect(op.isAllowedEvent(B)).toBe(true);
        expect(op.isAllowedEvent(C)).toBe(false);
    });

    test('operador com vínculo global NÃO opera qualquer evento (só a lista)', () => {
        expect(u('operador', 'global', []).isAllowedEvent(A)).toBe(false);
        expect(u('operador', 'global', [A]).isAllowedEvent(A)).toBe(true);
        expect(u('operador', 'global', [A]).isAllowedEvent(B)).toBe(false);
    });

    test('supervisor com vínculo global mantém todos os eventos', () => {
        expect(u('supervisor', 'global', []).isAllowedEvent(C)).toBe(true);
    });

    test('supervisor com vínculo específico só os da lista', () => {
        const sup = u('supervisor', 'especifico', [A]);
        expect(sup.isAllowedEvent(A)).toBe(true);
        expect(sup.isAllowedEvent(B)).toBe(false);
    });

    test('sem evento pedido não bloqueia (comportamento anterior)', () => {
        expect(u('operador', 'especifico', [A]).isAllowedEvent(null)).toBe(true);
    });
});
