const { supabase } = require('./src/config/supabase');
const fs = require('fs');
const path = require('path');

async function applyHotfix() {
    console.log('🚀 Iniciando aplicação de Hotfix (Fase 5)...');

    const sqlPath = path.join(__dirname, 'hotfix_schema.sql');
    if (!fs.existsSync(sqlPath)) {
        console.error('❌ Arquivo hotfix_schema.sql não encontrado!');
        return;
    }

    const sql = fs.readFileSync(sqlPath, 'utf8');

    try {
        console.log('⚠️ Tentando aplicar via RPC exec_sql...');
        const { error: rpcError } = await supabase.rpc('exec_sql', { sql_query: sql });

        if (rpcError) {
            console.log('❌ RPC exec_sql falhou ou não está disponível.');
            console.error('Erro:', rpcError.message);
            console.log('\n💡 Por favor, execute o conteúdo de "hotfix_schema.sql" manualmente no SQL Editor do Supabase.');
        } else {
            console.log('✅ Hotfix aplicado com sucesso via RPC!');
        }
    } catch (err) {
        console.error('❌ Erro inesperado:', err.message);
    }
}

applyHotfix();
