#!/usr/bin/env node

require('dotenv').config();
const { getConnection } = require('../config/database');
const logger = require('../services/logger');

async function checkDatabase() {
    console.log('\n🔍 ========================================');
    console.log('🔍 VERIFICAÇÃO DO BANCO DE DADOS');
    console.log('🔍 ========================================\n');

    try {
        const connection = await getConnection();

        // 1. Verificar tabelas
        console.log('📋 VERIFICANDO TABELAS...');
        const tables = await connection.request()
            .query(`
                SELECT 
                    TABLE_NAME,
                    (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = t.TABLE_NAME) as colunas
                FROM INFORMATION_SCHEMA.TABLES t
                WHERE TABLE_TYPE = 'BASE TABLE'
                ORDER BY TABLE_NAME
            `);

        for (const table of tables.recordset) {
            const status = table.colunas > 0 ? '✅' : '⚠️';
            console.log(`   ${status} ${table.TABLE_NAME} (${table.colunas} colunas)`);
        }

        // 2. Verificar índices
        console.log('\n📊 VERIFICANDO ÍNDICES...');
        const indexes = await connection.request()
            .query(`
                SELECT 
                    i.name as index_name,
                    OBJECT_NAME(i.object_id) as table_name,
                    i.type_desc,
                    i.is_primary_key,
                    i.is_unique
                FROM sys.indexes i
                WHERE i.name IS NOT NULL
                AND OBJECT_NAME(i.object_id) IN ('logs_acesso', 'pessoas', 'empresas')
                ORDER BY table_name, index_name
            `);

        for (const idx of indexes.recordset) {
            console.log(`   ✅ ${idx.table_name}.${idx.index_name} (${idx.type_desc})`);
        }

        // 3. Verificar procedures
        console.log('\n⚙️ VERIFICANDO PROCEDURES...');
        const procedures = await connection.request()
            .query(`
                SELECT 
                    SPECIFIC_NAME,
                    CREATED,
                    LAST_ALTERED
                FROM INFORMATION_SCHEMA.ROUTINES
                WHERE ROUTINE_TYPE = 'PROCEDURE'
                ORDER BY SPECIFIC_NAME
            `);

        for (const proc of procedures.recordset) {
            console.log(`   ✅ ${proc.SPECIFIC_NAME}`);
        }

        // 4. Verificar triggers
        console.log('\n⚡ VERIFICANDO TRIGGERS...');
        const triggers = await connection.request()
            .query(`
                SELECT 
                    name,
                    OBJECT_NAME(parent_id) as table_name
                FROM sys.triggers
                WHERE parent_class_desc = 'OBJECT_OR_COLUMN'
                ORDER BY name
            `);

        for (const trg of triggers.recordset) {
            console.log(`   ✅ ${trg.name} (${trg.table_name})`);
        }

        // 5. Estatísticas de dados
        console.log('\n📈 ESTATÍSTICAS DE DADOS...');

        const stats = await connection.request()
            .query(`
                SELECT 
                    (SELECT COUNT(*) FROM eventos) as total_eventos,
                    (SELECT COUNT(*) FROM empresas) as total_empresas,
                    (SELECT COUNT(*) FROM pessoas) as total_pessoas,
                    (SELECT COUNT(*) FROM logs_acesso) as total_logs,
                    (SELECT COUNT(*) FROM dispositivos_acesso) as total_dispositivos,
                    (SELECT COUNT(*) FROM perfis) as total_perfis
            `);

        const s = stats.recordset[0];
        console.log(`   Eventos: ${s.total_eventos}`);
        console.log(`   Empresas: ${s.total_empresas}`);
        console.log(`   Pessoas: ${s.total_pessoas}`);
        console.log(`   Logs de Acesso: ${s.total_logs}`);
        console.log(`   Dispositivos: ${s.total_dispositivos}`);
        console.log(`   Perfis: ${s.total_perfis}`);

        // 6. Logs pendentes
        const pending = await connection.request()
            .query(`
                SELECT 
                    COUNT(*) as total_pendente,
                    MIN(created_at) as mais_antigo,
                    MAX(created_at) as mais_recente
                FROM logs_acesso 
                WHERE sincronizado = 0
            `);

        const p = pending.recordset[0];
        console.log(`\n📤 LOGS PENDENTES: ${p.total_pendente || 0}`);
        if (p.mais_antigo) {
            console.log(`   Mais antigo: ${new Date(p.mais_antigo).toLocaleString('pt-BR')}`);
            console.log(`   Mais recente: ${new Date(p.mais_recente).toLocaleString('pt-BR')}`);
        }

        // 7. Retry queue
        const retry = await connection.request()
            .query('SELECT COUNT(*) as total FROM sync_retry_queue');

        console.log(`\n🔄 RETRY QUEUE: ${retry.recordset[0].total}`);

        console.log('\n✅ VERIFICAÇÃO CONCLUÍDA COM SUCESSO!\n');

    } catch (error) {
        console.error('\n❌ ERRO NA VERIFICAÇÃO:', error.message);
        process.exit(1);
    }
}

checkDatabase();