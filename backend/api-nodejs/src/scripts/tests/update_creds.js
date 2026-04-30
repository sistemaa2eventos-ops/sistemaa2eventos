const { supabase } = require('./src/config/supabase');

async function updateCredentials() {
    console.log('🚀 Atualizando credenciais dos dispositivos Intelbras...');

    const { data, error } = await supabase
        .from('dispositivos_acesso')
        .update({
            user_device: 'admin',
            password_device: 'admin123'
        })
        .eq('marca', 'intelbras');

    if (error) {
        console.error('❌ Erro ao atualizar credenciais:', error.message);
        process.exit(1);
    }

    console.log('✅ Credenciais atualizadas com sucesso!');
    process.exit(0);
}

updateCredentials();
