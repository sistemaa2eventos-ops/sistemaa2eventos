# criar-utils.ps1
Write-Host "🔧 CRIANDO ARQUIVOS UTILS" -ForegroundColor Cyan

# Criar pasta utils
New-Item -ItemType Directory -Path src\utils -Force

# Criar qrGenerator.js
@"
const QRCode = require('qrcode');
const { v4: uuidv4 } = require('uuid');

class QRGenerator {
    generateCode(identifier) {
        const timestamp = Date.now();
        const random = uuidv4().split('-')[0];
        return `A2E:\${identifier}:\${timestamp}:\${random}`;
    }

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
            return { code, image: qrImage };
        } catch (error) {
            throw new Error(`Erro ao gerar QR Code: \${error.message}`);
        }
    }

    async generateForPrint(identifier) {
        return this.generate(identifier, { width: 400, margin: 4, scale: 8 });
    }

    validateCode(code) {
        const pattern = /^A2E:[A-Za-z0-9]+:\d+:[a-f0-9]+$/;
        return pattern.test(code);
    }

    parseCode(code) {
        if (!this.validateCode(code)) throw new Error('Código QR inválido');
        const [prefix, identifier, timestamp, random] = code.split(':');
        return { identifier, timestamp: parseInt(timestamp), random, date: new Date(parseInt(timestamp)) };
    }
}

module.exports = new QRGenerator();
"@ | Out-File -FilePath src\utils\qrGenerator.js -Encoding UTF8 -Force
Write-Host "✅ qrGenerator.js criado" -ForegroundColor Green

Write-Host ""
Write-Host "🚀 Instale os módulos necessários:" -ForegroundColor Yellow
Write-Host "npm install qrcode uuid" -ForegroundColor Cyan
Write-Host ""
Write-Host "Depois reinicie o servidor: npm run dev" -ForegroundColor Yellow