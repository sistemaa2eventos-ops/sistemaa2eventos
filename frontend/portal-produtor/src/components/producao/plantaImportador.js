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

/**
 * Renderiza uma página de um PDF arquitetônico para imagem pronta para o canvas da planta.
 */
export async function renderizarPaginaPdfParaImagem(file, numeroPagina = 1, opcoes = {}) {
    const { maxLargura = 1600, transparente = false } = opcoes;
    const pdfjs = await obterPdfJs();
    const buffer = await file.arrayBuffer();
    const pdf = await pdfjs.getDocument({ data: buffer }).promise;
    const pagAlvo = Math.min(Math.max(1, Number(numeroPagina || 1)), pdf.numPages);
    const page = await pdf.getPage(pagAlvo);

    const viewportBase = page.getViewport({ scale: 1 });
    const escalaRender = Math.min(2.4, Math.max(1, maxLargura / Math.max(1, viewportBase.width)));
    const viewport = page.getViewport({ scale: escalaRender });

    const canvas = document.createElement('canvas');
    canvas.width = Math.round(viewport.width);
    canvas.height = Math.round(viewport.height);
    const ctx2d = canvas.getContext('2d');

    if (!transparente) {
        ctx2d.fillStyle = '#FFFFFF';
        ctx2d.fillRect(0, 0, canvas.width, canvas.height);
    }

    await page.render({ canvasContext: ctx2d, viewport }).promise;

    let imagemUrl = canvas.toDataURL(transparente ? 'image/png' : 'image/jpeg', 0.88);
    if (!transparente && imagemUrl.length > 2600000) {
        imagemUrl = canvas.toDataURL('image/jpeg', 0.72);
    }

    const { largura, altura } = normalizarDimensoes(viewportBase.width, viewportBase.height, 1280);
    return {
        imagemUrl,
        largura,
        altura,
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

    // 1. PDF técnico (suporta múltiplas pranchas/páginas)
    if (ext === 'pdf' || mime === 'application/pdf') {
        const render = await renderizarPaginaPdfParaImagem(file, 1, { maxLargura: 1600, transparente: false });
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

    const maxRenderW = 1600;
    const scale = img.width > maxRenderW ? (maxRenderW / img.width) : 1;
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(img.width * scale);
    canvas.height = Math.round(img.height * scale);
    const ctx2d = canvas.getContext('2d');
    if (!preservaAlpha) {
        ctx2d.fillStyle = '#FFFFFF';
        ctx2d.fillRect(0, 0, canvas.width, canvas.height);
    }
    ctx2d.drawImage(img, 0, 0, canvas.width, canvas.height);

    const imagemUrl = canvas.toDataURL(preservaAlpha ? 'image/png' : 'image/jpeg', 0.88);
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
