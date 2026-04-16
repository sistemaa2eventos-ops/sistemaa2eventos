const { supabase } = require('../../src/config/supabase');

async function checkTables() {
    const tables = [
        'eventos',
        'evento_areas',
        'evento_tipos_pulseira',
        'pulseira_areas_permitidas',
        'evento_etiqueta_layouts'
    ];

    console.log('--- Database Table Check ---');
    for (const table of tables) {
        try {
            const { data, error } = await supabase
                .from(table)
                .select('*')
                .limit(1);

            if (error) {
                if (error.code === 'PGRST205' || error.message.includes('not found')) {
                    console.error(`❌ Table '${table}' DOES NOT EXIST.`);
                } else {
                    console.error(`⚠️ Table '${table}' error: ${error.message} (Code: ${error.code})`);
                }
            } else {
                console.log(`✅ Table '${table}' exists.`);
            }
        } catch (err) {
            console.error(`💥 Unexpected error checking table '${table}':`, err.message);
        }
    }
}

checkTables();
