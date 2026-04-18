const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: 'c:/Projetos/Projeto_A2_Eventos/a2-eventos/backend/api-nodejs/.env' });

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function checkColumns() {
  const { data, error } = await supabase
    .from('pulseira_areas_permitidas')
    .select('*')
    .limit(1);
    
  if (error) {
    console.error('Error:', error);
  } else if (data.length > 0) {
    console.log('Columns:', Object.keys(data[0]));
  } else {
    // If empty, we can try to insert and catch the error, or query the REST API directly.
    // However, the easiest way to get columns if empty using just Supabase client is sending an OPTIONS request, or just inspecting the error of a bad insert.
    const { error: insertErr } = await supabase.from('pulseira_areas_permitidas').insert({ __fake_column: 1 });
    console.log('Error output (often shows valid columns):', insertErr);
  }
}

checkColumns();
