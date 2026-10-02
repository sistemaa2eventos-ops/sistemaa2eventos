const { supabase } = require('./src/config/supabase');
const IntelbrasService = require('./src/modules/devices/intelbras.service');

async function test() {
  const { data: device } = await supabase.from('dispositivos_acesso').select('*').eq('ip_address', '192.168.1.51').single();
  const service = new IntelbrasService(device);

  console.log('--- LISTANDO USUÁRIOS NO LEITOR INTELBRAS ---');
  try {
    const users = await service.listUsers(['01059674165']);
    console.log('Resposta listUsers 01059674165:\n', users);
  } catch (e) {
    console.error('Erro listUsers:', e);
  }

  console.log('\n--- VERIFICANDO FACE CADASTRADA ---');
  try {
    const faceResp = await service._postJson('/cgi-bin/FaceInfoManager.cgi', { action: 'find' }, {
      UserID: '01059674165'
    });
    console.log('Resposta FaceInfoManager find:\n', faceResp);
  } catch (e) {
    console.error('Erro find face:', e.message);
  }

  console.log('\n--- VERIFICANDO LOGS DE EVENTOS DO HARDWARE ---');
  try {
    // RecordFinder para AccessControl
    const logsResp = await service._get('/cgi-bin/recordFinder.cgi', {
      action: 'find',
      name: 'AccessControl',
      count: 10
    });
    console.log('Logs AccessControl do leitor:\n', logsResp);
  } catch (e) {
    console.error('Erro recordFinder:', e.message);
  }
}

test().catch(console.error);
