const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: 'c:/Projetos/Projeto_A2_Eventos/a2-eventos/backend/api-nodejs/.env' });

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function checkUser() {
  const email = 'sistemaa2eventos@gmail.com';
  console.log(`Checking user: ${email}...`);

  // 1. Check Auth User
  const { data: { users }, error: authError } = await supabase.auth.admin.listUsers();
  if (authError) {
    console.error('Error fetching auth users:', authError);
    return;
  }

  const user = users.find(u => u.email === email);
  if (!user) {
    console.log('User NOT found in Auth.');
    return;
  }

  console.log('Auth User found:', {
    id: user.id,
    last_sign_in_at: user.last_sign_in_at,
    user_metadata: user.user_metadata,
    app_metadata: user.app_metadata
  });

  // 2. Check Profile
  const { data: profile, error: profileError } = await supabase
    .from('perfis')
    .select('*')
    .eq('id', user.id)
    .single();

  if (profileError) {
    console.log('Profile NOT found or error:', profileError.message);
  } else {
    console.log('Public Profile found:', profile);
  }
}

checkUser();
