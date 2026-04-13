const { getConnection } = require('../config/database');
const { supabase } = require('../config/supabase');
const DeviceFactory = require('../modules/devices/adapters/DeviceFactory');
const logger = require('../services/logger');
const os = require('os');

// Função para pegar IP local
function getLocalIp() {
    const interfaces = os.networkInterfaces();
    for (const name of Object.keys(interfaces)) {
        for (const iface of interfaces[name]) {
            // Pula interfaces internas (localhost) e não-IPv4
            if (iface.family === 'IPv4' && !iface.internal) {
                return iface.address;
            }
        }
    }
    return '127.0.0.1';
}

async function configureTerminals() {
    const serverIp = process.argv[2] || getLocalIp();
    const serverPort = process.env.PORT || 3001;

    console.log(`\n🔧 Configurando Terminais para Push de Eventos`);
    console.log(`📡 Server IP detectado: ${serverIp}`);
    console.log(`Possible usage: node ConfigureTerminals.js [SERVER_IP]\n`);

    try {
        const { data: terminais, error } = await supabase
            .from('dispositivos_acesso')
            .select('*')
            .eq('tipo', 'terminal_facial')
            .eq('status', 'online');

        if (error) throw error;

        if (!terminais || terminais.length === 0) {
            console.log('⚠️ Nenhum terminal online encontrado.');
            return;
        }

        console.log(`📋 Encontrados ${terminais.length} terminais online.`);

        for (const terminal of terminais) {
            console.log(`\n⚙️  Configurando: ${terminal.nome} (${terminal.ip_address})...`);

            const service = DeviceFactory.getDevice(terminal);
            const success = await service.configureEventPush(serverIp, serverPort);

            if (success) {
                console.log(`✅ ${terminal.nome}: Configurado com sucesso!`);
            } else {
                console.error(`❌ ${terminal.nome}: Falha na configuração.`);
            }
        }

    } catch (error) {
        console.error('Erro geral:', error);
    } finally {
        process.exit();
    }
}

configureTerminals();
