const IntelbrasService = require('./src/services/intelbrasService');
const logger = require('./src/services/logger');

async function testListUsers() {
    const config = {
        ip_address: '192.168.1.17',
        porta: 80,
        user_device: 'admin',
        password_device: 'admin123'
    };

    const service = new IntelbrasService(config);

    try {
        console.log('--- Iniciando Teste List Users ---');

        console.log('Listando usuário específico...');
        const specificUser = await service.listUsers(['12345']);
        console.log('Usuário específico:', specificUser);

        // Se houver algum ID conhecido ou para testar filtro:
        // console.log('Listando usuário específico...');
        // const specificUser = await service.listUsers(['12345']);
        // console.log('Usuário específico:', specificUser);

        console.log('--- Teste List Users Concluído ---');
    } catch (error) {
        console.error('--- Teste List Users Falhou ---');
        console.error(error);
    }
}

testListUsers();
