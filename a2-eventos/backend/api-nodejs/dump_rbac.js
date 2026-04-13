const { supabase } = require('./src/config/supabase');

async function dumpRoles() {
    console.log('--- 🛡️ PERFIS (Roles) NO BANCO ---');
    const { data: roles } = await supabase.from('sys_roles').select('*');
    console.log(JSON.stringify(roles || [], null, 2));

    console.log('\n--- 🔑 PERMISSÕES NO BANCO ---');
    const { data: perms } = await supabase.from('sys_permissions').select('*');
    console.log(JSON.stringify(perms || [], null, 2));
}

dumpRoles();
