// Planilha de participantes: modelo do evento, geração do .xlsx e leitura do que voltou preenchido.
const ExcelJS = require('exceljs');
const {
    sanitizarModelo, montarWorkbook, lerPlanilha, lerData, lerCpf, cpfValido
} = require('../src/modules/planilha/planilhaModelo');

// CPFs válidos de teste (gerados pela regra dos dígitos verificadores)
const CPF_A = '52998224725';
const CPF_ZERO = '01234567890'; // começa com zero: o Excel costuma comer o 0

const paraBuffer = async (wb) => Buffer.from(await wb.xlsx.writeBuffer());

describe('sanitizarModelo', () => {
    test('garante nome e CPF obrigatórios, tira campo desconhecido e repetido', () => {
        const m = sanitizarModelo({
            colunas: [
                { campo: 'funcao', rotulo: 'Cargo' },
                { campo: 'funcao' },
                { campo: 'senha' },
                { campo: 'cpf', obrigatoria: false }
            ]
        });
        expect(m.colunas.map(c => c.campo)).toEqual(['nome_completo', 'funcao', 'cpf']);
        expect(m.colunas.find(c => c.campo === 'cpf').obrigatoria).toBe(true);
        expect(m.colunas.find(c => c.campo === 'funcao').rotulo).toBe('Cargo');
    });

    test('cor inválida volta para a padrão; sem nada vira o modelo padrão', () => {
        const m = sanitizarModelo({ cor_cabecalho: 'vermelho' });
        expect(m.cor_cabecalho).toBe('#0A1628');
        expect(m.colunas[0].campo).toBe('nome_completo');
    });
});

describe('ida e volta da planilha', () => {
    test('lê o que foi exportado, com cabeçalho de título, evento, empresa e instruções', async () => {
        const modelo = sanitizarModelo({ titulo: 'Equipe do show', colunas: [
            { campo: 'nome_completo' }, { campo: 'cpf' }, { campo: 'funcao' }, { campo: 'data_nascimento' }
        ] });
        const wb = montarWorkbook(modelo, {
            eventoNome: 'Sertanejo', empresaNome: 'GYN EVENTOS',
            linhas: [{ nome_completo: 'Ana Souza', cpf: CPF_A, funcao: 'PRODUTOR', data_nascimento: '1990-05-17' }]
        });
        const { linhas, erros } = await lerPlanilha(await paraBuffer(wb), modelo);
        expect(erros).toEqual([]);
        expect(linhas).toHaveLength(1);
        expect(linhas[0].dados).toEqual({ nome_completo: 'Ana Souza', cpf: CPF_A, funcao: 'PRODUTOR', data_nascimento: '1990-05-17' });
    });

    test('colunas em outra ordem e com títulos antigos também são lidas', async () => {
        const modelo = sanitizarModelo({});
        const wb = new ExcelJS.Workbook();
        const ws = wb.addWorksheet('x');
        ws.addRow(['FUNCAO', 'CPF (Somente números)', 'NOME DO COLABORADOR', 'NASCIMENTO (DD/MM/AAAA)']);
        ws.addRow(['LIMPEZA', Number(CPF_ZERO), 'Bruno Lima', '03/02/1985']);
        const { linhas, erros } = await lerPlanilha(await paraBuffer(wb), modelo);
        expect(erros).toEqual([]);
        expect(linhas[0].dados).toEqual({ funcao: 'LIMPEZA', cpf: CPF_ZERO, nome_completo: 'Bruno Lima', data_nascimento: '1985-02-03' });
    });

    test('aponta CPF inválido, CPF repetido, obrigatório vazio e data errada, com o número da linha', async () => {
        const modelo = sanitizarModelo({ colunas: [
            { campo: 'nome_completo' }, { campo: 'cpf' }, { campo: 'funcao', obrigatoria: true }, { campo: 'data_nascimento' }
        ] });
        const wb = new ExcelJS.Workbook();
        const ws = wb.addWorksheet('x');
        ws.addRow(['NOME COMPLETO *', 'CPF *', 'FUNÇÃO *', 'DATA DE NASCIMENTO']);
        ws.addRow(['Ana', CPF_A, 'DONO', '']);        // ok
        ws.addRow(['Carla', '11111111111', 'DONO', '']); // CPF inválido
        ws.addRow(['Dani', CPF_A, 'DONO', '']);       // repetido
        ws.addRow(['Edu', CPF_ZERO, '', '31/02/1990']); // sem função + data que não existe
        ws.addRow(['', '', '', '']);                  // vazia: ignorada
        const { linhas, erros } = await lerPlanilha(await paraBuffer(wb), modelo);
        expect(linhas.map(l => l.linha)).toEqual([2]);
        expect(erros.map(e => e.linha)).toEqual([3, 4, 5]);
        expect(erros[0].motivo).toMatch(/inválido/);
        expect(erros[1].motivo).toMatch(/repetido.*linha 2/);
        expect(erros[2].motivo).toMatch(/FUNÇÃO é obrigatório/);
        expect(erros[2].motivo).toMatch(/DATA DE NASCIMENTO inválida/);
    });

    test('sem linha de títulos com nome e CPF: erro claro', async () => {
        const wb = new ExcelJS.Workbook();
        wb.addWorksheet('x').addRow(['qualquer', 'coisa']);
        await expect(lerPlanilha(await paraBuffer(wb), sanitizarModelo({}))).rejects.toMatchObject({ status: 400 });
    });
});

describe('conversões', () => {
    test('datas: DD/MM/AAAA, AAAA-MM-DD, data do Excel e número de série', () => {
        expect(lerData('17/05/1990').valor).toBe('1990-05-17');
        expect(lerData('1990-05-17').valor).toBe('1990-05-17');
        expect(lerData(new Date(Date.UTC(1990, 4, 17))).valor).toBe('1990-05-17');
        expect(lerData(33010).valor).toBe('1990-05-17');
        expect(lerData('ontem').invalido).toBe(true);
    });

    test('CPF: completa zero comido pelo Excel e valida dígitos', () => {
        expect(lerCpf(1234567890)).toBe(CPF_ZERO);
        expect(lerCpf('529.982.247-25')).toBe(CPF_A);
        expect(cpfValido(CPF_A)).toBe(true);
        expect(cpfValido('52998224726')).toBe(false);
    });
});
