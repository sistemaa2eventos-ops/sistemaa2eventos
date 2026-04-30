const { supabase } = require('./src/config/supabase');

async function listTables() {
    console.log('--- Listing All Tables in public Schema ---');

    // Attempting to use a common trick to get table names if RPC is not available
    // though usually you need an RPC for this. 
    // Let's try to query a table we know exists first to confirm connection.
    const { data: eventos, error: evError } = await supabase.from('eventos').select('id').limit(1);
    if (evError) {
        console.error('Error connecting to eventos:', evError.message);
    } else {
        console.log('Connection to "eventos" confirmed.');
    }

    // Since we can't easily list tables without an RPC, let's try to "guess" 
    // if maybe they are in a different case or something? Unlikely.

    // Let's try to use the 'rpc' to get tables if 'exec_sql' exists
    const { data: tables, error: rpcError } = await supabase.rpc('exec_sql', {
        sql_query: "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'"
    });

    if (rpcError) {
        console.error('RPC exec_sql failed (maybe not defined):', rpcError.message);
    } else {
        console.log('Tables found via RPC:', tables);
    }
}

listTables();
