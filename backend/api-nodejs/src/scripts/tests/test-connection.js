#!/usr/Script/env node

require('dotenv').config();
const { getConnection, testConnection } = require('./src/config/database');
const { supabase } = require('./src/config/supabase');

async function testAll() {
    console.log('\n🔍 ========================================');
    console.log('🔍 TESTANDO CONEXÕES DO SISTEMA A2 EVENTOS');
    console.log('🔍 ========================================\n');

    // ============================================
    // 1. TESTAR SQL SERVER
    // ============================================
    console.log('📦 SQL SERVER:');
    console.log(`   Servidor: ${process.env.SQL_SERVER_HOST}`);
    console.log(`   Banco: ${process.env.SQL_SERVER_DATABASE}`);
    console.log(`   Usuário: ${process.env.SQL_SERVER_USER}`);

    let sqlError = null;
    try {
        const isSQLConnected = await testConnection();
        if (isSQLConnected) {
            console.log('   ✅ CONECTADO COM SUCESSO!');

            const conn = await getConnection();

            // Verificar logs pendentes
            const result = await conn.request()
                .query('SELECT COUNT(*) as total FROM logs_acesso WHERE sincronizado = 0');
            console.log(`   📊 Logs pendentes: ${result.recordset[0].total}`);

            // Verificar tabelas
            const tables = await conn.request()
                .query(`SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_TYPE = 'BASE TABLE'`);
            console.log(`   📋 Tabelas encontradas: ${tables.recordset.length}`);

            // Listar tabelas
            if (tables.recordset.length > 0) {
                console.log(`   📋 Tabelas: ${tables.recordset.map(t => t.TABLE_NAME).join(', ')}`);
            }

        } else {
            console.log('   ❌ FALHA NA CONEXÃO');
        }
    } catch (error) {
        sqlError = error;
        console.log('   ❌ ERRO:', error.message);
    }

    console.log('');

    // ============================================
    // 2. TESTAR SUPABASE
    // ============================================
    console.log('☁️  SUPABASE:');
    console.log(`   URL: ${process.env.SUPABASE_URL}`);

    let supabaseError = null;
    try {
        // Testar conexão básica
        const { data, error } = await supabase
            .from('eventos')
            .select('count')
            .limit(1);

        if (!error) {
            console.log('   ✅ CONECTADO COM SUCESSO!');

            // Listar tabelas públicas
            const { data: tables, error: tablesError } = await supabase
                .from('information_schema.tables')
                .select('table_name')
                .eq('table_schema', 'public')
                .eq('table_type', 'BASE TABLE');

            if (!tablesError && tables) {
                console.log(`   📋 Tabelas encontradas: ${tables.length}`);
                console.log(`   📋 Tabelas: ${tables.map(t => t.table_name).join(', ')}`);
            }

            // Testar autenticação (opcional)
            console.log(`\n   🔐 Testando autenticação...`);
            const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
                email: 'admin@a2eventos.com.br',
                password: 'Admin@2026!'
            });

            if (authError) {
                console.log(`   ⚠️  Login não testado: ${authError.message}`);
            } else {
                console.log(`   ✅ Login OK - Usuário: ${authData.user.email}`);
            }

        } else {
            supabaseError = error;
            console.log('   ❌ FALHA NA CONEXÃO:', error.message);

            if (error.message.includes('relation') || error.message.includes('does not exist')) {
                console.log('\n   ⚠️  AS TABELAS NÃO FORAM CRIADAS NO SUPABASE!');
                console.log('   🔧 Execute o script SQL no SQL Editor do Supabase:');
                console.log('   1. Acesse: https://supabase.com');
                console.log('   2. Entre no seu projeto');
                console.log('   3. Clique em "SQL Editor"');
                console.log('   4. Crie uma nova query');
                console.log('   5. Cole o script SQL completo');
                console.log('   6. Execute');
            }

            if (error.message.includes('JWT')) {
                console.log('\n   ⚠️  PROBLEMA COM AS CHAVES DO SUPABASE!');
                console.log('   🔧 Verifique se as chaves no .env estão corretas:');
                console.log(`   SUPABASE_URL: ${process.env.SUPABASE_URL}`);
                console.log(`   SUPABASE_ANON_KEY: ${process.env.SUPABASE_ANON_KEY?.substring(0, 20)}...`);
            }
        }
    } catch (error) {
        supabaseError = error;
        console.log('   ❌ ERRO:', error.message);
    }

    console.log('\n========================================\n');

    // ============================================
    // 3. RESUMO
    // ============================================
    console.log('📊 RESUMO:');
    console.log(`   ✅ SQL Server: ${sqlError ? 'FALHA' : 'CONECTADO'}`);
    console.log(`   ✅ Supabase: ${supabaseError ? 'FALHA' : 'CONECTADO'}`);
    console.log('\n✅ Teste concluído!\n');
}

// Executar teste
testAll().catch(console.error);