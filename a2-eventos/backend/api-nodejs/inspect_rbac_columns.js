const { supabase } = require('./src/config/supabase');

async function inspectTableSchemas() {
    console.log('--- 🛡️ INSPEÇÃO DE SCHEMAS PARA RLS ---');
    
    const tables = [
        'perfil_permissoes',
        'evento_etiqueta_layouts',
        'pessoa_documentos',
        'perfis',
        'eventos'
    ];

    for (const table of tables) {
        // We use a query that returns 0 rows but shows headers in some logs, 
        // but here we'll try to get one row or just use a generic select.
        const { data, error } = await supabase.from(table).select('*').limit(1);
        
        if (error) {
            console.log(`❌ Erro Tabela "${table}": ${error.message}`);
        } else if (data && data.length > 0) {
            console.log(`✅ Colunas "${table}":`, Object.keys(data[0]));
        } else {
            console.log(`⚠️ Tabela "${table}" está vazia. Não foi possível ler colunas via SELECT * no JS.`);
            // Tentativa de buscar via RPC genérico se existir ou pular.
        }
    }
}

inspectTableSchemas();
