const sharp = require('sharp');
const logger = require('../services/logger');

/**
 * imageProcessor: Otimizador de imagens biométricas para hardware.
 * Garante que as faces enviadas para Intelbras/Hikvision estejam dentro dos 
 * limites técnicos de resolução (640px) e peso (< 100KB).
 */
class ImageProcessor {
    /**
     * Otimiza uma foto para biometria facial em hardware.
     * @param {String|Buffer} input Base64 (com ou sem prefixo) ou Buffer da imagem original
     * @returns {Promise<Buffer>} Buffer da imagem JPEG otimizada
     */
    async optimizeForHardware(input) {
        try {
            let buffer;

            // 1. Converter Base64 para Buffer se necessário
            if (typeof input === 'string') {
                const base64Data = input.replace(/^data:image\/\w+;base64,/, '');
                buffer = Buffer.from(base64Data, 'base64');
            } else {
                buffer = input;
            }

            if (!buffer || buffer.length === 0) {
                throw new Error('Input de imagem vazio ou inválido');
            }

            // 2. Processar com Sharp
            // - Redimensionar para no máximo 640px (largura ou altura)
            // - Converter para JPEG
            // - Qualidade 80 (balanço ideal entre peso e nitidez)
            // - Remover metadados EXIF
            const optimizedBuffer = await sharp(buffer)
                .resize({
                    width: 640,
                    height: 640,
                    fit: 'inside', // Mantém proporção
                    withoutEnlargement: true // Não estica imagens pequenas
                })
                .jpeg({
                    quality: 80,
                    progressive: true,
                    chromaSubsampling: '4:2:0'
                })
                .withMetadata(false) // Remove EXIF
                .toBuffer();

            // 3. Verificação de Limite Crítico (100KB)
            if (optimizedBuffer.length > 100000) {
                logger.warn(`⚠️ [ImageProcessor] Imagem ainda pesada (${Math.round(optimizedBuffer.length/1024)}KB). Re-comprimindo...`);
                return await sharp(optimizedBuffer)
                    .jpeg({ quality: 60 }) // Reduz qualidade para garantir entrada
                    .toBuffer();
            }

            logger.debug(`📸 [ImageProcessor] Otimizado: ${Math.round(buffer.length/1024)}KB -> ${Math.round(optimizedBuffer.length/1024)}KB`);
            
            return optimizedBuffer;
        } catch (error) {
            logger.error(`❌ [ImageProcessor] Falha ao processar imagem: ${error.message}`);
            throw error;
        }
    }

    /**
     * Helper para retornar Base64 limpo (sem prefixo) do buffer otimizado
     */
    async optimizeToBase64(input) {
        const buffer = await this.optimizeForHardware(input);
        return buffer.toString('base64');
    }
}

module.exports = new ImageProcessor();
