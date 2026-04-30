
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function forceMaster() {
  const email = 'sistemaa2eventos@gmail.com';
  console.log('--- 🚀 INICIANDO ATIVAÇÃO FORÇADA NZT MASTER ---');

  // 1. Localizar o ID correto pelo e-mail
  const { data: { users }, error: authError } = await supabase.auth.admin.listUsers();
  const user = users.find(u => u.email === email);
  
  if (!user) {
    console.error('❌ ERRO: Usuário não localizado.');
    return;
  }
  
  const targetId = user.id;
  console.log(`✅ Alvo Identificado: ${targetId}`);

  // 2. Forçar Soberania Master nas 3 Tabelas Vitais
  console.log('--- 🔨 ATUALIZANDO TABELAS DE SOBERANIA ---');

  // Tabela: PERFIS (Dashboard e Acesso)
  const p1 = await supabase.from('perfis').update({ 
    nivel_acesso: 'master', 
    evento_id: null, 
    ativo: true 
  }).eq('id', targetId);
  if (p1.error) console.error('❌ Erro Perfis:', p1.error.message);
  else console.log('✅ Perfil Público: MASTER');

  // Tabela: PESSOAS (Identidade Portaria)
  const p2 = await supabase.from('pessoas').update({ 
    tipo_pessoa: 'master', 
    status_acesso: 'autorizado', 
    status_ativacao: 'ativo', 
    evento_id: null 
  }).eq('email', email);
  if (p2.error) console.error('❌ Erro Pessoas:', p2.error.message);
  else console.log('✅ Identidade Física: MASTER');

  // Tabela: AUTH.USERS (JWT Claims)
  const p3 = await supabase.auth.admin.updateUserById(targetId, {
    app_metadata: { nivel_acesso: 'master' }
  });
  if (p3.error) console.error('❌ Erro Auth:', p3.error.message);
  else console.log('✅ Token JWT Claims: MASTER');

  console.log('\n--- 🦅 SOBERANIA MASTER ATIVADA COM SUCESSO ---');
  console.log('IMPORTANTE: Agora você deve realizar Logout e entrar novamente em Janela Anônima.');
}

forceMaster();
