const { supabase } = require('./src/config/supabase');

async function inspectPermissionsTable() {
    console.log('--- Inspecionando colunas de sys_permissions ---');
    const { data, error } = await supabase.from('sys_permissions').select('*').limit(1);
    
    if (error) {
        console.error('❌ Erro ao ler tabela:', error.message);
    } else if (data && data.length > 0) {
        console.log('✅ Amostra de Colunas Encontradas:', Object.keys(data[0]));
    } else {
        console.log('⚠️ Tabela vazia, tentando buscar via rpc ou metadados de colunas...');
        // Fallback: tentar descrever a tabela via SQL interface (se possível) ou apenas listar chaves
        // Como o Supabase-js não tem "desc", vamos tentar inserir um registro fake pra ver o erro de colunas
    }
}

inspectPermissionsTable();
