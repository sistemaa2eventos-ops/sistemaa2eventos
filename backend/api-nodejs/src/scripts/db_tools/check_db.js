const { createClient } = require('@supabase/supabase-js');
const dotenv = require('dotenv');
const path = require('path');

dotenv.config({ path: path.join(__dirname, '.env') });

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function checkData() {
    console.log('Checking database...');

    const { data: eventos } = await supabase.from('eventos').select('*');
    console.log('\n--- Eventos ---');
    console.log(eventos);

    const { data: dispositivos } = await supabase.from('dispositivos_acesso').select('*');
    console.log('\n--- Dispositivos ---');
    console.log(dispositivos);

    const { data: funcionarios } = await supabase.from('funcionarios').select('id, nome, foto_url, ativo, evento_id').limit(5);
    console.log('\n--- Funcionarios (First 5) ---');
    console.log(funcionarios);
}

checkData().catch(console.error);
