const { supabase } = require('./src/config/supabase');
const fs = require('fs');
const path = require('path');

async function applyFix() {
    const sqlPath = path.join(__dirname, 'fix_veiculos_schema.sql');
    const sql = fs.readFileSync(sqlPath, 'utf8');

    console.log('🚀 Aplicando correção de schema para Veículos...');

    try {
        const { error } = await supabase.rpc('exec_sql', { sql_query: sql });

        if (error) {
            console.error('❌ Erro ao aplicar SQL via RPC:', error.message);
            console.log('\n💡 Dica: Se o RPC "exec_sql" não existir, execute o conteúdo de fix_veiculos_schema.sql manualmente no SQL Editor do Supabase.');
        } else {
            console.log('✅ Correção aplicada com sucesso!');
        }
    } catch (err) {
        console.error('💥 Erro fatal:', err.message);
    }
}

applyFix();
