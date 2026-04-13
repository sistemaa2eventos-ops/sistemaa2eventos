const { supabase } = require('./src/config/supabase');

async function checkTables() {
  const tables = ['eventos', 'empresas', 'pessoas', 'logs_acesso', 'dispositivos_acesso', 'monitor_watchlist', 'badge_templates', 'evento_areas', 'evento_tipos_pulseira'];
  
  console.log('--- Verificando Tabelas no Supabase ---');
  for (const table of tables) {
    try {
      const { error } = await supabase.from(table).select('count', { count: 'exact', head: true }).limit(1);
      if (error) {
        console.log(`❌ Tabela "${table}":`, error.message);
      } else {
        console.log(`✅ Tabela "${table}": OK`);
      }
    } catch (e) {
      console.log(`❌ Erro inesperado na tabela "${table}":`, e.message);
    }
  }
}

checkTables();
