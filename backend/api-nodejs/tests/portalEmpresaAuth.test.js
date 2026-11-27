// Portal da empresa: chave de acesso, cifra para o painel e token de escopo próprio.
process.env.PORTAL_EMPRESA_SEGREDO = 'segredo-de-teste-portal-com-mais-de-32-caracteres';
process.env.JWT_SECRET = 'segredo-do-painel-nao-usado-pelo-portal';
process.env.SUPABASE_JWT_SECRET = 'segredo-do-supabase-nao-usado-pelo-portal';

jest.mock('../src/config/supabase', () => ({ supabase: { from: jest.fn() } }));

const jwt = require('jsonwebtoken');
const auth = require('../src/modules/portalEmpresa/portalEmpresaAuth');

describe('chave de acesso', () => {
    test('formato XXXX-XXXX-XXXX sem letras que se confundem', () => {
        for (let i = 0; i < 50; i++) {
            const chave = auth.gerarChave();
            expect(chave).toMatch(/^[A-Z2-9]{4}-[A-Z2-9]{4}-[A-Z2-9]{4}$/);
            expect(chave).not.toMatch(/[01OIL]/);
        }
    });

    test('aceita a chave digitada em minúsculas, com espaço ou sem traço', () => {
        const { chave, colunas } = auth.novaChave();
        const digitada = chave.toLowerCase().replace(/-/g, ' ');
        expect(auth.conferirChave(digitada, colunas.portal_chave_hash)).toBe(true);
        expect(auth.conferirChave(chave.replace(/-/g, ''), colunas.portal_chave_hash)).toBe(true);
        expect(auth.conferirChave('AAAA-AAAA-AAAA', colunas.portal_chave_hash)).toBe(false);
    });

    test('cifra para o painel mostrar e não guarda a chave em claro', () => {
        const { chave, colunas } = auth.novaChave();
        expect(colunas.portal_chave_cifrada).not.toContain(chave);
        expect(auth.decifrarChave(colunas.portal_chave_cifrada)).toBe(chave);
        expect(auth.decifrarChave('v1:lixo:lixo:lixo')).toBeNull();
    });
});

describe('token do portal', () => {
    const empresa = { id: 'emp-1', evento_id: 'ev-1', portal_chave_gerada_em: '2026-11-26T10:00:00.000Z' };

    test('ida e volta com escopo do portal', () => {
        const d = auth.verificarToken(auth.assinarToken(empresa));
        expect(d).toMatchObject({ escopo: 'portal_empresa', empresa_id: 'emp-1', evento_id: 'ev-1', versao: empresa.portal_chave_gerada_em });
    });

    test('o painel NZT não aceita o token do portal (segredo diferente)', () => {
        const token = auth.assinarToken(empresa);
        expect(() => jwt.verify(token, process.env.SUPABASE_JWT_SECRET)).toThrow();
    });

    test('token de outro escopo ou adulterado é recusado', () => {
        const outro = jwt.sign({ escopo: 'portal_produtor', empresa_id: 'emp-1', evento_id: 'ev-1' }, 'qualquer');
        expect(auth.verificarToken(outro)).toBeNull();
        const t = auth.assinarToken(empresa);
        expect(auth.verificarToken(`${t.slice(0, -2)}xx`)).toBeNull();
    });

    test('sem PORTAL_EMPRESA_SEGREDO o portal não usa o JWT do painel nem do Supabase', () => {
        const guardado = process.env.PORTAL_EMPRESA_SEGREDO;
        try {
            delete process.env.PORTAL_EMPRESA_SEGREDO;
            expect(() => auth.assinarToken(empresa)).toThrow(/PORTAL_EMPRESA_SEGREDO/);
            process.env.PORTAL_EMPRESA_SEGREDO = 'curto';
            expect(() => auth.assinarToken(empresa)).toThrow(/PORTAL_EMPRESA_SEGREDO/);
        } finally {
            process.env.PORTAL_EMPRESA_SEGREDO = guardado;
        }
    });
});
