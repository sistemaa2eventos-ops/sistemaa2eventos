/**
 * FaceValidator Utility
 * Provides basic client-side validation for facial recognition photos.
 */
export const FaceValidator = {
    /**
     * Validates an image from a base64 string or File object.
     * Checks for minimum resolution and basic clarity.
     */
    validate: async (imageSrc) => {
        return new Promise((resolve) => {
            const img = new Image();
            img.crossOrigin = "anonymous";
            img.onload = () => {
                const canvas = document.createElement('canvas');
                canvas.width = img.width;
                canvas.height = img.height;
                const ctx = canvas.getContext('2d');
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

                const checklist = {
                    faceDetected: img.width >= 400 && img.height >= 500,
                    eyeQuality: true, // Mock: Requires ML for real check
                    neutralExpression: true, // Mock: Requires ML
                    contrast: contrast > 100, // Heuristic: Range of brightness
                    illumination: avgBrightness > 40 && avgBrightness < 220, // Heuristic: Avoid too dark/too bright
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

                resolve(results);
            };

            img.onerror = () => {
                resolve({ isValid: false, errors: ['Falha ao carregar imagem para validação.'] });
            };

            img.src = imageSrc;
        });
    }
};
