/**
 * FaceValidator.ts
 * Utilitário de validação e recorte facial utilizando @vladmandic/face-api.
 * Refatorado para suporte SSR (Next.js) via Dynamic Imports.
 */

export class FaceValidator {
    private static isInitialized = false;
    private static failedInit = false;
    private static loadingPromise: Promise<typeof import('@vladmandic/face-api') | null> | null = null;
    private static faceapi: typeof import('@vladmandic/face-api') | null = null;

    /**
     * Carrega dinamicamente a biblioteca face-api e os modelos neurais locais (/models).
     * Isso impede o erro de 'TextEncoder' no servidor (SSR) e evita bloqueio de CDN pelo CSP.
     */
    static async initModels() {
        if (this.isInitialized && this.faceapi) return this.faceapi;
        if (this.failedInit) return null;
        if (this.loadingPromise) return this.loadingPromise;

        this.loadingPromise = (async () => {
            try {
                this.faceapi = await import('@vladmandic/face-api');
                const tf = (this.faceapi as unknown as { tf?: { setBackend?: (b: string) => Promise<boolean>; ready?: () => Promise<void> } }).tf;
                if (tf?.setBackend) {
                    for (const backend of ['webgl', 'cpu']) {
                        const ok = await tf.setBackend(backend).catch(() => false);
                        if (ok) break;
                    }
                    if (tf.ready) await tf.ready();
                }

                const MODEL_URL = '/models';
                await this.faceapi.nets.tinyFaceDetector.loadFromUri(MODEL_URL);
                this.isInitialized = true;
                return this.faceapi;
            } catch (err) {
                console.error('Face-API: falha ao carregar detector local em /models', err);
                this.failedInit = true;
                return null;
            } finally {
                this.loadingPromise = null;
            }
        })();

        return this.loadingPromise;
    }

    static async validate(base64Image: string): Promise<{ isValid: boolean; errors: string[]; croppedBase64?: string }> {
        try {
            const api = await this.initModels();

            return new Promise((resolve) => {
                const img = new Image();
                img.onload = async () => {
                    const errors: string[] = [];

                    // Se o modelo neural não puder carregar (ex.: PC sem WebGL/CPU lenta), aplica recorte central 3:4
                    if (!api) {
                        const targetRatio = 3 / 4;
                        let cw = img.width;
                        let ch = img.height;
                        if (cw / ch > targetRatio) cw = ch * targetRatio;
                        else ch = cw / targetRatio;
                        const finalX = Math.max(0, (img.width - cw) / 2);
                        const finalY = Math.max(0, (img.height - ch) / 2);
                        const canvas = document.createElement('canvas');
                        canvas.width = Math.round(cw);
                        canvas.height = Math.round(ch);
                        const ctx = canvas.getContext('2d');
                        if (ctx) {
                            ctx.drawImage(img, finalX, finalY, cw, ch, 0, 0, canvas.width, canvas.height);
                            return resolve({
                                isValid: true,
                                errors: [],
                                croppedBase64: canvas.toDataURL('image/jpeg', 0.92)
                            });
                        }
                        return resolve({ isValid: false, errors: ['Falha ao processar imagem.'] });
                    }
                    
                    // Executa a detecção neural de rosto (TinyFaceDetector é leve e funciona rápido em webcams de PC)
                    const detection = await api.detectSingleFace(img, new api.TinyFaceDetectorOptions({ inputSize: 416, scoreThreshold: 0.45 }));
                    
                    if (!detection) {
                        errors.push("Nenhum rosto claro detectado. Retire óculos escuros, bonés e aproxime-se de um local iluminado.");
                        return resolve({ isValid: false, errors });
                    }

                    // --- SMART CROP: Formatando na Proporção 3:4 (Exigência Hikvision/Intelbras) ---
                    const box = detection.box;
                    const expandRatio = 0.6; // Margem ao redor da face
                    
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
                    let finalY = faceCenterY - (ch * 0.4);

                    finalX = Math.max(0, finalX);
                    finalY = Math.max(0, finalY);
                    if (finalX + cw > img.width) cw = img.width - finalX;
                    if (finalY + ch > img.height) ch = img.height - finalY;

                    const canvas = document.createElement('canvas');
                    canvas.width = Math.round(cw);
                    canvas.height = Math.round(ch);
                    const ctx = canvas.getContext('2d');
                    if (ctx) {
                        ctx.drawImage(img, finalX, finalY, cw, ch, 0, 0, canvas.width, canvas.height);
                        const croppedBase64 = canvas.toDataURL('image/jpeg', 0.92);
                        
                        return resolve({
                            isValid: true,
                            errors: [],
                            croppedBase64
                        });
                    }
                    
                    errors.push("Falha ao gerar o recorte final da biometria.");
                    resolve({ isValid: false, errors });
                };

                img.onerror = () => {
                    resolve({ isValid: false, errors: ["Erro ao carregar imagem capturada."] });
                };

                img.src = base64Image;
            });
        } catch (e) {
            console.error('Face-API Erro Crítico:', e);
            return { isValid: false, errors: ["Falha ao inicializar o motor de Inteligência Artificial."] };
        }
    }

    /**
     * Real-time face detection on Video or Image element.
     */
    static async detect(input: HTMLVideoElement | HTMLImageElement | HTMLCanvasElement) {
        const api = await this.initModels();
        if (!api) return null;
        
        return await api.detectSingleFace(input, new api.TinyFaceDetectorOptions({ inputSize: 320, scoreThreshold: 0.45 }));
    }
}

