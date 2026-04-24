const { supabasePublic } = require('./src/config/supabase');

async function testLogin() {
    console.log('🔐 Testando autenticação no Supabase...\n');

    const email = process.argv[2] || 'admin@a2eventos.com.br';
    const password = process.argv[3] || process.env.TEST_PASSWORD;
    if (!password) {
        console.error('Uso: node test-auth.js [email] <senha>');
        console.error('  ou defina TEST_PASSWORD no ambiente');
        process.exit(1);
    }

    console.log(`📧 Email: ${email}`);
    console.log(`🔑 Password: ${'*'.repeat(password.length)}\n`);

    try {
        const { data, error } = await supabasePublic.auth.signInWithPassword({
            email,
            password
        });

        if (error) {
            console.log('❌ ERRO NO LOGIN:');
            console.log(error.message);

            if (error.message.includes('Invalid login credentials')) {
                console.log('\n🔧 DIAGNÓSTICO:');
                console.log('   1. O usuário existe no auth.users? Execute:');
                console.log('      SELECT * FROM auth.users WHERE email = \'admin@a2eventos.com.br\';');
                console.log('   2. A senha está correta? Execute o reset de senha via SQL');
            }
        } else {
            console.log('✅ LOGIN BEM-SUCEDIDO!\n');
            console.log('👤 Usuário:', data.user.email);
            console.log('🆔 ID:', data.user.id);
            console.log('📋 Metadata:', data.user.user_metadata);
            console.log('🎟️  Token JWT:', data.session.access_token.substring(0, 50) + '...');

            // Verificar perfil
            const { data: perfil } = await supabasePublic
                .from('perfis')
                .select('*')
                .eq('id', data.user.id)
                .single();

            console.log('\n📋 Perfil no banco:', perfil);
        }
    } catch (error) {
        console.log('❌ ERRO:', error.message);
    }
}

testLogin();