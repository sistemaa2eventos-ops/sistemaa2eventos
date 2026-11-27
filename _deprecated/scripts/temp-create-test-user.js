require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function run() {
  try {
      // Remover se já existir
      const { data: users } = await supabase.auth.admin.listUsers();
      const existing = users.users.find(u => u.email === 'test_master@a2eventos.com');
      if (existing) {
          await supabase.auth.admin.deleteUser(existing.id);
      }

      console.log("Criando usuário master...");
      const { data, error } = await supabase.auth.admin.createUser({
          email: 'test_master@a2eventos.com',
          password: 'testPassword123!',
          email_confirm: true,
          user_metadata: {
              nome_completo: 'Test Master AI',
              cpf: '000.000.000-00',
              nivel_acesso: 'master'
          }
      });
      if (error) throw error;

      await supabase.auth.admin.updateUserById(data.user.id, {
          app_metadata: { role: 'master' }
      });

      console.log("Usuário criado com sucesso. ID:", data.user.id);
      process.exit(0);
  } catch (error) {
      console.error(error);
      process.exit(1);
  }
}
run();
