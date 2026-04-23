const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: 'c:/Projetos/Projeto_A2_Eventos/a2-eventos/backend/api-nodejs/.env' });

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function fixMaster() {
  const email = 'sistemaa2eventos@gmail.com';
  console.log(`⏳ Corrigindo metadados para: ${email}...`);

  // 1. Buscar ID do usuário e dados do perfil
  const { data: { users }, error: authError } = await supabase.auth.admin.listUsers();
  if (authError) throw authError;

  const user = users.find(u => u.email === email);
  if (!user) {
    console.error('❌ Usuário não encontrado no Auth.');
    return;
  }

  // Buscar evento_id correto do perfil
  const { data: profile, error: profileError } = await supabase
    .from('perfis')
    .select('evento_id, nivel_acesso')
    .eq('id', user.id)
    .single();

  if (profileError || !profile) {
    console.error('❌ Perfil não encontrado no banco público.');
    return;
  }

  console.log(`✅ Evento correto identificado: ${profile.evento_id}`);

  // 2. Atualizar Auth Metadata (User e App)
  // Alinhamos para a nova nomenclatura 'admin_master' e o evento_id real
  const { data: updatedUser, error: updateError } = await supabase.auth.admin.updateUserById(
    user.id,
    {
      user_metadata: { 
        ...user.user_metadata, 
        nivel_acesso: 'admin_master',
        role: 'admin_master',
        evento_id: profile.evento_id 
      },
      app_metadata: { 
        ...user.app_metadata,
        nivel_acesso: 'admin_master',
        role: 'admin_master',
        evento_id: profile.evento_id 
      }
    }
  );

  if (updateError) {
    console.error('❌ Erro ao atualizar metadados:', updateError.message);
  } else {
    console.log('🚀 Metadados sincronizados com sucesso!');
    console.log('Role e Evento ID agora batem com o banco público.');
  }
}

fixMaster().catch(err => console.error('💥 Erro fatal:', err));
