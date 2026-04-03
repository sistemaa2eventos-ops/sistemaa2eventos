export class FaceValidator {
    static async validate(base64Image: string): Promise<{ isValid: boolean; errors: string[] }> {
        return new Promise((resolve) => {
            const img = new Image();
            img.onload = () => {
                const errors: string[] = [];
                const width = img.width;
                const height = img.height;

                // 1. Validar Resolução Mínima
                if (width < 400 || height < 400) {
                    errors.push("A resolução da imagem é muito baixa. Use uma câmera melhor ou aproxime-se.");
                }

                // 2. Validar Proporção (Deve ser aproximadamente quadrada/vertical)
                const aspect = width / height;
                if (aspect > 1.2 || aspect < 0.6) {
                    errors.push("A proporção da imagem é inadequada. Centralize seu rosto.");
                }

                resolve({
                    isValid: errors.length === 0,
                    errors: errors
                });
            };

            img.onerror = () => {
                resolve({ isValid: false, errors: ["Erro ao processar imagem."] });
            };

            img.src = base64Image;
        });
    }
}
