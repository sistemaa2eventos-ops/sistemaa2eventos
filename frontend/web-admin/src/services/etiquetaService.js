import api from './api';
import { obterUrlFoto } from './fotosPessoa';
import {
    ESCALA_EDITOR,
    unidadeMm,
    elementosHtml,
    estiloFundoPapel,
    gerarBarcodeSvg,
    preencher
} from './etiquetaRender';

export { gerarBarcodeSvg, preencher };

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

/**
 * Monta o HTML unificado para impressão de crachás, credenciais e etiquetas.
 * Usa as regras de renderização padrão compartilhadas com o editor.
 */
export function montarHtmlEtiqueta(layout, dados) {
    const papel = layout?.papel_config || LAYOUT_PADRAO.papel_config;
    const larguraMm = Number(papel.width) || 100;
    const alturaMm = Number(papel.height) || 150;

    const bgStyle = estiloFundoPapel(papel);
    const htmlElementos = elementosHtml(layout, dados, unidadeMm, { incluirReferencia: false });

    return `<!doctype html><html><head><meta charset="utf-8"><title>Etiqueta / Crachá</title><style>
        @page { size: ${larguraMm}mm ${alturaMm}mm; margin: 0; }
        html, body { margin: 0; padding: 0; }
        .pagina { position: relative; width: ${larguraMm}mm; height: ${alturaMm}mm; overflow: hidden; font-family: Arial, Helvetica, sans-serif; color: #000; box-sizing: border-box; ${bgStyle} }
    </style></head><body><div class="pagina">${htmlElementos}</div></body></html>`;
}

/** Imprime por um iframe invisível; espera as imagens carregarem antes de chamar a impressão. */
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

/**
 * Troca a foto guardada da pessoa pela URL assinada (bucket privado).
 */
export async function comFotoAssinada(dados, pessoaId) {
    const original = dados?.foto_url_guardada ?? dados?.foto_url;
    if (!original || !pessoaId) return dados;
    const url = await obterUrlFoto(pessoaId, original).catch(() => null);
    return { ...dados, foto_url: url || original, foto_url_guardada: original };
}

/** Imprime a etiqueta de uma pessoa com o layout do evento. */
export async function imprimirEtiqueta(eventoId, pessoaId) {
    const { layout } = await carregarConfigEtiqueta(eventoId);
    const { data } = await api.get(`/config/etiquetas/pessoa/${pessoaId}`, { params: { evento_id: eventoId } });
    const dados = await comFotoAssinada(data.data, pessoaId);
    return imprimirHtml(montarHtmlEtiqueta(layout, dados));
}

/**
 * Chamado após um check-in bem-sucedido: imprime só se o evento ligou a opção.
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
