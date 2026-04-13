const { supabase } = require('./src/config/supabase');

async function inspectDocSchema() {
    console.log('--- 🛡️ INSPEÇÃO PARA RLS (Pessoas & Perfis) ---');
    const { data: perfis } = await supabase.from('perfis').select('*').limit(1);
    const { data: pessoas } = await supabase.from('pessoas').select('*').limit(1);
    const { data: docs } = await supabase.from('pessoa_documentos').select('*').limit(1);
    
    console.log('Colunas Perfis:', Object.keys(perfis?.[0] || {}));
    console.log('Colunas Pessoas:', Object.keys(pessoas?.[0] || {}));
    console.log('Colunas Pessoa_Documentos:', Object.keys(docs?.[0] || {}));
}

inspectDocSchema();
