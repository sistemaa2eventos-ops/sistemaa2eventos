const { supabase } = require('./src/config/supabase');

async function test() {
  console.log('--- BUSCANDO DISPOSITIVOS ---');
  const { data: devices, error: devErr } = await supabase.from('dispositivos_acesso').select('*');
  if (devErr) console.error('Erro dispositivos:', devErr);
  else console.log('Dispositivos encontrados:', devices?.map(d => ({ id: d.id, nome: d.nome, ip: d.ip_address || d.ip, marca: d.marca, tipo: d.tipo, status_online: d.status_online, evento_id: d.evento_id })));

  console.log('\n--- BUSCANDO PESSOA 2b6d8295-44bd-4f8b-8173-7acd29d97849 ---');
  const { data: pessoa, error: pErr } = await supabase.from('pessoas').select('id, nome_completo, cpf, status_acesso, bloqueado, foto_url, dias_acesso, evento_id').eq('id', '2b6d8295-44bd-4f8b-8173-7acd29d97849').single();
  if (pErr) console.error('Erro pessoa:', pErr);
  else console.log('Pessoa encontrada:', {
    id: pessoa.id,
    nome: pessoa.nome_completo,
    cpf: pessoa.cpf,
    status_acesso: pessoa.status_acesso,
    bloqueado: pessoa.bloqueado,
    tem_foto: !!pessoa.foto_url,
    foto_preview: pessoa.foto_url ? pessoa.foto_url.substring(0, 50) + '...' : null,
    dias_acesso: pessoa.dias_acesso,
    evento_id: pessoa.evento_id
  });

  console.log('\n--- ULTIMOS REGISTROS DE ACESSO ---');
  const { data: logs, error: lErr } = await supabase.from('access_logs').select('*').order('created_at', { ascending: false }).limit(5);
  if (lErr) console.error('Erro logs:', lErr);
  else console.log('Últimos access_logs:', logs);
}

test().catch(console.error);
