#!/usr/bin/env node

require('dotenv').config();
const { getConnection } = require('../config/database');
const { supabase } = require('../config/supabase');
const os = require('os');

async function monitor() {
    console.log('\n📊 ========================================');
    console.log('📊 MONITOR - A2 EVENTOS');
    console.log('📊 ========================================\n');

    try {
        const conn = await getConnection();

        // 1. Status do SQL Server
        const sqlStatus = await conn.request()
            .query(`
                SELECT 
                    (SELECT COUNT(*) FROM logs_acesso) as total_logs,
                    (SELECT COUNT(*) FROM logs_acesso WHERE sincronizado = 0) as logs_pendentes,
                    (SELECT COUNT(*) FROM sync_retry_queue) as retry_queue,
                    (SELECT COUNT(*) FROM pessoas) as total_pessoas,
                    (SELECT COUNT(*) FROM empresas) as total_empresas,
                    GETDATE() as server_time
            `);

        console.log('📦 SQL SERVER:');
        console.log(`   Total logs: ${sqlStatus.recordset[0].total_logs}`);
        console.log(`   Pendentes: ${sqlStatus.recordset[0].logs_pendentes}`);
        console.log(`   Retry queue: ${sqlStatus.recordset[0].retry_queue}`);
        console.log(`   Pessoas: ${sqlStatus.recordset[0].total_pessoas}`);
        console.log(`   Empresas: ${sqlStatus.recordset[0].total_empresas}`);
        console.log(`   Hora servidor: ${sqlStatus.recordset[0].server_time}`);

        // 2. Sistema
        console.log('\n💻 SISTEMA:');
        console.log(`   Hostname: ${os.hostname()}`);
        console.log(`   Platform: ${os.platform()}`);
        console.log(`   Memory: ${Math.round(os.freemem() / 1024 / 1024)}MB / ${Math.round(os.totalmem() / 1024 / 1024)}MB`);
        console.log(`   Uptime: ${Math.round(os.uptime() / 60)} minutos`);

        // 3. Processo
        console.log('\n⚙️  PROCESSO:');
        console.log(`   PID: ${process.pid}`);
        console.log(`   Node: ${process.version}`);
        console.log(`   Memory: ${Math.round(process.memoryUsage().heapUsed / 1024 / 1024)}MB`);

    } catch (error) {
        console.error('❌ Erro no monitoramento:', error.message);
    }

    console.log('\n========================================\n');
}

// Executar a cada 10 segundos se for comando contínuo
if (process.argv.includes('--watch')) {
    console.log('📊 Modo monitoramento contínuo (Ctrl+C para parar)\n');
    setInterval(monitor, 10000);
} else {
    monitor();
}