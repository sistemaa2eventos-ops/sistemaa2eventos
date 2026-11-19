/**
 * Regra de formato do código lido (codigoLeitor.js). O painel valida ANTES de enfileirar uma leitura
 * sem servidor, com esta mesma regra. Texto que não é código (nome) nunca entra na fila nem no banco.
 *
 * Regra que o cliente replica (após trim):
 *   1. Sem espaço, acento ou símbolo fora de letras, números, '.', '_' e '-'; começa por letra ou número;
 *      até 2048 caracteres → senão é nome/texto (não enfileirar).
 *   2. UUID → id da pessoa.
 *   3. CPF (11 dígitos, com ou sem pontos e traço) → CPF.
 *   4. Sem dígito e sem ponto (só letras) → nome (não enfileirar).
 *   5. Demais (número de pulseira, QR com três partes separadas por ponto) → código.
 */
const mockFrom = jest.fn();

jest.mock('../src/config/supabase', () => ({ supabase: { from: (...a) => mockFrom(...a) } }));
jest.mock('../src/services/logger', () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() }));

const { classificarCodigoLeitor, buscarPessoaPorCodigo, MSG_NAO_E_CODIGO } = require('../src/modules/checkin/codigoLeitor');

const QR = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6IjUyOTk4MjI0NzI1In0.abcDEF123-_x';

describe('classificarCodigoLeitor (regra do cliente offline)', () => {
    it('número de pulseira é código (pulseira e QR são candidatos)', () => {
        expect(classificarCodigoLeitor('  1001 ')).toEqual({ pulseira: true, qr: true, cpf: null, id: false });
    });

    it('CPF só com dígitos é CPF e também pode ser pulseira', () => {
        const t = classificarCodigoLeitor('52998224725');
        expect(t.cpf).toEqual(['52998224725', '529.982.247-25']);
        expect(t.pulseira).toBe(true);
    });

    it('CPF com máscara não é pulseira', () => {
        const t = classificarCodigoLeitor('529.982.247-25');
        expect(t.cpf).not.toBeNull();
        expect(t.pulseira).toBe(false);
    });

    it('UUID é id', () => {
        expect(classificarCodigoLeitor('a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d')).toEqual({ pulseira: false, qr: true, cpf: null, id: true });
    });

    it('QR (JWT com três partes) é código sem pulseira', () => {
        const t = classificarCodigoLeitor(QR);
        expect(t).not.toBeNull();
        expect(t.pulseira).toBe(false);
        expect(t.qr).toBe(true);
    });

    it('nome com espaço, acento ou só letras não é código (não enfileirar)', () => {
        expect(classificarCodigoLeitor('Maria Silva')).toBeNull();
        expect(classificarCodigoLeitor('João')).toBeNull();
        expect(classificarCodigoLeitor('Maria')).toBeNull();
        expect(classificarCodigoLeitor('')).toBeNull();
    });

    it('acima de 2048 caracteres não é código', () => {
        expect(classificarCodigoLeitor('1'.repeat(2049))).toBeNull();
        expect(classificarCodigoLeitor('1'.repeat(2048))).not.toBeNull();
    });
});

describe('buscarPessoaPorCodigo', () => {
    it('nome devolve 400 sem consultar o banco', async () => {
        mockFrom.mockClear();
        const r = await buscarPessoaPorCodigo({ from: mockFrom }, 'ev1', 'Maria Silva', 'id');
        expect(r).toEqual({ status: 400, erro: MSG_NAO_E_CODIGO });
        expect(mockFrom).not.toHaveBeenCalled();
    });
});
