#!/usr/bin/env node

require('dotenv').config();
const { supabase } = require('../config/supabase');
const { getConnection } = require('../config/database');
const logger = require('../services/logger');

async function wipeAllData() {
    console.log('\n⚠️  ========================================');
    console.log('⚠️  LIMPEZA TOTAL DE DADOS (WIPE)');
    console.log('⚠️  ========================================\n');

    try {
        console.log('🔄 Limpando dados no Supabase...');

        // Deletar em ordem para respeitar chaves estrangeiras (se existirem)
        const tables = [
            'logs_acesso',
            'sync_retry_queue',
            'pessoas',
            'empresas',
            'quotas_diarias',
            'dispositivos_acesso',
            'dispositivos_leitura',
            'eventos'
        ];

        for (const table of tables) {
            console.log(`   - Limpando tabela: ${table}`);
            const { error } = await supabase.from(table).delete().neq('id', '00000000-0000-0000-0000-000000000000'); // Delete all
            if (error) {
                console.error(`   ❌ Erro ao limpar ${table}:`, error.message);
            }
        }

        console.log('\n🔄 Limpando dados no SQL Server local...');
        const connection = await getConnection();

        const sqlTables = [
            'logs_acesso',
            'sync_retry_queue',
            'pessoas',
            'empresas',
            'eventos'
        ];

        for (const table of sqlTables) {
            console.log(`   - Truncando tabela: ${table}`);
            try {
                await connection.request().query(`DELETE FROM ${table}`);
            } catch (e) {
                console.warn(`   ⚠️  Erro ao truncar ${table} (pode não existir):`, e.message);
            }
        }

        console.log('\n✅ LIMPEZA CONCLUÍDA COM SUCESSO!');
        console.log('Agora o sistema está pronto para novos cadastros.\n');

    } catch (error) {
        console.error('\n❌ ERRO CRÍTICO NO WIPE:', error.message);
    } finally {
        process.exit(0);
    }
}

wipeAllData();
