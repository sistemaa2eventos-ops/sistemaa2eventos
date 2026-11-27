import { cores } from '../styles/tokens';
/**
 * Desenho único das etiquetas e crachás.
 *
 * O editor (tela), a pré-visualização e a impressão usam estas mesmas funções, então o que se vê
 * no editor é o que sai na impressora. As coordenadas dos elementos estão em "px do editor"
 * (3 px = 1 mm). Quem chama passa `u(px)`, que converte para a unidade de saída
 * (mm na impressão, px na tela, px reduzidos na miniatura dos modelos).
 */
export const ESCALA_EDITOR = 3;

export const unidadeMm = (px) => `${Math.round(((Number(px) || 0) / ESCALA_EDITOR) * 1000) / 1000}mm`;
export const unidadePx = (fator = 1) => (px) => `${Math.round((Number(px) || 0) * fator * 100) / 100}px`;

export const escapar = (t) => String(t ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/** Troca {marcador} pelo valor da pessoa; marcador desconhecido some (não imprime "{xyz}"). */
export const preencher = (texto, dados) => String(texto ?? '').replace(/\{(\w+)\}/g, (_, chave) => dados?.[chave] ?? '');

/** Campos derivados que não vêm prontos da API (primeiro nome, CPF parcial para LGPD). */
export const enriquecerDados = (dados = {}) => {
    const nome = String(dados.nome_pessoa || dados.nome_completo || '').trim();
    const cpf = String(dados.cpf || '').replace(/\D/g, '');
    return {
        primeiro_nome: nome.split(/\s+/)[0] || '',
        cpf_parcial: cpf.length === 11 ? `***.${cpf.slice(3, 6)}.${cpf.slice(6, 9)}-**` : '',
        ...dados
    };
};

// Só fontes de sistema: o iframe de impressão não carrega fontes da web.
export const FONTES = [
    { valor: 'arial', rotulo: 'Arial', css: 'Arial, Helvetica, sans-serif', largura: 0.55 },
    { valor: 'arial_black', rotulo: 'Arial Black', css: "'Arial Black', 'Arial Bold', Arial, sans-serif", largura: 0.68 },
    { valor: 'segoe', rotulo: 'Segoe UI', css: "'Segoe UI', Roboto, Arial, sans-serif", largura: 0.55 },
    { valor: 'verdana', rotulo: 'Verdana', css: 'Verdana, Geneva, sans-serif', largura: 0.62 },
    { valor: 'tahoma', rotulo: 'Tahoma', css: 'Tahoma, Verdana, sans-serif', largura: 0.56 },
    { valor: 'trebuchet', rotulo: 'Trebuchet MS', css: "'Trebuchet MS', Helvetica, sans-serif", largura: 0.55 },
    { valor: 'impact', rotulo: 'Impact', css: "Impact, Haettenschweiler, 'Arial Narrow Bold', sans-serif", largura: 0.47 },
    { valor: 'georgia', rotulo: 'Georgia', css: "Georgia, 'Times New Roman', serif", largura: 0.56 },
    { valor: 'times', rotulo: 'Times New Roman', css: "'Times New Roman', Times, serif", largura: 0.5 },
    { valor: 'courier', rotulo: 'Courier New', css: "'Courier New', Courier, monospace", largura: 0.6 }
];
const fonteDe = (valor) => FONTES.find(f => f.valor === valor) || FONTES[0];

/** Pictogramas vetoriais (viewBox 24×24) para crachás: setor, função, avisos. */
export const ICONES = {
    estrela: { rotulo: 'Estrela', d: 'M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z' },
    estrela_contorno: { rotulo: 'Estrela (contorno)', d: 'M22 9.24l-7.19-.62L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21 12 17.27 18.18 21l-1.63-7.03L22 9.24zM12 15.4l-3.76 2.27 1-4.28-3.32-2.88 4.38-.38L12 6.1l1.71 4.04 4.38.38-3.32 2.88 1 4.28L12 15.4z' },
    check: { rotulo: 'Liberado', d: 'M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z' },
    proibido: { rotulo: 'Proibido', d: 'M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zM4 12c0-4.42 3.58-8 8-8 1.85 0 3.55.63 4.9 1.69L5.69 16.9C4.63 15.55 4 13.85 4 12zm8 8c-1.85 0-3.55-.63-4.9-1.69L18.31 7.1C19.37 8.45 20 10.15 20 12c0 4.42-3.58 8-8 8z' },
    alerta: { rotulo: 'Atenção', d: 'M1 21h22L12 2 1 21zm12-3h-2v-2h2v2zm0-4h-2v-4h2v4z' },
    pessoa: { rotulo: 'Pessoa', d: 'M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z' },
    escudo: { rotulo: 'Segurança', d: 'M12 1L3 5v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V5l-9-4z' },
    camera: { rotulo: 'Imprensa', d: 'M12 15.2a3.2 3.2 0 1 0 0-6.4 3.2 3.2 0 0 0 0 6.4zM9 2L7.17 4H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2h-3.17L15 2H9zm3 15c-2.76 0-5-2.24-5-5s2.24-5 5-5 5 2.24 5 5-2.24 5-5 5z' },
    microfone: { rotulo: 'Palco / artista', d: 'M12 14c1.66 0 2.99-1.34 2.99-3L15 5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3zm5.3-3c0 3-2.54 5.1-5.3 5.1S6.7 14 6.7 11H5c0 3.41 2.72 6.23 6 6.72V21h2v-3.28c3.28-.48 6-3.3 6-6.72h-1.7z' },
    musica: { rotulo: 'Música', d: 'M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z' },
    saude: { rotulo: 'Saúde / brigada', d: 'M19 3H5c-1.1 0-1.99.9-1.99 2L3 19c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-1 11h-4v4h-4v-4H6v-4h4V6h4v4h4v4z' },
    ferramenta: { rotulo: 'Técnico', d: 'M22.7 19l-9.1-9.1c.9-2.3.4-5-1.5-6.9-2-2-5-2.4-7.4-1.3L9 6 6 9 1.6 4.7C.4 7.1.9 10.1 2.9 12.1c1.9 1.9 4.6 2.4 6.9 1.5l9.1 9.1c.4.4 1 .4 1.4 0l2.3-2.3c.5-.4.5-1.1.1-1.4z' },
    chave: { rotulo: 'Acesso', d: 'M12.65 10C11.83 7.67 9.61 6 7 6c-3.31 0-6 2.69-6 6s2.69 6 6 6c2.61 0 4.83-1.67 5.65-4H17v4h4v-4h2v-4H12.65zM7 14c-1.1 0-2-.9-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2z' },
    alimentacao: { rotulo: 'Alimentação', d: 'M11 9H9V2H7v7H5V2H3v7c0 2.12 1.66 3.84 3.75 3.97V22h2.5v-9.03C11.34 12.84 13 11.12 13 9V2h-2v7zm5-3v8h2.5v8H21V2c-2.76 0-5 2.24-5 4z' },
    calendario: { rotulo: 'Data', d: 'M17 12h-5v5h5v-5zM16 1v2H8V1H6v2H5c-1.11 0-1.99.9-1.99 2L3 19c0 1.1.89 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2h-1V1h-2zm3 18H5V8h14v11z' },
    local: { rotulo: 'Local / setor', d: 'M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z' },
    coracao: { rotulo: 'Coração', d: 'M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z' },
    raio: { rotulo: 'Raio', d: 'M7 2v11h3v9l7-12h-4l4-8z' }
};

// Tabela de codificação CODE 39 para geração vetorial SVG direta de código de barras 1D
const CODE39 = {
    '0': '000110100', '1': '100100001', '2': '001100001', '3': '101100000',
    '4': '000110001', '5': '100110000', '6': '001110000', '7': '000100101',
    '8': '100100100', '9': '001100100', 'A': '100001001', 'B': '001001001',
    'C': '101001000', 'D': '000011001', 'E': '100011000', 'F': '001011000',
    'G': '000001101', 'H': '100001100', 'I': '001001100', 'J': '000011100',
    'K': '100000011', 'L': '001000011', 'M': '101000010', 'N': '000010011',
    'O': '100010010', 'P': '001010010', 'Q': '000000111', 'R': '100000110',
    'S': '001000110', 'T': '000010110', 'U': '110000001', 'V': '011000001',
    'W': '111000000', 'X': '010010001', 'Y': '110010000', 'Z': '011010000',
    '-': '010000101', '.': '110000100', ' ': '011000100', '$': '010101000',
    '/': '010100010', '+': '010001010', '%': '000101010', '*': '010010100'
};

export function gerarBarcodeSvg(texto, exibirTexto = true, cor = '#000000') {
    const raw = String(texto || '').toUpperCase().replace(/[^0-9A-Z\-.$/+% ]/g, '');
    const clean = raw || '123456';
    const encoded = `*${clean}*`;
    const narrow = 2;
    const wide = 5;
    const gap = 2;
    const bars = [];
    let curX = 10;
    const barHeight = 40;

    for (let i = 0; i < encoded.length; i++) {
        const pattern = CODE39[encoded[i]] || CODE39['-'];
        for (let b = 0; b < 9; b++) {
            const width = pattern[b] === '1' ? wide : narrow;
            if (b % 2 === 0) bars.push(`<rect x="${curX}" y="2" width="${width}" height="${barHeight}" />`);
            curX += width;
        }
        curX += gap;
    }
    const totalWidth = curX + 10;
    const totalHeight = exibirTexto ? 56 : 44;
    const textSvg = exibirTexto ? `<text x="${totalWidth / 2}" y="52" text-anchor="middle" font-family="monospace, sans-serif" font-size="11" font-weight="600">${escapar(clean)}</text>` : '';
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${totalWidth} ${totalHeight}" width="100%" height="100%" preserveAspectRatio="none" style="display:block"><rect width="100%" height="100%" fill={cores.textoForte} /><g fill="${cor}">${bars.join('')}${textSvg}</g></svg>`;
}

/** QR de mentira, mas com cara de QR (cantos de posição + módulos), só para o editor e testes. */
export function gerarQrExemploSvg(semente = 'A2-EVENTOS', cor = '#000000') {
    const n = 25;
    let h = 2166136261;
    for (const c of String(semente)) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619); }
    const aleatorio = () => { h ^= h << 13; h ^= h >>> 17; h ^= h << 5; return ((h >>> 0) % 1000) / 1000; };
    const naZonaDeCanto = (x, y) => (x < 8 && y < 8) || (x >= n - 8 && y < 8) || (x < 8 && y >= n - 8);
    let d = '';
    for (let y = 0; y < n; y++) {
        for (let x = 0; x < n; x++) {
            if (naZonaDeCanto(x, y)) continue;
            const ligado = (y === 6 || x === 6) ? (x + y) % 2 === 0 : aleatorio() < 0.48;
            if (ligado) d += `M${x} ${y}h1v1h-1z`;
        }
    }
    [[0, 0], [n - 7, 0], [0, n - 7]].forEach(([fx, fy]) => {
        d += `M${fx} ${fy}h7v7h-7zM${fx + 1} ${fy + 1}v5h5v-5zM${fx + 2} ${fy + 2}h3v3h-3z`;
    });
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="-1 -1 ${n + 2} ${n + 2}" width="100%" height="100%" preserveAspectRatio="xMidYMid meet" shape-rendering="crispEdges" style="display:block"><rect x="-1" y="-1" width="${n + 2}" height="${n + 2}" fill={cores.textoForte}/><path fill="${cor}" fill-rule="evenodd" d="${d}"/></svg>`;
}

const SILHUETA = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="100%" height="100%" preserveAspectRatio="xMidYMid slice" style="display:block"><rect width="24" height="24" fill="#E6EAF0"/><path fill="#A3ADBB" d="M12 12.6c2.35 0 4.25-1.9 4.25-4.25S14.35 4.1 12 4.1 7.75 6 7.75 8.35 9.65 12.6 12 12.6zm0 2.1c-2.84 0-8.5 1.42-8.5 4.25V24h17v-5.05c0-2.83-5.66-4.25-8.5-4.25z"/></svg>';

// ---------- Formas vetoriais (com contorno real, sem preenchimento se quiser) ----------
export const FORMAS = {
    retangulo: 'Retângulo',
    pilula: 'Pílula',
    elipse: 'Elipse / círculo',
    triangulo: 'Triângulo',
    losango: 'Losango',
    hexagono: 'Hexágono',
    estrela: 'Estrela',
    seta: 'Seta'
};

const PONTOS = {
    triangulo: [[0.5, 0], [1, 1], [0, 1]],
    losango: [[0.5, 0], [1, 0.5], [0.5, 1], [0, 0.5]],
    hexagono: [[0.25, 0], [0.75, 0], [1, 0.5], [0.75, 1], [0.25, 1], [0, 0.5]],
    seta: [[0, 0.3], [0.6, 0.3], [0.6, 0.04], [1, 0.5], [0.6, 0.96], [0.6, 0.7], [0, 0.7]],
    estrela: Array.from({ length: 10 }, (_, i) => {
        const r = i % 2 === 0 ? 0.5 : 0.21;
        const a = (-90 + i * 36) * (Math.PI / 180);
        return [0.5 + r * Math.cos(a), 0.52 + r * Math.sin(a) * 1.02];
    })
};

export const formaDoElemento = (el) => (el.type === 'circle' ? 'elipse' : (el.forma || 'retangulo'));

export const semPreenchimento = (el) => Boolean(el.semPreenchimento) || el.backgroundColor === 'transparent' || el.backgroundColor === '';

const tracejado = (estilo, sw) => {
    if (estilo === 'dashed') return ` stroke-dasharray="${sw * 3} ${sw * 2}"`;
    if (estilo === 'dotted') return ` stroke-dasharray="0.01 ${sw * 2}" stroke-linecap="round"`;
    return '';
};

export function svgForma(el, w, h) {
    const sw = Math.max(0, Number(el.borderWidth ?? (el.borderColor ? 1 : 0)) || 0);
    const traco = sw > 0 ? (el.borderColor || '#000000') : 'none';
    const fill = semPreenchimento(el) ? 'none' : (el.backgroundColor ?? cores.primaria);
    const attrs = `fill="${fill}" stroke="${traco}" stroke-width="${sw}"${tracejado(el.strokeStyle, sw)}`;
    const i = sw / 2;
    const W = Math.max(0.1, w - sw);
    const H = Math.max(0.1, h - sw);
    const forma = formaDoElemento(el);
    let corpo;
    if (forma === 'retangulo' || forma === 'pilula') {
        const r = forma === 'pilula' ? Math.min(W, H) / 2 : Math.min(Number(el.borderRadius) || 0, W / 2, H / 2);
        corpo = `<rect x="${i}" y="${i}" width="${W}" height="${H}" rx="${r}" ry="${r}" ${attrs}/>`;
    } else if (forma === 'elipse') {
        corpo = `<ellipse cx="${w / 2}" cy="${h / 2}" rx="${W / 2}" ry="${H / 2}" ${attrs}/>`;
    } else {
        const pts = (PONTOS[forma] || PONTOS.triangulo).map(([px, py]) => `${(i + px * W).toFixed(2)},${(i + py * H).toFixed(2)}`).join(' ');
        corpo = `<polygon points="${pts}" stroke-linejoin="round" ${attrs}/>`;
    }
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="100%" height="100%" preserveAspectRatio="none" style="display:block">${corpo}</svg>`;
}

function svgLinha(el, w, h) {
    const sw = Math.max(0.5, Number(el.borderWidth) || 2);
    const cor = el.borderColor || el.color || '#000000';
    const d = h > w ? `M${w / 2} 0V${h}` : `M0 ${h / 2}H${w}`;
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="100%" height="100%" preserveAspectRatio="none" style="display:block"><path d="${d}" stroke="${cor}" stroke-width="${sw}"${tracejado(el.strokeStyle, sw)} fill="none"/></svg>`;
}

// ---------- Texto ----------
const pesoDe = (fw) => {
    if (fw === 'bold') return 700;
    if (!fw || fw === 'normal') return 400;
    return Number(fw) || 400;
};

/** Tamanho final da fonte: com "Reduzir para caber", encolhe até o texto caber na caixa. */
export function tamanhoDaFonte(el, texto, w, h) {
    let fs = Number(el.fontSize) || 14;
    if (!el.autoAjuste) return fs;
    const fonte = fonteDe(el.fontFamily);
    const pad = Number(el.padding) || 0;
    const bw = el.borderColor && Number(el.borderWidth) > 0 ? Number(el.borderWidth) : 0;
    const ls = Number(el.letterSpacing) || 0;
    const lh = Number(el.lineHeight) || 1.15;
    const linhas = String(texto).split('\n');
    const maior = Math.max(1, ...linhas.map(l => l.length));
    let fator = fonte.largura;
    if (pesoDe(el.fontWeight) >= 600) fator *= 1.08;
    if (el.textTransform === 'uppercase') fator *= 1.14;
    const disponivel = Math.max(1, w - pad * 2 - bw * 2 - 1);
    if (maior * (fs * fator + ls) > disponivel) fs = (disponivel / maior - ls) / fator;
    const maxAltura = (h - pad * 2 - bw * 2) / (linhas.length * lh);
    if (fs > maxAltura) fs = maxAltura;
    return Math.max(3, Math.round(fs * 100) / 100);
}

function htmlTexto(el, dados, u, w, h) {
    const texto = preencher(el.content, dados);
    const fonte = fonteDe(el.fontFamily);
    const fs = tamanhoDaFonte(el, texto, w, h);
    const pad = Number(el.padding) || 0;
    const bw = el.borderColor && Number(el.borderWidth) > 0 ? Number(el.borderWidth) : 0;
    const justificar = { top: 'flex-start', middle: 'center', bottom: 'flex-end' }[el.verticalAlign || 'top'] || 'flex-start';
    const fundo = el.backgroundColor && el.backgroundColor !== 'transparent' ? `background:${el.backgroundColor};` : '';
    const borda = bw ? `border:${u(bw)} ${el.strokeStyle || 'solid'} ${el.borderColor};` : '';
    const raio = el.borderRadius ? `border-radius:${u(el.borderRadius)};` : '';
    const estilo = [
        'width:100%;height:100%;box-sizing:border-box;display:flex;flex-direction:column;overflow:hidden',
        `justify-content:${justificar}`,
        `padding:${u(pad)}`,
        `font-family:${fonte.css}`,
        `font-size:${u(fs)}`,
        `font-weight:${pesoDe(el.fontWeight)}`,
        `font-style:${el.italic ? 'italic' : 'normal'}`,
        `text-decoration:${el.sublinhado ? 'underline' : 'none'}`,
        `text-transform:${el.textTransform || 'none'}`,
        `letter-spacing:${u(Number(el.letterSpacing) || 0)}`,
        `line-height:${Number(el.lineHeight) || 1.15}`,
        `color:${el.color || '#000000'}`,
        `text-align:${el.textAlign || 'left'}`,
        `white-space:${el.autoAjuste ? 'pre' : 'pre-wrap'}`,
        'word-break:break-word'
    ].join(';');
    return `<div style="${estilo};${fundo}${borda}${raio}"><div style="display:block">${escapar(texto)}</div></div>`;
}

// ---------- Conteúdo de cada tipo ----------
function conteudoBruto(el, dados, u, w, h) {
    const raio = (r) => (r ? `border-radius:${u(r)};` : '');
    switch (el.type) {
        case 'qrcode': {
            if (dados.qr_imagem) return `<img src="${escapar(dados.qr_imagem)}" alt="" draggable="false" style="width:100%;height:100%;object-fit:contain;display:block">`;
            return dados.exemplo ? gerarQrExemploSvg(preencher(el.content, dados) || 'QR', el.color || '#000000') : '';
        }
        case 'barcode':
            return gerarBarcodeSvg(preencher(el.content || '{pulseira}', dados) || '123456', el.exibirTexto !== false, el.color || '#000000');
        case 'foto': {
            const url = dados.foto_url || dados.foto || null;
            const bw = Number(el.borderWidth ?? (el.borderColor ? 1 : 0)) || 0;
            const forma = el.circular ? 'border-radius:50%;' : raio(el.borderRadius);
            const borda = bw > 0 ? `border:${u(bw)} solid ${el.borderColor || '#000000'};` : '';
            const interno = url
                ? `<img src="${escapar(url)}" alt="" draggable="false" style="width:100%;height:100%;display:block;object-fit:${el.objectFit || 'cover'};object-position:center 25%">`
                : SILHUETA;
            return `<div style="width:100%;height:100%;box-sizing:border-box;overflow:hidden;${forma}${borda}">${interno}</div>`;
        }
        case 'image': {
            const src = el.content || el.url;
            if (!src) return '';
            return `<img src="${escapar(src)}" alt="" draggable="false" style="width:100%;height:100%;display:block;object-fit:${el.objectFit || 'contain'};${raio(el.borderRadius)}">`;
        }
        case 'icone': {
            const ic = ICONES[el.icone] || ICONES.estrela;
            return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="100%" height="100%" preserveAspectRatio="xMidYMid meet" style="display:block"><path fill="${el.color || '#000000'}" d="${ic.d}"/></svg>`;
        }
        case 'shape':
        case 'circle':
            return svgForma(el, w, h);
        case 'line':
            return svgLinha(el, w, h);
        default:
            return htmlTexto(el, dados, u, w, h);
    }
}

export const rotacaoDe = (el) => (((Number(el.rotacao) || 0) % 360) + 360) % 360;

/** HTML do conteúdo do elemento, ocupando 100% da caixa dele (com rotação de 90° em 90°). */
export function conteudoHtml(el, dados, u) {
    const rot = rotacaoDe(el);
    const troca = rot === 90 || rot === 270;
    const w = troca ? el.height : el.width;
    const h = troca ? el.width : el.height;
    const interno = conteudoBruto(el, dados || {}, u, w, h);
    if (!rot) return interno;
    return `<div style="position:absolute;left:50%;top:50%;width:${u(w)};height:${u(h)};transform:translate(-50%,-50%) rotate(${rot}deg)">${interno}</div>`;
}

/** Todos os elementos imprimíveis do layout, já posicionados (para impressão e miniaturas). */
export function elementosHtml(layout, dados, u, { incluirReferencia = false } = {}) {
    const completos = enriquecerDados(dados);
    return (layout?.elementos || [])
        .filter(el => !el.oculto && (incluirReferencia || !el.apenasReferencia))
        .map((el, index) => {
            const z = el.zIndex != null ? el.zIndex : index + 2;
            const opacidade = el.opacity != null && el.opacity !== 1 ? `opacity:${el.opacity};` : '';
            return `<div style="position:absolute;left:${u(el.x)};top:${u(el.y)};width:${u(el.width)};height:${u(el.height)};z-index:${z};overflow:hidden;box-sizing:border-box;${opacidade}">${conteudoHtml(el, completos, u)}</div>`;
        })
        .join('');
}

/** Fundo do papel (cor + arte antiga em modo "fundo fixo"). */
export function estiloFundoPapel(papel = {}) {
    const ehReferencia = Boolean(papel.fundo_como_referencia || papel.modo_referencia || papel.imprimir_fundo === false);
    const url = !ehReferencia ? (papel.background_url || papel.bg_url || null) : null;
    const cor = papel.corFundo || cores.textoForte;
    return url
        ? `background-color:${cor};background-image:url('${String(url).replace(/'/g, '%27')}');background-size:cover;background-position:center;background-repeat:no-repeat;`
        : `background-color:${cor};`;
}
