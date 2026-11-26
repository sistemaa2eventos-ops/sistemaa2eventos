/**
 * Pasta de encerramento do evento (GET /api/eventos/:id/registro-encerramento), antes da exclusão:
 *  - traz empresas, pessoas (inclui vínculo pivô), veículos, documentos e relatórios; nada mais
 *  - nunca leva biometria, token, chave, QR ou foto
 *  - tabela opcional ausente vira "indisponivel"; erro de leitura ou volume no teto interrompe tudo
 *  - o pacote é um .zip válido com CSV para Excel
 */
const zlib = require('zlib');

const bancoSimulado = {};
let erroPorTabela = {};

jest.mock('../src/utils/buscarTodos', () => {
    const actual = jest.requireActual('../src/utils/buscarTodos');
    return {
        ...actual,
        buscarTodos: jest.fn(async (query) => query.__executar()),
        buscarPorIdsEmLotes: jest.fn(async (ids, montar) => montar(ids)),
    };
});

const {
    montarRegistroEncerramento, gerarPacoteZip, nomeDoArquivo, limpar, paraCsv,
} = require('../src/modules/events/registroEncerramento.service');
const { crc32 } = require('../src/utils/zipSimples');

function consulta(tabela) {
    const filtros = [];
    const aplicar = () => (bancoSimulado[tabela] || []).filter(l => filtros.every(([tipo, c, v]) =>
        tipo === 'in' ? v.includes(l[c]) : l[c] === v));
    const erro = () => erroPorTabela[tabela] || null;
    const b = {
        select() { return b; },
        order() { return b; },
        eq(c, v) { filtros.push(['eq', c, v]); return b; },
        in(c, v) { filtros.push(['in', c, v]); return b; },
        maybeSingle() {
            return Promise.resolve({ data: aplicar()[0] || null, error: erro() });
        },
        __executar() {
            return Promise.resolve({ data: aplicar(), error: erro() });
        },
        then(ok, ko) { return b.__executar().then(ok, ko); },
    };
    return b;
}

const cliente = { from: (tabela) => consulta(tabela) };
const EVENTO = 'evt-1';
const OUTRO = 'evt-2';

beforeEach(() => {
    erroPorTabela = {};
    for (const k of Object.keys(bancoSimulado)) delete bancoSimulado[k];
    bancoSimulado.eventos = [{ id: EVENTO, nome: 'Feira', config: { chave_motor: 'x', modulo: { ok: 1 } } }];
    bancoSimulado.empresas = [{ id: 'emp-1', evento_id: EVENTO, nome: 'Acme', registration_token: 'tok-123' }];
    bancoSimulado.pessoas = [
        { id: 'p-1', evento_id: EVENTO, nome_completo: 'Ana', cpf: '111', face_encoding: [0.1], foto_url: 'x.jpg', qr_code: 'pessoa-1' },
        { id: 'p-3', evento_id: OUTRO, nome_completo: 'Caio', cpf: '333' },
    ];
    bancoSimulado.pessoa_evento_empresa = [
        { id: 'v-1', pessoa_id: 'p-1', evento_id: EVENTO, empresa_id: 'emp-1' },
        { id: 'v-2', pessoa_id: 'p-3', evento_id: EVENTO, empresa_id: 'emp-1' },
    ];
    bancoSimulado.veiculos = [
        { id: 've-1', empresa_id: 'emp-1', placa: 'ABC1D23', motorista_id: 'p-1' },
        { id: 've-2', empresa_id: 'emp-de-outro', placa: 'ZZZ9Z99' },
    ];
    bancoSimulado.pessoa_documentos = [
        { id: 'd-1', pessoa_id: 'p-1', titulo: 'ASO', status: 'aprovado' },
        { id: 'd-2', pessoa_id: 'p-3', titulo: 'NR-35', status: 'vencido' },
    ];
    bancoSimulado.relatorios_diarios_fechados = [{ id: 'r-1', evento_id: EVENTO, data: '2026-11-20', total: 120 }];
    // Estas tabelas NÃO entram mais no registro
    bancoSimulado.logs_acesso = [{ id: 'l-1', evento_id: EVENTO, pessoa_id: 'p-1', tipo: 'entrada' }];
    bancoSimulado.pulseira_vinculos = [{ id: 'pv-1', evento_id: EVENTO, pessoa_id: 'p-1', numero_pulseira: '10' }];
    bancoSimulado.central_auditoria = [{ id: 1, evento_id: EVENTO, acao: 'entrar' }];
    bancoSimulado.pulseiras_pendencia = [];
    buscarTodosMockLimpo();
});

function buscarTodosMockLimpo() {
    require('../src/utils/buscarTodos').buscarTodos.mockClear();
}

describe('montarRegistroEncerramento', () => {
    test('traz só empresas, pessoas (com pivô), veículos, documentos e relatórios', async () => {
        const r = await montarRegistroEncerramento(cliente, EVENTO, { geradoPor: 'Admin' });

        expect(r.formato).toBe('nzt-registro-encerramento');
        expect(r.evento.id).toBe(EVENTO);
        expect(r.gerado_por).toBe('Admin');
        expect(Object.keys(r.secoes).sort()).toEqual(['documentos', 'empresas', 'pessoas', 'relatorios', 'veiculos']);
        expect(r.secoes.empresas).toHaveLength(1);
        // p-1 do evento + p-3 (outro evento, mas com vínculo pivô neste evento)
        expect(r.secoes.pessoas.map(p => p.id).sort()).toEqual(['p-1', 'p-3']);
        // veículos de empresas do evento; documentos das pessoas do registro
        expect(r.secoes.veiculos.map(v => v.id)).toEqual(['ve-1']);
        expect(r.secoes.documentos.map(d => d.id).sort()).toEqual(['d-1', 'd-2']);
        expect(r.secoes.relatorios.map(x => x.id)).toEqual(['r-1']);
        expect(r.contagens).toEqual({ empresas: 1, pessoas: 2, veiculos: 1, documentos: 2, relatorios: 1 });
        expect(r.secoes_indisponiveis).toEqual([]);
    });

    test('não lê acessos, pulseiras nem auditoria da Central', async () => {
        const r = await montarRegistroEncerramento(cliente, EVENTO);
        const texto = JSON.stringify(r);
        expect(texto).not.toMatch(/"tipo":"entrada"/);
        expect(texto).not.toMatch(/numero_pulseira/);
        expect(texto).not.toMatch(/"acao":"entrar"/);
        expect(r.secoes.logs_acesso).toBeUndefined();
        expect(r.secoes.central_auditoria).toBeUndefined();
    });

    test('não leva biometria, token, QR, foto nem chave de configuração', async () => {
        const r = JSON.stringify(await montarRegistroEncerramento(cliente, EVENTO));
        expect(r).not.toMatch(/face_encoding/);
        expect(r).not.toMatch(/foto_url/);
        expect(r).not.toMatch(/qr_code/);
        expect(r).not.toMatch(/registration_token/);
        expect(r).not.toMatch(/chave_motor/);
        // o que não é sigiloso continua
        expect(r).toMatch(/"modulo"/);
        expect(r).toMatch(/"placa":"ABC1D23"/);
    });

    test('tabela opcional ausente (veiculos) fica indisponível sem derrubar o registro', async () => {
        erroPorTabela.veiculos = { code: '42P01', message: 'relation does not exist' };
        const r = await montarRegistroEncerramento(cliente, EVENTO);
        expect(r.secoes_indisponiveis).toEqual(['veiculos']);
        expect(r.secoes.veiculos).toEqual([]);
        expect(r.secoes.documentos).toHaveLength(2);
    });

    test('erro de leitura em tabela obrigatória (pessoas) interrompe a exportação', async () => {
        erroPorTabela.pessoas = { code: 'XX000', message: 'timeout' };
        await expect(montarRegistroEncerramento(cliente, EVENTO)).rejects.toMatchObject({ status: 500 });
    });

    test('volume no teto de leitura bloqueia (registro não pode sair cortado)', async () => {
        const { LIMITE_SEGURANCA } = jest.requireActual('../src/utils/buscarTodos');
        bancoSimulado.pessoas = Array.from({ length: LIMITE_SEGURANCA }, (_, i) => ({ id: `p${i}`, evento_id: EVENTO }));
        await expect(montarRegistroEncerramento(cliente, EVENTO)).rejects.toMatchObject({ status: 413 });
    });

    test('evento inexistente devolve 404', async () => {
        await expect(montarRegistroEncerramento(cliente, 'nao-existe')).rejects.toMatchObject({ status: 404 });
    });
});

describe('pasta .zip de encerramento', () => {
    test('gera zip com LEIA-ME, evento.json e um CSV por assunto', async () => {
        const r = await montarRegistroEncerramento(cliente, EVENTO, { geradoPor: 'Admin' });
        const zip = gerarPacoteZip(r);
        const nomes = listarNomesZip(zip);
        expect(nomes).toEqual(['LEIA-ME.txt', 'evento.json', 'empresas.csv', 'pessoas.csv', 'veiculos.csv', 'documentos.csv', 'relatorios.csv']);
        const conteudos = extrairZip(zip);
        expect(conteudos['pessoas.csv']).toMatch(/^﻿/);
        expect(conteudos['pessoas.csv']).toMatch(/Ana/);
        expect(conteudos['veiculos.csv']).toMatch(/ABC1D23/);
        expect(conteudos['LEIA-ME.txt']).toMatch(/Evento: Feira/);
        // nada sigiloso dentro do pacote
        const tudo = Object.values(conteudos).join('\n');
        expect(tudo).not.toMatch(/face_encoding|qr_code|foto_url|registration_token/);
    });

    test('LEIA-ME avisa quando a tabela não está disponível', async () => {
        erroPorTabela.veiculos = { code: '42P01', message: 'relation does not exist' };
        const r = await montarRegistroEncerramento(cliente, EVENTO);
        const conteudos = extrairZip(gerarPacoteZip(r));
        expect(conteudos['LEIA-ME.txt']).toMatch(/veiculos\.csv: .*TABELA NÃO DISPONÍVEL/);
    });

    test('nome do arquivo sem acento e sem caracteres estranhos', () => {
        const nome = nomeDoArquivo('Festa São João / 2026', new Date(2026, 10, 25, 9, 5));
        expect(nome).toBe('registro-encerramento_Festa-Sao-Joao-2026_2026-11-25_09-05.zip');
    });

    test('CSV escapa aspas e junta colunas de todas as linhas', () => {
        const csv = paraCsv([{ a: 'x"y', b: 1 }, { a: null, c: { k: 2 } }]);
        expect(csv).toBe('﻿"a";"b";"c"\r\n"x""y";"1";""\r\n"";"";"{""k"":2}"');
    });

    test('crc32 bate com o valor conhecido', () => {
        expect(crc32(Buffer.from('123456789'))).toBe(0xCBF43926);
    });
});

describe('limpar', () => {
    test('remove chaves sigilosas em qualquer profundidade e mantém o resto', () => {
        const out = limpar({ a: 1, token_x: 'z', deep: { lista: [{ foto_url: 'u', nome: 'n' }] } });
        expect(out).toEqual({ a: 1, deep: { lista: [{ nome: 'n' }] } });
    });
});

// Leitor mínimo de ZIP só para o teste (lê o diretório central e descomprime cada entrada)
function listarNomesZip(zip) {
    return Object.keys(extrairZip(zip));
}

function extrairZip(zip) {
    const fim = zip.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
    expect(fim).toBeGreaterThan(-1);
    const total = zip.readUInt16LE(fim + 10);
    let pos = zip.readUInt32LE(fim + 16);
    const saida = {};
    for (let i = 0; i < total; i++) {
        expect(zip.readUInt32LE(pos)).toBe(0x02014b50);
        const tamanhoNome = zip.readUInt16LE(pos + 28);
        const tamanhoComp = zip.readUInt32LE(pos + 20);
        const crc = zip.readUInt32LE(pos + 16);
        const offset = zip.readUInt32LE(pos + 42);
        const nome = zip.toString('utf8', pos + 46, pos + 46 + tamanhoNome);
        const local = offset;
        const tamanhoNomeLocal = zip.readUInt16LE(local + 26);
        const tamanhoExtraLocal = zip.readUInt16LE(local + 28);
        const inicio = local + 30 + tamanhoNomeLocal + tamanhoExtraLocal;
        const bruto = zlib.inflateRawSync(zip.subarray(inicio, inicio + tamanhoComp));
        expect(crc32(bruto)).toBe(crc);
        saida[nome] = bruto.toString('utf8');
        pos += 46 + tamanhoNome;
    }
    return saida;
}
