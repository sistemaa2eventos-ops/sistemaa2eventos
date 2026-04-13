const { supabase } = require('./src/config/supabase');
const fs = require('fs');
const path = require('path');

async function applyModulesMigration() {
    console.log('🚀 Aplicando Migração de Módulos Configuráveis...');

    const sqlPath = path.join(__dirname, 'create_event_modules.sql');
    if (!fs.existsSync(sqlPath)) {
        console.error('❌ Arquivo create_event_modules.sql não encontrado!');
        return;
    }

    const sql = fs.readFileSync(sqlPath, 'utf8');

    try {
        console.log('⚠️ Tentando aplicar via RPC exec_sql...');
        const { error: rpcError } = await supabase.rpc('exec_sql', { sql_query: sql });

        if (rpcError) {
            console.log('❌ RPC exec_sql falhou.');
            console.error('Erro:', rpcError.message);
            console.log('\n💡 Por favor, execute o conteúdo de "create_event_modules.sql" manualmente no SQL Editor do Supabase.');
        } else {
            console.log('✅ Migração de módulos aplicada com sucesso!');
        }
    } catch (err) {
        console.error('❌ Erro inesperado:', err.message);
    }
}

applyModulesMigration();
