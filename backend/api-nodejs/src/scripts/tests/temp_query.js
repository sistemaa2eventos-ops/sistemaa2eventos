const { supabase } = require('./src/config/supabase');
require('dotenv').config();

async function run() {
    const { data, error } = await supabase.rpc('run_sql', { sql: "SELECT table_name, column_name FROM information_schema.columns WHERE table_name IN ('funcionarios', 'pessoas');" });
    console.log("Supabase RPC:", data, error);

    // Se rpc não existir, tenta via raw fetch caso tenha admin
}

run();
