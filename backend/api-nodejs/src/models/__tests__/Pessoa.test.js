const Pessoa = require('../Pessoa');

describe('Pessoa Model', () => {
    test('deve criar um funcionário válido', () => {
        const func = new Pessoa({
            nome: 'João Silva',
            cpf: '12345678900',
            funcao: 'Técnico'
        });

        expect(func.nome).toBe('João Silva');
        expect(func.cpf).toBe('12345678900');
        expect(func.status_acesso).toBe('pendente');
    });

    test('deve validar CPF correto', () => {
        const func = new Pessoa({ cpf: '52998224725' }); // CPF válido
        expect(func.isValidCPF()).toBe(true);
    });

    test('deve rejeitar CPF inválido', () => {
        const func = new Pessoa({ cpf: '11111111111' });
        expect(func.isValidCPF()).toBe(false);
    });

    test('deve formatar CPF corretamente', () => {
        const func = new Pessoa({ cpf: '12345678900' });
        expect(func.getCPFFormatado()).toBe('123.456.789-00');
    });

    test('deve verificar permissão de fase', () => {
        const func = new Pessoa({
            fase_montagem: true,
            fase_showday: false,
            fase_desmontagem: true
        });

        expect(func.hasPermissaoFase('montagem')).toBe(true);
        expect(func.hasPermissaoFase('showday')).toBe(false);
        expect(func.hasPermissaoFase('desmontagem')).toBe(true);
    });

    test('deve retornar cor do status', () => {
        const func = new Pessoa({ status_acesso: 'checkin' });
        expect(func.getStatusColor()).toBe('success');

        func.status_acesso = 'expulso';
        expect(func.getStatusColor()).toBe('error');
    });
});
