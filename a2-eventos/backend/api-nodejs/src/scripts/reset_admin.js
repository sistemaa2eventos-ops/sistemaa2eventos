const { createClient } = require('@supabase/supabase-js');
const dotenv = require('dotenv');
const path = require('path');

dotenv.config({ path: path.join(__dirname, '../../.env') });

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function resetAdmin() {
    try {
        const email = 'admin@a2eventos.com.br';
        const password = 'NexusAdmin123!'; // definindo uma senha padrão para o teste

        console.log(`Buscando usuário ${email}...`);
        const { data: users, error: listError } = await supabase.auth.admin.listUsers();

        if (listError) throw listError;

        const adminUser = users.users.find(u => u.email === email);

        if (adminUser) {
            console.log('Usuário encontrado. Atualizando senha...');
            const { error: updateError } = await supabase.auth.admin.updateUserById(adminUser.id, {
                password: password
            });

            if (updateError) throw updateError;
            console.log('Senha atualizada com sucesso para "admin"!');
        } else {
            console.log('Usuário não encontrado. Criando novo usuário admin...');
            const { data, error } = await supabase.auth.admin.createUser({
                email: email,
                password: password,
                email_confirm: true,
                user_metadata: {
                    nome_completo: 'Administrador do Sistema',
                    cpf: '000.000.000-00',
                    nivel_acesso: 'admin'
                }
            });

            if (error) throw error;

            await supabase.auth.admin.updateUserById(data.user.id, {
                app_metadata: { role: 'admin' }
            });

            // Verifica o evento padrão para vincular
            const { data: evento } = await supabase
                .from('eventos')
                .select('*')
                .limit(1)
                .single();

            if (evento) {
                await supabase.from('perfis').update({ evento_id: evento.id, nivel_acesso: 'admin' }).eq('id', data.user.id);
            }

            console.log('Usuário criado com a senha "admin"!');
        }
    } catch (err) {
        console.error('Erro ao resetar admin:', err);
    }
}

resetAdmin();
