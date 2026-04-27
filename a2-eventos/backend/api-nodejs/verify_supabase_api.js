const { createClient } = require('@supabase/supabase-js');
const dotenv = require('dotenv');

dotenv.config({ path: 'C:/Projetos/Projeto_A2_Eventos/a2-eventos/.env' });

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function deepDiagnostic() {
    console.log('--- Diagnóstico Profundo Supabase ---');
    console.log('URL:', supabaseUrl);
    
    // Tentar uma query simples e logar o erro COMPLETO
    const result = await supabase.from('eventos').select('*').limit(1);
    
    if (result.error) {
        console.error('❌ Erro Detectado:');
        console.error(JSON.stringify(result.error, null, 2));
        
        if (result.error.message && result.error.message.includes('invalid font')) {
             console.log('💡 Dica: Isso pode ser um erro de rede ou DNS.');
        }
    } else {
        console.log('✅ Conexão estabelecida!');
        console.log('Dados recebidos:', result.data.length);
    }
}

deepDiagnostic();
