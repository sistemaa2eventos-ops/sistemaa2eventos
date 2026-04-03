#!/usr/bin/env node

require('dotenv').config();
const { getConnection } = require('../config/database');

let isRunning = true;

async function getLiveStats() {
    try {
        const connection = await getConnection();

        // Logs dos últimos 5 minutos
        const logs = await connection.request()
            .query(`
                SELECT TOP 10
                    l.id, l.tipo, l.metodo, l.created_at,
                    p.nome as pessoa_nome
                FROM logs_acesso l
                JOIN pessoas p ON l.pessoa_id = p.id
                ORDER BY l.created_at DESC
            `);

        // Estatísticas em tempo real
        const stats = await connection.request()
            .query(`
                SELECT 
                    COUNT(*) as logs_ultimos_5min,
                    SUM(CASE WHEN tipo = 'checkin' THEN 1 ELSE 0 END) as checkins,
                    SUM(CASE WHEN metodo = 'fast-track' THEN 1 ELSE 0 END) as fast_track,
                    AVG(confianca) as media_confianca
                FROM logs_acesso
                WHERE created_at >= DATEADD(minute, -5, GETDATE())
            `);

        // Pendentes
        const pending = await connection.request()
            .query('SELECT COUNT(*) as pendentes FROM logs_acesso WHERE sincronizado = 0');

        return {
            timestamp: new Date().toLocaleTimeString('pt-BR'),
            stats: stats.recordset[0],
            pending: pending.recordset[0].pendentes,
            recent_logs: logs.recordset
        };

    } catch (error) {
        return {
            error: error.message,
            timestamp: new Date().toLocaleTimeString('pt-BR')
        };
    }
}

async function monitor() {
    console.clear();
    console.log('\n📡 ========================================');
    console.log('📡 MONITOR EM TEMPO REAL - A2 EVENTOS');
    console.log('📡 ========================================\n');

    const data = await getLiveStats();

    if (data.error) {
        console.log(`❌ Erro: ${data.error}`);
    } else {
        console.log(`🕐 ${data.timestamp}`);
        console.log('\n📊 ESTATÍSTICAS (últimos 5 min):');
        console.log(`   Logs: ${data.stats.logs_ultimos_5min || 0}`);
        console.log(`   Check-ins: ${data.stats.checkins || 0}`);
        console.log(`   Fast Track: ${data.stats.fast_track || 0}`);
        console.log(`   Confiança média: ${data.stats.media_confianca ?
            (data.stats.media_confianca * 100).toFixed(1) + '%' : 'N/A'}`);
        console.log(`   Pendentes sincronização: ${data.pending}`);

        console.log('\n📋 ÚLTIMOS ACESSOS:');
        if (data.recent_logs.length === 0) {
            console.log('   Nenhum acesso nos últimos 5 minutos');
        } else {
            data.recent_logs.forEach(log => {
                const tipoIcon = log.tipo === 'checkin' ? '✅' :
                    log.tipo === 'checkout' ? '🚪' : '⚠️';
                const metodoIcon = log.metodo === 'fast-track' ? '⚡' : '📱';
                const confianca = log.confianca ?
                    ` (${(log.confianca * 100).toFixed(0)}%)` : '';

                console.log(`   ${tipoIcon}${metodoIcon} ${log.pessoa_nome}${confianca} - ${new Date(log.created_at).toLocaleTimeString('pt-BR')}`);
            });
        }
    }

    console.log('\n========================================\n');
    console.log('Pressione Ctrl+C para sair');
}

// Executar a cada 2 segundos
console.log('📡 Iniciando monitoramento em tempo real...\n');
const interval = setInterval(monitor, 2000);

// Graceful shutdown
process.on('SIGINT', () => {
    clearInterval(interval);
    console.log('\n\n📡 Monitoramento encerrado.\n');
    process.exit(0);
});

// Executar primeira vez imediatamente
monitor();