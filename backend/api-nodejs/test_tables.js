const { supabase } = require('./src/config/supabase');

async function listAllTables() {
    console.log('--- Buscando Tabelas de Sistema (RBAC) ---');
    const tables = ['sys_roles', 'sys_permissions', 'sys_role_permissions', 'perfis'];
    
    for (const table of tables) {
        const { data, error } = await supabase.from(table).select('count').limit(1);
        if (error) {
            console.log(`❌ Tabela "${table}": Erro - ${error.message}`);
        } else {
            console.log(`✅ Tabela "${table}": OK`);
        }
    }
}

listAllTables();
