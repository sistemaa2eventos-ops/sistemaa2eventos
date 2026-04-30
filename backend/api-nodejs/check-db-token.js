require('dotenv').config({ path: './.env' });
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function checkUser(email) {
    console.log(`--- VERIFICAÇÃO DE DADOS (EMAIL: ${email}) ---`);
    const { data: perfil, error } = await supabase
        .from('perfis')
        .select('*')
        .eq('email', email)
        .maybeSingle();

    if (error) {
        console.error('❌ Erro no Supabase:', error);
        return;
    }

    if (!perfil) {
        console.log('❌ Perfil não encontrado no banco de dados!');
    } else {
        console.log('✅ Perfil encontrado!');
        console.log('Status Aprov:', perfil.status_aprovacao);
        console.log('Onboarding Token:', perfil.onboarding_token);
        console.log('Ultima Atualização:', perfil.updated_at || perfil.created_at);
        
        if (perfil.onboarding_token) {
            const portalUrl = process.env.PUBLIC_PORTAL_URL || 'https://cadastro.nzt.app.br';
            const link = `${portalUrl}/onboarding/${perfil.onboarding_token}`;
            console.log('🔗 Link Atual para este Token:', link);
        } else {
            console.log('⚠️  Atenção: Onboarding Token está vazio no banco!');
        }
    }
}

checkUser('nataliaalvesengenharia@gmail.com');
