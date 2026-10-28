/**
 * FaceValidator: confere a foto de cadastro antes de salvar e recorta em 3:4 para os leitores faciais.
 *
 * O detector (face-api, TinyFaceDetector, ~190 KB) é servido pelo próprio painel em /face-api/: funciona
 * em evento sem internet (antes vinha de um CDN). Se não carregar, cai na validação simples
 * (resolução, contraste e luz), sem tentar o download de novo a cada foto.
 *
 * Checagens reais (antes "olhos", "expressão" e "centralizado" eram sempre verdadeiros):
 * um rosto só, rosto grande o bastante, nítido, centralizado, contraste e luz medidos no rosto.
 * O servidor de IA confere de novo ao gerar a biometria.
 */

const BASE_FACE_API = '/face-api';
const LADO_MIN_ROSTO = 80;    // px do rosto na foto original
const FRACAO_MIN_ROSTO = 0.15; // rosto ocupando pelo menos 15% da largura da foto
const NITIDEZ_MIN = 15;       // variância do Laplaciano no rosto reduzido a 112 px (mesma régua do servidor)

/** Brilho médio, contraste e nitidez de uma região da imagem */
const medirRegiao = (img, x, y, w, h) => {
    const lado = 112;
    const canvas = document.createElement('canvas');
    canvas.width = lado;
    canvas.height = lado;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return null;
    ctx.drawImage(img, x, y, w, h, 0, 0, lado, lado);
    const { data } = ctx.getImageData(0, 0, lado, lado);
    const cinza = new Float32Array(lado * lado);
    let soma = 0;
    let min = 255;
    let max = 0;
    for (let i = 0, p = 0; i < data.length; i += 4, p++) {
        const v = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
        cinza[p] = v;
        soma += v;
        if (v < min) min = v;
        if (v > max) max = v;
    }
    let somaL = 0;
    let somaL2 = 0;
    let n = 0;
    for (let yy = 1; yy < lado - 1; yy++) {
        for (let xx = 1; xx < lado - 1; xx++) {
            const p = yy * lado + xx;
            const l = cinza[p - lado] + cinza[p + lado] + cinza[p - 1] + cinza[p + 1] - 4 * cinza[p];
            somaL += l;
            somaL2 += l * l;
            n++;
        }
    }
    const mediaL = somaL / n;
    return { brilho: soma / cinza.length, contraste: max - min, nitidez: somaL2 / n - mediaL * mediaL };
};

const carregarImagem = (src) => new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
});

const recortar = (img, x, y, w, h) => {
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(w);
    canvas.height = Math.round(h);
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    ctx.drawImage(img, x, y, w, h, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL('image/jpeg', 0.9);
};

/** Reduz a foto para no máximo largura x altura (JPEG): foto de celular de 4 MB vira ~80 KB */
export const reduzirFoto = async (dataUrl, maxW = 600, maxH = 800, qualidade = 0.85) => {
    const img = await carregarImagem(dataUrl);
    if (!img) return dataUrl;
    const escala = Math.min(1, maxW / img.width, maxH / img.height);
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(img.width * escala);
    canvas.height = Math.round(img.height * escala);
    const ctx = canvas.getContext('2d');
    if (!ctx) return dataUrl;
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL('image/jpeg', qualidade);
};

export const FaceValidator = {
    isInitialized: false,
    falhouInit: false,
    faceapi: null,
    _carregando: null,

    /** Carrega o face-api e o detector do próprio painel (uma vez; falha também fica memorizada) */
    init: function () {
        if (this.isInitialized) return Promise.resolve(this.faceapi);
        if (this.falhouInit) return Promise.resolve(null);
        if (this._carregando) return this._carregando;
        this._carregando = (async () => {
            try {
                if (!window.faceapi) {
                    await new Promise((resolve, reject) => {
                        const script = document.createElement('script');
                        script.src = `${BASE_FACE_API}/face-api.js`;
                        script.onload = resolve;
                        script.onerror = reject;
                        document.head.appendChild(script);
                    });
                }
                this.faceapi = window.faceapi;
                // Sem WebGL o tfjs escolhe o backend 'wasm', que não é carregado aqui, e falha:
                // usa WebGL e, na falta dele, a CPU (o TinyFaceDetector é leve o bastante)
                const tf = this.faceapi.tf;
                if (tf?.setBackend) {
                    for (const backend of ['webgl', 'cpu']) {
                        const ok = await tf.setBackend(backend).catch(() => false);
                        if (ok) break;
                    }
                    await tf.ready();
                }
                await this.faceapi.nets.tinyFaceDetector.loadFromUri(BASE_FACE_API);
                this.isInitialized = true;
                return this.faceapi;
            } catch (err) {
                console.error('Face-API: não foi possível carregar o detector local', err);
                this.falhouInit = true;
                return null;
            } finally {
                this._carregando = null;
            }
        })();
        return this._carregando;
    },

    /** Valida e recorta a foto (3:4, rosto centralizado com margem) */
    validate: async function (imageSrc) {
        const api = await this.init();
        if (!api) return this.legacyValidate(imageSrc);

        const img = await carregarImagem(imageSrc);
        if (!img) return { isValid: false, errors: ['Falha ao carregar imagem para validação.'] };

        try {
            const opcoes = new api.TinyFaceDetectorOptions({ inputSize: 416, scoreThreshold: 0.5 });
            const rostos = (await api.detectAllFaces(img, opcoes)) || [];
            if (rostos.length === 0) {
                return {
                    isValid: false,
                    checklist: { faceDetected: false },
                    errors: ['Rosto não detectado. Procure um local iluminado e tire óculos escuros, boné ou máscara.']
                };
            }
            rostos.sort((a, b) => b.box.area - a.box.area);
            const box = rostos[0].box;
            // Outro rosto grande na foto: a biometria pode sair da pessoa errada
            const variosRostos = rostos.length > 1 && rostos[1].box.area > box.area * 0.35;

            const medidas = medirRegiao(img, box.x, box.y, box.width, box.height);
            const centroX = (box.x + box.width / 2) / img.width;
            const centroY = (box.y + box.height / 2) / img.height;
            const ladoRosto = Math.min(box.width, box.height);

            const checklist = {
                faceDetected: true,
                singleFace: !variosRostos,
                faceSize: ladoRosto >= LADO_MIN_ROSTO && box.width >= img.width * FRACAO_MIN_ROSTO,
                sharpness: medidas ? medidas.nitidez >= NITIDEZ_MIN : true,
                contrast: medidas ? medidas.contraste > 60 : true,
                illumination: medidas ? medidas.brilho > 45 && medidas.brilho < 215 : true,
                centered: centroX > 0.2 && centroX < 0.8 && centroY > 0.15 && centroY < 0.75
            };

            const errors = [];
            if (!checklist.singleFace) errors.push('Há mais de um rosto na foto: fotografe só a pessoa.');
            if (!checklist.faceSize) errors.push('Rosto muito pequeno: aproxime a câmera.');
            if (!checklist.sharpness) errors.push('Foto borrada: segure firme e evite movimento.');
            if (!checklist.contrast) errors.push('Contraste baixo no rosto.');
            if (!checklist.illumination) errors.push('Iluminação inadequada no rosto (muito escura ou estourada).');
            if (!checklist.centered) errors.push('Rosto fora do centro da foto.');

            // Recorte 3:4 com margem para cabelo e queixo
            let cw = box.width * 1.5;
            let ch = box.height * 1.5;
            if (cw / ch > 3 / 4) ch = cw / (3 / 4);
            else cw = ch * (3 / 4);
            let x = Math.max(0, box.x + box.width / 2 - cw / 2);
            let y = Math.max(0, box.y + box.height / 2 - ch * 0.45);
            if (x + cw > img.width) cw = img.width - x;
            if (y + ch > img.height) ch = img.height - y;

            return {
                isValid: errors.length === 0,
                errors,
                checklist,
                croppedBase64: recortar(img, x, y, cw, ch),
                width: Math.round(cw),
                height: Math.round(ch)
            };
        } catch (err) {
            console.error('Validation Error:', err);
            return { isValid: false, errors: ['Erro técnico no processamento da imagem.'] };
        }
    },

    /**
     * Sem o detector: resolução mínima (retrato ou paisagem — antes 640x480 deitada sempre reprovava),
     * contraste e luz da imagem inteira.
     */
    legacyValidate: async (imageSrc) => {
        const img = await carregarImagem(imageSrc);
        if (!img) return { isValid: false, errors: ['Falha ao carregar imagem para validação.'] };
        const medidas = medirRegiao(img, 0, 0, img.width, img.height);
        const resolucaoOk = Math.min(img.width, img.height) >= 360 && Math.max(img.width, img.height) >= 480;
        const checklist = {
            faceDetected: resolucaoOk,
            contrast: medidas ? medidas.contraste > 100 : true,
            illumination: medidas ? medidas.brilho > 40 && medidas.brilho < 220 : true
        };
        const errors = [];
        if (!resolucaoOk) errors.push('Resolução insuficiente (mínimo 480x360).');
        if (!checklist.contrast) errors.push('Contraste da imagem muito baixo.');
        if (!checklist.illumination) errors.push('Iluminação inadequada (muito escura ou estourada).');
        const isValid = errors.length === 0;
        return {
            isValid,
            checklist,
            errors,
            croppedBase64: isValid ? recortar(img, 0, 0, img.width, img.height) : undefined,
            width: img.width,
            height: img.height
        };
    }
};
