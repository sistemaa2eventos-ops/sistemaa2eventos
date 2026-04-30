require('dotenv').config({ path: './.env' });
const { createClient } = require('@supabase/supabase-js');
const crypto = require('crypto');

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function forceToken(email) {
    const onboardingToken = crypto.randomUUID();
    const { data, error } = await supabase
        .from('perfis')
        .update({ 
            onboarding_token: onboardingToken,
            status_aprovacao: 'convite_enviado' // Resetar status para permitir o onboarding
        })
        .eq('email', email)
        .select()
        .single();

    if (error) {
        console.error('❌ Erro ao atualizar:', error);
    } else {
        const portalUrl = process.env.PUBLIC_PORTAL_URL || 'https://cadastro.nzt.app.br';
        console.log('✅ TOKEN GERADO COM SUCESSO!');
        console.log('🔗 LINK DE ACESSO:', `${portalUrl}/onboarding/${onboardingToken}`);
        console.log('Email:', email);
    }
}

forceToken('nataliaalvesengenharia@gmail.com');
