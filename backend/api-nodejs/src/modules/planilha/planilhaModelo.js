const ExcelJS = require('exceljs');

/**
 * Planilha de participantes por evento: catálogo de campos, modelo (cabeçalho + colunas),
 * geração do .xlsx e leitura do que voltou preenchido. Sem acesso ao banco (testável).
 */

/** Campos do participante que podem virar coluna. nome_completo e cpf são fixos (sempre presentes). */
const CAMPOS = {
    nome_completo: { rotulo: 'NOME COMPLETO', tipo: 'texto', fixo: true, largura: 36 },
    cpf: { rotulo: 'CPF', tipo: 'cpf', fixo: true, largura: 18 },
    funcao: { rotulo: 'FUNÇÃO', tipo: 'texto', largura: 22 },
    email: { rotulo: 'E-MAIL', tipo: 'email', largura: 30 },
    telefone: { rotulo: 'TELEFONE', tipo: 'telefone', largura: 18 },
    data_nascimento: { rotulo: 'DATA DE NASCIMENTO', tipo: 'data', largura: 20 },
    nome_mae: { rotulo: 'NOME DA MÃE', tipo: 'texto', largura: 34 },
    nome_credencial: { rotulo: 'NOME NO CRACHÁ', tipo: 'texto', largura: 24 },
    passaporte: { rotulo: 'PASSAPORTE (ESTRANGEIROS)', tipo: 'texto', largura: 22 }
};

/** Nomes antigos de coluna que continuam sendo reconhecidos na importação. */
const APELIDOS = {
    nome_completo: ['NOME', 'NOME DO COLABORADOR', 'NOME DO PARTICIPANTE', 'COLABORADOR', 'PARTICIPANTE'],
    cpf: ['CPF SOMENTE NUMEROS', 'CPF (SOMENTE NUMEROS)', 'DOCUMENTO CPF'],
    funcao: ['FUNCAO', 'CARGO', 'FUNCAO / CARGO', 'FUNCAO/CARGO'],
    email: ['EMAIL', 'E MAIL'],
    data_nascimento: ['NASCIMENTO', 'NASCIMENTO (DD/MM/AAAA)', 'DATA NASCIMENTO'],
    nome_mae: ['NOME DA MAE', 'MAE'],
    nome_credencial: ['NOME CRACHA', 'NOME NO CRACHA', 'NOME DA CREDENCIAL'],
    passaporte: ['PASSAPORTE']
};

const COR_PADRAO = '#0A1628';
const MAX_LINHAS_CABECALHO = 20;

const MODELO_PADRAO = {
    titulo: 'Cadastro de participantes',
    instrucoes: 'Preencha uma linha por participante. CPF somente com números. Não altere os títulos das colunas. Colunas com * são obrigatórias.',
    cor_cabecalho: COR_PADRAO,
    mostrar_evento: true,
    mostrar_empresa: true,
    colunas: [
        { campo: 'nome_completo', obrigatoria: true },
        { campo: 'cpf', obrigatoria: true },
        { campo: 'funcao', obrigatoria: false },
        { campo: 'email', obrigatoria: false },
        { campo: 'telefone', obrigatoria: false },
        { campo: 'data_nascimento', obrigatoria: false },
        { campo: 'nome_mae', obrigatoria: false }
    ]
};

const texto = (v, max) => String(v ?? '').trim().slice(0, max);

/** Normaliza um título de coluna para comparar ("Função *" → "FUNCAO"). */
const normalizarRotulo = (s) => String(s ?? '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/\*/g, '')
    .replace(/[_\-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toUpperCase();

/**
 * Modelo válido a partir do que veio do banco ou do painel: só campos conhecidos, sem repetição,
 * com nome e CPF sempre presentes e obrigatórios.
 */
function sanitizarModelo(entrada) {
    const m = entrada && typeof entrada === 'object' ? entrada : {};
    const cor = /^#[0-9a-f]{6}$/i.test(m.cor_cabecalho || '') ? m.cor_cabecalho.toUpperCase() : COR_PADRAO;

    const vistos = new Set();
    const colunas = [];
    for (const c of Array.isArray(m.colunas) ? m.colunas : MODELO_PADRAO.colunas) {
        const campo = c?.campo;
        if (!CAMPOS[campo] || vistos.has(campo)) continue;
        vistos.add(campo);
        const largura = Number.parseInt(c.largura, 10);
        colunas.push({
            campo,
            rotulo: texto(c.rotulo, 60) || CAMPOS[campo].rotulo,
            obrigatoria: CAMPOS[campo].fixo ? true : !!c.obrigatoria,
            largura: Number.isFinite(largura) ? Math.min(60, Math.max(8, largura)) : CAMPOS[campo].largura
        });
    }
    // Nome e CPF não podem faltar: entram no começo, na ordem padrão
    for (const fixo of ['cpf', 'nome_completo']) {
        if (!vistos.has(fixo)) {
            colunas.unshift({ campo: fixo, rotulo: CAMPOS[fixo].rotulo, obrigatoria: true, largura: CAMPOS[fixo].largura });
        }
    }

    return {
        titulo: texto(m.titulo, 120) || MODELO_PADRAO.titulo,
        instrucoes: m.instrucoes === undefined ? MODELO_PADRAO.instrucoes : texto(m.instrucoes, 1000),
        cor_cabecalho: cor,
        mostrar_evento: m.mostrar_evento !== false,
        mostrar_empresa: m.mostrar_empresa !== false,
        colunas
    };
}

const argb = (hex) => `FF${hex.replace('#', '').toUpperCase()}`;

const cpfFormatado = (cpf) => {
    const d = String(cpf || '').replace(/\D/g, '');
    return d.length === 11 ? `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}` : d;
};

const dataBr = (iso) => {
    const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso || ''));
    return m ? `${m[3]}/${m[2]}/${m[1]}` : '';
};

/**
 * Monta o .xlsx do modelo: título, linha de evento/empresa, instruções, títulos das colunas e as linhas.
 * @param {object} modelo modelo já sanitizado
 * @param {{ eventoNome?: string, empresaNome?: string, linhas?: object[] }} opcoes
 * @returns {ExcelJS.Workbook}
 */
function montarWorkbook(modelo, { eventoNome = '', empresaNome = '', linhas = [] } = {}) {
    const wb = new ExcelJS.Workbook();
    wb.creator = 'NZT Intelligent Control System';
    const ws = wb.addWorksheet('Participantes');
    const total = modelo.colunas.length;
    const ultima = ws.getColumn(total).letter;
    let r = 1;

    const linhaMesclada = (valor, estilo = {}) => {
        ws.mergeCells(`A${r}:${ultima}${r}`);
        const cel = ws.getCell(`A${r}`);
        cel.value = valor;
        cel.alignment = { vertical: 'middle', horizontal: 'left', wrapText: true };
        Object.assign(cel, estilo);
        return ws.getRow(r++);
    };

    const titulo = linhaMesclada(modelo.titulo, {
        font: { bold: true, size: 15, color: { argb: 'FFFFFFFF' } },
        fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: argb(modelo.cor_cabecalho) } }
    });
    titulo.height = 28;

    const info = [
        modelo.mostrar_evento && eventoNome ? `Evento: ${eventoNome}` : null,
        modelo.mostrar_empresa && empresaNome ? `Empresa: ${empresaNome}` : null
    ].filter(Boolean).join('   •   ');
    if (info) linhaMesclada(info, { font: { bold: true, size: 11 } });

    if (modelo.instrucoes) {
        const instr = linhaMesclada(modelo.instrucoes, { font: { italic: true, size: 10, color: { argb: 'FF475569' } } });
        instr.height = Math.min(90, 15 * Math.ceil(modelo.instrucoes.length / 110) + 6);
    }
    r++; // linha em branco antes dos títulos

    const linhaTitulos = r;
    const cabecalho = ws.getRow(r++);
    modelo.colunas.forEach((c, i) => {
        const cel = cabecalho.getCell(i + 1);
        cel.value = c.obrigatoria ? `${c.rotulo} *` : c.rotulo;
        cel.font = { bold: true, color: { argb: 'FFFFFFFF' } };
        cel.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: argb(modelo.cor_cabecalho) } };
        cel.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
        cel.border = { bottom: { style: 'thin', color: { argb: 'FF94A3B8' } } };
        const col = ws.getColumn(i + 1);
        col.width = c.largura;
        // CPF e telefone como texto: o Excel não come o zero da frente
        if (['cpf', 'telefone'].includes(CAMPOS[c.campo].tipo)) col.numFmt = '@';
    });
    cabecalho.height = 22;

    for (const p of linhas) {
        const row = ws.getRow(r++);
        modelo.colunas.forEach((c, i) => {
            const v = p[c.campo];
            const tipo = CAMPOS[c.campo].tipo;
            row.getCell(i + 1).value = tipo === 'cpf' ? cpfFormatado(v) : tipo === 'data' ? dataBr(v) : (v ?? '');
        });
    }

    ws.views = [{ state: 'frozen', ySplit: linhaTitulos }];
    ws.autoFilter = { from: { row: linhaTitulos, column: 1 }, to: { row: linhaTitulos, column: total } };
    return wb;
}

/** Texto de uma célula do ExcelJS (texto rico, fórmula, link, data, número). */
function valorCelula(cell) {
    const v = cell?.value;
    if (v === null || v === undefined) return '';
    if (v instanceof Date) return v;
    if (typeof v === 'object') {
        if (Array.isArray(v.richText)) return v.richText.map(t => t.text).join('');
        if (v.text !== undefined) return String(v.text);
        if (v.result !== undefined) return v.result instanceof Date ? v.result : String(v.result);
        return '';
    }
    return v;
}

/** Data da planilha → "AAAA-MM-DD" (aceita data do Excel, número de série, DD/MM/AAAA e AAAA-MM-DD). */
function lerData(v) {
    if (v === '' || v === null || v === undefined) return { valor: null };
    let d = null;
    if (v instanceof Date) d = v;
    else if (typeof v === 'number' && v > 0) d = new Date(Math.round((v - 25569) * 86400000));
    else {
        const s = String(v).trim();
        let m = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2}|\d{4})$/.exec(s);
        if (m) {
            const ano = m[3].length === 2 ? (Number(m[3]) > 30 ? `19${m[3]}` : `20${m[3]}`) : m[3];
            d = new Date(Date.UTC(Number(ano), Number(m[2]) - 1, Number(m[1])));
            if (d.getUTCDate() !== Number(m[1]) || d.getUTCMonth() !== Number(m[2]) - 1) d = null;
        } else if ((m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s))) {
            d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
        }
    }
    if (!d || Number.isNaN(d.getTime())) return { valor: null, invalido: true };
    const iso = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
    return { valor: iso };
}

/** CPF da planilha: só dígitos; com 9 ou 10 dígitos (zero comido pelo Excel) completa com zeros. */
function lerCpf(v) {
    let d = String(v ?? '').replace(/\D/g, '');
    if (d.length >= 9 && d.length < 11) d = d.padStart(11, '0');
    return d;
}

function cpfValido(cpf) {
    if (!/^\d{11}$/.test(cpf) || /^(\d)\1{10}$/.test(cpf)) return false;
    const n = cpf.split('').map(Number);
    const dv = (qtd) => (n.slice(0, qtd).reduce((s, x, i) => s + x * (qtd + 1 - i), 0) * 10) % 11 % 10;
    return dv(9) === n[9] && dv(10) === n[10];
}

/** Mapa título normalizado → campo, com os títulos do modelo, os padrões e os nomes antigos. */
function mapaDeRotulos(modelo) {
    const mapa = new Map();
    for (const [campo, def] of Object.entries(CAMPOS)) {
        mapa.set(normalizarRotulo(def.rotulo), campo);
        mapa.set(normalizarRotulo(campo), campo);
        for (const a of APELIDOS[campo] || []) mapa.set(normalizarRotulo(a), campo);
    }
    for (const c of modelo.colunas) mapa.set(normalizarRotulo(c.rotulo), c.campo);
    return mapa;
}

/**
 * Lê a planilha preenchida. A linha de títulos é procurada nas primeiras linhas (o cabeçalho do
 * modelo pode ter título, evento, empresa e instruções); as colunas valem pelo título, em qualquer ordem.
 * @returns {Promise<{ linhas: Array<{ linha: number, dados: object }>, erros: Array<{ linha: number, motivo: string }> }>}
 */
async function lerPlanilha(buffer, modelo) {
    const wb = new ExcelJS.Workbook();
    try {
        await wb.xlsx.load(buffer);
    } catch {
        const err = new Error('Arquivo inválido. Envie a planilha em .xlsx (use o modelo do evento).');
        err.status = 400;
        throw err;
    }
    const ws = wb.worksheets.find(w => w.state !== 'hidden') || wb.worksheets[0];
    if (!ws) {
        const err = new Error('A planilha está vazia.');
        err.status = 400;
        throw err;
    }

    const mapa = mapaDeRotulos(modelo);
    let linhaTitulos = null;
    let colunas = null; // número da coluna → campo
    for (let r = 1; r <= Math.min(MAX_LINHAS_CABECALHO, ws.rowCount); r++) {
        const achadas = new Map();
        ws.getRow(r).eachCell({ includeEmpty: false }, (cell, col) => {
            const campo = mapa.get(normalizarRotulo(valorCelula(cell)));
            if (campo && ![...achadas.values()].includes(campo)) achadas.set(col, campo);
        });
        const campos = [...achadas.values()];
        if (campos.includes('cpf') && campos.includes('nome_completo')) {
            linhaTitulos = r;
            colunas = achadas;
            break;
        }
    }
    if (!linhaTitulos) {
        const err = new Error('Não encontramos a linha de títulos com as colunas NOME COMPLETO e CPF. Use o modelo do evento.');
        err.status = 400;
        throw err;
    }

    const obrigatorias = modelo.colunas.filter(c => c.obrigatoria).map(c => c.campo);
    const rotuloDe = Object.fromEntries(modelo.colunas.map(c => [c.campo, c.rotulo]));
    const linhas = [];
    const erros = [];
    const cpfsVistos = new Map();

    for (let r = linhaTitulos + 1; r <= ws.rowCount; r++) {
        const row = ws.getRow(r);
        const dados = {};
        const problemas = [];
        let algumValor = false;

        for (const [col, campo] of colunas) {
            const bruto = valorCelula(row.getCell(col));
            if (bruto === '' || (typeof bruto === 'string' && !bruto.trim())) continue;
            algumValor = true;
            const tipo = CAMPOS[campo].tipo;
            if (tipo === 'cpf') dados.cpf = lerCpf(bruto);
            else if (tipo === 'data') {
                const d = lerData(bruto);
                if (d.invalido) problemas.push(`${rotuloDe[campo] || CAMPOS[campo].rotulo} inválida (use DD/MM/AAAA)`);
                else dados[campo] = d.valor;
            } else if (tipo === 'email') dados[campo] = String(bruto).trim().toLowerCase().slice(0, 200);
            else dados[campo] = String(bruto).replace(/\s+/g, ' ').trim().slice(0, 200);
        }
        if (!algumValor) continue; // linha vazia

        if (!dados.cpf) problemas.push('CPF não informado');
        else if (!cpfValido(dados.cpf)) problemas.push(`CPF ${cpfFormatado(dados.cpf)} inválido`);
        else if (cpfsVistos.has(dados.cpf)) problemas.push(`CPF repetido (já aparece na linha ${cpfsVistos.get(dados.cpf)})`);
        for (const campo of obrigatorias) {
            if (campo !== 'cpf' && !dados[campo]) problemas.push(`${rotuloDe[campo]} é obrigatório`);
        }

        if (problemas.length) erros.push({ linha: r, motivo: problemas.join('; ') });
        else {
            cpfsVistos.set(dados.cpf, r);
            linhas.push({ linha: r, dados });
        }
    }

    return { linhas, erros };
}

module.exports = {
    CAMPOS,
    MODELO_PADRAO,
    sanitizarModelo,
    montarWorkbook,
    lerPlanilha,
    normalizarRotulo,
    lerData,
    lerCpf,
    cpfValido
};
