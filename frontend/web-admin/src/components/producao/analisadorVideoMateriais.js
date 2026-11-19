import { CORES_MATERIAL } from './producaoHelpers';

const NUM_BINS_HUE = 12;
const TOTAL_BINS_HIST = 15; // 12 matizes + 3 acromáticos (escuro, médio, claro)

export function hexParaRgb(hex) {
    if (!hex || typeof hex !== 'string') return null;
    const limpo = hex.replace('#', '').trim();
    if (!/^[0-9a-fA-F]{6}$/.test(limpo)) return null;
    const n = parseInt(limpo, 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export function rgbParaHsv(r, g, b) {
    const rn = r / 255;
    const gn = g / 255;
    const bn = b / 255;
    const max = Math.max(rn, gn, bn);
    const min = Math.min(rn, gn, bn);
    const d = max - min;

    let h = 0;
    if (d > 0.0001) {
        if (max === rn) h = ((gn - bn) / d) % 6;
        else if (max === gn) h = (bn - rn) / d + 2;
        else h = (rn - gn) / d + 4;
        h = (h * 60 + 360) % 360;
    }
    const s = max === 0 ? 0 : d / max;
    const v = max;
    return [h, s, v];
}

function normalizarVetorL2(arr) {
    let somaQuad = 0;
    for (let i = 0; i < arr.length; i += 1) {
        somaQuad += arr[i] * arr[i];
    }
    const norm = Math.sqrt(somaQuad) || 1;
    return arr.map((v) => Math.round((v / norm) * 10000) / 10000);
}

function similaridadeCosseno(a, b) {
    if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return 0;
    let dot = 0;
    let na = 0;
    let nb = 0;
    for (let i = 0; i < a.length; i += 1) {
        dot += a[i] * b[i];
        na += a[i] * a[i];
        nb += b[i] * b[i];
    }
    if (na === 0 || nb === 0) return 0;
    return Math.max(0, Math.min(1, dot / (Math.sqrt(na) * Math.sqrt(nb))));
}

/**
 * Extrai assinatura visual compacta (cor média RGB, histograma HSV 15-D,
 * proporção largura/altura e densidade de bordas) de uma região de um canvas.
 */
export function extrairAssinaturaVisualDeCanvas(canvas, rect = null) {
    if (!canvas || !canvas.width || !canvas.height) return null;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return null;

    const rx = Math.max(0, Math.floor(rect?.x ?? 0));
    const ry = Math.max(0, Math.floor(rect?.y ?? 0));
    const rw = Math.max(2, Math.min(canvas.width - rx, Math.floor(rect?.w ?? canvas.width)));
    const rh = Math.max(2, Math.min(canvas.height - ry, Math.floor(rect?.h ?? canvas.height)));

    let data;
    try {
        data = ctx.getImageData(rx, ry, rw, rh).data;
    } catch {
        return null;
    }

    const hist = new Array(TOTAL_BINS_HIST).fill(0);
    let somaR = 0;
    let somaG = 0;
    let somaB = 0;
    let pixels = 0;
    let somaGrad = 0;
    let amostrasGrad = 0;

    const passo = Math.max(1, Math.floor(Math.sqrt((rw * rh) / 900)));

    for (let y = 0; y < rh; y += passo) {
        for (let x = 0; x < rw; x += passo) {
            const idx = (y * rw + x) * 4;
            const r = data[idx];
            const g = data[idx + 1];
            const b = data[idx + 2];
            const a = data[idx + 3];
            if (a < 20) continue;

            somaR += r;
            somaG += g;
            somaB += b;
            pixels += 1;

            const [h, s, v] = rgbParaHsv(r, g, b);
            if (s >= 0.2 && v >= 0.14) {
                const binHue = Math.min(NUM_BINS_HUE - 1, Math.floor((h / 360) * NUM_BINS_HUE));
                hist[binHue] += 1;
            } else if (v < 0.28) {
                hist[12] += 1;
            } else if (v < 0.72) {
                hist[13] += 1;
            } else {
                hist[14] += 1;
            }

            if (x + passo < rw && y + passo < rh) {
                const idxDir = (y * rw + (x + passo)) * 4;
                const idxBaixo = ((y + passo) * rw + x) * 4;
                const lum = 0.299 * r + 0.587 * g + 0.114 * b;
                const lumDir = 0.299 * data[idxDir] + 0.587 * data[idxDir + 1] + 0.114 * data[idxDir + 2];
                const lumBaixo = 0.299 * data[idxBaixo] + 0.587 * data[idxBaixo + 1] + 0.114 * data[idxBaixo + 2];
                somaGrad += (Math.abs(lum - lumDir) + Math.abs(lum - lumBaixo)) / 510;
                amostrasGrad += 1;
            }
        }
    }

    if (pixels === 0) return null;
    const densidadeBruta = amostrasGrad > 0 ? (somaGrad / amostrasGrad) : 0;

    return {
        cor_media_rgb: [
            Math.round(somaR / pixels),
            Math.round(somaG / pixels),
            Math.round(somaB / pixels)
        ],
        hist_hsv: normalizarVetorL2(hist),
        aspecto: Math.round((rw / Math.max(1, rh)) * 100) / 100,
        densidade_bordas: Math.round(Math.min(1, densidadeBruta * 4.2) * 1000) / 1000
    };
}

/**
 * Carrega uma foto de referência (Data URL ou imagem) e extrai sua assinatura visual.
 */
export function extrairAssinaturaVisualDeImagem(dataUrl) {
    if (!dataUrl || typeof dataUrl !== 'string') return Promise.resolve(null);

    return new Promise((resolve) => {
        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.onerror = () => resolve(null);
        img.onload = () => {
            try {
                const maxLado = 96;
                const escala = Math.min(1, maxLado / Math.max(1, img.width, img.height));
                const w = Math.max(12, Math.round(img.width * escala));
                const h = Math.max(12, Math.round(img.height * escala));
                const canvas = document.createElement('canvas');
                canvas.width = w;
                canvas.height = h;
                const ctx = canvas.getContext('2d', { willReadFrequently: true });
                ctx.drawImage(img, 0, 0, w, h);

                const margemX = Math.floor(w * 0.1);
                const margemY = Math.floor(h * 0.1);
                const sig = extrairAssinaturaVisualDeCanvas(canvas, {
                    x: margemX,
                    y: margemY,
                    w: Math.max(8, w - margemX * 2),
                    h: Math.max(8, h - margemY * 2)
                });
                resolve(sig);
            } catch {
                resolve(null);
            }
        };
        img.src = dataUrl;
    });
}

/**
 * Preenche assinaturas visuais ausentes em materiais que já tenham foto cadastrada.
 */
export async function prepararAssinaturasMateriais(materiais = []) {
    const mapa = new Map();
    await Promise.all((materiais || []).map(async (m) => {
        const fotos = Array.isArray(m.fotos_referencia) ? m.fotos_referencia : [];
        const sigsFotos = [];

        for (const f of fotos) {
            if (f?.assinatura_visual?.hist_hsv) {
                sigsFotos.push(f.assinatura_visual);
            } else if (f?.url) {
                const s = await extrairAssinaturaVisualDeImagem(f.url);
                if (s) sigsFotos.push(s);
            }
        }

        if (sigsFotos.length === 0 && m.foto_referencia_url) {
            const s = await extrairAssinaturaVisualDeImagem(m.foto_referencia_url);
            if (s) sigsFotos.push(s);
        }

        mapa.set(m.id, sigsFotos);
    }));
    return mapa;
}

const ASPECTO_POR_FORMATO = {
    barra_retangular: { aspecto: 2.6, bordas: 0.35 },
    estrutura_vazada: { aspecto: 1.85, bordas: 0.62 },
    painel_plano: { aspecto: 1.75, bordas: 0.24 },
    caixa_cubica: { aspecto: 1.05, bordas: 0.3 },
    cilindrico: { aspecto: 0.65, bordas: 0.26 },
    irregular: { aspecto: 1.25, bordas: 0.36 }
};

/**
 * Constrói uma assinatura sintética a partir de cor + geometria declarada
 * para quando o material ainda não possui foto de referência.
 */
export function criarAssinaturaPorCaracteristicas(material) {
    const car = material?.caracteristicas || {};
    let hex = car.cor_hex_referencia;
    if (!hex && car.cor_predominante) {
        const alvo = car.cor_predominante.toLowerCase();
        hex = CORES_MATERIAL.find((c) => c.rotulo.toLowerCase().includes(alvo))?.hex || '';
    }
    const rgb = hexParaRgb(hex);
    if (!rgb && !car.formato_geometria) return null;

    const corFinal = rgb || [148, 163, 184];
    const [h, s, v] = rgbParaHsv(corFinal[0], corFinal[1], corFinal[2]);
    const hist = new Array(TOTAL_BINS_HIST).fill(0.02);
    if (s >= 0.2 && v >= 0.14) {
        const binHue = Math.min(NUM_BINS_HUE - 1, Math.floor((h / 360) * NUM_BINS_HUE));
        hist[binHue] = 0.8;
        hist[(binHue + 1) % NUM_BINS_HUE] += 0.22;
        hist[(binHue + NUM_BINS_HUE - 1) % NUM_BINS_HUE] += 0.22;
    } else if (v < 0.28) {
        hist[12] = 0.85;
    } else if (v < 0.72) {
        hist[13] = 0.85;
    } else {
        hist[14] = 0.85;
    }

    const fmt = ASPECTO_POR_FORMATO[car.formato_geometria] || { aspecto: 1.35, bordas: 0.32 };
    return {
        cor_media_rgb: corFinal,
        hist_hsv: normalizarVetorL2(hist),
        aspecto: fmt.aspecto,
        densidade_bordas: fmt.bordas
    };
}

function pontuarParAssinaturas(sigA, sigB) {
    if (!sigA || !sigB) return 0;
    const simHist = similaridadeCosseno(sigA.hist_hsv, sigB.hist_hsv);

    const [r1, g1, b1] = sigA.cor_media_rgb || [128, 128, 128];
    const [r2, g2, b2] = sigB.cor_media_rgb || [128, 128, 128];
    const distRgb = Math.sqrt((r1 - r2) ** 2 + (g1 - g2) ** 2 + (b1 - b2) ** 2);
    const simRgb = Math.max(0, 1 - distRgb / 441.67);

    const simBordas = Math.max(
        0,
        1 - Math.abs(Number(sigA.densidade_bordas || 0.3) - Number(sigB.densidade_bordas || 0.3)) * 1.4
    );

    const aspA = Math.max(0.2, Number(sigA.aspecto || 1));
    const aspB = Math.max(0.2, Number(sigB.aspecto || 1));
    const simAspecto = Math.max(0.35, Math.min(aspA, aspB) / Math.max(aspA, aspB));

    return simHist * 0.52 + simRgb * 0.24 + simBordas * 0.14 + simAspecto * 0.1;
}

export function compararAssinaturaComMaterial(sigFrame, material, assinaturasPreComputadas = null) {
    if (!sigFrame || !material) return { score: 0, origem: 'nenhuma' };

    const fotos = Array.isArray(material.fotos_referencia) ? material.fotos_referencia : [];
    const sigsFoto = fotos.map((f) => f?.assinatura_visual).filter((s) => s?.hist_hsv);
    const extras = assinaturasPreComputadas?.get(material.id) || [];
    const todasSigsFoto = sigsFoto.length > 0 ? sigsFoto : extras;

    if (todasSigsFoto.length > 0) {
        let melhor = 0;
        for (const sf of todasSigsFoto) {
            const p = pontuarParAssinaturas(sigFrame, sf);
            if (p > melhor) melhor = p;
        }
        return { score: Math.round(melhor * 1000) / 1000, origem: 'foto' };
    }

    const sigCar = criarAssinaturaPorCaracteristicas(material);
    if (sigCar) {
        const p = pontuarParAssinaturas(sigFrame, sigCar) * 0.88;
        return { score: Math.round(p * 1000) / 1000, origem: 'caracteristicas' };
    }

    return { score: 0.45, origem: 'generico' };
}

export function classificarRegiaoNoCatalogo(sigFrame, materiaisAlvo = [], assinaturasPreComputadas = null) {
    if (!materiaisAlvo.length) {
        return { material: null, confianca: 0, reconhecido: false, origem: 'nenhuma' };
    }

    let melhorMat = null;
    let melhorScore = -1;
    let melhorOrigem = 'nenhuma';

    for (const mat of materiaisAlvo) {
        const res = compararAssinaturaComMaterial(sigFrame, mat, assinaturasPreComputadas);
        if (res.score > melhorScore) {
            melhorScore = res.score;
            melhorMat = mat;
            melhorOrigem = res.origem;
        }
    }

    const limiar = Number(melhorMat?.regra_monitoramento?.confianca_minima ?? 0.65);
    const reconhecido = Boolean(melhorMat && melhorScore >= limiar);

    return {
        material: reconhecido ? melhorMat : null,
        candidato: melhorMat,
        confianca: Math.max(0, Math.min(0.99, Math.round(melhorScore * 100) / 100)),
        reconhecido,
        origem: melhorOrigem
    };
}

/**
 * Tracker multi-objeto leve no navegador usando subtração de fundo adaptativa +
 * associação IoU/centróide + classificação pelas assinaturas visuais do catálogo.
 */
export class AnalisadorVideoTracker {
    constructor() {
        this.gradeW = 160;
        this.gradeH = 90;
        this.fundo = null;
        this.trilhas = [];
        this.proximoTrackId = 1;
        this.contagensPorMaterial = {};
        this.naoReconhecidos = [];
        this.evidenciasPorMaterial = {};
        this.quadrosProcessados = 0;

        this.offscreen = document.createElement('canvas');
        this.offscreen.width = this.gradeW;
        this.offscreen.height = this.gradeH;
        this.offCtx = this.offscreen.getContext('2d', { willReadFrequently: true });
    }

    resetar({ manterFundo = false } = {}) {
        if (!manterFundo) {
            this.fundo = null;
            this.quadrosProcessados = 0;
        }
        this.trilhas = [];
        this.proximoTrackId = 1;
        this.contagensPorMaterial = {};
        this.naoReconhecidos = [];
        this.evidenciasPorMaterial = {};
    }

    capturarRecorteEvidencia(canvasPrincipal, bbox) {
        try {
            const w = Math.min(240, Math.max(96, Math.round(bbox.w * 1.1)));
            const h = Math.min(180, Math.max(72, Math.round(bbox.h * 1.1)));
            const sx = Math.max(0, Math.round(bbox.x - w * 0.05));
            const sy = Math.max(0, Math.round(bbox.y - h * 0.05));
            const sw = Math.min(canvasPrincipal.width - sx, w);
            const sh = Math.min(canvasPrincipal.height - sy, h);
            if (sw < 10 || sh < 10) return null;

            const temp = document.createElement('canvas');
            temp.width = 160;
            temp.height = 110;
            const tCtx = temp.getContext('2d');
            tCtx.drawImage(canvasPrincipal, sx, sy, sw, sh, 0, 0, 160, 110);
            return temp.toDataURL('image/jpeg', 0.72);
        } catch {
            return null;
        }
    }

    detectarBlobsMovimento(larguraCanvas, alturaCanvas, sensibilidade = 28) {
        const { gradeW, gradeH, offCtx } = this;
        const pixels = offCtx.getImageData(0, 0, gradeW, gradeH).data;
        const total = gradeW * gradeH;
        const lumAtual = new Float32Array(total);

        for (let i = 0; i < total; i += 1) {
            const p = i * 4;
            lumAtual[i] = 0.299 * pixels[p] + 0.587 * pixels[p + 1] + 0.114 * pixels[p + 2];
        }

        if (!this.fundo) {
            this.fundo = lumAtual;
            return [];
        }

        const limiarDiff = Math.max(12, Math.min(65, 72 - Number(sensibilidade || 30)));
        const mascara = new Uint8Array(total);
        const alpha = this.quadrosProcessados < 12 ? 0.14 : 0.032;

        for (let i = 0; i < total; i += 1) {
            const diff = Math.abs(lumAtual[i] - this.fundo[i]);
            if (diff > limiarDiff) {
                mascara[i] = 1;
            }
            this.fundo[i] = this.fundo[i] * (1 - alpha) + lumAtual[i] * alpha;
        }
        this.quadrosProcessados += 1;

        const visitado = new Uint8Array(total);
        const caixasBrutas = [];
        const fila = new Int32Array(total);

        for (let y = 1; y < gradeH - 1; y += 1) {
            for (let x = 1; x < gradeW - 1; x += 1) {
                const start = y * gradeW + x;
                if (!mascara[start] || visitado[start]) continue;

                let head = 0;
                let tail = 0;
                fila[tail++] = start;
                visitado[start] = 1;

                let minX = x;
                let maxX = x;
                let minY = y;
                let maxY = y;
                let area = 0;

                while (head < tail) {
                    const idx = fila[head++];
                    const cy = Math.floor(idx / gradeW);
                    const cx = idx - cy * gradeW;
                    area += 1;
                    if (cx < minX) minX = cx;
                    if (cx > maxX) maxX = cx;
                    if (cy < minY) minY = cy;
                    if (cy > maxY) maxY = cy;

                    const viz = [idx - 1, idx + 1, idx - gradeW, idx + gradeW];
                    for (const nb of viz) {
                        if (nb >= 0 && nb < total && mascara[nb] && !visitado[nb]) {
                            visitado[nb] = 1;
                            fila[tail++] = nb;
                        }
                    }
                }

                if (area >= 48) {
                    const fx = larguraCanvas / gradeW;
                    const fy = alturaCanvas / gradeH;
                    caixasBrutas.push({
                        x: Math.round(minX * fx),
                        y: Math.round(minY * fy),
                        w: Math.max(24, Math.round((maxX - minX + 1) * fx)),
                        h: Math.max(24, Math.round((maxY - minY + 1) * fy)),
                        area
                    });
                }
            }
        }

        caixasBrutas.sort((a, b) => b.area - a.area);
        const filtradas = [];
        for (const c of caixasBrutas) {
            const cx = c.x + c.w / 2;
            const cy = c.y + c.h / 2;
            const contida = filtradas.some((outro) =>
                cx >= outro.x - 10 && cx <= outro.x + outro.w + 10
                && cy >= outro.y - 10 && cy <= outro.y + outro.h + 10
            );
            if (!contida) filtradas.push(c);
            if (filtradas.length >= 10) break;
        }
        return filtradas;
    }

    _registrarDeteccao(canvasPrincipal, mat, tr, match, acao) {
        const registro = this.contagensPorMaterial[mat.id] || {
            material_id: mat.id,
            nome: mat.nome,
            classe_identificada: mat.classe_deteccao_ia,
            quantidade: 0,
            somaConfianca: 0,
            acao_aplicada: acao
        };
        registro.quantidade += 1;
        registro.somaConfianca += match.confianca;
        this.contagensPorMaterial[mat.id] = registro;

        const evUrl = this.capturarRecorteEvidencia(canvasPrincipal, tr.bbox);
        if (evUrl && !this.evidenciasPorMaterial[mat.id]) {
            this.evidenciasPorMaterial[mat.id] = evUrl;
        }
        return { registro, evUrl };
    }

    processarQuadro(canvasPrincipal, fonteVideo, opcoes = {}) {
        if (!canvasPrincipal || !fonteVideo) {
            return {
                trilhasAtivas: [],
                contagensPorMaterial: { ...this.contagensPorMaterial },
                evidenciasPorMaterial: { ...this.evidenciasPorMaterial },
                naoReconhecidos: [...this.naoReconhecidos],
                novosEventosAcao: [],
                presencaAtual: {}
            };
        }

        const {
            materiaisAlvo = [],
            assinaturasPreComputadas = null,
            modoContagem = 'line_zone',
            linhaXRatio = 0.55,
            sensibilidade = 38
        } = opcoes;

        const w = canvasPrincipal.width;
        const h = canvasPrincipal.height;
        const ctxPrincipal = canvasPrincipal.getContext('2d', { willReadFrequently: true });

        ctxPrincipal.drawImage(fonteVideo, 0, 0, w, h);
        this.offCtx.drawImage(fonteVideo, 0, 0, this.gradeW, this.gradeH);

        const deteccoes = this.detectarBlobsMovimento(w, h, sensibilidade);

        const usadas = new Set();
        for (const tr of this.trilhas) {
            tr.ttl -= 1;
            let melhorDetIdx = -1;
            let melhorDist = 110;

            for (let i = 0; i < deteccoes.length; i += 1) {
                if (usadas.has(i)) continue;
                const det = deteccoes[i];
                const dcx = det.x + det.w / 2;
                const dcy = det.y + det.h / 2;
                const dist = Math.hypot(dcx - tr.cx, dcy - tr.cy);
                if (dist < melhorDist) {
                    melhorDist = dist;
                    melhorDetIdx = i;
                }
            }

            if (melhorDetIdx >= 0) {
                usadas.add(melhorDetIdx);
                const det = deteccoes[melhorDetIdx];
                tr.prevCx = tr.cx;
                tr.prevCy = tr.cy;
                tr.bbox = det;
                tr.cx = det.x + det.w / 2;
                tr.cy = det.y + det.h / 2;
                tr.ttl = 8;
                tr.idade += 1;
            }
        }

        this.trilhas = this.trilhas.filter((t) => t.ttl > 0);

        for (let i = 0; i < deteccoes.length; i += 1) {
            if (usadas.has(i)) continue;
            const det = deteccoes[i];
            const cx = det.x + det.w / 2;
            const cy = det.y + det.h / 2;
            this.trilhas.push({
                id: this.proximoTrackId++,
                bbox: det,
                cx,
                cy,
                prevCx: cx,
                prevCy: cy,
                ttl: 8,
                idade: 1,
                cruzouEntrada: false,
                cruzouSaida: false,
                esteveNaZona: false,
                alertaEmitido: false,
                classificacao: null
            });
        }

        const linhaX = w * linhaXRatio;
        const zonaPoly = { x1: w * 0.28, x2: w * 0.78, y1: h * 0.14, y2: h * 0.88 };
        const novosEventosAcao = [];
        const presencaAtual = {};

        for (const tr of this.trilhas) {
            const sig = extrairAssinaturaVisualDeCanvas(canvasPrincipal, tr.bbox);
            const match = classificarRegiaoNoCatalogo(sig, materiaisAlvo, assinaturasPreComputadas);
            tr.classificacao = match;

            const mat = match.material;
            const dentroZona = tr.cx >= zonaPoly.x1 && tr.cx <= zonaPoly.x2 && tr.cy >= zonaPoly.y1 && tr.cy <= zonaPoly.y2;

            if (mat && dentroZona) {
                presencaAtual[mat.id] = (presencaAtual[mat.id] || 0) + 1;
            }

            const cruzouEsqDir = tr.prevCx < linhaX && tr.cx >= linhaX;
            const cruzouDirEsq = tr.prevCx > linhaX && tr.cx <= linhaX;
            const entrouZona = !tr.esteveNaZona && dentroZona && tr.idade >= 2;
            const saiuZona = tr.esteveNaZona && !dentroZona;
            tr.esteveNaZona = dentroZona;

            const acao = mat?.regra_monitoramento?.acao_ao_detectar || 'contar_entrada';
            const disparouEntrada = modoContagem === 'polygon_zone' ? entrouZona : cruzouEsqDir;
            const disparouSaida = modoContagem === 'polygon_zone' ? saiuZona : cruzouDirEsq;
            const disparouSaidaIndevida = modoContagem === 'polygon_zone' ? saiuZona : (cruzouDirEsq || cruzouEsqDir);

            if (mat && tr.idade >= 2) {
                if ((acao === 'contar_entrada' || acao === 'alertar_divergencia') && disparouEntrada && !tr.cruzouEntrada) {
                    tr.cruzouEntrada = true;
                    const { registro, evUrl } = this._registrarDeteccao(canvasPrincipal, mat, tr, match, acao);
                    novosEventosAcao.push({
                        id: `${Date.now()}-${tr.id}-in`,
                        tipo: acao,
                        material_id: mat.id,
                        material_nome: mat.nome,
                        mensagem: `Contagem #${tr.id}: +1 ${mat.nome} (${registro.quantidade}/${mat.quantidade_planejada || '?'} previsto).`,
                        timestamp: new Date().toISOString(),
                        evidencia_url: evUrl
                    });

                    if (acao === 'alertar_divergencia' && mat.quantidade_planejada > 0 && registro.quantidade > mat.quantidade_planejada) {
                        novosEventosAcao.push({
                            id: `${Date.now()}-${tr.id}-div`,
                            tipo: 'alertar_divergencia',
                            material_id: mat.id,
                            material_nome: mat.nome,
                            mensagem: `Divergência: ${mat.nome} ultrapassou o previsto (${registro.quantidade} > ${mat.quantidade_planejada}).`,
                            timestamp: new Date().toISOString(),
                            evidencia_url: evUrl
                        });
                    }
                } else if (acao === 'contar_saida' && disparouSaida && !tr.cruzouSaida) {
                    tr.cruzouSaida = true;
                    const { registro, evUrl } = this._registrarDeteccao(canvasPrincipal, mat, tr, match, 'contar_saida');
                    novosEventosAcao.push({
                        id: `${Date.now()}-${tr.id}-out`,
                        tipo: 'contar_saida',
                        material_id: mat.id,
                        material_nome: mat.nome,
                        mensagem: `Saída rastreada #${tr.id}: +1 ${mat.nome} (total ${registro.quantidade}).`,
                        timestamp: new Date().toISOString(),
                        evidencia_url: evUrl
                    });
                } else if (acao === 'alertar_saida_indevida' && disparouSaidaIndevida && !tr.alertaEmitido) {
                    tr.alertaEmitido = true;
                    const { evUrl } = this._registrarDeteccao(canvasPrincipal, mat, tr, match, 'alertar_saida_indevida');
                    novosEventosAcao.push({
                        id: `${Date.now()}-${tr.id}-sec`,
                        tipo: 'alertar_saida_indevida',
                        material_id: mat.id,
                        material_nome: mat.nome,
                        mensagem: `ALERTA DE SAÍDA INDEVIDA #${tr.id}: ${mat.nome} cruzou o perímetro monitorado.`,
                        timestamp: new Date().toISOString(),
                        evidencia_url: evUrl
                    });
                } else if (acao === 'monitorar_presenca' && dentroZona && !tr.cruzouEntrada) {
                    tr.cruzouEntrada = true;
                    const { evUrl } = this._registrarDeteccao(canvasPrincipal, mat, tr, match, 'monitorar_presenca');
                    novosEventosAcao.push({
                        id: `${Date.now()}-${tr.id}-pres`,
                        tipo: 'monitorar_presenca',
                        material_id: mat.id,
                        material_nome: mat.nome,
                        mensagem: `Presença confirmada #${tr.id}: ${mat.nome} dentro da zona.`,
                        timestamp: new Date().toISOString(),
                        evidencia_url: evUrl
                    });
                }
            } else if (!mat && tr.idade >= 3 && (cruzouEsqDir || entrouZona) && !tr.cruzouEntrada) {
                tr.cruzouEntrada = true;
                const evUrl = this.capturarRecorteEvidencia(canvasPrincipal, tr.bbox);
                const nr = {
                    id: `nr-${tr.id}-${Date.now()}`,
                    classe_identificada: `objeto_nao_catalogado_${this.naoReconhecidos.length + 1}`,
                    confianca: match.confianca || 0.48,
                    evidencia_url: evUrl
                };
                this.naoReconhecidos.push(nr);
                novosEventosAcao.push({
                    id: `evt-${nr.id}`,
                    tipo: 'nao_reconhecido',
                    material_id: null,
                    material_nome: 'Objeto não catalogado',
                    mensagem: `Item #${tr.id} cruzou a zona sem corresponder ao catálogo (confiança ${Math.round((nr.confianca || 0) * 100)}%).`,
                    timestamp: new Date().toISOString(),
                    evidencia_url: evUrl
                });
            }
        }

        return {
            trilhasAtivas: this.trilhas,
            contagensPorMaterial: { ...this.contagensPorMaterial },
            evidenciasPorMaterial: { ...this.evidenciasPorMaterial },
            naoReconhecidos: [...this.naoReconhecidos],
            novosEventosAcao,
            presencaAtual
        };
    }
}
