const imageProcessor = require('./src/utils/imageProcessor');
const fs = require('fs');
const path = require('path');

async function testProcessing() {
    console.log('🧪 Iniciando Teste de Processamento de Imagem...');
    
    // 1. Criar um buffer fake (ou carregar um real se houvesse no FS)
    // Para teste, vamos gerar uma string base64 que representa uma imagem pequena
    const dummyBase64 = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
    
    try {
        const start = Date.now();
        const optimizedBuffer = await imageProcessor.optimizeForHardware(dummyBase64);
        const duration = Date.now() - start;
        
        console.log(`✅ Processamento concluído em ${duration}ms`);
        console.log(`📊 Tamanho final: ${optimizedBuffer.length} bytes`);
        
        if (optimizedBuffer.length > 0 && optimizedBuffer.length < 100000) {
            console.log('✨ [SUCESSO] Imagem dentro dos limites de hardware.');
        } else {
            console.error('❌ [FALHA] Tamanho de imagem inválido.');
        }

        const optimizedBase64 = await imageProcessor.optimizeToBase64(dummyBase64);
        console.log('🔗 Base64 Otimizado gerado (primeiros 50 chars):', optimizedBase64.substring(0, 50));
        
    } catch (error) {
        console.error('❌ Erro durante o teste:', error.message);
        process.exit(1);
    }
}

testProcessing();
