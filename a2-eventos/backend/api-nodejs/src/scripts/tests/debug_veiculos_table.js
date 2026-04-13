const { supabase } = require('./src/config/supabase');

async function debugVeiculos() {
    console.log('--- Debugging Veiculos Table ---');
    try {
        // Try to get one vehicle
        const { data: veiculos, error: vError } = await supabase
            .from('veiculos')
            .select('*')
            .limit(1);

        if (vError) {
            console.error('Error fetching veiculo:', vError.message);
        } else if (veiculos && veiculos.length > 0) {
            console.log('Columns:', Object.keys(veiculos[0]));
            console.log('Sample Row:', veiculos[0]);
        } else {
            console.log('Table exists but is empty.');
        }

        // Try to get foreign keys if possible (PostgreSQL specific query via RPC or semi-select)
        // Since we can't do arbitrary SQL easily without a custom RPC, let's try 
        // a join without a specified FK and see if it works with different names.

        console.log('--- Testing Joins ---');

        const testJoins = [
            '*, empresas(id, nome)',
            '*, empresas!veiculos_empresa_id_fkey(id, nome)',
            '*, empresa:empresas(id, nome)'
        ];

        for (const select of testJoins) {
            console.log(`Testing select: "${select}"`);
            const { error } = await supabase.from('veiculos').select(select).limit(1);
            if (error) {
                console.error(`❌ Failed: ${error.message}`);
            } else {
                console.log(`✅ Success for: "${select}"`);
            }
        }

    } catch (err) {
        console.error('Fatal error:', err.message);
    }
}

debugVeiculos();
