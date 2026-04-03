const IntelbrasService = require('./src/services/intelbrasService');
const logger = require('./src/services/logger');

async function testV2() {
    const config = {
        ip_address: '192.168.1.17',
        porta: 80,
        user_device: 'admin',
        password_device: 'admin123'
    };

    const service = new IntelbrasService(config);

    const testFuncionario = {
        nome: 'Teste V2 Antigravity',
        cpf: '12345',
        rfid_tag: '12345678'
    };

    // Imagem real extraída da documentação do Postman (JPG base64) para evitar 'Batch Process Error'
    // Imagem real extraída da documentação do Postman (JPG base64) - Versão Completa
    const base64Image = "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";

    try {
        console.log('--- Iniciando Teste V2 ---');

        // Testa exclusão primeiro para limpar
        console.log('Limpando usuário de teste...');
        const deleteResult = await service.deleteUser('12345');
        console.log('Resultado da exclusão:', deleteResult);

        console.log('Enviando cadastro V2...');
        await service.enrollUser(testFuncionario, base64Image);

        console.log('--- Teste V2 Concluído com Sucesso ---');
    } catch (error) {
        console.error('--- Teste V2 Falhou ---');
        console.error(error);
    }
}

testV2();
