
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function checkMaster() {
  const email = 'sistemaa2eventos@gmail.com';
  
  // 1. Buscar no Auth
  const { data: { users }, error: authError } = await supabase.auth.admin.listUsers();
  const user = users.find(u => u.email === email);
  
  if (!user) {
    console.log(`❌ Usuário ${email} não encontrado no Auth.`);
    return;
  }
  
  console.log(`\n--- AUTH.USERS [${email}] ---`);
  console.log(`ID: ${user.id}`);
  console.log(`App Metadata:`, JSON.stringify(user.app_metadata, null, 2));

  // 2. Buscar no Perfil Público
  const { data: perfil, error: perfilError } = await supabase
    .from('perfis')
    .select('*')
    .eq('id', user.id)
    .single();

  if (perfilError) {
    console.log(`❌ Erro ao buscar perfil:`, perfilError.message);
  } else {
    console.log(`\n--- PUBLIC.PERFIS [${email}] ---`);
    console.log(`Nível: ${perfil.nivel_acesso}`);
    console.log(`Evento ID: ${perfil.evento_id}`);
    console.log(`Ativo: ${perfil.ativo}`);
  }
}

checkMaster();
