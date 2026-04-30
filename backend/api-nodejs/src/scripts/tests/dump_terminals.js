const { supabase } = require('./src/config/supabase');
const fs = require('fs');

async function listAll() {
    const { data, error } = await supabase
        .from('dispositivos_acesso')
        .select('id, nome, evento_id, marca, ip_address, user_device, password_device');

    if (error) {
        fs.writeFileSync('terminals_dump.json', JSON.stringify(error, null, 2));
    } else {
        fs.writeFileSync('terminals_dump.json', JSON.stringify(data, null, 2));
    }
    process.exit(0);
}

listAll();
