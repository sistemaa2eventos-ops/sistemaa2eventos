
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function deepAudit() {
  const email = 'sistemaa2eventos@gmail.com';
  console.log('--- 🔍 INICIANDO AUDITORIA PROFUNDA NZT ---');

  // 1. Auth Users
  const { data: { users }, error: authError } = await supabase.auth.admin.listUsers();
  const user = users.find(u => u.email === email);
  
  if (!user) {
    console.error('❌ ERRO CRÍTICO: Usuário não encontrado no Auth.');
    return;
  }
  
  console.log(`✅ Usuário Auth: ${user.id}`);
  console.log(`✅ Metadata JWT:`, JSON.stringify(user.app_metadata, null, 2));

  // 2. Perfis Públicos
  const { data: perfil, error: perfilError } = await supabase
    .from('perfis')
    .select('*')
    .eq('id', user.id)
    .maybeSingle();

  if (perfilError) {
    console.error('❌ ERRO PERFIL:', perfilError.message);
  } else if (!perfil) {
    console.error('❌ ALERTA: Perfil público NÃO EXISTE para este ID.');
  } else {
    console.log(`--- 🛡️ PERFIL PÚBLICO LOCALIZADO ---`);
    console.log(`Nível de Acesso: [${perfil.nivel_acesso}]`);
    console.log(`Status Ativo: ${perfil.ativo}`);
    console.log(`Evento Vinculado: ${perfil.evento_id || 'GLOBAL (NULL)'}`);
  }

  // 3. Pessoas (Identidade Física)
  const { data: pessoa, error: pessoaError } = await supabase
    .from('pessoas')
    .select('*')
    .eq('email', email)
    .maybeSingle();

  if (pessoaError) {
    console.error('❌ ERRO PESSOA:', pessoaError.message);
  } else if (!pessoa) {
    console.log('⚠️ AVISO: Identidade física não encontrada para este e-mail.');
  } else {
    console.log(`--- 👤 IDENTIDADE FÍSICA LOCALIZADA ---`);
    console.log(`Tipo: [${pessoa.tipo_pessoa}]`);
    console.log(`Status Acesso: ${pessoa.status_acesso}`);
    console.log(`Evento: ${pessoa.evento_id || 'GLOBAL (NULL)'}`);
  }
}

deepAudit();
