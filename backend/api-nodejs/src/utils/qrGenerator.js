const QRCode = require('qrcode');
const { v4: uuidv4 } = require('uuid');
const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
    throw new Error('❌ JWT_SECRET não definido no arquivo .env');
}

class QRGenerator {
    /**
     * Gera um código único para QR Code assinado com JWT para prevenir Spoofing
     */
    generateCode(identifier) {
        const payload = {
            id: identifier,
            ts: Date.now(),
            rnd: uuidv4().split('-')[0]
        };

        // Assina o código. O QR conterá apenas o Token JWT.
        return jwt.sign(payload, JWT_SECRET, { expiresIn: '1y' });
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
     * Valida um código QR (JWT)
     */
    validateCode(token) {
        try {
            jwt.verify(token, JWT_SECRET);
            return true;
        } catch (e) {
            return false;
        }
    }

    /**
     * Extrai informações do código assinado
     */
    parseCode(token) {
        try {
            const decoded = jwt.verify(token, JWT_SECRET);
            return {
                identifier: decoded.id,
                timestamp: decoded.ts,
                random: decoded.rnd,
                date: new Date(decoded.ts)
            };
        } catch (error) {
            throw new Error('QR Code Inválido ou Assinatura Corrompida');
        }
    }
}

module.exports = new QRGenerator();