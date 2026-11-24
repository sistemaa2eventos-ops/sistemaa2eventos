import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';

let workerConfigurado = false;

async function obterPdfJs() {
    const pdfjs = await import('pdfjs-dist');
    if (!workerConfigurado && pdfjs.GlobalWorkerOptions) {
        const sep = pdfWorkerUrl.includes('?') ? '&' : '?';
        pdfjs.GlobalWorkerOptions.workerSrc = `${pdfWorkerUrl}${sep}mime=js`;
        workerConfigurado = true;
    }
    return pdfjs;
}

function normalizarDimensoes(larguraOrig, alturaOrig, maxLargura = 1280) {
    const w = Math.max(400, Number(larguraOrig || 960));
    const h = Math.max(300, Number(alturaOrig || 600));
    if (w <= maxLargura) {
        return { largura: Math.round(w), altura: Math.round(h) };
    }
    const fator = maxLargura / w;
    return {
        largura: Math.round(maxLargura),
        altura: Math.max(300, Math.round(h * fator))
    };
}

function lerDataUrl(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onerror = () => reject(new Error('Falha ao ler arquivo selecionado.'));
        reader.onload = () => resolve(reader.result);
        reader.readAsDataURL(file);
    });
}

function carregarImagemElemento(src) {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.onerror = () => reject(new Error('Não foi possível decodificar a imagem.'));
        img.onload = () => resolve(img);
        img.src = src;
    });
}

const MAX_PIXELS_CANVAS = 18000000; // ~4096x4390 (seguro para desktop e mobile)
const MAX_DATAURL_BYTES = 7500000;  // cabe com folga no limite de 15 MB do Gateway/API

function exportarCanvasAltaNitidez(canvas, transparente = false) {
    // WebP preserva linhas finas e textos de AutoCAD muito melhor que JPEG e ocupa bem menos que PNG
    const testarWebp = (q) => {
        try {
            const url = canvas.toDataURL('image/webp', q);
            return url.startsWith('data:image/webp') ? url : null;
        } catch {
            return null;
        }
    };

    if (transparente) {
        const webpAlpha = testarWebp(0.94);
        if (webpAlpha && webpAlpha.length <= MAX_DATAURL_BYTES) return webpAlpha;
        const png = canvas.toDataURL('image/png');
        if (png.length <= MAX_DATAURL_BYTES) return png;
        return testarWebp(0.84) || png;
    }

    for (const q of [0.92, 0.85, 0.78]) {
        const webp = testarWebp(q);
        if (webp && webp.length <= MAX_DATAURL_BYTES) return webp;
    }

    let jpeg = canvas.toDataURL('image/jpeg', 0.92);
    if (jpeg.length > MAX_DATAURL_BYTES) {
        jpeg = canvas.toDataURL('image/jpeg', 0.82);
    }
    return jpeg;
}

/**
 * Renderiza uma página de um PDF arquitetônico em alta definição (até 4K) para leitura de cotas e textos no zoom.
 */
export async function renderizarPaginaPdfParaImagem(file, numeroPagina = 1, opcoes = {}) {
    const { maxLargura = 4096, transparente = false } = opcoes;
    const pdfjs = await obterPdfJs();
    const buffer = await file.arrayBuffer();
    const pdf = await pdfjs.getDocument({ data: buffer }).promise;
    const pagAlvo = Math.min(Math.max(1, Number(numeroPagina || 1)), pdf.numPages);
    const page = await pdf.getPage(pagAlvo);

    const viewportBase = page.getViewport({ scale: 1 });
    let escalaRender = Math.min(6, Math.max(1.5, maxLargura / Math.max(1, viewportBase.width)));

    // Protege contra estouro de memória em pranchas A0 muito altas/largas
    const pixelsProjetados = (viewportBase.width * escalaRender) * (viewportBase.height * escalaRender);
    if (pixelsProjetados > MAX_PIXELS_CANVAS) {
        escalaRender *= Math.sqrt(MAX_PIXELS_CANVAS / pixelsProjetados);
    }

    const viewport = page.getViewport({ scale: escalaRender });

    const canvas = document.createElement('canvas');
    canvas.width = Math.round(viewport.width);
    canvas.height = Math.round(viewport.height);
    const ctx2d = canvas.getContext('2d');
    ctx2d.imageSmoothingEnabled = true;
    ctx2d.imageSmoothingQuality = 'high';

    if (!transparente) {
        ctx2d.fillStyle = '#FFFFFF';
        ctx2d.fillRect(0, 0, canvas.width, canvas.height);
    }

    await page.render({ canvasContext: ctx2d, viewport }).promise;

    const imagemUrl = exportarCanvasAltaNitidez(canvas, transparente);

    const { largura, altura } = normalizarDimensoes(viewportBase.width, viewportBase.height, 1280);
    return {
        imagemUrl,
        largura,
        altura,
        larguraRenderPx: canvas.width,
        alturaRenderPx: canvas.height,
        numeroPagina: pagAlvo,
        totalPaginas: pdf.numPages
    };
}

/**
 * Isola um grupo/camada nomeada (<g>) de um arquivo SVG preservando coordenadas e viewBox.
 */
export function extrairCamadaSvgParaImagem(svgTexto, camadaIdAlvo) {
    try {
        const parser = new DOMParser();
        const doc = parser.parseFromString(svgTexto, 'image/svg+xml');
        const svgEl = doc.documentElement;
        if (!svgEl || svgEl.nodeName.toLowerCase() !== 'svg') return null;

        const grupos = Array.from(svgEl.children).filter((el) => el.tagName?.toLowerCase() === 'g');
        for (const g of grupos) {
            const gid = g.getAttribute('id') || '';
            const label = g.getAttribute('inkscape:label') || g.getAttribute('data-name') || gid;
            if (gid !== camadaIdAlvo && label !== camadaIdAlvo) {
                g.remove();
            }
        }

        const xml = new XMLSerializer().serializeToString(svgEl);
        return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(xml)}`;
    } catch {
        return null;
    }
}

/**
 * Inspeciona um arquivo de projeto do arquiteto (PDF, SVG, PNG, JPG, WebP),
 * detecta páginas de PDF ou camadas nomeadas de SVG e prepara o desenho para o mapa.
 */
export async function inspecionarArquivoArquitetura(file) {
    if (!file) throw new Error('Nenhum arquivo selecionado.');
    const nome = file.name || 'projeto';
    const ext = (nome.split('.').pop() || '').toLowerCase();
    const mime = (file.type || '').toLowerCase();

    // 1. PDF técnico (suporta múltiplas pranchas/páginas em alta definição 4K)
    if (ext === 'pdf' || mime === 'application/pdf') {
        const render = await renderizarPaginaPdfParaImagem(file, 1, { maxLargura: 4096, transparente: false });
        return {
            tipo: 'pdf',
            nomeArquivo: nome,
            tamanhoBytes: file.size || 0,
            totalPaginas: render.totalPaginas,
            paginaSelecionada: 1,
            largura: render.largura,
            altura: render.altura,
            imagemUrl: render.imagemUrl,
            camadasDetectadas: [],
            file
        };
    }

    // 2. SVG vetorial (com detecção de camadas <g>)
    if (ext === 'svg' || mime === 'image/svg+xml') {
        const svgTexto = await file.text();
        const parser = new DOMParser();
        const doc = parser.parseFromString(svgTexto, 'image/svg+xml');
        const svgEl = doc.documentElement;

        let vbW = 1200;
        let vbH = 800;
        const vb = svgEl?.getAttribute('viewBox');
        if (vb) {
            const parts = vb.trim().split(/[\s,]+/).map(Number);
            if (parts.length === 4 && parts[2] > 0 && parts[3] > 0) {
                vbW = parts[2];
                vbH = parts[3];
            }
        } else {
            const wAttr = parseFloat(svgEl?.getAttribute('width') || '1200');
            const hAttr = parseFloat(svgEl?.getAttribute('height') || '800');
            if (wAttr > 0 && hAttr > 0) {
                vbW = wAttr;
                vbH = hAttr;
            }
        }

        const grupos = svgEl
            ? Array.from(svgEl.children).filter((el) => el.tagName?.toLowerCase() === 'g')
            : [];
        const camadasDetectadas = grupos
            .map((g, idx) => {
                const idAttr = g.getAttribute('id') || '';
                const rotulo = g.getAttribute('inkscape:label')
                    || g.getAttribute('data-name')
                    || g.getAttribute('aria-label')
                    || idAttr
                    || `Camada ${idx + 1}`;
                const chave = idAttr || rotulo;
                return {
                    id: chave,
                    nome: rotulo,
                    selecionada: true,
                    imagemUrl: extrairCamadaSvgParaImagem(svgTexto, chave)
                };
            })
            .filter((c) => Boolean(c.imagemUrl) && (grupos.length > 1 || c.id));

        const { largura, altura } = normalizarDimensoes(vbW, vbH, 1280);
        const imagemUrl = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svgTexto)}`;

        return {
            tipo: 'svg',
            nomeArquivo: nome,
            tamanhoBytes: file.size || 0,
            totalPaginas: 1,
            largura,
            altura,
            imagemUrl,
            svgTexto,
            camadasDetectadas,
            file
        };
    }

    // 3. Imagens raster (PNG, JPG, WebP)
    const rawUrl = await lerDataUrl(file);
    const img = await carregarImagemElemento(rawUrl);
    const preservaAlpha = ext === 'png' || ext === 'webp' || mime === 'image/png' || mime === 'image/webp';

    const maxRenderW = 4096;
    let scale = img.width > maxRenderW ? (maxRenderW / img.width) : 1;
    if ((img.width * scale) * (img.height * scale) > MAX_PIXELS_CANVAS) {
        scale *= Math.sqrt(MAX_PIXELS_CANVAS / ((img.width * scale) * (img.height * scale)));
    }
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(img.width * scale);
    canvas.height = Math.round(img.height * scale);
    const ctx2d = canvas.getContext('2d');
    ctx2d.imageSmoothingEnabled = true;
    ctx2d.imageSmoothingQuality = 'high';
    if (!preservaAlpha) {
        ctx2d.fillStyle = '#FFFFFF';
        ctx2d.fillRect(0, 0, canvas.width, canvas.height);
    }
    ctx2d.drawImage(img, 0, 0, canvas.width, canvas.height);

    const imagemUrl = exportarCanvasAltaNitidez(canvas, preservaAlpha);
    const { largura, altura } = normalizarDimensoes(img.width, img.height, 1280);

    return {
        tipo: 'imagem',
        nomeArquivo: nome,
        tamanhoBytes: file.size || 0,
        totalPaginas: 1,
        largura,
        altura,
        imagemUrl,
        camadasDetectadas: [],
        file
    };
}
