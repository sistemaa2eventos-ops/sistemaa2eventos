#!/usr/bin/env node

require('dotenv').config();
const syncService = require('../modules/devices/sync.service');
const logger = require('../services/logger');

async function manualSync() {
    console.log('\n🚀 ========================================');
    console.log('🚀 SINCRONIZAÇÃO MANUAL - A2 EVENTOS');
    console.log('🚀 ========================================\n');

    const startTime = Date.now();

    try {
        // 1. Verificar conexões
        console.log('📡 Verificando conexões...');

        const { testConnection } = require('../config/database');
        const sqlStatus = await testConnection();

        if (!sqlStatus) {
            throw new Error('SQL Server offline');
        }

        console.log('✅ SQL Server online');

        // 2. Executar sincronização completa
        console.log('\n🔄 Executando sincronização...');

        const result = await syncService.syncAll();

        // 3. Mostrar resultados
        const duration = ((Date.now() - startTime) / 1000).toFixed(2);

        console.log('\n📊 ========================================');
        console.log('📊 RESULTADOS DA SINCRONIZAÇÃO');
        console.log('📊 ========================================');
        console.log(`⏱️  Tempo: ${duration}s`);
        console.log(`✅ Logs sincronizados: ${result.logs?.synced || 0}`);
        console.log(`⚠️  Logs com falha: ${result.logs?.failed || 0}`);
        console.log(`📦 Pessoas: ${result.pessoas?.synced || 0}`);
        console.log(`🔄 Retentativas: ${result.retryQueue?.processed || 0}`);
        console.log(`📌 Pendentes: ${result.logs?.pending || 0}`);
        console.log('========================================\n');

    } catch (error) {
        console.error('\n❌ ERRO NA SINCRONIZAÇÃO:', error.message);
        process.exit(1);
    }
}

// Executar
manualSync();