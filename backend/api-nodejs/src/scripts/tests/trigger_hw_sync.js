const terminalSyncService = require('./src/services/terminalSyncService');
const logger = require('./src/services/logger');
const { supabase } = require('./src/config/supabase');

async function testSync() {
    const terminalId = 'ef7a754a-cddb-4852-a405-62e4c8cfee40';
    console.log(`🚀 Iniciando sincronização definitiva para o terminal: ${terminalId}`);

    try {
        const { data: terminal } = await supabase.from('dispositivos_acesso').select('*').eq('id', terminalId).single();
        console.log(`🔍 Dados no DB: IP=${terminal.ip_address}, user_device=${terminal.user_device}, password_device=${terminal.password_device}`);

        const result = await terminalSyncService.syncTerminal(terminalId);
        console.log('📊 Resultado da Sincronização:', JSON.stringify(result, null, 2));
    } catch (error) {
        console.error('❌ Erro durante a sincronização:', error);
    }
    process.exit(0);
}

testSync();
