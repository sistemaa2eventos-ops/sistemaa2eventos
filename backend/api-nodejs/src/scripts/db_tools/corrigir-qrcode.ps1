const QRCode = require('qrcode');
const { v4: uuidv4 } = require('uuid');

class QRGenerator {
    /**
     * Gera um código único para QR Code
     */
    generateCode(identifier) {
        const timestamp = Date.now();
        const random = uuidv4().split('-')[0];
        // Template string correta com crases
        return `A2E:${identifier}:${timestamp}:${random}`;
    }

    /**
     * Gera QR Code em formato base64
     */
    async generate(identifier, options = {}) {
        const code = this.generateCode(identifier);
        
        const qrOptions = {
            width: options.width || 300,
            margin: options.margin || 2,
            color: {
                dark: options.darkColor || '#0A1929',
                light: options.lightColor || '#FFFFFF'
            },
            ...options
        };

        try {
            const qrImage = await QRCode.toDataURL(code, qrOptions);
            return {
                code,
                image: qrImage
            };
        } catch (error) {
            throw new Error(`Erro ao gerar QR Code: ${error.message}`);
        }
    }

    /**
     * Gera QR Code para impressão em PDF
     */
    async generateForPrint(identifier) {
        return this.generate(identifier, {
            width: 400,
            margin: 4,
            scale: 8
        });
    }

    /**
     * Valida um código QR
     */
    validateCode(code) {
        const pattern = /^A2E:[A-Za-z0-9]+:\d+:[a-f0-9]+$/;
        return pattern.test(code);
    }

    /**
     * Extrai informações do código
     */
    parseCode(code) {
        if (!this.validateCode(code)) {
            throw new Error('Código QR inválido');
        }

        const [prefix, identifier, timestamp, random] = code.split(':');
        
        return {
            identifier,
            timestamp: parseInt(timestamp),
            random,
            date: new Date(parseInt(timestamp))
        };
    }
}

module.exports = new QRGenerator();