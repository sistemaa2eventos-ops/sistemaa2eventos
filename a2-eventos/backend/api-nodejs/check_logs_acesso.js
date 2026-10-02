const { supabase } = require('./src/config/supabase');

async function testLogs() {
  const { data: logs, error } = await supabase
    .from('logs_acesso')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(10);

  if (error) console.error('Erro logs_acesso:', error);
  else console.log('Últimos 10 logs_acesso:', logs?.map(l => ({
    tipo: l.tipo,
    metodo: l.metodo,
    pessoa_id: l.pessoa_id,
    dispositivo_id: l.dispositivo_id,
    created_at: l.created_at,
    detalhes: l.detalhes
  })));
}

testLogs().catch(console.error);
