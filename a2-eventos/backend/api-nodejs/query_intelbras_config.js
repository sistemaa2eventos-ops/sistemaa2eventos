const { supabase } = require('./src/config/supabase');
const IntelbrasService = require('./src/modules/devices/intelbras.service');

async function testConfig() {
  const { data: device } = await supabase.from('dispositivos_acesso').select('*').eq('ip_address', '192.168.1.51').single();
  const service = new IntelbrasService(device);

  console.log('--- CONFIG DO LEITOR ---');
  try {
    const cfg = await service._get('/cgi-bin/configManager.cgi', {
      action: 'getConfig',
      name: 'AccessControl'
    });
    console.log('AccessControl Config:\n', cfg);
  } catch (e) {
    console.error('Erro getConfig AccessControl:', e.message);
  }

  try {
    const cfg2 = await service._get('/cgi-bin/configManager.cgi', {
      action: 'getConfig',
      name: 'AccessControlGeneral'
    });
    console.log('AccessControlGeneral Config:\n', cfg2);
  } catch (e) {
    console.error('Erro getConfig AccessControlGeneral:', e.message);
  }
}

testConfig().catch(console.error);
