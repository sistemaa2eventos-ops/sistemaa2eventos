const { supabase } = require('../../src/config/supabase');

async function checkRPC() {
    try {
        console.log('🔍 Verificando se o RPC "exec_sql" existe...');
        const { error } = await supabase.rpc('exec_sql', { sql_query: 'SELECT 1' });

        if (error) {
            console.error('❌ RPC "exec_sql" não encontrado ou erro:', error.message);
        } else {
            console.log('✅ RPC "exec_sql" está disponível!');
        }
    } catch (err) {
        console.error('💥 Erro fatal:', err.message);
    }
}

checkRPC();
