const { supabase } = require('./src/config/supabase');

async function checkPerfisSchema() {
    console.log('--- 🛡️ VERIFICANDO COLUNAS DE PERFIS ---');
    const { data, error } = await supabase.from('perfis').select('*').limit(1);
    
    // If table is empty, we can't see columns via select *.
    // I'll try to find any script that created it.
}

checkPerfisSchema();
