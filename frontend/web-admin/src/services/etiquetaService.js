import api from './api';

/**
 * Impressão de etiqueta pelo navegador do operador: usa a impressora instalada no Windows
 * (Zebra, Argox, Elgin, A4...). O layout vem de Configurações → Etiquetas, onde as posições
 * estão em pixels de tela na escala do editor (3 px = 1 mm).
 */
const ESCALA_EDITOR = 3;
const CACHE_MS = 60 * 1000;
const cache = new Map(); // eventoId → { expira, config }

// Mesmo layout inicial do editor: evento sem layout salvo ainda imprime algo útil
const LAYOUT_PADRAO = {
    papel_config: { width: 100, height: 150 },
    elementos: [
        { id: '1', type: 'text', content: '{nome_pessoa}', x: 10, y: 10, width: 200, height: 30, fontSize: 16, fontWeight: 'bold' },
        { id: '2', type: 'text', content: '{empresa}', x: 10, y: 45, width: 200, height: 25, fontSize: 14, fontWeight: 'normal' },
        { id: '3', type: 'qrcode', content: '{qr_code}', x: 50, y: 80, width: 100, height: 100 }
    ]
};

const escapar = (t) => String(t ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const mm = (px) => `${(Number(px) || 0) / ESCALA_EDITOR}mm`;

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

export function gerarBarcodeSvg(texto, exibirTexto = true) {
    const raw = String(texto || '').toUpperCase().replace(/[^0-9A-Z\-.$/+% ]/g, '');
    const clean = raw || '123456';
    const encoded = `*${clean}*`;
    const narrow = 2;
    const wide = 5;
    const gap = 2;
    let bars = [];
    let curX = 10;
    const barHeight = 40;

    for (let i = 0; i < encoded.length; i++) {
        const char = encoded[i];
        const pattern = CODE39[char] || CODE39['-'];
        for (let b = 0; b < 9; b++) {
            const isBar = (b % 2 === 0);
            const isWide = pattern[b] === '1';
            const width = isWide ? wide : narrow;
            if (isBar) {
                bars.push(`<rect x="${curX}" y="2" width="${width}" height="${barHeight}" fill="#000000" />`);
            }
            curX += width;
        }
        curX += gap;
    }
    const totalWidth = curX + 10;
    const totalHeight = exibirTexto ? 56 : 44;
    const textSvg = exibirTexto ? `<text x="${totalWidth / 2}" y="52" text-anchor="middle" font-family="monospace, sans-serif" font-size="11" fill="#000000" font-weight="600">${escapar(clean)}</text>` : '';
    const bgSvg = `<rect width="100%" height="100%" fill="#FFFFFF" />`;
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${totalWidth} ${totalHeight}" width="100%" height="100%" preserveAspectRatio="none">${bgSvg}${bars.join('')}${textSvg}</svg>`;
}

/** Troca {marcador} pelo valor da pessoa; marcador desconhecido some (não imprime "{xyz}"). */
export const preencher = (texto, dados) => String(texto || '').replace(/\{(\w+)\}/g, (_, chave) => dados?.[chave] ?? '');

export const limparCacheEtiqueta = (eventoId) => { if (eventoId) cache.delete(eventoId); else cache.clear(); };

/** Layout e a opção "imprimir no check-in" do evento, guardados por 1 minuto. */
export async function carregarConfigEtiqueta(eventoId) {
    const item = cache.get(eventoId);
    if (item && item.expira > Date.now()) return item.config;
    const { data } = await api.get('/config/etiquetas', { params: { evento_id: eventoId } });
    const layout = data?.data?.elementos?.length ? data.data : LAYOUT_PADRAO;
    const config = { imprimir: !!data?.imprimir_no_checkin, layout };
    cache.set(eventoId, { expira: Date.now() + CACHE_MS, config });
    return config;
}

export function montarHtmlEtiqueta(layout, dados) {
    const papel = layout?.papel_config || LAYOUT_PADRAO.papel_config;
    const largura = Number(papel.width) || 100;
    const altura = Number(papel.height) || 150;

    // Situação C: se a arte for marcada como gabarito de referência visual ou imprimir_fundo for falso, NÃO imprime a imagem
    const ehApenasReferencia = Boolean(papel.fundo_como_referencia || papel.modo_referencia || papel.imprimir_fundo === false);
    const bgUrl = !ehApenasReferencia ? (papel.background_url || papel.bg_url || null) : null;
    const bgStyle = bgUrl ? `background-image: url('${bgUrl}'); background-size: cover; background-position: center; background-repeat: no-repeat;` : 'background-color: #ffffff;';

    const elementos = (layout?.elementos || []).map((el, index) => {
        const zIndex = el.zIndex != null ? el.zIndex : (index + 2);
        const caixa = `left:${mm(el.x)};top:${mm(el.y)};width:${mm(el.width)};height:${mm(el.height)};z-index:${zIndex}`;
        const borda = el.borderRadius ? `border-radius: ${el.borderRadius}px;` : '';
        const borderStyle = el.borderColor ? `border: ${el.borderWidth || 1}px solid ${el.borderColor};` : '';
        const opacidade = el.opacity != null ? `opacity: ${el.opacity};` : '';

        if (el.type === 'qrcode') {
            if (dados.qr_imagem) return `<img class="el" style="${caixa};object-fit:contain;${borda}" src="${dados.qr_imagem}" alt="QR">`;
            return dados.exemplo ? `<div class="el qr-exemplo" style="${caixa};${borda}">QR</div>` : '';
        }

        if (el.type === 'barcode') {
            const codigo = preencher(el.content || '{pulseira}', dados) || '123456';
            const svg = gerarBarcodeSvg(codigo, el.exibirTexto !== false);
            return `<div class="el" style="${caixa};display:flex;align-items:center;justify-content:center;${opacidade}">${svg}</div>`;
        }

        if (el.type === 'foto') {
            const fotoUrl = dados.foto_url || dados.foto || null;
            if (fotoUrl) {
                return `<img class="el" style="${caixa};object-fit:cover;${borda}${borderStyle}" src="${fotoUrl}" alt="Foto">`;
            }
            return `<div class="el foto-placeholder" style="${caixa};${borda}${borderStyle}">Foto</div>`;
        }

        if (el.type === 'image') {
            const imgSrc = el.content || el.url;
            if (imgSrc) {
                return `<img class="el" style="${caixa};object-fit:contain;${borda}${opacidade}" src="${imgSrc}" alt="Elemento">`;
            }
            return '';
        }

        if (el.type === 'circle') {
            const bgCor = el.backgroundColor || el.cor || '#00D4FF';
            return `<div class="el" style="${caixa};background-color:${bgCor};border-radius:50%;${borderStyle}${opacidade}"></div>`;
        }

        if (el.type === 'line') {
            const corLinha = el.color || el.borderColor || '#000000';
            const espessura = el.borderWidth || 2;
            return `<div class="el" style="${caixa};border-top:${espessura}px solid ${corLinha};${opacidade}"></div>`;
        }

        if (el.type === 'shape') {
            const bgCor = el.backgroundColor || el.cor || '#000000';
            return `<div class="el" style="${caixa};background-color:${bgCor};${borda}${borderStyle}${opacidade}"></div>`;
        }

        // Tipo texto
        const cor = el.color ? `color:${el.color};` : 'color:#000000;';
        const align = el.textAlign ? `text-align:${el.textAlign};` : '';
        const transform = el.textTransform ? `text-transform:${el.textTransform};` : '';
        const fonte = `font-size:${mm(el.fontSize || 14)};font-weight:${el.fontWeight === 'bold' ? 700 : 400};${cor}${align}${transform}`;
        return `<div class="el" style="${caixa};${fonte}">${escapar(preencher(el.content, dados))}</div>`;
    }).join('');

    return `<!doctype html><html><head><meta charset="utf-8"><title>Etiqueta / Crachá</title><style>
        @page { size: ${largura}mm ${altura}mm; margin: 0; }
        html, body { margin: 0; padding: 0; }
        .pagina { position: relative; width: ${largura}mm; height: ${altura}mm; overflow: hidden; font-family: Arial, Helvetica, sans-serif; color: #000; ${bgStyle} }
        .el { position: absolute; overflow: hidden; box-sizing: border-box; line-height: 1.15; }
        .qr-exemplo { box-sizing: border-box; border: 0.4mm dashed #000; display: flex; align-items: center; justify-content: center; font-size: 4mm; background: rgba(0,0,0,0.05); }
        .foto-placeholder { box-sizing: border-box; border: 0.4mm dashed #777; display: flex; align-items: center; justify-content: center; font-size: 3.5mm; color: #777; background: rgba(0,0,0,0.03); }
    </style></head><body><div class="pagina">${elementos}</div></body></html>`;
}

/** Imprime por um iframe invisível; espera o QR carregar antes de chamar a impressão. */
export function imprimirHtml(html) {
    return new Promise((resolve) => {
        const iframe = document.createElement('iframe');
        iframe.setAttribute('aria-hidden', 'true');
        Object.assign(iframe.style, { position: 'fixed', right: '0', bottom: '0', width: '0', height: '0', border: '0' });
        document.body.appendChild(iframe);
        const doc = iframe.contentWindow.document;
        doc.open(); doc.write(html); doc.close();
        const imagens = Array.from(doc.images);
        Promise.all(imagens.map(img => img.complete ? null : new Promise(r => { img.onload = r; img.onerror = r; }))).then(() => {
            iframe.contentWindow.focus();
            iframe.contentWindow.print();
            // O diálogo de impressão bloqueia até fechar; o atraso cobre o modo sem diálogo (--kiosk-printing)
            setTimeout(() => { iframe.remove(); resolve(true); }, 1500);
        });
    });
}

/** Imprime a etiqueta de uma pessoa com o layout do evento. */
export async function imprimirEtiqueta(eventoId, pessoaId) {
    const { layout } = await carregarConfigEtiqueta(eventoId);
    const { data } = await api.get(`/config/etiquetas/pessoa/${pessoaId}`, { params: { evento_id: eventoId } });
    return imprimirHtml(montarHtmlEtiqueta(layout, data.data));
}

/**
 * Chamado após um check-in bem-sucedido: imprime só se o evento ligou a opção.
 * Nunca lança: falha de impressão não pode atrapalhar a entrada.
 */
export async function imprimirSeAtivo(eventoId, pessoaId) {
    if (!eventoId || !pessoaId) return false;
    try {
        const { imprimir } = await carregarConfigEtiqueta(eventoId);
        if (!imprimir) return false;
        await imprimirEtiqueta(eventoId, pessoaId);
        return true;
    } catch (err) {
        console.warn('Falha ao imprimir etiqueta:', err?.message || err);
        return false;
    }
}
