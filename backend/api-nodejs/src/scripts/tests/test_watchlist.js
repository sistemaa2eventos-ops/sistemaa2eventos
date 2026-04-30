const { supabase } = require('./src/config/supabase');

async function testQuery() {
    try {
        console.log('Testing monitor_watchlist query...');
        const { data, error } = await supabase
            .from('monitor_watchlist')
            .select(`
                *,
                pessoas (
                    nome,
                    foto_url,
                    empresas (nome)
                )
            `)
            .limit(1);

        if (error) {
            console.error('Query Error:', error);
        } else {
            console.log('Query Success:', data);
        }
    } catch (err) {
        console.error('Execution Error:', err);
    }
}

testQuery();
