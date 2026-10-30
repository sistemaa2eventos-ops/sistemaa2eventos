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
    const elementos = (layout?.elementos || []).map(el => {
        const caixa = `left:${mm(el.x)};top:${mm(el.y)};width:${mm(el.width)};height:${mm(el.height)}`;
        if (el.type === 'qrcode') {
            if (dados.qr_imagem) return `<img class="el" style="${caixa};object-fit:contain" src="${dados.qr_imagem}" alt="">`;
            // Teste de impressão: marca onde o QR vai sair
            return dados.exemplo ? `<div class="el qr-exemplo" style="${caixa}">QR</div>` : '';
        }
        const fonte = `font-size:${mm(el.fontSize || 14)};font-weight:${el.fontWeight === 'bold' ? 700 : 400}`;
        return `<div class="el" style="${caixa};${fonte}">${escapar(preencher(el.content, dados))}</div>`;
    }).join('');
    return `<!doctype html><html><head><meta charset="utf-8"><title>Etiqueta</title><style>
        @page { size: ${largura}mm ${altura}mm; margin: 0; }
        html, body { margin: 0; padding: 0; }
        .pagina { position: relative; width: ${largura}mm; height: ${altura}mm; overflow: hidden; font-family: Arial, Helvetica, sans-serif; color: #000; }
        .el { position: absolute; overflow: hidden; line-height: 1.15; white-space: nowrap; text-overflow: ellipsis; }
        .qr-exemplo { box-sizing: border-box; border: 0.4mm dashed #000; display: flex; align-items: center; justify-content: center; font-size: 4mm; }
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
