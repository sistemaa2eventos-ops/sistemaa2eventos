const { supabase } = require('./src/config/supabase');

async function check() {
  const { data: dev } = await supabase.from('dispositivos_acesso').select('*').eq('ip_address', '192.168.1.51').single();
  console.log('DISPOSITIVO:', {
    id: dev.id,
    nome: dev.nome,
    tipo: dev.tipo,
    config: dev.config,
    control_token: dev.control_token
  });

  const { data: sessoes } = await supabase.from('sessoes_operador').select('*').eq('dispositivo_id', dev.id);
  console.log('SESSOES OPERADOR:', sessoes);
}

check().catch(console.error);
