/**
 * Relatórios por empresa: quem troca de empresa no meio do dia tem um turno em cada empresa,
 * e a saída fica com a empresa da entrada que ela fecha (não com a empresa atual da pessoa).
 */
jest.mock('../src/services/logger', () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() }));
jest.mock('../src/config/supabase', () => ({ supabase: { from: () => ({}) } }));
jest.mock('../src/services/pdf.service', () => ({}));

const { montarTurnos } = require('../src/modules/reports/report.controller');

const pessoa = { id: 'p1', nome_completo: 'Fulano', cpf: '000' };
const log = (tipo, hora, empresa_id, extra = {}) => ({
    tipo,
    created_at: `2026-11-12T${hora}:00Z`, // 10h–15h no horário de Brasília
    pessoa_id: pessoa.id,
    empresa_id,
    pessoas: { ...pessoa, empresa_id: 'EMPRESA_ATUAL' },
    ...extra
});

describe('montarTurnos por empresa', () => {
    test('troca de empresa no dia gera um turno em cada empresa', () => {
        const turnos = montarTurnos([
            log('checkin', '13:00', 'A'),
            log('checkout', '15:00', null), // saída sem empresa gravada: segue a entrada aberta (A)
            log('checkin', '16:00', 'B'),
            log('checkout', '18:00', 'B')
        ]);

        expect(turnos).toHaveLength(2);
        const a = turnos.find(t => t.empresa_id === 'A');
        const b = turnos.find(t => t.empresa_id === 'B');
        expect(a.total_horas).toBe(2);   // 13h → 15h
        expect(b.total_horas).toBe(2);   // 16h → 18h
        expect(a.saidas).toBe(1);
        expect(b.saidas).toBe(1);
    });

    test('sem troca, o turno inteiro fica numa empresa só', () => {
        const turnos = montarTurnos([
            log('checkin', '13:00', 'A'),
            log('checkout', '17:00', 'A')
        ]);
        expect(turnos).toHaveLength(1);
        expect(turnos[0].empresa_id).toBe('A');
        expect(turnos[0].total_horas).toBe(4);
    });

    test('acesso antigo sem empresa gravada cai na empresa atual da pessoa', () => {
        const turnos = montarTurnos([
            log('checkin', '13:00', null),
            log('checkout', '14:00', null)
        ]);
        expect(turnos[0].empresa_id).toBe('EMPRESA_ATUAL');
    });
});
