const { supabase } = require('./src/config/supabase');

async function checkUserMetadata() {
    console.log('--- 🛡️ VERIFICANDO METADADOS DO MASTER ---');
    const { data: users, error } = await supabase.from('auth.users').select('id, email, raw_user_meta_data').eq('email', 'sistemaa2eventos@gmail.com');
    // Using supabase-js might not allow access to auth.users.
}

checkUserMetadata();
