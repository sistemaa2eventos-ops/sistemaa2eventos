const { supabase } = require('./src/config/supabase');

async function testRpc() {
    console.log('--- Testing exec_sql RPC ---');
    const { data, error } = await supabase.rpc('exec_sql', { sql_query: 'SELECT 1 as test' });

    if (error) {
        console.error('❌ exec_sql RPC does NOT exist or failed:', error.message);
    } else {
        console.log('✅ exec_sql RPC exists! Data:', data);
    }
}

testRpc();
