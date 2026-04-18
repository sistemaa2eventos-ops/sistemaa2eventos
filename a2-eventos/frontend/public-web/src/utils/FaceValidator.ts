/**
 * FaceValidator.ts
 * Utilitário de validação e recorte facial utilizando @vladmandic/face-api.
 * Refatorado para suporte SSR (Next.js) via Dynamic Imports.
 */

export class FaceValidator {
    private static isInitialized = false;
    private static faceapi: typeof import('@vladmandic/face-api') | null = null;

    /**
     * Carrega dinamicamente a biblioteca face-api e os modelos neurais.
     * Isso impede o erro de 'TextEncoder' no servidor (SSR).
     */
    static async initModels() {
        if (this.isInitialized && this.faceapi) return this.faceapi;

        // Import dinâmico da biblioteca (Executado apenas no Client)
        this.faceapi = await import('@vladmandic/face-api');
        
        const MODEL_URL = 'https://cdn.jsdelivr.net/npm/@vladmandic/face-api/model';
        
        // Carrega o modelo de detecção (SSD Mobilenet v1)
        await this.faceapi.nets.ssdMobilenetv1.loadFromUri(MODEL_URL);
        
        this.isInitialized = true;
        return this.faceapi;
    }

    static async validate(base64Image: string): Promise<{ isValid: boolean; errors: string[]; croppedBase64?: string }> {
        try {
            // Garante que o motor e os modelos estão carregados
            const api = await this.initModels();

            return new Promise((resolve) => {
                const img = new Image();
                img.onload = async () => {
                    const errors: string[] = [];
                    
                    // Executa a detecção neural de rosto
                    const detection = await api.detectSingleFace(img, new api.SsdMobilenetv1Options({ minConfidence: 0.6 }));
                    
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
                    canvas.width = cw;
                    canvas.height = ch;
                    const ctx = canvas.getContext('2d');
                    if (ctx) {
                        ctx.drawImage(img, finalX, finalY, cw, ch, 0, 0, cw, ch);
                        const croppedBase64 = canvas.toDataURL('image/jpeg', 0.95);
                        
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
        if (!this.faceapi) await this.initModels();
        if (!this.faceapi) return null;
        
        return await this.faceapi.detectSingleFace(input, new this.faceapi.SsdMobilenetv1Options({ minConfidence: 0.5 }));
    }
}

