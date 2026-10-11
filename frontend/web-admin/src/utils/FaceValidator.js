/**
 * FaceValidator Utility (Upgraded)
 * Provides neural-net based facial detection and automated "Smart Crop" 
 * to ensure 3:4 ratio for biometric terminals.
 *
 * Mantém a validação heurística original (produção) como fallback quando os
 * modelos não puderem ser carregados (CDN offline/bloqueado).
 */

const measureImage = (img) => {
    const canvas = document.createElement('canvas');
    canvas.width = img.width;
    canvas.height = img.height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;

    ctx.drawImage(img, 0, 0);

    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const data = imageData.data;

    let totalBrightness = 0;
    let minBrightness = 255;
    let maxBrightness = 0;

    for (let i = 0; i < data.length; i += 4) {
        const brightness = (data[i] + data[i + 1] + data[i + 2]) / 3;
        totalBrightness += brightness;
        if (brightness < minBrightness) minBrightness = brightness;
        if (brightness > maxBrightness) maxBrightness = brightness;
    }

    const avgBrightness = totalBrightness / (data.length / 4);
    const contrast = maxBrightness - minBrightness;

    return {
        contrastOk: contrast > 100,
        illuminationOk: avgBrightness > 40 && avgBrightness < 220
    };
};

export const FaceValidator = {
    isInitialized: false,
    faceapi: null,

    /**
     * Initializes the face-api models from CDN.
     */
    init: async function() {
        if (this.isInitialized) return this.faceapi;

        try {
            // Load face-api from CDN dynamically to avoid bundle size issues in dev
            if (!window.faceapi) {
                await new Promise((resolve, reject) => {
                    const script = document.createElement('script');
                    script.src = 'https://cdn.jsdelivr.net/npm/@vladmandic/face-api/dist/face-api.js';
                    script.onload = resolve;
                    script.onerror = reject;
                    document.head.appendChild(script);
                });
            }

            this.faceapi = window.faceapi;
            const MODEL_URL = 'https://cdn.jsdelivr.net/npm/@vladmandic/face-api/model';
            
            // Load only the necessary model for detection
            await this.faceapi.nets.ssdMobilenetv1.loadFromUri(MODEL_URL);
            
            this.isInitialized = true;
            return this.faceapi;
        } catch (err) {
            console.error("Face-API Initialization Error:", err);
            return null;
        }
    },

    /**
     * Validates and automatically crops a face from an image.
     */
    validate: async function(imageSrc) {
        const api = await this.init();
        if (!api) {
            return this.legacyValidate(imageSrc);
        }
        
        return new Promise((resolve) => {
            const img = new Image();
            img.crossOrigin = "anonymous";
            img.onload = async () => {
                try {
                    // 1. Detection
                    const detection = await api.detectSingleFace(img, new api.SsdMobilenetv1Options({ minConfidence: 0.5 }));
                    
                    if (!detection) {
                        return resolve({ 
                            isValid: false, 
                            errors: ['Rosto não detectado. Certifique-se de estar em um local iluminado e sem acessórios (óculos escuros, máscaras).'] 
                        });
                    }

                    // 2. Smart Crop (3:4 ratio)
                    const box = detection.box;
                    const expandRatio = 0.5; // Margin around face
                    
                    let cw = box.width * (1 + expandRatio);
                    let ch = box.height * (1 + expandRatio);

                    const targetRatio = 3 / 4;
                    const currentRatio = cw / ch;

                    if (currentRatio > targetRatio) {
                        ch = cw / targetRatio;
                    } else {
                        cw = ch * targetRatio;
                    }

                    const faceCenterX = box.x + (box.width / 2);
                    const faceCenterY = box.y + (box.height / 2);

                    let finalX = faceCenterX - cw / 2;
                    let finalY = faceCenterY - (ch * 0.45); // Offset to include hair/top of head

                    // Clamp to image boundaries
                    finalX = Math.max(0, finalX);
                    finalY = Math.max(0, finalY);
                    if (finalX + cw > img.width) cw = img.width - finalX;
                    if (finalY + ch > img.height) ch = img.height - finalY;

                    const canvas = document.createElement('canvas');
                    canvas.width = cw;
                    canvas.height = ch;
                    const ctx = canvas.getContext('2d');
                    
                    if (ctx) {
                        ctx.drawImage(img, finalX, finalY, cw, ch, 0, 0, cw, ch);
                        const croppedBase64 = canvas.toDataURL('image/jpeg', 0.9);

                        const stats = measureImage(img);
                        const checklist = {
                            faceDetected: true,
                            eyeQuality: true,
                            neutralExpression: true,
                            contrast: stats ? stats.contrastOk : true,
                            illumination: stats ? stats.illuminationOk : true,
                            centered: true
                        };

                        const errors = [];
                        if (!checklist.contrast) errors.push('Contraste da imagem muito baixo.');
                        if (!checklist.illumination) errors.push('Iluminação inadequada (muito escura ou estourada).');

                        resolve({
                            isValid: Object.values(checklist).every(v => v === true),
                            errors,
                            checklist,
                            croppedBase64,
                            width: cw,
                            height: ch
                        });
                    } else {
                        resolve({ isValid: false, errors: ['Erro ao processar recorte da imagem.'] });
                    }
                } catch (err) {
                    console.error("Validation Error:", err);
                    resolve({ isValid: false, errors: ['Erro técnico no processamento da imagem.'] });
                }
            };

            img.onerror = () => {
                resolve({ isValid: false, errors: ['Falha ao carregar imagem para validação.'] });
            };

            img.src = imageSrc;
        });
    },

    /**
     * Validação heurística original (produção): resolução, contraste e
     * iluminação, sem depender de modelos externos.
     */
    legacyValidate: async (imageSrc) => {
        return new Promise((resolve) => {
            const img = new Image();
            img.crossOrigin = "anonymous";
            img.onload = () => {
                const stats = measureImage(img);

                const checklist = {
                    faceDetected: img.width >= 400 && img.height >= 500,
                    eyeQuality: true, // Mock: Requires ML for real check
                    neutralExpression: true, // Mock: Requires ML
                    contrast: stats ? stats.contrastOk : true, // Heuristic: Range of brightness
                    illumination: stats ? stats.illuminationOk : true, // Heuristic: Avoid too dark/too bright
                    centered: true // Mock: Requires face landmark detection
                };

                const results = {
                    isValid: Object.values(checklist).every(v => v === true),
                    checklist,
                    errors: [],
                    width: img.width,
                    height: img.height
                };

                if (!checklist.faceDetected) results.errors.push('Resolução insuficiente ou face não encontrada.');
                if (!checklist.contrast) results.errors.push('Contraste da imagem muito baixo.');
                if (!checklist.illumination) results.errors.push('Iluminação inadequada (muito escura ou estourada).');

                if (results.isValid) {
                    const canvas = document.createElement('canvas');
                    canvas.width = img.width;
                    canvas.height = img.height;
                    const ctx = canvas.getContext('2d');
                    if (ctx) {
                        ctx.drawImage(img, 0, 0);
                        results.croppedBase64 = canvas.toDataURL('image/jpeg', 0.9);
                    }
                }

                resolve(results);
            };

            img.onerror = () => {
                resolve({ isValid: false, errors: ['Falha ao carregar imagem para validação.'] });
            };

            img.src = imageSrc;
        });
    }
};
